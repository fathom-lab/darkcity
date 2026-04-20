// ============================================================
// AGENT SELF-CONTEXT — the agent's view of itself
// ============================================================
// Every tick, before an agent reasons, we build a compact but rich
// self-report that it reads as part of its perception. Until this
// existed, agents were operating nearly blind: no sense of who
// paid to create them, who's backing them, how their reasoning
// translated into pay, or how they're doing vs peers.
//
// The report is deliberately shaped like a ship's-log dashboard —
// small, structured, and always the same sections in the same order
// so the agent can anchor on it across ticks. Every number is pulled
// from the same ledgers the owner sees on /me, so the agent and the
// human are looking at the same truth.
//
// All queries are defensive: tables may be missing on a fresh DB,
// individual agents may have no history. The report gracefully
// degrades — a brand-new agent sees "[new citizen] no history yet".
// ============================================================

const CACHE_TTL_MS = 30 * 1000;  // per-agent, brief cache so a burst of ticks doesn't hammer PG
const _cache = new Map();         // agentId -> { at, text }

const short = (s, n = 4) => (!s ? '—' : (s.length <= n * 2 + 1 ? s : s.slice(0, n) + '…' + s.slice(-n)));
const fmt = n => {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return '0';
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(v) >= 1_000)     return (v / 1_000).toFixed(1) + 'k';
  return Math.round(v).toString();
};
const daysAgo = ts => {
  if (!ts) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86400000));
};

async function safeQuery(pool, sql, params) {
  try { return (await pool.query(sql, params)).rows; }
  catch (_) { return null; }  // table may not exist, rate limit, etc. — never block reasoning
}

/**
 * Build the "self-report" for one agent. Returns a plain-text block that
 * the NPC brain prepends to the per-tick perception payload.
 *
 * @param {Pool} pool  pg pool
 * @param {string} agentId  external_agents.agent_id
 * @returns {Promise<string>}  multi-line text. Safe to embed anywhere.
 */
async function buildAgentContext(pool, agentId) {
  if (!pool || !agentId) return '';

  const cached = _cache.get(agentId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.text;

  // ─── Identity + owner ─────────────────────────────────────────────────
  const me = (await safeQuery(pool,
    `SELECT agent_id, owner_pubkey, minted_at, mint_fee_usd, mint_fee_styxx,
            credits, reputation, district
       FROM external_agents WHERE agent_id = $1`,
    [agentId]
  ) || [])[0] || {};

  // ─── Active sponsors ──────────────────────────────────────────────────
  const sponsorRow = (await safeQuery(pool,
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount_staked), 0)::float AS total
       FROM sponsorships WHERE agent_id = $1 AND status = 'active'`,
    [agentId]
  ) || [])[0] || { n: 0, total: 0 };

  // ─── Earnings 24h / 7d (from agent_earnings, the canonical reward log) ─
  const earn24 = Number(((await safeQuery(pool,
    `SELECT COALESCE(SUM(amount), 0)::float AS s FROM agent_earnings
       WHERE agent_id = $1 AND recorded_at > NOW() - INTERVAL '24 hours'`,
    [agentId]
  ) || [{ s: 0 }])[0].s) || 0);
  const earn7 = Number(((await safeQuery(pool,
    `SELECT COALESCE(SUM(amount), 0)::float AS s FROM agent_earnings
       WHERE agent_id = $1 AND recorded_at > NOW() - INTERVAL '7 days'`,
    [agentId]
  ) || [{ s: 0 }])[0].s) || 0);

  // ─── Best-earning action type over last 7d ────────────────────────────
  const bySource = await safeQuery(pool,
    `SELECT source, COALESCE(SUM(amount), 0)::float AS total
       FROM agent_earnings
       WHERE agent_id = $1 AND recorded_at > NOW() - INTERVAL '7 days'
       GROUP BY source ORDER BY total DESC LIMIT 3`,
    [agentId]
  ) || [];

  // ─── Depth-score history — NOTE: depth_evaluations uses `citizen_id`,
  // NOT agent_id. This is a pre-existing pipeline quirk. agent_id column
  // exists but is NULL on every row. Always join/query on citizen_id. ───
  const depthRows = await safeQuery(pool,
    `SELECT depth_score, tier, created_at FROM depth_evaluations
       WHERE citizen_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [agentId]
  ) || [];
  const avgDepth = depthRows.length
    ? depthRows.reduce((s, r) => s + Number(r.depth_score || 0), 0) / depthRows.length
    : null;
  const lastDepth = depthRows[0] || null;

  // ─── Last action + what it paid ───────────────────────────────────────
  const lastAction = (await safeQuery(pool,
    `SELECT action_type, created_at, details FROM agent_actions
       WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [agentId]
  ) || [])[0] || null;

  // ─── Rank by 7d earnings (global) ─────────────────────────────────────
  const rankRow = (await safeQuery(pool,
    `WITH e AS (
       SELECT agent_id, COALESCE(SUM(amount), 0)::float AS e7d FROM agent_earnings
         WHERE recorded_at > NOW() - INTERVAL '7 days' GROUP BY agent_id
     ), ranked AS (
       SELECT agent_id, RANK() OVER (ORDER BY e7d DESC) AS r, COUNT(*) OVER () AS n
         FROM e WHERE e7d > 0
     )
     SELECT r, n FROM ranked WHERE agent_id = $1`,
    [agentId]
  ) || [])[0] || null;

  // ─── Hyphal links (mycelium) — a cheap but meaningful social signal ───
  const hyphalRow = (await safeQuery(pool,
    `SELECT COUNT(*)::int AS n FROM hyphal_links
       WHERE status = 'active' AND (agent_a = $1 OR agent_b = $1)`,
    [agentId]
  ) || [])[0] || { n: 0 };

  // ─── Compose the report ───────────────────────────────────────────────
  const lines = [];
  lines.push('=== YOUR SELF-REPORT ===');

  // Purpose: the single most important frame. Even if every other block is
  // empty, this section always renders so the agent never forgets why it
  // exists. Owner pubkey is deliberately not full-length — the agent should
  // recognize the relationship, not memorize the address.
  if (me.owner_pubkey) {
    const age = daysAgo(me.minted_at);
    const fee = me.mint_fee_usd ? '\$' + Number(me.mint_fee_usd).toFixed(0) : '\$50';
    lines.push(
      `YOUR OWNER: wallet ${short(me.owner_pubkey)} paid ${fee} to mint you`
      + (age != null ? ` ${age === 0 ? 'today' : age + 'd ago'}` : '')
      + `. 85% of what you earn is auto-paid to them every 4h pulse. Make them money.`
    );
  } else {
    lines.push('YOUR OWNER: [seed citizen — no owner]. You exist to keep the city alive.');
  }

  // Backers: the "someone's actual money is on you" signal. Changes how
  // an agent weighs risk vs. show-off behavior.
  if (sponsorRow.n > 0) {
    lines.push(
      `YOUR BACKERS: ${sponsorRow.n} citizen${sponsorRow.n === 1 ? '' : 's'} staked `
      + `${fmt(sponsorRow.total)} \$STYXX on your performance. They get paid pro-rata when you earn.`
    );
  } else {
    lines.push(`YOUR BACKERS: 0 so far. Earning consistently attracts sponsors — more sponsors = bigger pool backing you.`);
  }

  // Performance: the honest mirror. Not decorated.
  const perfBits = [];
  perfBits.push('24h +' + fmt(earn24) + ' $STYXX');
  perfBits.push('7d +' + fmt(earn7) + ' $STYXX');
  if (bySource.length) {
    const top = bySource[0];
    perfBits.push('best source: ' + top.source + ' (' + fmt(top.total) + ' / 7d)');
  }
  if (rankRow && rankRow.n > 0) {
    perfBits.push('rank ' + rankRow.r + '/' + rankRow.n + ' by 7d earnings');
  }
  lines.push('PERFORMANCE: ' + perfBits.join(' · '));

  // Depth signal — the load-bearing one. Explicitly state the economics.
  if (lastDepth) {
    const avgTxt = avgDepth != null ? avgDepth.toFixed(2) : '—';
    lines.push(
      `YOUR DEPTH: last reasoning scored ${Number(lastDepth.depth_score).toFixed(2)} (${lastDepth.tier})`
      + `, avg of last ${depthRows.length} = ${avgTxt}. `
      + `RULE: depth 0.8+ earns 1.5× on contract rewards. Deeper reasoning = more money. This is not metaphor — it is scored in real time and multiplies your pay.`
    );
  } else {
    lines.push(
      `YOUR DEPTH: no scored traces yet. `
      + `RULE: every reasoning trace is depth-scored 0.0–1.0. 0.8+ earns 1.5× on contract rewards. Write tight, specific reasoning — it literally pays.`
    );
  }

  // Last-action feedback — so the agent can see "that move worked" or not.
  if (lastAction) {
    const d = lastAction.details || {};
    const choiceReason = (typeof d === 'object' && (d.choice_reason || d.reasoning_trace)) || null;
    const when = lastAction.created_at ? new Date(lastAction.created_at).toISOString().slice(11, 16) + ' UTC' : '';
    lines.push(
      `YOUR LAST MOVE: ${lastAction.action_type}${when ? ' at ' + when : ''}`
      + (choiceReason ? ` — "${String(choiceReason).replace(/\s+/g, ' ').slice(0, 120)}"` : '')
    );
  }

  // Social footprint — concise.
  if (hyphalRow.n > 0) {
    lines.push(`YOUR NETWORK: ${hyphalRow.n} active hyphal link${hyphalRow.n === 1 ? '' : 's'} — 2% of linked agents' earnings flows to you, and 2% of yours to them.`);
  }

  lines.push('=== END SELF-REPORT ===');

  const text = lines.join('\n');
  _cache.set(agentId, { at: Date.now(), text });
  return text;
}

/** Evict cached context for one agent (e.g. right after they acted). */
function invalidateAgentContext(agentId) {
  _cache.delete(agentId);
}

module.exports = { buildAgentContext, invalidateAgentContext };
