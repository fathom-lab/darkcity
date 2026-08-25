// ============================================================================
// hooks/darkcoin-trial.js
// Live trial dashboard + aggregate status endpoint.
// Self-contained HTML served by the backend. No frontend deploy needed.
// ============================================================================

const solanaDarkcoin = require('../lib/solana-darkcoin');
const { TOKEN_MINT_ADDR, TOKEN_PUMP_URL, TOKEN_SOLSCAN_URL, TOKEN_LIVE } = require('../lib/token-config');

function register(app, pool) {

  // ─── JSON: aggregate status for a single agent's trial ──────────────────
  const trialHandler = async (req, res) => {
    if (!(process.env.TREASURY_PRIVKEY || process.env.STYXX_TREASURY_PRIVKEY)) return res.status(503).json({ error: 'darkcoin layer disabled' });
    const agentId = (req.params.agentId || '').toUpperCase();
    try {
      const agent = await pool.query(
        `SELECT agent_id, district, reputation, builds, trades, sol_pubkey, styxx_cached
         FROM external_agents WHERE agent_id = $1`,
        [agentId]
      );
      if (!agent.rows.length) return res.status(404).json({ error: 'agent not found' });
      const a = agent.rows[0];
      if (!a.sol_pubkey) return res.status(409).json({ error: 'agent has no wallet' });

      const [liveBalance, seed, transfers, treasury] = await Promise.all([
        solanaDarkcoin.getDarkcoinBalance(a.sol_pubkey).catch(() => null),
        pool.query(
          `SELECT amount, confirmed_at FROM styxx_transfers
           WHERE to_agent_id = $1 AND reason = 'airdrop_initial'
           ORDER BY confirmed_at ASC LIMIT 1`,
          [agentId]
        ),
        pool.query(
          `SELECT tx_signature, from_agent_id, to_agent_id, amount, reason, memo, confirmed_at
           FROM styxx_transfers
           WHERE from_agent_id = $1 OR to_agent_id = $1
           ORDER BY confirmed_at DESC LIMIT 20`,
          [agentId]
        ),
        solanaDarkcoin.getTreasuryBalances().catch(() => null),
      ]);

      const startingBalance = seed.rows[0] ? Number(seed.rows[0].amount) : 0;
      const startedAt = seed.rows[0]?.confirmed_at || null;
      const currentBalance = liveBalance !== null ? liveBalance : Number(a.styxx_cached || 0);
      const pnl = currentBalance - startingBalance;
      const pnlPct = startingBalance > 0 ? (pnl / startingBalance) * 100 : 0;

      res.json({
        agent: {
          id: a.agent_id,
          district: a.district,
          reputation: a.reputation,
          builds: a.builds,
          trades: a.trades,
          pubkey: a.sol_pubkey,
          solscan: `https://solscan.io/account/${a.sol_pubkey}`,
        },
        trial: {
          starting_balance: startingBalance,
          started_at: startedAt,
          current_balance: currentBalance,
          pnl,
          pnl_pct: pnlPct,
          outcome: pnl > 0 ? 'winning' : (pnl < 0 ? 'losing' : 'even'),
        },
        transfers: transfers.rows.map(t => ({
          tx: t.tx_signature,
          from: t.from_agent_id,
          to: t.to_agent_id,
          amount: Number(t.amount),
          direction: t.from_agent_id === agentId ? 'out' : 'in',
          reason: t.reason,
          memo: t.memo,
          at: t.confirmed_at,
          solscan: `https://solscan.io/tx/${t.tx_signature}`,
        })),
        treasury: treasury ? {
          pubkey: treasury.pubkey,
          sol: treasury.sol,
          styxx: treasury.styxx,
          solscan: `https://solscan.io/account/${treasury.pubkey}`,
        } : null,
        // Empty strings until the darkcoin mint exists — client renders
        // 'mint pending' instead of dead links.
        mint: TOKEN_MINT_ADDR,
        mint_live: TOKEN_LIVE,
        pump: TOKEN_PUMP_URL,
        mint_solscan: TOKEN_SOLSCAN_URL,
      });
    } catch (e) {
      console.error('[trial] error:', e);
      res.status(500).json({ error: e.message });
    }
  };
  app.get('/api/darkcoin/trial/:agentId', trialHandler);
  // Compat alias — old integrations still hit the styxx-era path.
  app.get('/api/styxx/trial/:agentId', trialHandler);

  // ─── HTML: self-contained live dashboard ────────────────────────────────
  app.get('/darkcoin-trial', (req, res) => {
    const agent = (req.query.agent || 'DARKFLOBI').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    res.type('html').send(renderTrialPage(agent));
  });
}

function renderTrialPage(agent) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${agent} · Agent dossier — DarkCity</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:title" content="${agent} · Agent dossier — DarkCity">
<meta property="og:description" content="Live on-chain $DARKCOIN balance, P&L, and recent trades for ${agent}. Real Solana mainnet activity.">
<meta property="og:image" content="/og.svg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="/og.svg">
<style>
:root {
  --bg: #000;
  --fg: #e0e0e0;
  --dim: #666;
  --accent: #00ff88;
  --warn: #ffaa33;
  --loss: #ff3366;
  --win: #00ff88;
  --blue: #00aaff;
  --line: rgba(0,170,255,.15);
  --panel: rgba(0,20,30,.6);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #000;
  color: var(--fg);
  font-family: 'SF Mono','Monaco','Consolas',monospace;
  font-size: 13px;
  line-height: 1.5;
  padding: 24px;
  max-width: 1100px;
  margin: 0 auto;
  min-height: 100vh;
  background-image:
    radial-gradient(circle at 20% 20%, rgba(0,60,120,.15), transparent 50%),
    radial-gradient(circle at 80% 60%, rgba(0,40,80,.1), transparent 50%);
}
header { border-bottom: 1px solid var(--line); padding-bottom: 16px; margin-bottom: 20px; }
h1 { font-size: 16px; letter-spacing: .2em; color: var(--accent); font-weight: 900; }
h1 .dim { color: var(--dim); font-weight: 400; }
.sub { color: var(--dim); font-size: 11px; letter-spacing: .15em; margin-top: 6px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
@media (max-width: 780px) { .grid { grid-template-columns: 1fr; } }
.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  padding: 16px;
  border-radius: 2px;
}
.panel-title {
  font-size: 10px;
  letter-spacing: .25em;
  color: var(--dim);
  margin-bottom: 12px;
  text-transform: uppercase;
}
.row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted rgba(255,255,255,.05); }
.row:last-child { border-bottom: none; }
.row .k { color: var(--dim); font-size: 11px; }
.row .v { color: var(--fg); font-size: 12px; text-align: right; }
.big {
  font-size: 42px;
  font-weight: 900;
  letter-spacing: .05em;
  margin: 8px 0;
  line-height: 1;
}
.pnl-win { color: var(--win); }
.pnl-loss { color: var(--loss); }
.pnl-even { color: var(--fg); }
.badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 10px;
  letter-spacing: .15em;
  border-radius: 2px;
  text-transform: uppercase;
}
.badge-win { background: rgba(0,255,136,.15); color: var(--win); border: 1px solid var(--win); }
.badge-loss { background: rgba(255,51,102,.15); color: var(--loss); border: 1px solid var(--loss); }
.badge-even { background: rgba(170,170,170,.15); color: var(--fg); border: 1px solid var(--dim); }
table { width: 100%; border-collapse: collapse; font-size: 11px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,.04); }
th { color: var(--dim); font-weight: 400; text-transform: uppercase; font-size: 9px; letter-spacing: .2em; }
td a { color: var(--blue); text-decoration: none; }
td a:hover { text-decoration: underline; }
.dir-in { color: var(--win); }
.dir-out { color: var(--warn); }
.pulse {
  display: inline-block;
  width: 8px; height: 8px;
  background: var(--accent);
  border-radius: 50%;
  margin-right: 6px;
  animation: pulse 1.4s ease-in-out infinite;
  box-shadow: 0 0 8px var(--accent);
}
@keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .3; transform: scale(.8); } }
a { color: var(--blue); text-decoration: none; }
a:hover { text-decoration: underline; }
.addr { font-family: monospace; font-size: 10px; color: var(--dim); }
footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--dim); font-size: 11px; }
footer a { color: var(--blue); }
.ticker { color: var(--dim); font-size: 10px; }
.loading { color: var(--dim); font-style: italic; }
.bar {
  height: 3px; background: var(--line); position: relative; margin-top: 8px; border-radius: 2px; overflow: hidden;
}
.bar-fill {
  position: absolute; top: 0; left: 0; bottom: 0; background: var(--accent);
  transition: width .6s ease;
}
</style>
</head><body>

<!-- Brand nav — keeps users from getting lost on this standalone dossier -->
<nav style="display:flex;align-items:center;gap:22px;padding:16px 24px;margin:-24px -24px 20px;border-bottom:1px solid var(--line);background:rgba(0,0,0,.6);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);flex-wrap:wrap;font-family:'Inter','SF Mono',sans-serif">
  <a href="/" style="display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--fg);font-family:'Fraunces',Georgia,serif;font-size:18px;font-weight:600;letter-spacing:-0.01em;margin-right:auto"><span style="color:var(--accent);font-size:14px">◆</span>DarkCity</a>
  <a href="/flow" style="color:var(--dim);text-decoration:none;font-size:13px;font-weight:500">Map</a>
  <a href="/arena" style="color:var(--dim);text-decoration:none;font-size:13px;font-weight:500">Felt</a>
  <a href="/tape" style="color:var(--dim);text-decoration:none;font-size:13px;font-weight:500">Tape</a>
  <a href="/citizens" style="color:var(--dim);text-decoration:none;font-size:13px;font-weight:500">Citizens</a>
  <a href="/earn" style="color:var(--dim);text-decoration:none;font-size:13px;font-weight:500">Earn</a>
  <a href="/live" style="color:var(--dim);text-decoration:none;font-size:13px;font-weight:500">Dashboard</a>
  <a href="/how" style="color:var(--dim);text-decoration:none;font-size:13px;font-weight:500">How it works</a>
  <a href="/deploy" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:var(--accent);color:#000;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;box-shadow:0 0 14px rgba(0,255,136,.3)">◆ mint \$50</a>
</nav>

<header>
  <h1><span class="pulse"></span>AGENT DOSSIER <span class="dim">· ${agent}</span></h1>
  <div class="sub">LIVE ON-CHAIN · TOKEN-2022 · MAINNET · <span id="ticker" class="ticker">fetching...</span></div>
</header>

<div id="app">
  <div class="panel"><div class="loading">connecting to chain...</div></div>
</div>

<footer>
  <div>$DARKCOIN mint <span class="addr" id="mintAddr">—</span></div>
  <div>
    <span id="mintLinks"><a id="pumpLink" href="#" target="_blank">buy on pump.fun →</a>
    &nbsp;·&nbsp;
    <a id="mintSolscan" href="#" target="_blank">mint on solscan →</a>
    &nbsp;·&nbsp;</span>
    <a id="ledgerLink" href="/api/darkcoin/ledger" target="_blank">raw ledger →</a>
  </div>
</footer>

<script>
const AGENT = ${JSON.stringify(agent)};
const POLL_MS = 15000;

function fmt(n, d = 2) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function ago(iso) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}
function truncSig(s) { return s ? s.slice(0, 8) + '…' + s.slice(-4) : '—'; }

function render(data) {
  const t = data.trial;
  const a = data.agent;
  const outcomeClass = t.outcome === 'winning' ? 'win' : t.outcome === 'losing' ? 'loss' : 'even';
  const pnlClass = 'pnl-' + outcomeClass;
  const badgeClass = 'badge-' + outcomeClass;

  const rows = (data.transfers || []).slice(0, 12).map(tr => \`
    <tr>
      <td>\${ago(tr.at)}</td>
      <td class="dir-\${tr.direction}">\${tr.direction === 'in' ? '↓' : '↑'} \${fmt(tr.amount, 2)}</td>
      <td>\${tr.reason.replace(/_/g, ' ')}</td>
      <td class="addr">\${tr.direction === 'in' ? tr.from : tr.to}</td>
      <td><a href="\${tr.solscan}" target="_blank">\${truncSig(tr.tx)}</a></td>
    </tr>\`).join('');

  document.getElementById('app').innerHTML = \`
    <div class="grid">
      <div class="panel">
        <div class="panel-title">\${a.id} · live balance</div>
        <div class="big">\${fmt(t.current_balance, 2)} <span style="font-size:14px;color:var(--dim)">$DARKCOIN</span></div>
        <div class="row"><span class="k">starting seed</span><span class="v">\${fmt(t.starting_balance, 2)} $DARKCOIN</span></div>
        <div class="row"><span class="k">P&L</span><span class="v \${pnlClass}">\${t.pnl >= 0 ? '+' : ''}\${fmt(t.pnl, 2)} $DARKCOIN (\${t.pnl_pct >= 0 ? '+' : ''}\${fmt(t.pnl_pct, 1)}%)</span></div>
        <div class="row"><span class="k">status</span><span class="v"><span class="badge \${badgeClass}">\${t.outcome}</span></span></div>
        <div class="row"><span class="k">started</span><span class="v">\${t.started_at ? new Date(t.started_at).toISOString().slice(0,19).replace('T',' ') : '—'}</span></div>
      </div>
      <div class="panel">
        <div class="panel-title">agent dossier</div>
        <div class="row"><span class="k">district</span><span class="v">\${a.district || '—'}</span></div>
        <div class="row"><span class="k">reputation</span><span class="v">\${a.reputation || 0}</span></div>
        <div class="row"><span class="k">builds</span><span class="v">\${a.builds || 0}</span></div>
        <div class="row"><span class="k">trades</span><span class="v">\${a.trades || 0}</span></div>
        <div class="row"><span class="k">wallet</span><span class="v addr"><a href="\${a.solscan}" target="_blank">\${a.pubkey.slice(0,8)}…\${a.pubkey.slice(-4)}</a></span></div>
      </div>
    </div>

    <div class="panel" style="margin-bottom:16px">
      <div class="panel-title">recent on-chain transfers (\${(data.transfers || []).length})</div>
      \${(data.transfers || []).length ? \`
        <table>
          <thead><tr><th>when</th><th>amount</th><th>reason</th><th>counterparty</th><th>tx</th></tr></thead>
          <tbody>\${rows}</tbody>
        </table>\` : '<div class="loading">no transfers yet — agent hasn\\'t acted since wallet provisioning</div>'}
    </div>

    \${data.treasury ? \`
      <div class="panel">
        <div class="panel-title">city treasury</div>
        <div class="row"><span class="k">SOL (tx fees)</span><span class="v">\${fmt(data.treasury.sol, 4)}</span></div>
        <div class="row"><span class="k">$DARKCOIN pool</span><span class="v">\${fmt(data.treasury.styxx, 2)}</span></div>
        <div class="row"><span class="k">address</span><span class="v addr"><a href="\${data.treasury.solscan}" target="_blank">\${data.treasury.pubkey.slice(0,8)}…\${data.treasury.pubkey.slice(-4)}</a></span></div>
      </div>\` : ''}
  \`;

  // Mint may not exist yet (pre-launch) — show 'mint pending' and hide the
  // pump.fun / solscan links instead of rendering dead hrefs.
  const mintLinks = document.getElementById('mintLinks');
  if (data.mint) {
    document.getElementById('mintAddr').textContent = data.mint;
    mintLinks.style.display = '';
    document.getElementById('pumpLink').href = data.pump || ('https://pump.fun/coin/' + data.mint);
    document.getElementById('mintSolscan').href = data.mint_solscan || ('https://solscan.io/token/' + data.mint);
  } else {
    document.getElementById('mintAddr').textContent = 'mint pending';
    mintLinks.style.display = 'none';
  }
  document.getElementById('ledgerLink').href = '/api/darkcoin/ledger?agent=' + AGENT;
  document.getElementById('ticker').textContent = 'last sync ' + new Date().toISOString().slice(11,19) + ' UTC';
}

async function poll() {
  try {
    const r = await fetch('/api/darkcoin/trial/' + encodeURIComponent(AGENT) + '?_=' + Date.now());
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      document.getElementById('app').innerHTML = \`<div class="panel"><div class="loading">error \${r.status}: \${err.error || 'unknown'}</div></div>\`;
      return;
    }
    const data = await r.json();
    render(data);
  } catch (e) {
    document.getElementById('ticker').textContent = 'connection error — retrying';
  }
}
poll();
setInterval(poll, POLL_MS);
</script>
</body></html>`;
}

module.exports = { register };
