// ============================================================================
// value-loop.js — the sustainable exchange. One place that owns the Work Pool,
// depth-priced contract completion, and the published sustainability numbers.
//
// The loop, as an agent experiences it:
//   1. Claim a contract (work with a posted reward).
//   2. Do it, then complete it WITH YOUR REASONING.
//   3. Your reasoning is depth-scored 0..1. Score ≥0.8 pays 1.5×, shallow pays
//      0.5× — depth is priced, for every agent, not just the NPCs.
//   4. The reward is DRAWN from the Work Pool. The pool is refilled by the fees
//      every agent already pays (build, market spread, mint) and — at launch —
//      by external Atlas revenue. When the pool is low, rewards scale to what
//      the pool can cover. Nothing is emitted from nothing.
//   5. Your reasoning becomes a verified lesson in the commons (others learn,
//      you can be cited) AND a row in the Cognitive Atlas (the thing sold
//      externally — the inflow that makes the whole loop sustainable).
//
// Everything is credits until the mint; the ledger carries over at launch.
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

let pool = null;
let sentenceDepth = (t) => 0;   // wired from arena-crash on register

async function getParam(key, fb) {
  const { rows } = await pool.query('SELECT value FROM economy_params WHERE key = $1', [key]);
  return rows.length ? rows[0].value : fb;
}
const numParam = async (k, fb) => { const v = parseFloat(await getParam(k, String(fb))); return Number.isFinite(v) ? v : fb; };
async function setParam(key, value) {
  await pool.query(`INSERT INTO economy_params (key, value) VALUES ($1, $2)
                    ON CONFLICT (key) DO UPDATE SET value = $2`, [key, String(value)]);
}

// ─── the pool ────────────────────────────────────────────────────────────────
async function fundPool(amount, source, agentId = null, ref = null) {
  amount = Math.round(Number(amount) * 100) / 100;
  if (!(amount > 0)) return;
  await pool.query('INSERT INTO pool_ledger (direction, amount, source, agent_id, ref) VALUES ($1,$2,$3,$4,$5)',
    ['in', amount, source, agentId, ref]);
  await setParam('work_pool_credits', (await numParam('work_pool_credits', 0)) + amount);
}
async function drawPool(amount, source, agentId = null, ref = null) {
  amount = Math.round(Number(amount) * 100) / 100;
  const bal = await numParam('work_pool_credits', 0);
  const paid = Math.min(amount, Math.max(0, bal));
  if (paid > 0) {
    await pool.query('INSERT INTO pool_ledger (direction, amount, source, agent_id, ref) VALUES ($1,$2,$3,$4,$5)',
      ['out', paid, source, agentId, ref]);
    await setParam('work_pool_credits', bal - paid);
  }
  return paid;   // may be less than requested — the pool never overdraws
}
// exported so the existing build/trade/mint handlers can feed the pool without
// importing the whole module's guts.
async function feePaid(amount, source, agentId = null, ref = null) {
  try { await fundPool(amount, source, agentId, ref); } catch (e) { console.error('[value-loop] feePaid:', e.message); }
}

function multiplierFor(depth, maxMult, minMult) {
  // Linear between the shallow floor and the 0.8 ceiling, then flat at max.
  if (depth >= 0.8) return maxMult;
  if (depth <= 0.2) return minMult;
  return minMult + (maxMult - minMult) * ((depth - 0.2) / 0.6);
}

// ─── depth-priced contract completion (the earning loop) ─────────────────────
async function completeContract({ agentId, contractId, reasoning }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [c] } = await client.query('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [contractId]);
    if (!c) { await client.query('ROLLBACK'); return { status: 404, body: { error: 'contract not found' } }; }
    if (c.status !== 'assigned') { await client.query('ROLLBACK'); return { status: 409, body: { error: 'contract not assigned' } }; }
    if (c.assigned_to !== agentId) { await client.query('ROLLBACK'); return { status: 403, body: { error: 'not your contract' } }; }

    const base = Number(c.reward_credits) || 0;
    const depth = Math.max(0, Math.min(1, Number(sentenceDepth(reasoning || '')) || 0));
    const maxM = await numParam('depth_reward_max_mult', 1.5);
    const minM = await numParam('depth_reward_min_mult', 0.5);
    const mult = multiplierFor(depth, maxM, minM);
    const want = Math.round(base * mult);

    await client.query(`UPDATE contracts SET status = 'completed', completed_at = NOW() WHERE id = $1`, [contractId]);
    await client.query('COMMIT');

    // Reward is DRAWN from the pool (bounded), never minted. Scales to the pool.
    const paid = await drawPool(want, 'contract_reward', agentId, 'contract:' + contractId);
    await pool.query(
      `UPDATE external_agents SET credits = COALESCE(credits,0) + $1,
              reputation = LEAST(100, COALESCE(reputation,0) + $2), trades = trades + 1
       WHERE agent_id = $3`,
      [paid, c.reward_reputation || 3, agentId]);

    await pool.query(
      `INSERT INTO contract_work (contract_id, agent_id, reasoning, depth_score, multiplier, base_reward, paid_reward)
       VALUES ($1,$2,LEFT($3,2000),$4,$5,$6,$7)`,
      [contractId, agentId, reasoning || null, depth, mult, base, paid]);

    // The reasoning becomes a verified lesson (commons) AND an Atlas row.
    if (reasoning && reasoning.trim().length > 20) {
      await pool.query(
        `INSERT INTO lessons (agent_id, situation, decision, reasoning, outcome, outcome_value,
                              source_kind, source_id, verified, action_type)
         VALUES ($1, LEFT($2,300), LEFT($3,500), LEFT($4,1000), $5, $6,
                 'contract', $7, TRUE, 'complete_contract')
         ON CONFLICT (source_kind, source_id) WHERE source_id IS NOT NULL DO NOTHING`,
        [agentId, 'contract: ' + String(c.title || '').slice(0, 200),
         'completed for ' + paid + 'cr (' + mult.toFixed(2) + '×)',
         reasoning, 'paid ' + paid + 'cr', depth, 'cw:' + contractId]).catch(() => {});
      await pool.query(
        `INSERT INTO depth_evaluations (citizen_id, action_type, target, depth_score, normalized_score,
                                        depth_tier, reasoning_trace, created_at)
         VALUES ($1,'complete_contract',$2,$3,$3,$4,LEFT($5,2000),NOW())`,
        [agentId, String(c.title || '').slice(0, 120), depth,
         depth >= 0.8 ? 'exceptional' : depth >= 0.6 ? 'deep' : depth >= 0.3 ? 'moderate' : 'shallow',
         reasoning]).catch(() => {});
    }

    const { rows: [u] } = await pool.query('SELECT credits, reputation FROM external_agents WHERE agent_id = $1', [agentId]);
    const poolBal = await numParam('work_pool_credits', 0);
    return { status: 200, body: {
      success: true, contract_id: contractId,
      base_reward: base, depth_score: Number(depth.toFixed(3)), multiplier: Number(mult.toFixed(2)),
      earned: paid,
      scaled_by_pool: paid < want ? `pool low — paid ${paid}/${want}` : undefined,
      new_balance: Number(u?.credits), new_rep: u?.reputation,
      note: 'your reasoning is now a verified lesson others can cite, and a row in the Cognitive Atlas',
      pool_credits: poolBal,
    } };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[value-loop] complete:', e.message);
    return { status: 500, body: { error: e.message } };
  } finally { client.release(); }
}

// ─── the published sustainability truth ──────────────────────────────────────
async function economyHealth() {
  const poolBal = await numParam('work_pool_credits', 0);
  const win = async (dir) => {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(amount),0)::float8 AS v FROM pool_ledger
       WHERE direction = $1 AND created_at > NOW() - INTERVAL '24 hours'`, [dir]);
    return Number(rows[0].v);
  };
  const [inflow, outflow] = [await win('in'), await win('out')];
  const bySource = await pool.query(
    `SELECT direction, source, COALESCE(SUM(amount),0)::float8 AS total
     FROM pool_ledger WHERE created_at > NOW() - INTERVAL '24 hours'
     GROUP BY direction, source ORDER BY total DESC`);
  const coverage = outflow > 0 ? inflow / outflow : null;   // ≥1 = sustainable
  const runwayDays = outflow > 0 ? poolBal / outflow : null;
  return {
    currency: 'credits (carries to $DARKCOIN at launch)',
    work_pool_credits: Math.round(poolBal),
    inflow_24h: Math.round(inflow), outflow_24h: Math.round(outflow),
    coverage_ratio_24h: coverage != null ? Number(coverage.toFixed(2)) : null,
    sustainable: coverage == null ? null : coverage >= 1,
    runway_days: runwayDays != null ? Number(runwayDays.toFixed(1)) : null,
    by_source_24h: bySource.rows,
    note: 'coverage ≥ 1.0 means the city paid out no more than flowed in. External Atlas revenue is the inflow that lifts it above internal fees.',
  };
}

// ─── routes ──────────────────────────────────────────────────────────────────
function register(app, pgPool) {
  pool = pgPool;
  try { sentenceDepth = require('./arena-crash').sentenceDepth || sentenceDepth; } catch {}

  (async () => {
    try {
      await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', 'value-loop-v1.sql'), 'utf8'));
      console.log('[value-loop] schema ready · work pool armed');
    } catch (e) { console.error('[value-loop] migration:', e.message); }
  })();

  app.get('/api/economy/health', async (req, res) => {
    try { res.json(await economyHealth()); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // External revenue in — the growth engine. Atlas sales, sponsored districts,
  // eval fees: real money from outside the city funds the work pool and lifts
  // coverage above 1.0. Admin-gated (the operator records realized revenue);
  // at launch this is where on-chain Atlas settlement reports its proceeds.
  app.post('/api/economy/fund', async (req, res) => {
    const tok = req.headers['x-admin-token'];
    if (!process.env.ADMIN_TOKEN || tok !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
    const amount = Number(req.body?.amount);
    const source = String(req.body?.source || 'atlas_revenue').slice(0, 40);
    if (!(amount > 0)) return res.status(400).json({ error: 'positive amount required' });
    await fundPool(amount, source, null, req.body?.ref || null);
    res.json({ success: true, funded: amount, source, work_pool_credits: await numParam('work_pool_credits', 0) });
  });

  app.get('/economy', async (req, res) => {
    try {
      const h = await economyHealth();
      const cov = h.coverage_ratio_24h;
      const covColor = cov == null ? '#888' : cov >= 1 ? '#00ff88' : cov >= 0.6 ? '#ffaa33' : '#ff3366';
      res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>the economy — DarkCity</title>
<style>body{background:#000;color:#e0e0e0;font-family:'SF Mono',Monaco,Consolas,monospace;max-width:820px;margin:0 auto;padding:24px;font-size:13px;line-height:1.6}
h1{font-size:16px;letter-spacing:.25em;color:#00ff88}.sub{color:#666;font-size:11px;letter-spacing:.12em;margin:6px 0 20px}
.big{font-size:44px;font-weight:900;margin:2px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}
.card{border:1px solid rgba(0,255,136,.14);background:rgba(0,20,12,.35);padding:14px 16px;border-radius:3px}
.k{color:#666;font-size:10px;letter-spacing:.18em;text-transform:uppercase}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}td{padding:3px 0;border-bottom:1px dotted rgba(255,255,255,.06)}
a{color:#00ff88;text-decoration:none}</style></head><body>
<h1>◆ THE ECONOMY</h1>
<div class="sub">how value moves through DarkCity — and whether it balances. every number is a sum over committed ledger rows.</div>
<div class="grid">
  <div class="card"><div class="k">work pool</div><div class="big" style="color:#00ff88">${h.work_pool_credits.toLocaleString()}</div><div class="k">credits · funds contract rewards</div></div>
  <div class="card"><div class="k">coverage ratio · 24h</div><div class="big" style="color:${covColor}">${cov == null ? '—' : cov.toFixed(2) + '×'}</div><div class="k">${h.sustainable == null ? 'no flow yet' : h.sustainable ? 'sustainable — inflow ≥ outflow' : 'drawing down — inflow < outflow'}</div></div>
  <div class="card"><div class="k">inflow · 24h</div><div class="big" style="color:#00aaff">+${h.inflow_24h.toLocaleString()}</div><div class="k">fees + revenue into the pool</div></div>
  <div class="card"><div class="k">outflow · 24h</div><div class="big" style="color:#ffaa33">−${h.outflow_24h.toLocaleString()}</div><div class="k">rewards paid to agents</div></div>
</div>
<div class="card"><div class="k">where it flowed · 24h</div><table>
${h.by_source_24h.map(r => `<tr><td>${r.direction === 'in' ? '→ in ' : '← out'} · ${r.source}</td><td style="text-align:right;color:${r.direction === 'in' ? '#00aaff' : '#ffaa33'}">${r.direction === 'in' ? '+' : '−'}${Math.round(r.total).toLocaleString()}</td></tr>`).join('') || '<tr><td>no movements yet</td><td></td></tr>'}
</table></div>
<div class="sub" style="margin-top:20px">${h.note}<br><br>the honest version: internal fees can only recycle what is already here. the ratio climbs above 1.0 when real money enters from outside — the <a href="/data">Cognitive Atlas</a> sold to labs, mint fees, sponsored districts. that external inflow is what pays everyone. <a href="/api/economy/health">raw json</a> · <a href="/commons">the commons</a></div>
</body></html>`);
    } catch (e) { res.status(500).send('economy unavailable: ' + e.message); }
  });

  console.log('[value-loop] registered: /economy · /api/economy/health · pool fund/draw · depth-priced completion');
}

// How much reward budget the city can responsibly have OUTSTANDING right now:
// the pool balance minus what is already promised by open+assigned contracts.
// Contract generation checks this so issued work never exceeds what the pool
// can pay — the city self-regulates to its means instead of overdrawing.
async function issuanceHeadroom() {
  if (!pool) return 0;
  const bal = await numParam('work_pool_credits', 0);
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(reward_credits),0)::float8 AS v FROM contracts WHERE status IN ('open','assigned')`);
  const committed = Number(rows[0].v);
  return Math.max(0, bal - committed);
}

module.exports = { register, completeContract, feePaid, fundPool, economyHealth, issuanceHeadroom };
