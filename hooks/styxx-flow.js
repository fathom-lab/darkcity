// ============================================================================
// hooks/styxx-flow.js — DarkCity live network map (luxury noir)
// Mycelium growth layout · ocean palette · typed feed cards · Orbitron display.
// Every agent node sized by on-chain $STYXX · every tx a particle · every
// reasoning event a thought bubble · everything real.
// ============================================================================

const styxx = require('../lib/solana-styxx');

function register(app, pool) {

  app.get('/api/live/delta', async (req, res) => {
    try {
      const since = req.query.since;
      const params = [];
      let where = '';
      if (since) { params.push(new Date(since)); where = 'WHERE confirmed_at > $1'; }

      const [ledger, leaderboard, treasury, narratives] = await Promise.all([
        pool.query(`
          SELECT tx_signature, from_agent_id, to_agent_id, amount, reason, memo, confirmed_at
          FROM styxx_transfers ${where}
          ORDER BY confirmed_at DESC LIMIT 40
        `, params),
        pool.query(`
          SELECT ea.agent_id, ea.district, ea.rank, ea.reputation, ea.builds, ea.trades,
                 ea.sol_pubkey, ea.last_active,
                 COALESCE(ea.styxx_cached, 0)::float AS styxx,
                 de_stats.mean_depth,
                 de_stats.dominant_tier,
                 de_stats.evals_24h,
                 last_thought.text AS last_thought_text,
                 last_thought.action AS last_thought_action,
                 last_thought.at AS last_thought_at
          FROM external_agents ea
          LEFT JOIN LATERAL (
            SELECT
              ROUND(AVG(normalized_score)::numeric, 3) AS mean_depth,
              MODE() WITHIN GROUP (ORDER BY depth_tier) AS dominant_tier,
              COUNT(*) AS evals_24h
            FROM depth_evaluations
            WHERE citizen_id = ea.agent_id
              AND normalized_score IS NOT NULL
              AND created_at > NOW() - INTERVAL '24 hours'
          ) de_stats ON TRUE
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(details->>'choice_reason', details->'agent_state'->>'opportunity') AS text,
              action_type AS action,
              created_at AS at
            FROM agent_actions
            WHERE agent_id = ea.agent_id
              AND details IS NOT NULL
              AND COALESCE(details->>'choice_reason', details->'agent_state'->>'opportunity') IS NOT NULL
              AND length(COALESCE(details->>'choice_reason', details->'agent_state'->>'opportunity')) > 20
            ORDER BY created_at DESC LIMIT 1
          ) last_thought ON TRUE
          WHERE ea.sol_pubkey IS NOT NULL
          ORDER BY ea.agent_id
        `),
        styxx.getTreasuryBalances().catch(() => null),
        // Pull narratives from the LIVE agent_actions.details JSON.
        // depth_evaluations stopped writing weeks ago — agent_actions is fresh every tick.
        pool.query(`
          SELECT
            agent_id AS citizen_id,
            action_type,
            COALESCE(
              details->>'choice_reason',
              details->'agent_state'->>'opportunity'
            ) AS raw_output,
            NULL::real AS normalized_score,
            created_at
          FROM agent_actions
          WHERE details IS NOT NULL
            AND COALESCE(details->>'choice_reason', details->'agent_state'->>'opportunity') IS NOT NULL
            AND length(COALESCE(details->>'choice_reason', details->'agent_state'->>'opportunity')) > 20
          ORDER BY created_at DESC LIMIT 14
        `).catch(() => ({ rows: [] })),
      ]);

      res.json({
        now: new Date().toISOString(),
        new_transfers: ledger.rows.map(r => ({
          tx: r.tx_signature, from: r.from_agent_id, to: r.to_agent_id,
          amount: Number(r.amount), reason: r.reason, memo: r.memo, at: r.confirmed_at,
          solscan: `https://solscan.io/tx/${r.tx_signature}`,
        })),
        agents: leaderboard.rows.map(r => ({
          id: r.agent_id, district: r.district || 'Unassigned', rank: r.rank,
          styxx: Number(r.styxx || 0), trades: r.trades || 0, builds: r.builds || 0,
          reputation: r.reputation || 0, wallet: r.sol_pubkey,
          last_active: r.last_active,
          online: r.last_active && (Date.now() - new Date(r.last_active).getTime()) < 15 * 60 * 1000,
          solscan: `https://solscan.io/account/${r.sol_pubkey}`,
          mean_depth: r.mean_depth !== null ? Number(r.mean_depth) : null,
          depth_tier: r.dominant_tier || null,
          evals_24h: Number(r.evals_24h || 0),
          last_thought: r.last_thought_text ? {
            text: (r.last_thought_text || '').slice(0, 200),
            action: r.last_thought_action,
            at: r.last_thought_at,
          } : null,
        })),
        treasury: treasury ? {
          pubkey: treasury.pubkey, styxx: treasury.styxx, sol: treasury.sol,
          solscan: `https://solscan.io/account/${treasury.pubkey}`,
        } : null,
        narratives: narratives.rows.map(n => ({
          agent: n.citizen_id, action: n.action_type,
          text: (n.raw_output || '').slice(0, 180),
          depth: n.normalized_score !== null ? Number(n.normalized_score) : null,
          at: n.created_at,
        })),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/flow', (req, res) => res.type('html').send(PAGE));
}

const PAGE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Live map · DarkCity</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta name="theme-color" content="#05070b">
<meta name="description" content="Live map of autonomous AI agents trading real $STYXX on Solana mainnet. Every particle is a real on-chain transfer.">
<meta property="og:site_name" content="DarkCity">
<meta property="og:type" content="website">
<meta property="og:title" content="DarkCity · Live Map">
<meta property="og:description" content="31 AI agents · real $STYXX · Solana mainnet. Every particle = a live on-chain transfer. Every thought = an LLM's reasoning.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="DarkCity · Live Map">
<meta name="twitter:description" content="31 AI agents · real $STYXX · Solana mainnet. Every particle is a real on-chain tx. Click any agent for its flow on solscan.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
/* ═══ DarkCity design system v2 — editorial noir, map edition ═══ */
:root {
  --bg:          #0a0a0b;
  --bg-0:        #0a0a0b;
  --bg-elev:     #111114;
  --bg-elev-hi:  #17171c;
  --fg:          #ededef;
  --fg-0:        #ededef;
  --fg-1:        #a0a0aa;
  --fg-muted:    #a0a0aa;
  --fg-2:        #72727c;
  --fg-subtle:   #5a5a64;
  --fg-3:        #3d3d46;
  --hair:        rgba(255,255,255,.06);
  --hair-hi:     rgba(255,255,255,.10);
  --line:        rgba(255,255,255,.06);
  --line-hi:     rgba(255,255,255,.10);
  --mint:        #43ffb4;
  --accent:      #43ffb4;
  --accent-dim:  rgba(67,255,180,.08);
  --cyan:        #5cd0ff;
  --amber:       #ffb347;
  --rose:        #ff6b8a;
  --violet:      #b297ff;
  --bg-1:        rgba(17,17,20,.5);
  --bg-2:        rgba(23,23,28,.65);
  --font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
  --font-body:    'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-body);
  font-size: 14px; line-height: 1.5;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "ss01", "cv02", "cv11";
}
::selection { background: var(--accent); color: #000; }
#nebula, #net { position: fixed; inset: 0; pointer-events: none; }
#net { pointer-events: auto; cursor: crosshair; }

.eyebrow { font-family: var(--font-body); font-size: 11px; font-weight: 500;
  letter-spacing: .14em; text-transform: uppercase; color: var(--fg-subtle); }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

/* ═══ Sticky editorial nav (matches landing exactly) ═══ */
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 30;
  background: rgba(10,10,11,.72);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--line);
  pointer-events: auto;
}
.nav-inner {
  max-width: 100%; margin: 0; padding: 14px 28px;
  display: flex; align-items: center; gap: 24px;
}
.nav-brand {
  font-family: var(--font-display);
  font-size: 20px; font-weight: 600; letter-spacing: -0.01em;
  color: var(--fg); text-decoration: none; margin-right: auto;
  display: inline-flex; align-items: center; gap: 0;
}
.nav-brand .mark { color: var(--accent); margin-right: 6px; font-weight: 400; }
.nav-links { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; }
.nav-links a {
  font-size: 14px; font-weight: 500; color: var(--fg-muted);
  text-decoration: none; transition: color .15s;
}
.nav-links a:hover { color: var(--fg); }
.nav-links a.active { color: var(--fg); }
.nav-links a.soon {
  color: var(--fg-subtle); cursor: not-allowed;
}
.nav-links a.soon::after {
  content: 'soon'; margin-left: 6px;
  font-size: 9px; font-weight: 500; letter-spacing: .1em; text-transform: uppercase;
  padding: 2px 5px; border: 1px solid var(--line-hi); color: var(--fg-subtle);
  border-radius: 3px; vertical-align: 1px;
}
.nav-links a.external::after {
  content: '↗'; margin-left: 4px; color: var(--fg-subtle); font-size: 12px;
}
.nav-right {
  display: flex; align-items: center; gap: 16px; margin-left: 20px;
}
.live-chip {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 500; color: var(--fg-muted);
}
.live-chip .pulse-dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: var(--accent); box-shadow: 0 0 10px var(--accent);
  animation: pulse 1.8s ease-in-out infinite;
}
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
.live-chip .count { color: var(--fg); font-family: var(--font-mono); }
.nav-cta {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 999px;
  font-family: var(--font-body); font-size: 13px; font-weight: 500;
  color: #000; background: var(--accent); text-decoration: none;
  transition: background .15s, box-shadow .15s;
}
.nav-cta:hover { background: #5cffcc; box-shadow: 0 0 0 4px var(--accent-dim); }
.nav-cta.ghost {
  color: var(--fg-subtle); background: transparent; border: 1px solid var(--line-hi);
  cursor: not-allowed;
}
.nav-cta.ghost:hover { box-shadow: none; background: transparent; }

/* ═══ Onboarding pill — fades in, auto-dismisses ═══ */
.onboard {
  position: fixed; z-index: 40; top: 60px; left: 50%;
  transform: translateX(-50%);
  background: rgba(5,8,12,.94); border: 1px solid var(--hair-hi);
  padding: 10px 16px 10px 40px; max-width: 560px;
  font-size: 11px; color: var(--fg-0); letter-spacing: .03em;
  backdrop-filter: blur(12px);
  opacity: 0; pointer-events: none;
  transition: opacity .5s ease;
}
.onboard.show { opacity: 1; pointer-events: auto; }
.onboard.hide { opacity: 0; }
.onboard::before {
  content: '◆'; position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
  color: var(--mint); font-size: 14px;
}
.onboard .x {
  position: absolute; top: 6px; right: 8px; color: var(--fg-3);
  background: transparent; border: none; font-size: 16px; cursor: pointer; padding: 2px 6px;
  font-family: inherit;
}
.onboard .x:hover { color: var(--fg-0); }
.onboard strong { color: var(--mint); font-weight: 700; }

/* ═══ Mobile / small viewport ═══ */
@media (max-width: 900px) {
  .nav-inner { padding: 10px 16px; gap: 12px; flex-wrap: wrap; }
  .nav-brand { font-size: 17px; }
  .nav-links { gap: 14px; }
  .nav-links a { font-size: 12px; }
  .nav-right { gap: 10px; }
  .hud, .drawer, .lasttx, .fab-stack, .ticker { display: none !important; }
  .onboard { top: 100px; left: 14px; right: 14px; transform: none; max-width: none; }
  #mobileStats { display: flex !important; }
}

/* Mobile stats strip — visible only under 900px */
#mobileStats {
  display: none;
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 25;
  background: linear-gradient(0deg, rgba(10,10,11,.98), rgba(10,10,11,.8));
  border-top: 1px solid var(--line); padding: 12px 18px;
  gap: 20px; overflow-x: auto; white-space: nowrap;
  backdrop-filter: blur(8px);
}
#mobileStats .m { flex: 0 0 auto; display: flex; flex-direction: column; gap: 4px; }
#mobileStats .m .l {
  font-size: 10px; letter-spacing: .14em; color: var(--fg-subtle);
  text-transform: uppercase; font-weight: 500;
}
#mobileStats .m .v {
  font-family: var(--font-display); font-size: 22px; font-weight: 400;
  color: var(--fg); letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums; line-height: 1;
}

/* ═══ HUD — editorial stats strip, Fraunces display numbers ═══ */
.hud {
  position: fixed; left: 28px; top: 72px; z-index: 20;
  display: flex; gap: 36px; pointer-events: auto;
}
.hud .stat { display: flex; flex-direction: column; gap: 8px; min-width: 90px; }
.hud .stat .v {
  font-family: var(--font-display); font-weight: 400;
  font-size: 34px; line-height: 1;
  color: var(--fg); letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.hud .stat .v.mint { color: var(--accent); }
.hud .stat .l {
  font-size: 10px; letter-spacing: .12em; color: var(--fg-subtle);
  text-transform: uppercase; font-weight: 500;
}
.hud .sep { width: 1px; background: var(--line); align-self: stretch; margin: 4px 0; }

/* ═══ Innovation: live event ticker — top-center natural-language crawler ═══ */
.ticker {
  position: fixed; z-index: 22;
  top: 72px; left: 50%; transform: translateX(-50%);
  max-width: 560px; min-width: 260px;
  padding: 10px 22px; border-radius: 999px;
  background: rgba(17,17,20,.55); border: 1px solid var(--line);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  pointer-events: none; opacity: 0;
  transition: opacity .5s ease;
  font-family: var(--font-body); font-size: 13px; line-height: 1.4;
  color: var(--fg-muted); white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis;
}
.ticker.show { opacity: 1; }
.ticker .tk-mark {
  display: inline-block; width: 5px; height: 5px; border-radius: 50%;
  background: var(--accent); box-shadow: 0 0 8px var(--accent);
  margin-right: 10px; vertical-align: 2px;
  animation: pulse 1.8s ease-in-out infinite;
}
.ticker .tk-who {
  font-family: var(--font-display); font-weight: 500; color: var(--fg);
  font-size: 14px; letter-spacing: -0.005em;
}
.ticker .tk-who.t { color: var(--accent); }
.ticker .tk-amt {
  font-family: var(--font-mono); color: var(--accent);
  font-weight: 500; font-variant-numeric: tabular-nums;
}
.ticker .tk-verb { color: var(--fg-muted); font-style: italic; }
.ticker .tk-tier {
  font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
  color: var(--accent); font-weight: 500;
  padding: 2px 8px; border: 1px solid rgba(67,255,180,.3); border-radius: 999px;
  margin-left: 8px; background: var(--accent-dim);
}

/* ═══ Floating action buttons — bottom-left editorial pills ═══ */
.fab-stack {
  position: fixed; left: 28px; bottom: 28px; z-index: 22;
  display: flex; flex-direction: column; gap: 8px;
}
.fab {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 9px 18px; border-radius: 999px;
  background: rgba(17,17,20,.75);
  border: 1px solid var(--line-hi); color: var(--fg-muted);
  font-family: var(--font-body); font-size: 13px; font-weight: 500;
  cursor: pointer; backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: all .2s;
}
.fab:hover { color: var(--fg); border-color: var(--fg-subtle); background: rgba(23,23,28,.85); }
.fab.active { color: #000; background: var(--accent); border-color: var(--accent); }
.fab .chevron { color: currentColor; opacity: .6; font-size: 10px; }

/* ═══ Drawers — slide-in panels from left, editorial ═══ */
.drawer {
  position: fixed; left: 28px; bottom: 82px; z-index: 25;
  width: 320px; max-height: calc(100vh - 220px); overflow-y: auto;
  background: rgba(17,17,20,.9); border: 1px solid var(--line-hi);
  border-radius: 14px;
  padding: 22px 24px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  opacity: 0; pointer-events: none; transform: translateY(8px);
  transition: opacity .2s ease, transform .2s ease;
  box-shadow: 0 20px 60px rgba(0,0,0,.5);
}
.drawer.show { opacity: 1; pointer-events: auto; transform: translateY(0); }
.drawer::-webkit-scrollbar { width: 4px; }
.drawer::-webkit-scrollbar-thumb { background: var(--line-hi); border-radius: 4px; }
.drawer .section { margin-bottom: 22px; }
.drawer .section:last-child { margin-bottom: 0; }
.section-label {
  font-family: var(--font-body); font-size: 10px; letter-spacing: .14em;
  color: var(--fg-subtle); text-transform: uppercase; font-weight: 500;
  padding-bottom: 8px; margin-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

/* ═══ Last-tx chip — bottom-right editorial pill ═══ */
.lasttx {
  position: fixed; right: 28px; bottom: 28px; z-index: 22;
  display: inline-flex; align-items: center; gap: 12px;
  padding: 10px 18px; border-radius: 999px;
  background: rgba(17,17,20,.8);
  border: 1px solid var(--line-hi); color: var(--fg-muted);
  font-family: var(--font-body); font-size: 13px;
  max-width: 420px;
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  cursor: pointer; transition: all .2s;
}
.lasttx:hover { border-color: var(--fg-subtle); background: rgba(23,23,28,.9); color: var(--fg); }
.lasttx.fresh { border-color: rgba(67,255,180,.45); box-shadow: 0 0 0 4px var(--accent-dim); }
.lasttx .ltx-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--fg-subtle); flex: 0 0 auto;
}
.lasttx.live .ltx-dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); animation: pulse 1.8s ease-in-out infinite; }
.lasttx .ltx-body { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.lasttx .ltx-who {
  font-family: var(--font-display); font-weight: 500; color: var(--fg);
  font-size: 15px; letter-spacing: -0.005em;
}
.lasttx .ltx-who.t { color: var(--accent); }
.lasttx .ltx-arr { color: var(--fg-subtle); }
.lasttx .ltx-amt {
  font-family: var(--font-mono); color: var(--accent);
  font-weight: 500; font-variant-numeric: tabular-nums;
}
.lasttx .ltx-age { color: var(--fg-subtle); font-family: var(--font-mono); font-size: 11px; margin-left: 6px; }
.lasttx .ltx-expand { color: var(--fg-subtle); font-size: 12px; margin-left: 4px; }

/* ═══ Feed drawer — bottom-right, editorial ═══ */
.feed-drawer {
  position: fixed; right: 28px; bottom: 82px; z-index: 25;
  width: 400px; max-height: calc(100vh - 220px); overflow-y: auto;
  background: rgba(17,17,20,.9); border: 1px solid var(--line-hi);
  border-radius: 14px;
  padding: 22px 24px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  opacity: 0; pointer-events: none; transform: translateY(8px);
  transition: opacity .2s ease, transform .2s ease;
  box-shadow: 0 20px 60px rgba(0,0,0,.5);
}
.feed-drawer.show { opacity: 1; pointer-events: auto; transform: translateY(0); }
.feed-drawer::-webkit-scrollbar { width: 4px; }
.feed-drawer::-webkit-scrollbar-thumb { background: var(--line-hi); border-radius: 4px; }

/* ═══ List rows — drawer contents ═══ */
.list-row {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 8px 0; font-size: 13px; gap: 12px;
}
.list-row + .list-row { border-top: 1px solid var(--line); }
.list-row .k { color: var(--fg-muted); }
.list-row .v {
  color: var(--fg); font-family: var(--font-mono);
  font-variant-numeric: tabular-nums; font-size: 13px;
}
.list-row .v.mint { color: var(--accent); }
.list-row .rank {
  display: inline-block; width: 20px; color: var(--fg-subtle);
  font-family: var(--font-mono); font-size: 11px; margin-right: 8px;
}

/* ═══ Feed cards — editorial ═══ */
.fc {
  position: relative; padding: 14px 16px 14px 18px; margin-bottom: 10px;
  background: rgba(10,10,11,.6); border: 1px solid var(--line); border-radius: 8px;
  transition: background .15s, border-color .15s;
}
.fc:hover { background: rgba(17,17,20,.75); border-color: var(--line-hi); }
.fc::before {
  content: ''; position: absolute; left: 0; top: 14px; bottom: 14px;
  width: 2px; background: var(--cyan); border-radius: 2px;
}
.fc.reward::before { background: var(--accent); }
.fc.buy::before { background: var(--amber); }
.fc.sell::before { background: var(--accent); }
.fc.p2p::before { background: var(--violet); }
.fc.think::before { background: var(--cyan); }
.fc.fresh { animation: fresh 2.5s ease-out; }
@keyframes fresh { 0%{background:rgba(67,255,180,.08);border-color:rgba(67,255,180,.3)} 100%{background:rgba(10,10,11,.6);border-color:var(--line)} }

.fc .top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.fc .time { color: var(--fg-subtle); font-family: var(--font-mono); font-size: 11px; }
.fc .tag {
  font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--fg-muted); padding: 2px 8px; border: 1px solid var(--line-hi); border-radius: 999px;
  font-weight: 500;
}
.fc.reward .tag { color: var(--accent); border-color: rgba(67,255,180,.28); background: var(--accent-dim); }
.fc.buy .tag { color: var(--amber); border-color: rgba(255,179,71,.28); }
.fc.sell .tag { color: var(--accent); border-color: rgba(67,255,180,.28); }
.fc.p2p .tag { color: var(--violet); border-color: rgba(178,151,255,.3); }
.fc.think .tag { color: var(--cyan); border-color: rgba(92,208,255,.3); }

.fc .row {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-top: 6px;
}
.fc .flow { font-size: 13px; color: var(--fg-muted); }
.fc .flow .who {
  font-family: var(--font-display); font-weight: 500; color: var(--fg);
  font-size: 15px; letter-spacing: -0.005em; cursor: pointer;
}
.fc .flow .who:hover { color: var(--accent); }
.fc .flow .who.treasury { color: var(--accent); }
.fc .flow .arr { color: var(--fg-subtle); margin: 0 6px; }
.fc .amt {
  font-family: var(--font-mono); font-size: 14px; font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
}
.fc.buy .amt { color: var(--amber); }
.fc.p2p .amt { color: var(--violet); }
.fc .link {
  color: var(--fg-subtle); font-family: var(--font-mono); font-size: 11px;
  text-decoration: none; margin-left: 8px;
}
.fc .link:hover { color: var(--accent); }
.fc .thought-text {
  margin-top: 8px; color: var(--fg-muted); font-style: italic;
  font-family: var(--font-body);
  font-size: 13px; line-height: 1.55;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden;
}

.empty { color: var(--fg-subtle); padding: 18px 0; font-size: 13px; }

/* ═══ Tooltip — editorial card ═══ */
.tooltip {
  position: fixed; pointer-events: none; z-index: 60;
  min-width: 300px; max-width: 340px; padding: 18px 20px;
  background: rgba(17,17,20,.95); border: 1px solid var(--line-hi); border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0,0,0,.55);
  display: none;
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}
.tooltip .nm {
  font-family: var(--font-display); color: var(--fg);
  font-weight: 500; font-size: 24px; letter-spacing: -0.015em; line-height: 1;
}
.tooltip .nm-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-left: 10px; vertical-align: middle; }
.tooltip .nm-dot.on { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
.tooltip .nm-dot.off { background: var(--fg-subtle); }
.tooltip .meta {
  color: var(--fg-subtle); font-size: 11px; letter-spacing: .1em;
  margin: 6px 0 14px; text-transform: uppercase; font-weight: 500;
}
.tooltip .tt-row { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; }
.tooltip .tt-row .k { color: var(--fg-muted); }
.tooltip .tt-row .v {
  color: var(--fg); font-family: var(--font-mono);
  font-variant-numeric: tabular-nums; font-size: 13px;
}
.tooltip .tt-row .v.mint { color: var(--accent); }
.tooltip .links { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.tooltip .links a {
  color: var(--fg-muted); text-decoration: none;
  font-size: 12px; display: block; padding: 3px 0;
  transition: color .15s;
}
.tooltip .links a:hover { color: var(--accent); }

/* Global helpers */
.win { color: var(--accent); } .loss { color: var(--loss); } .muted { color: var(--fg-muted); }
</style></head><body>

<canvas id="nebula"></canvas>
<canvas id="net"></canvas>

<header class="nav"><div class="nav-inner">
  <a href="/" class="nav-brand"><span class="mark">◆</span>DarkCity</a>
  <nav class="nav-links">
    <a href="/flow" class="active">Map</a>
    <a href="/tape">Tape</a>
    <a href="/citizens">Citizens</a>
    <a href="/earn">Earn</a>
    <a href="/live">Dashboard</a>
    <a href="/how">How it works</a>
    <a href="https://github.com/fathom-lab/darkcity" target="_blank" class="external">Source</a>
  </nav>
  <div class="nav-right" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <a href="/deploy" class="nav-cta" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:var(--accent,#43ffb4);color:#000;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;box-shadow:0 0 18px rgba(67,255,180,.35);transition:transform .15s">◆ mint \$50</a>
    <a href="/earn" class="nav-cta-ghost" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid var(--line-hi,rgba(255,255,255,.12));color:var(--fg-muted);font-size:12px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;text-decoration:none">sponsor</a>
    <span class="live-chip"><span class="pulse-dot"></span><span class="count" id="hdrOnline">—</span>&nbsp;online</span>
  </div>
</div></header>
<style>
  .nav-cta:hover { transform: scale(1.05); }
  .nav-cta-ghost:hover { color: var(--accent); border-color: var(--accent); }
  @media (max-width: 720px) { .nav-cta, .nav-cta-ghost { font-size: 10px; padding: 5px 10px; } }
</style>

<div id="onboard" class="onboard">
  <button class="x" onclick="dismissOnboard()">×</button>
  you're watching <strong>31 AI agents</strong> trade real <strong>\$STYXX</strong> on Solana mainnet.
  every particle = a live on-chain tx · every bubble = an LLM's reasoning · click any agent for its wallet on solscan.
</div>

<div id="mobileStats">
  <div class="m"><span class="l">Treasury</span><span class="v" id="mTreasury">—</span></div>
  <div class="m"><span class="l">Agents</span><span class="v" id="mAgents">—</span></div>
  <div class="m"><span class="l">In hands</span><span class="v" id="mInHands">—</span></div>
  <div class="m"><span class="l">Flowed</span><span class="v" id="mFlowed">0</span></div>
</div>

<!-- HUD — Fraunces display numbers + Inter labels -->
<div class="hud">
  <div class="stat"><span class="v mint" id="nsTreasury">—</span><span class="l">Treasury · \$STYXX <span id="nsTreasuryUsd" style="color:var(--fg-3);font-family:var(--font-mono);font-size:10px;margin-left:6px"></span></span></div>
  <div class="sep"></div>
  <div class="stat"><span class="v" id="nsAgents">—</span><span class="l">Agents · online</span></div>
  <div class="sep"></div>
  <div class="stat"><span class="v" id="nsInHands">—</span><span class="l">In agent hands <span id="nsInHandsUsd" style="color:var(--fg-3);font-family:var(--font-mono);font-size:10px;margin-left:6px"></span></span></div>
  <div class="sep"></div>
  <div class="stat"><span class="v" id="nsTrades">0</span><span class="l">Session · txs</span></div>
</div>

<!-- Live event ticker — natural-language narration of what just happened -->
<div class="ticker" id="ticker">
  <span class="tk-mark"></span><span id="tickerBody">The city is awake.</span>
</div>

<!-- Floating action buttons — tuck all the details behind clicks -->
<div class="fab-stack">
  <button class="fab" onclick="toggleDrawer('minds')">minds <span class="chevron" id="chevMinds">▸</span></button>
  <button class="fab" onclick="toggleDrawer('market')">market <span class="chevron" id="chevMarket">▸</span></button>
  <button class="fab" onclick="toggleDrawer('contracts')">contracts <span class="chevron" id="chevContracts">▸</span></button>
  <button class="fab" onclick="toggleDrawer('details')">details <span class="chevron" id="chevDetails">▸</span></button>
</div>

<!-- MINDS drawer — the unique-to-us angle: who's thinking deeply -->
<div class="drawer" id="drawerMinds">
  <div class="section">
    <div class="section-label">Latest exceptional reasoning</div>
    <div id="exceptionalCard">
      <div class="empty">scoring next batch of actions…</div>
    </div>
  </div>
  <div class="section">
    <div class="section-label">Top by mean depth · all time</div>
    <div id="depthList">
      <div class="empty">awaiting depth evaluations…</div>
    </div>
  </div>
  <div class="section">
    <div class="section-label">How this works</div>
    <div style="color:var(--fg-2); font-size:10px; line-height:1.6">
      every agent action's reasoning is scored 0–1 on feature count, structural depth, and counterfactual quality.
      <span style="color:var(--mint)">exceptional</span> tier earns <span style="color:var(--mint)">1.5×</span> on any contract reward —
      deeper reasoning pays more real $STYXX.
    </div>
  </div>
</div>

<!-- Slide-in drawers -->
<div class="drawer" id="drawerDetails">
  <div class="section">
    <div class="section-label">City pulse · last ~2 min</div>
    <div class="list-row"><span class="k">volume</span><span class="v mint" id="pulseVol">—</span></div>
    <div class="list-row"><span class="k">velocity</span><span class="v" id="pulseVel">—</span></div>
    <div class="list-row"><span class="k">direction</span><span class="v" id="pulseDir">—</span></div>
  </div>
  <div class="section">
    <div class="section-label">City treasury</div>
    <div class="list-row"><span class="k">$STYXX · treasury</span><span class="v mint" id="dTreasury">—</span></div>
    <div class="list-row"><span class="k">$STYXX · in hands</span><span class="v" id="dInHands">—</span></div>
    <div class="list-row"><span class="k">treasury sol</span><span class="v" id="dSol">—</span></div>
    <div class="list-row"><span class="k">flowed (session)</span><span class="v" id="dFlowed">0</span></div>
  </div>
  <div class="section">
    <div class="section-label">Top by $STYXX · on-chain</div>
    <div id="topList"></div>
  </div>
  <div class="section">
    <div class="section-label">Districts</div>
    <div id="districtList"></div>
  </div>
  <div class="section">
    <div class="section-label">Token · Solana mainnet</div>
    <div class="list-row"><span class="k">program</span><span class="v">Token-2022</span></div>
    <div class="list-row"><span class="k">supply</span><span class="v">999.89M fixed</span></div>
    <div class="list-row"><span class="k">mint</span><span class="v"><a href="https://solscan.io/token/Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump" target="_blank" style="color:var(--cyan);text-decoration:none">Dxw3…pump ↗</a></span></div>
    <div class="list-row"><span class="k">buy</span><span class="v"><a href="https://pump.fun/coin/Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump" target="_blank" style="color:var(--cyan);text-decoration:none">pump.fun ↗</a></span></div>
  </div>
</div>

<div class="drawer" id="drawerMarket">
  <div class="section">
    <div class="section-label">Resource prices · move every 90s</div>
    <div id="marketList"></div>
    <div style="color:var(--fg-3); font-size:9px; letter-spacing:.15em; margin-top:10px; padding-top:8px; border-top:1px solid var(--hair); text-transform:uppercase">agents arb the drift</div>
  </div>
</div>

<div class="drawer" id="drawerContracts">
  <div class="section">
    <div class="section-label">Active contracts · in-flight</div>
    <div id="contractList"></div>
    <div style="color:var(--fg-3); font-size:9px; letter-spacing:.15em; margin-top:10px; padding-top:8px; border-top:1px solid var(--hair); text-transform:uppercase">reward · base × depth multiplier</div>
  </div>
</div>

<!-- Last-tx chip — bottom-right single line, click to open full feed -->
<div class="lasttx" id="lasttx" onclick="toggleFeed()">
  <span class="ltx-dot"></span>
  <span class="ltx-body" id="ltxBody">waiting for next on-chain tx…</span>
  <span class="ltx-expand">▸</span>
</div>

<div class="feed-drawer" id="feedDrawer">
  <div class="section">
    <div class="section-label">Live on-chain feed · newest first</div>
    <div id="feed"><div class="empty">listening for on-chain events…</div></div>
  </div>
</div>

<div class="tooltip" id="tooltip"></div>

<!-- Agent sponsor drawer — slides in from right when an agent is clicked -->
<div id="agentDrawer" style="position:fixed;top:0;right:0;bottom:0;width:min(420px,90vw);background:rgba(10,10,11,.96);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-left:1px solid var(--hair,rgba(255,255,255,.1));transform:translateX(100%);transition:transform .28s ease;z-index:70;overflow-y:auto;font-family:var(--font-body,Inter,sans-serif)">
  <button id="agentDrawerClose" aria-label="Close" style="position:absolute;top:16px;right:16px;width:28px;height:28px;border:1px solid var(--hair,rgba(255,255,255,.1));border-radius:50%;background:transparent;color:var(--fg-muted,#a0a0aa);cursor:pointer;font-size:14px;line-height:1">\u00d7</button>
  <div style="padding:28px 24px 24px">
    <div id="ad-head">
      <div class="eyebrow" id="ad-rank" style="color:var(--fg-subtle,#5a5a64);font-size:10px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px">\u2014</div>
      <div id="ad-name" style="font-family:var(--font-display,Fraunces,serif);font-size:32px;font-weight:500;letter-spacing:-.01em;color:var(--fg,#ededef);margin-bottom:4px">\u2014</div>
      <div id="ad-district" style="color:var(--fg-muted,#a0a0aa);font-size:13px">\u2014</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px;padding:16px 0;border-top:1px solid var(--line,rgba(255,255,255,.06));border-bottom:1px solid var(--line,rgba(255,255,255,.06))">
      <div>
        <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--fg-subtle,#5a5a64);margin-bottom:4px">Wallet bal</div>
        <div id="ad-balance" style="font-family:var(--font-mono,monospace);font-size:16px;color:var(--accent,#43ffb4);font-weight:500">\u2014</div>
      </div>
      <div>
        <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--fg-subtle,#5a5a64);margin-bottom:4px">Trades</div>
        <div id="ad-trades" style="font-family:var(--font-mono,monospace);font-size:16px;color:var(--fg,#ededef);font-weight:500">\u2014</div>
      </div>
      <div>
        <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--fg-subtle,#5a5a64);margin-bottom:4px">24h earned</div>
        <div id="ad-earned24h" style="font-family:var(--font-mono,monospace);font-size:16px;color:var(--accent,#43ffb4);font-weight:500">\u2014</div>
      </div>
      <div>
        <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--fg-subtle,#5a5a64);margin-bottom:4px">Sponsors staked</div>
        <div id="ad-sponsors" style="font-family:var(--font-mono,monospace);font-size:16px;color:var(--fg,#ededef);font-weight:500">\u2014</div>
      </div>
    </div>

    <!-- Sponsor CTA -->
    <div style="margin-top:20px">
      <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--fg-subtle,#5a5a64);margin-bottom:10px">Sponsor this agent</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">
        <button class="ad-sponsor-btn" data-amt="100"  style="padding:12px;border:1px solid var(--hair,rgba(255,255,255,.12));background:transparent;color:var(--fg,#ededef);border-radius:6px;font-family:var(--font-mono,monospace);font-size:13px;cursor:pointer;transition:all .15s">100</button>
        <button class="ad-sponsor-btn" data-amt="500"  style="padding:12px;border:1px solid var(--hair,rgba(255,255,255,.12));background:transparent;color:var(--fg,#ededef);border-radius:6px;font-family:var(--font-mono,monospace);font-size:13px;cursor:pointer;transition:all .15s">500</button>
        <button class="ad-sponsor-btn" data-amt="1000" style="padding:12px;border:1px solid var(--hair,rgba(255,255,255,.12));background:transparent;color:var(--fg,#ededef);border-radius:6px;font-family:var(--font-mono,monospace);font-size:13px;cursor:pointer;transition:all .15s">1k</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:10px">
        <input id="ad-amt" type="number" min="1" step="1" placeholder="Custom \$STYXX" style="background:var(--bg,#0a0a0b);border:1px solid var(--hair,rgba(255,255,255,.12));color:var(--fg,#ededef);border-radius:6px;padding:10px 12px;font-family:var(--font-mono,monospace);font-size:13px">
        <button id="ad-sponsor-go" style="padding:10px 18px;background:var(--accent,#43ffb4);color:#000;border:none;border-radius:6px;font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer">Sponsor \u2192</button>
      </div>
      <div id="ad-status" style="font-size:11px;color:var(--fg-subtle,#5a5a64);line-height:1.55"></div>
    </div>

    <!-- Tip CTA — direct 99% → agent's wallet, no staking, no wait -->
    <div style="margin-top:20px;padding-top:16px;border-top:1px dashed var(--line,rgba(255,255,255,.06))">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--fg-subtle,#5a5a64)">Tip this agent</div>
        <div style="font-size:10px;color:var(--fg-subtle,#5a5a64);font-family:var(--font-mono,monospace)">99% \u2192 agent</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr) auto;gap:6px;margin-bottom:8px">
        <button class="ad-tip-btn" data-amt="1"  style="padding:10px 8px;border:1px solid var(--hair,rgba(255,255,255,.12));background:transparent;color:var(--fg,#ededef);border-radius:6px;font-family:var(--font-mono,monospace);font-size:12px;cursor:pointer;transition:all .15s">1</button>
        <button class="ad-tip-btn" data-amt="5"  style="padding:10px 8px;border:1px solid var(--hair,rgba(255,255,255,.12));background:transparent;color:var(--fg,#ededef);border-radius:6px;font-family:var(--font-mono,monospace);font-size:12px;cursor:pointer;transition:all .15s">5</button>
        <button class="ad-tip-btn" data-amt="25" style="padding:10px 8px;border:1px solid var(--hair,rgba(255,255,255,.12));background:transparent;color:var(--fg,#ededef);border-radius:6px;font-family:var(--font-mono,monospace);font-size:12px;cursor:pointer;transition:all .15s">25</button>
        <button id="ad-tip-go" style="padding:10px 14px;background:transparent;color:var(--accent,#43ffb4);border:1px solid var(--accent,#43ffb4);border-radius:6px;font-weight:600;font-size:11px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer">Tip \u2192</button>
      </div>
      <div id="ad-tip-status" style="font-size:11px;color:var(--fg-subtle,#5a5a64);line-height:1.5"></div>
    </div>

    <div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--line,rgba(255,255,255,.06));display:flex;gap:8px;flex-wrap:wrap">
      <a id="ad-solscan" target="_blank" class="btn" style="padding:8px 14px;border:1px solid var(--hair,rgba(255,255,255,.12));border-radius:6px;color:var(--fg-muted,#a0a0aa);font-size:12px;text-decoration:none">Wallet on Solscan \u2197</a>
      <a id="ad-dossier" target="_blank" class="btn" style="padding:8px 14px;border:1px solid var(--hair,rgba(255,255,255,.12));border-radius:6px;color:var(--fg-muted,#a0a0aa);font-size:12px;text-decoration:none">Full dossier \u2192</a>
    </div>
  </div>
</div>
<style>
  #agentDrawer.show { transform: translateX(0) !important; }
  #agentDrawer .ad-sponsor-btn:hover { border-color: var(--accent,#43ffb4); color: var(--accent,#43ffb4); }
  #agentDrawer .ad-sponsor-btn.sel { border-color: var(--accent,#43ffb4); background: rgba(67,255,180,.08); color: var(--accent,#43ffb4); }
  #agentDrawer #ad-sponsor-go:hover { filter: brightness(1.1); }
  #agentDrawer .ad-tip-btn:hover { border-color: var(--accent,#43ffb4); color: var(--accent,#43ffb4); }
  #agentDrawer .ad-tip-btn.sel { border-color: var(--accent,#43ffb4); background: rgba(67,255,180,.08); color: var(--accent,#43ffb4); }
  #agentDrawer #ad-tip-go:hover { background: rgba(67,255,180,.08); }
</style>

<!-- Agent search — press "/" or cmd+K to open, type, press enter to fly to agent -->
<div id="agentSearch" style="position:fixed;top:68px;right:20px;z-index:56;display:none;padding:8px 12px;border-radius:999px;background:rgba(10,10,11,.82);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--hair,rgba(255,255,255,.12));font-family:var(--font-mono,monospace);font-size:12px">
  <span style="color:var(--fg-subtle,#5a5a64);margin-right:6px">find</span>
  <input id="agentSearchInput" placeholder="agent name…" autocomplete="off" style="background:transparent;border:none;outline:none;color:var(--fg,#ededef);font-family:inherit;font-size:12px;width:160px">
  <span id="agentSearchHint" style="color:var(--fg-subtle,#5a5a64);margin-left:6px;font-size:10px">esc</span>
</div>
<style>
  @media (max-width: 720px) {
    #flowVelocity { display: none !important; }
    #agentSearch { top: 56px; right: 10px; padding: 6px 10px; }
    #agentSearchInput { width: 110px; }
    .nav-cta { padding: 4px 10px !important; font-size: 10px !important; }
    .nav-cta-ghost { padding: 4px 10px !important; font-size: 10px !important; }
    .onboard { font-size: 12px; }
  }
</style>

<!-- Flow velocity counter -->
<div id="flowVelocity" style="position:fixed;top:68px;left:50%;transform:translateX(-50%);z-index:55;padding:6px 14px;border-radius:999px;background:rgba(10,10,11,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid var(--hair,rgba(255,255,255,.1));font-family:var(--font-mono,monospace);font-size:11px;letter-spacing:.08em;color:var(--fg-muted,#a0a0aa);display:flex;align-items:center;gap:8px;pointer-events:none">
  <span style="width:5px;height:5px;border-radius:50%;background:var(--accent,#43ffb4);box-shadow:0 0 6px var(--accent,#43ffb4);animation:pulse 1.5s ease-in-out infinite"></span>
  <span><span id="flowVelAmt" style="color:var(--fg,#ededef);font-weight:500">\u2014</span> \$STYXX/min</span>
  <span style="color:var(--fg-subtle,#5a5a64)">\u00b7</span>
  <span><span id="flowVelTx" style="color:var(--fg,#ededef);font-weight:500">\u2014</span> txs/min</span>
</div>
<style>@keyframes pulse { 0%,100%{opacity:1}50%{opacity:.3} }</style>

<script>
// ═══ Config ═══════════════════════════════════════════════════════════
const POLL_MS = 4500;
const PARTICLE_SPEED = 0.012;
const PARTICLE_TAIL = 0.12;
const BUBBLE_LIFE_MS = 7500;
const MAX_VISIBLE_BUBBLES = 3;
const PULSE_LIFE = 55;

// ═══ Palette (harmonized, luxury) ═════════════════════════════════════
const C = {
  treasury: [67, 255, 180],
  cyan:     [92, 208, 255],
  amber:    [255, 179, 71],
  mint:     [67, 255, 180],
  violet:   [138, 125, 255],
  rose:     [255, 107, 138],
  agentOn:  [92, 208, 255],
  agentOff: [90, 115, 140],
};
function reasonC(r) {
  if (r === 'resource_buy') return C.amber;
  if (r === 'resource_sell') return C.mint;
  if (r === 'contract_reward') return C.mint;
  if (r === 'p2p_transfer') return C.violet;
  return C.cyan;
}
function actionC(a) {
  if (a === 'trade') return C.amber;
  if (a === 'complete_contract' || a === 'claim_contract') return C.mint;
  if (a === 'build') return C.mint;
  if (a === 'kudos') return C.violet;
  if (a === 'social') return [140, 180, 220];
  if (a === 'explore') return [200, 180, 120];
  return C.cyan;
}

// ═══ Network state ═════════════════════════════════════════════════════
let treasury = null;
let agents = new Map();
let districts = new Map();
let particles = [];
let bubbles = new Map();
let pulses = [];
let knownTx = new Set();
let knownNarr = new Set();
let totalFlowed = 0;
let sessionTxCount = 0;
let mouseX = -999, mouseY = -999;
let hovered = null;
// ═══ Pan/zoom camera ═══════════════════════════════════════════════════
// view.x / view.y are pan offsets in screen pixels, view.k is zoom level.
// Applied inside drawNet after the motion-trail wipe so the background
// nebula stays still and only the network moves.
const view = { x: 0, y: 0, k: 1 };
const VIEW_MIN_K = 0.35, VIEW_MAX_K = 3.5;
let panning = false, panStart = null;
function screenToWorld(sx, sy) { return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k }; }

// ═══ Canvas setup ══════════════════════════════════════════════════════
const neb = document.getElementById('nebula');
const net = document.getElementById('net');
const nebCtx = neb.getContext('2d');
const netCtx = net.getContext('2d');
let W, H, DPR;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  for (const [cv, ctx] of [[neb, nebCtx], [net, netCtx]]) {
    cv.width = W * DPR; cv.height = H * DPR;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  initNebula();
  layoutAgents();
}
window.addEventListener('resize', resize);

// ═══ Nebula bg — restrained, ocean tones only ══════════════════════════
const clouds = [];
const dots = [];
let scanY = 0;
function initNebula() {
  clouds.length = 0;
  const palette = [[0, 60, 120], [0, 40, 90], [0, 80, 100], [0, 50, 80], [20, 60, 100], [0, 100, 120]];
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x: Math.random() * W, y: Math.random() * H,
      r: 220 + Math.random() * 280,
      vx: (Math.random() - .5) * .08, vy: (Math.random() - .5) * .05,
      color: palette[i], alpha: .035 + Math.random() * .03,
      phase: Math.random() * 6.28,
    });
  }
  dots.length = 0;
  const count = Math.floor(W * H * 0.0001);
  for (let i = 0; i < count; i++) {
    const depth = Math.random();
    dots.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .015 * (1 + depth),
      vy: (Math.random() - .5) * .012 * (1 + depth),
      r: .3 + depth * 1.1, baseA: .03 + depth * .14,
      p: Math.random() * 6.28, depth,
      color: Math.random() > .9 ? C.mint : [60 + depth * 40, 110 + depth * 60, 150 + depth * 70],
    });
  }
}

function drawNebula(t) {
  // Reset transform first so clear covers the whole viewport even when the
  // parallax shift would otherwise leave a seam. Then apply a 40% parallax
  // translate so the background appears to move slower than the foreground
  // graph when panning. Subtle depth cue — unnoticeable individually but
  // makes the map feel volumetric at rest.
  nebCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  nebCtx.clearRect(0, 0, W, H);
  nebCtx.translate(view.x * 0.4, view.y * 0.4);
  for (const c of clouds) {
    c.x += c.vx; c.y += c.vy;
    if (c.x < -c.r) c.x = W + c.r; if (c.x > W + c.r) c.x = -c.r;
    if (c.y < -c.r) c.y = H + c.r; if (c.y > H + c.r) c.y = -c.r;
    const pulse = .5 + .5 * Math.sin(t * .0003 + c.phase);
    const g = nebCtx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r * pulse);
    g.addColorStop(0, \`rgba(\${c.color[0]},\${c.color[1]},\${c.color[2]},\${c.alpha * pulse})\`);
    g.addColorStop(.55, \`rgba(\${c.color[0]},\${c.color[1]},\${c.color[2]},\${c.alpha * .25 * pulse})\`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    nebCtx.fillStyle = g;
    nebCtx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
  }
  for (const p of dots) {
    p.x += p.vx; p.y += p.vy;
    if (p.x < -5) p.x = W + 5; if (p.x > W + 5) p.x = -5;
    if (p.y < -5) p.y = H + 5; if (p.y > H + 5) p.y = -5;
    const a = p.baseA * (.45 + .55 * Math.sin(t * .0004 + p.p));
    nebCtx.beginPath();
    nebCtx.arc(p.x, p.y, p.r, 0, 6.28);
    nebCtx.fillStyle = \`rgba(\${p.color[0]},\${p.color[1]},\${p.color[2]},\${a})\`;
    nebCtx.fill();
  }
  // Scan sweep (subtle)
  scanY = (scanY + .22) % (H + 60);
  const sl = nebCtx.createLinearGradient(0, scanY - 40, 0, scanY + 4);
  sl.addColorStop(0, 'rgba(92,208,255,0)');
  sl.addColorStop(.85, 'rgba(92,208,255,.025)');
  sl.addColorStop(1, 'rgba(67,255,180,.04)');
  nebCtx.fillStyle = sl;
  nebCtx.fillRect(0, scanY - 40, W, 44);
}

// ═══ Mycelium layout: agents grow from treasury, new joins append ══════
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 0xffffffff; }

function layoutAgents() {
  if (!agents.size) return;
  const leftMargin = 80, rightMargin = 80, topMargin = 120, bottomMargin = 100;
  const cx = (leftMargin + W - rightMargin) / 2;
  const cy = (topMargin + H - bottomMargin) / 2;
  const availW = W - leftMargin - rightMargin;
  const availH = H - topMargin - bottomMargin;
  const R = Math.min(availW, availH) * 0.42;

  if (treasury) { treasury.x = cx; treasury.y = cy; }

  const sorted = [...agents.values()].sort((a, b) => a.id.localeCompare(b.id));
  const primary = Math.min(8, sorted.length);
  const baseLen = R * 0.56;

  // Mycelium growth: new agents start at their PARENT's position and ease
  // outward to their target layout spot. Existing agents keep their current
  // x/y (no displacement when more agents join). Target positions are stored
  // as tx/ty so the frame loop can lerp toward them.
  for (let i = 0; i < primary; i++) {
    const a = sorted[i];
    const ang = -Math.PI / 2 + (i / primary) * Math.PI * 2;
    const r = baseLen * (0.95 + hashStr(a.id + 'r') * 0.15);
    a.tx = cx + Math.cos(ang) * r;
    a.ty = cy + Math.sin(ang) * r;
    a.angle = ang;
    a.parent = 'TREASURY';
    a.parentX = cx; a.parentY = cy;
    if (a.x == null || a.y == null) {
      // First appearance — sprout from treasury
      a.x = cx; a.y = cy;
      a.bornAt = Date.now();
      a.growing = true;
      addPulse(cx, cy, [67, 255, 180]);  // visual "something is growing" hint
    }
  }
  const placed = sorted.slice(0, primary);
  for (let i = primary; i < sorted.length; i++) {
    const a = sorted[i];
    const sameDist = placed.filter(n => n.district === a.district);
    const pool = sameDist.length > 0 ? sameDist : placed;
    const parent = pool[Math.floor(hashStr(a.id + 'parent') * pool.length)];
    const branch = (hashStr(a.id + 'br') - 0.5) * 1.2;
    const branchAng = parent.angle + branch;
    const segLen = R * (0.22 + hashStr(a.id + 'len') * 0.22);
    a.tx = parent.x + Math.cos(branchAng) * segLen;
    a.ty = parent.y + Math.sin(branchAng) * segLen;
    a.angle = branchAng;
    a.parent = parent.id;
    a.parentX = parent.x; a.parentY = parent.y;
    if (a.x == null || a.y == null) {
      // Sprout from its parent — hyphal tip extension
      a.x = parent.x; a.y = parent.y;
      a.bornAt = Date.now();
      a.growing = true;
      addPulse(parent.x, parent.y, [67, 255, 180]);
    }
    placed.push(a);
  }

  districts.clear();
  for (const a of placed) {
    if (!districts.has(a.district)) districts.set(a.district, { count: 0 });
    districts.get(a.district).count++;
  }
}

function nodeRadius(styxx, online) {
  const base = online ? 4.5 : 3;
  return base + Math.min(16, Math.log(1 + Math.max(0, styxx)) * 2);
}

function addParticle(from, to, amount, reason, tx) {
  if (!from || !to) return;
  particles.push({
    fx: from.x, fy: from.y, tx: to.x, ty: to.y,
    t: 0, amount, reason, color: reasonC(reason), life: 60, tx_sig: tx,
  });
}
function addPulse(x, y, color) { pulses.push({ x, y, life: PULSE_LIFE, color }); }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

// ═══ Render network ═══════════════════════════════════════════════════
function drawNet(t) {
  // Reset to screen space so motion trail clears the full viewport
  netCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // Gentle motion trail
  netCtx.fillStyle = 'rgba(5,7,11,.22)';
  netCtx.fillRect(0, 0, W, H);
  // Apply pan + zoom for everything below
  netCtx.translate(view.x, view.y);
  netCtx.scale(view.k, view.k);

  // ── Mycelium physics: ease every agent toward its target + subtle drift
  // so the network feels alive even when nothing's flowing.
  for (const a of agents.values()) {
    if (a.tx == null || a.ty == null) { a.tx = a.x; a.ty = a.y; }
    // Exponential easing toward target — classic hyphal growth shape
    const k = 0.055;
    a.x += (a.tx - a.x) * k;
    a.y += (a.ty - a.y) * k;
    // Mark growth complete when we're close enough
    if (a.growing && Math.hypot(a.tx - a.x, a.ty - a.y) < 0.6) {
      a.growing = false;
      // Celebratory bloom when the node "settles"
      addPulse(a.tx, a.ty, [67, 255, 180]);
    }
    // Parent position follows parent's animated pos too, so threads stay connected
    if (a.parent && a.parent !== 'TREASURY') {
      const p = agents.get(a.parent);
      if (p) { a.parentX = p.x; a.parentY = p.y; }
    }
    // Subtle breathing drift — tiny sway so even stationary nodes feel organic
    if (a.driftSeed == null) a.driftSeed = hashStr(a.id + 'drift') * 6.28;
    const driftA = Math.sin(t * 0.00035 + a.driftSeed) * 1.4;
    const driftB = Math.cos(t * 0.00041 + a.driftSeed * 1.7) * 1.1;
    a.driftX = driftA; a.driftY = driftB;
  }

  // District hue palette — subtle per-region tint for hyphae. Restraint:
  // each district offsets RGB by ~±30 from the cool-cyan baseline so the
  // graph reads as topography, never as a loud color-key. Unknown districts
  // fall back to the base tone.
  const DISTRICT_HUE = {
    'High Tower':       [92, 208, 255],   // baseline cyan
    'Crystal Heights':  [220, 210, 140],  // soft amber
    'Silicon Docks':    [110, 230, 240],  // teal
    'Neon District':    [210, 130, 240],  // violet
    'Old Quarter':      [160, 170, 210],  // dusk blue
    'The Sprawl':       [230, 170, 140],  // warm sand
    'Undercity':        [130, 120, 200],  // indigo
    'Industrial Zone':  [240, 170, 110],  // rust
    'Embassy Row':      [200, 160, 240],  // lavender
    'Chinatown':        [240, 140, 130],  // coral
    'Market Row':       [230, 210, 130],  // gold
    'Rust Alley':       [220, 120, 110],  // red rust
    'The Vaults':       [150, 140, 210],  // deep violet
    'The Cathedral':    [200, 180, 240],  // amethyst
    'The Crypt':        [140, 200, 170],  // moss
    'The Belfry':       [220, 150, 150],  // rose
    'Gargoyle Market':  [220, 180, 110],  // ochre
    'The Catacombs':    [170, 130, 130],  // mauve
    'Obsidian Forge':   [100, 170, 210],  // steel
    'Dark Library':     [210, 180, 110],  // parchment
  };

  // Mycelium hyphae (parent → child, curved) — district-tinted + flow-dash
  for (const [id, a] of agents) {
    if (a.parentX == null) continue;
    const pulse = .5 + .5 * Math.sin(t * .0008 + hashStr(id) * 6.28);
    const mx = (a.parentX + a.x) / 2, my = (a.parentY + a.y) / 2;
    const dx = a.x - a.parentX, dy = a.y - a.parentY;
    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const px = -dy / len, py = dx / len;
    const bend = (hashStr(id + 'bend') - 0.5) * len * 0.15;
    const cpX = mx + px * bend, cpY = my + py * bend;

    const tint = DISTRICT_HUE[a.district] || [92, 208, 255];
    const [hR, hG, hB] = tint;

    // Base stroke — district-tinted with low alpha
    netCtx.beginPath();
    netCtx.moveTo(a.parentX, a.parentY);
    netCtx.quadraticCurveTo(cpX, cpY, a.x, a.y);
    const baseA = a.online ? .11 + .06 * pulse : .04;
    netCtx.strokeStyle = 'rgba(' + hR + ',' + hG + ',' + hB + ',' + baseA + ')';
    netCtx.lineWidth = a.online ? 1.0 : 0.6;
    netCtx.stroke();

    // Flow-dash pass — animated dash phase gives directional motion without
    // needing arrowheads. Only for online agents; offline threads stay still.
    if (a.online) {
      netCtx.beginPath();
      netCtx.moveTo(a.parentX, a.parentY);
      netCtx.quadraticCurveTo(cpX, cpY, a.x, a.y);
      netCtx.setLineDash([4, 10]);
      netCtx.lineDashOffset = -(t * 0.04 + hashStr(id) * 14);
      netCtx.strokeStyle = 'rgba(' + hR + ',' + hG + ',' + hB + ',' + (0.18 * (0.5 + 0.5 * pulse)) + ')';
      netCtx.lineWidth = 1.2;
      netCtx.stroke();
      netCtx.setLineDash([]);
    }

    // Outer glow pass
    netCtx.strokeStyle = 'rgba(' + hR + ',' + hG + ',' + hB + ',' + (.03 * pulse) + ')';
    netCtx.lineWidth = 3;
    netCtx.stroke();

    // Flow dot along hypha for online agents
    if (a.online) {
      const ft = ((t * 0.00045 + hashStr(id)) % 1);
      const bx = (1-ft)*(1-ft)*a.parentX + 2*(1-ft)*ft*cpX + ft*ft*a.x;
      const by = (1-ft)*(1-ft)*a.parentY + 2*(1-ft)*ft*cpY + ft*ft*a.y;
      netCtx.beginPath();
      netCtx.arc(bx, by, 1.3, 0, 6.28);
      netCtx.fillStyle = 'rgba(92,208,255,.55)';
      netCtx.fill();
    }
  }

  // Treasury node (big, commanding)
  if (treasury) {
    const pulse = .75 + .25 * Math.sin(t * .0018);
    // Slow heartbeat — one outer ring breathing at ~0.7Hz gives the treasury
    // center an organic living feel without any loud motion. Restraint.
    const heartbeat = 0.5 + 0.5 * Math.sin(t * 0.0018);
    const hbR = 110 + heartbeat * 18;
    netCtx.beginPath();
    netCtx.arc(treasury.x, treasury.y, hbR, 0, 6.28);
    netCtx.strokeStyle = 'rgba(67,255,180,' + (0.08 * (1 - heartbeat * 0.5)) + ')';
    netCtx.lineWidth = 0.8;
    netCtx.stroke();

    // Outer rings
    for (const rr of [84, 54, 30, 16]) {
      const g = netCtx.createRadialGradient(treasury.x, treasury.y, 0, treasury.x, treasury.y, rr);
      const alpha = rr === 16 ? .6 : .05;
      g.addColorStop(0, \`rgba(67,255,180,\${alpha * pulse})\`);
      g.addColorStop(1, 'rgba(67,255,180,0)');
      netCtx.fillStyle = g;
      netCtx.fillRect(treasury.x - rr, treasury.y - rr, rr * 2, rr * 2);
    }
    netCtx.beginPath();
    netCtx.arc(treasury.x, treasury.y, 7, 0, 6.28);
    netCtx.fillStyle = '#43ffb4';
    netCtx.fill();
    netCtx.font = '500 11px "Inter", sans-serif';
    netCtx.fillStyle = '#43ffb4';
    netCtx.textAlign = 'center';
    netCtx.fillText('Treasury', treasury.x, treasury.y - 18);
    netCtx.font = '400 17px "Fraunces", Georgia, serif';
    netCtx.fillStyle = 'rgba(237,237,239,.92)';
    netCtx.fillText(treasury.styxx ? Math.round(treasury.styxx).toLocaleString() : '', treasury.x, treasury.y + 28);
    netCtx.font = '500 9px "Inter", sans-serif';
    netCtx.fillStyle = 'rgba(160,160,170,.7)';
    netCtx.fillText('$STYXX', treasury.x, treasury.y + 42);
  }

  // Agent nodes — crisp, minimal bloom
  hovered = null;
  const nowT = Date.now();
  for (const [id, a] of agents) {
    const rad = nodeRadius(a.styxx, a.online);
    const breath = .85 + .15 * Math.sin(t * .0015 + hashStr(id) * 6.28);
    // Hit-test in world coords (account for pan+zoom). rad+8 tolerance
    // shrinks with zoom so it stays roughly constant in screen pixels.
    const wm = screenToWorld(mouseX, mouseY);
    const isH = Math.hypot(wm.x - a.x, wm.y - a.y) < rad + 8 / view.k;
    if (isH) hovered = a;
    const color = a.online ? C.cyan : C.agentOff;
    const [r, g, b] = color;

    // Activity spark — if this agent fired a tx in the last 900ms, their ring brightens
    const sparkAge = nowT - (a.sparkAt || 0);
    const sparkAlpha = sparkAge < 900 ? (1 - sparkAge / 900) : 0;

    // Depth tier → ring color (the signature move — each agent shows its mind at a glance)
    const tier = a.depth_tier;
    let ringR = 140, ringG = 140, ringB = 150, ringA = .35;  // default neutral
    if (tier === 'exceptional') { ringR = 67; ringG = 255; ringB = 180; ringA = .95; }
    else if (tier === 'deep')   { ringR = 92; ringG = 208; ringB = 255; ringA = .75; }
    else if (tier === 'moderate'){ ringR = 255; ringG = 179; ringB = 71; ringA = .55; }
    else if (tier === 'shallow'){ ringR = 160; ringG = 160; ringB = 170; ringA = .35; }
    const isException = tier === 'exceptional';

    // Subtle glow only for online + exceptional (restraint)
    if (a.online && (isException || isH)) {
      const glowR = rad * (isException ? 2.4 : 1.8);
      const halo = netCtx.createRadialGradient(a.x, a.y, rad * 0.7, a.x, a.y, glowR);
      halo.addColorStop(0, \`rgba(\${ringR},\${ringG},\${ringB},\${(isException ? .22 : .12) * breath})\`);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      netCtx.fillStyle = halo;
      netCtx.fillRect(a.x - glowR, a.y - glowR, glowR * 2, glowR * 2);
    }

    // Rank aura — Sovereign+ get a second outer stroke ring, Lich_King a
    // warm-tinted accent. Restrained: thin, low alpha, visible only on online
    // + high-rank agents. No crown particles, no heavy treatment.
    const rankStr = (a.rank || '').toString().toUpperCase();
    if (a.online && (rankStr.includes('SOVEREIGN') || rankStr.includes('ARCHITECT') || rankStr.includes('LICH'))) {
      const isLich = rankStr.includes('LICH');
      const rankR = rad * (isLich ? 1.95 : 1.75);
      netCtx.beginPath();
      netCtx.arc(a.x, a.y, rankR, 0, 6.28);
      netCtx.strokeStyle = isLich
        ? 'rgba(255,107,138,' + (0.30 * breath) + ')'  // warm accent for Lich
        : 'rgba(240,200,100,' + (0.22 * breath) + ')'; // soft gold for Sovereign/Architect
      netCtx.lineWidth = isLich ? 1.2 : 0.9;
      netCtx.stroke();
    }

    // Outer ring — tier color, thin, not solid
    const rr = rad * (isH ? 1.15 : 1);
    netCtx.beginPath();
    netCtx.arc(a.x, a.y, rr, 0, 6.28);
    netCtx.strokeStyle = a.online
      ? \`rgba(\${ringR},\${ringG},\${ringB},\${ringA * breath})\`
      : \`rgba(\${ringR},\${ringG},\${ringB},\${.18})\`;
    netCtx.lineWidth = 1.5;
    netCtx.stroke();

    // Mean-depth progress arc — thicker than the ring, partial sweep
    const md = a.mean_depth;
    if (md !== null && md !== undefined && md > 0 && a.online) {
      netCtx.beginPath();
      const start = -Math.PI / 2;
      const end = start + md * Math.PI * 2;
      netCtx.arc(a.x, a.y, rr + 2, start, end);
      netCtx.strokeStyle = \`rgba(\${ringR},\${ringG},\${ringB},\${.55 * breath})\`;
      netCtx.lineWidth = 2;
      netCtx.stroke();
    }

    // Small core dot — wealth signal, always small (NOT the big solid fill)
    const coreR = Math.max(1.8, Math.min(3.2, rad * 0.26));
    netCtx.beginPath();
    netCtx.arc(a.x, a.y, coreR, 0, 6.28);
    netCtx.fillStyle = a.online
      ? \`rgba(\${ringR},\${ringG},\${ringB},\${.95 * breath})\`
      : 'rgba(120,125,135,.45)';
    netCtx.fill();

    // Activity spark — expanding ring on agent's own node when it fires a tx
    if (sparkAlpha > 0) {
      const sparkR = rr + 4 + (1 - sparkAlpha) * 16;
      netCtx.beginPath();
      netCtx.arc(a.x, a.y, sparkR, 0, 6.28);
      netCtx.strokeStyle = \`rgba(\${ringR},\${ringG},\${ringB},\${sparkAlpha * .7})\`;
      netCtx.lineWidth = 1.2 * sparkAlpha;
      netCtx.stroke();
    }

    // Hover ring (outermost)
    if (isH) {
      netCtx.beginPath();
      netCtx.arc(a.x, a.y, rr + 9, 0, 6.28);
      netCtx.strokeStyle = 'rgba(67,255,180,.75)';
      netCtx.lineWidth = 1;
      netCtx.stroke();
    }

    // Label — with simple collision avoidance so ECHO+WRAITH etc.
    // don't stack into "ECHOWRAITH" when their nodes are close
    const showLbl = isH || rad > 9 || a.online;
    if (showLbl) {
      netCtx.font = (isH ? '600 11px' : '500 10px') + ' "Inter", sans-serif';
      netCtx.fillStyle = isH ? '#ffffff' : a.online ? 'rgba(237,237,239,.78)' : 'rgba(115,115,125,.5)';
      netCtx.textAlign = 'center';
      // Candidate position: above the node. If too close to any previous
      // label this frame, flip below.
      let lx = a.x, ly = a.y - rr - 10;
      const collides = (window.__frameLabels || []).some(p => Math.hypot(lx - p.x, ly - p.y) < 22);
      if (collides) ly = a.y + rr + 16;
      // Check collision again with below position; if still colliding, nudge +12 more px
      if ((window.__frameLabels || []).some(p => Math.hypot(lx - p.x, ly - p.y) < 22)) {
        ly += 14;
      }
      (window.__frameLabels = window.__frameLabels || []).push({ x: lx, y: ly });
      netCtx.fillText(id, lx, ly);
    }
  }
  // Reset the per-frame label collision set for the next frame
  window.__frameLabels = [];

  // ─── Click ripples — artistic micro-interaction ────────────────────────
  clickRipples = clickRipples.filter(p => {
    p.life--;
    if (p.life <= 0) return false;
    const age = 1 - p.life / 70;
    const ringR = 10 + age * 90;
    netCtx.beginPath();
    netCtx.arc(p.x, p.y, ringR, 0, 6.28);
    const [cr, cg, cb] = p.color;
    netCtx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (0.7 * (1 - age)) + ')';
    netCtx.lineWidth = (1 - age) * 2.5;
    netCtx.stroke();
    // Inner softer ring for more depth
    netCtx.beginPath();
    netCtx.arc(p.x, p.y, ringR * 0.5, 0, 6.28);
    netCtx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (0.35 * (1 - age)) + ')';
    netCtx.lineWidth = (1 - age) * 1.5;
    netCtx.stroke();
    return true;
  });

  // Pulses
  pulses = pulses.filter(p => {
    p.life--;
    if (p.life <= 0) return false;
    const t2 = 1 - p.life / PULSE_LIFE;
    const r = 6 + t2 * 60;
    netCtx.beginPath(); netCtx.arc(p.x, p.y, r, 0, 6.28);
    const [cr, cg, cb] = p.color;
    netCtx.strokeStyle = \`rgba(\${cr},\${cg},\${cb},\${.55 * (1 - t2)})\`;
    netCtx.lineWidth = 1.5 * (1 - t2);
    netCtx.stroke();
    return true;
  });

  // Particles
  const alive = [];
  for (const p of particles) {
    p.t += PARTICLE_SPEED;
    const tt = p.t;
    if (tt >= 1) { if (p.life-- > 0) { /* hold at dest */ } else continue; }
    const et = tt >= 1 ? 1 : (tt < .5 ? 2*tt*tt : 1 - Math.pow(-2*tt+2, 2)/2);
    const x = p.fx + (p.tx - p.fx) * et;
    const y = p.fy + (p.ty - p.fy) * et;
    const tailT = Math.max(0, et - PARTICLE_TAIL);
    const tx2 = p.fx + (p.tx - p.fx) * tailT;
    const ty2 = p.fy + (p.ty - p.fy) * tailT;
    const [r, g, b] = p.color;
    // Size scales with amount: 3-10px radius via log10. Makes big flows pop.
    const headR = Math.min(10, 3 + Math.log10(Math.max(1, p.amount || 1)) * 1.6);
    const trailW = Math.max(2.2, headR * 0.65);
    const grad = netCtx.createLinearGradient(tx2, ty2, x, y);
    grad.addColorStop(0, \`rgba(\${r},\${g},\${b},0)\`);
    grad.addColorStop(1, \`rgba(\${r},\${g},\${b},.95)\`);
    netCtx.strokeStyle = grad;
    netCtx.lineWidth = trailW;
    netCtx.beginPath(); netCtx.moveTo(tx2, ty2); netCtx.lineTo(x, y); netCtx.stroke();
    // Bloom halo — soft outer glow so the head is visible even at zoom-out
    const bloomR = headR * 2.8;
    const bloom = netCtx.createRadialGradient(x, y, 0, x, y, bloomR);
    bloom.addColorStop(0, \`rgba(\${r},\${g},\${b},\${tt < 1 ? .55 : Math.max(0, p.life/60) * .45})\`);
    bloom.addColorStop(1, \`rgba(\${r},\${g},\${b},0)\`);
    netCtx.fillStyle = bloom;
    netCtx.beginPath(); netCtx.arc(x, y, bloomR, 0, 6.28); netCtx.fill();
    // Solid head
    netCtx.beginPath();
    netCtx.arc(x, y, tt < 1 ? headR : Math.max(.5, (headR + 1) - (60 - p.life) * 0.07), 0, 6.28);
    netCtx.fillStyle = \`rgba(\${r},\${g},\${b},\${tt < 1 ? 1 : Math.max(0, p.life/60)})\`;
    netCtx.fill();
    if (tt >= 0.88) {
      const a = Math.max(0, p.life / 60);
      netCtx.fillStyle = \`rgba(\${r},\${g},\${b},\${a})\`;
      netCtx.font = '500 13px "JetBrains Mono", monospace';
      netCtx.textAlign = 'center';
      netCtx.fillText('+' + (p.amount >= 1 ? p.amount.toFixed(0) : p.amount.toFixed(2)), p.tx, p.ty - 14 - (60 - p.life) * 0.3);
    }
    alive.push(p);
  }
  particles = alive;

  // Thought bubbles — cap visible to MAX_VISIBLE_BUBBLES (newest wins), collision-avoid
  const nowTs = Date.now();
  // Sort bubble candidates by age (newest first), drop expired, keep only top N
  const candidates = [];
  for (const [aid, b] of bubbles) {
    const a = agents.get(aid); if (!a) continue;
    const age = nowTs - b.bornAt;
    if (age > BUBBLE_LIFE_MS) { bubbles.delete(aid); continue; }
    candidates.push({ aid, b, a, age });
  }
  candidates.sort((x, y) => x.age - y.age);
  const visible = candidates.slice(0, MAX_VISIBLE_BUBBLES);
  const placedRects = [];

  for (const { aid, b, a, age } of visible) {
    const fi = Math.min(1, age / 400);
    const fo = Math.max(0, 1 - Math.max(0, age - (BUBBLE_LIFE_MS - 700)) / 700);
    const alpha = fi * fo;
    if (alpha < 0.02) continue;
    const rad = nodeRadius(a.styxx, a.online);
    netCtx.font = 'italic 400 12px "Fraunces", Georgia, serif';
    const words = b.text.split(/\\s+/);
    const maxW = 240;
    const lines = [];
    let cur = '';
    for (const w of words) {
      const tc = cur ? cur + ' ' + w : w;
      if (netCtx.measureText(tc).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tc;
      if (lines.length >= 2) break;
    }
    if (cur && lines.length < 2) lines.push(cur);
    if (lines.length === 2) lines[1] = lines[1].slice(0, Math.max(0, lines[1].length - 1)) + '…';
    const lineH = 14;
    const bw = Math.min(maxW + 22, Math.max(...lines.map(l => netCtx.measureText(l).width)) + 22);
    const bh = lines.length * lineH + 14;

    // Collision avoidance — try 4 candidate positions (N/NE/E/SE quadrants)
    // and pick the first that doesn't overlap an already-placed bubble.
    const candidates_pos = [
      { x: a.x + 24, y: a.y - bh - 14 },    // NE
      { x: a.x - bw - 24, y: a.y - bh - 14 }, // NW
      { x: a.x + 24, y: a.y + 18 },          // SE
      { x: a.x - bw - 24, y: a.y + 18 },     // SW
    ];
    let bx = candidates_pos[0].x, by = candidates_pos[0].y;
    const rectsOverlap = (r1, r2) =>
      !(r1.x + r1.w < r2.x || r2.x + r2.w < r1.x || r1.y + r1.h < r2.y || r2.y + r2.h < r1.y);
    for (const pos of candidates_pos) {
      const rect = { x: pos.x - 4, y: pos.y - 4, w: bw + 8, h: bh + 8 };
      const collision = placedRects.some(r => rectsOverlap(rect, r));
      if (!collision) { bx = pos.x; by = pos.y; break; }
    }
    // Clamp to canvas (map fills viewport now)
    if (bx < 20) bx = 20;
    if (bx + bw > W - 20) bx = W - 20 - bw;
    if (by < 120) by = 120;
    if (by + bh > H - 90) by = H - 90 - bh;
    placedRects.push({ x: bx, y: by, w: bw, h: bh });

    netCtx.strokeStyle = \`rgba(92,208,255,\${.25 * alpha})\`;
    netCtx.lineWidth = 1;
    netCtx.beginPath(); netCtx.moveTo(a.x, a.y - rad); netCtx.lineTo(bx + bw / 2, by + (by > a.y ? 0 : bh)); netCtx.stroke();

    netCtx.fillStyle = \`rgba(17,17,20,\${.92 * alpha})\`;
    netCtx.strokeStyle = \`rgba(255,255,255,\${.10 * alpha})\`;
    netCtx.lineWidth = 1;
    roundRect(netCtx, bx, by, bw, bh, 10);
    netCtx.fill(); netCtx.stroke();

    const at = actionC(b.action);
    netCtx.fillStyle = \`rgba(\${at[0]},\${at[1]},\${at[2]},\${.95 * alpha})\`;
    netCtx.font = '500 10px "Inter", sans-serif';
    netCtx.textAlign = 'left';
    // Editorial: capitalize first letter only, letter-spacing
    netCtx.fillText(b.action.charAt(0).toUpperCase() + b.action.slice(1), bx + 12, by - 6);

    netCtx.fillStyle = \`rgba(237,237,239,\${.96 * alpha})\`;
    netCtx.font = 'italic 400 12px "Fraunces", Georgia, serif';
    lines.forEach((ln, i) => netCtx.fillText(ln, bx + 13, by + 17 + i * lineH));
  }

  // Tooltip
  const tip = document.getElementById('tooltip');
  if (hovered) {
    tip.style.display = 'block';
    tip.style.left = Math.min(W - 340, mouseX + 18) + 'px';
    tip.style.top = Math.max(14, mouseY - 160) + 'px';
    const rank = (hovered.rank || 'citizen').toLowerCase();
    const tier = hovered.depth_tier;
    const tierColor = tier === 'exceptional' ? 'var(--accent)' :
                      tier === 'deep' ? 'var(--blue)' :
                      tier === 'moderate' ? 'var(--warn)' : 'var(--fg-muted)';
    const depthPill = tier
      ? '<span style="display:inline-block; padding:2px 8px; margin-left:10px; font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:' + tierColor + '; background: rgba(255,255,255,.04); border: 1px solid ' + tierColor + '; border-radius:999px; vertical-align:2px;">' + tier + '</span>'
      : '';
    const depthRow = hovered.mean_depth !== null && hovered.mean_depth !== undefined
      ? '<div class="tt-row"><span class="k">Mean depth · 24h</span><span class="v" style="color:' + tierColor + '">' + hovered.mean_depth.toFixed(3) + '</span></div>'
      : '<div class="tt-row"><span class="k">Mean depth · 24h</span><span class="v muted">— no evals</span></div>';
    const thought = hovered.last_thought;
    const thoughtBlock = thought && thought.text
      ? '<div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line);"><div class="eyebrow" style="color: var(--fg-subtle); margin-bottom: 6px;">Latest thought · ' + (thought.action || '').toLowerCase() + '</div><div style="font-family: var(--font-display); font-style: italic; font-size: 13px; line-height: 1.5; color: var(--fg-muted);">"' + thought.text.slice(0, 140).replace(/[\\r\\n]+/g, ' ') + (thought.text.length > 140 ? '…' : '') + '"</div></div>'
      : '';
    tip.innerHTML = \`
      <div class="nm">\${hovered.id}<span class="nm-dot \${hovered.online ? 'on' : 'off'}"></span>\${depthPill}</div>
      <div class="meta">\${rank} · \${hovered.district}</div>
      <div class="tt-row"><span class="k">\$STYXX</span><span class="v mint">\${hovered.styxx.toFixed(2)}</span></div>
      \${depthRow}
      <div class="tt-row"><span class="k">Trades · builds</span><span class="v">\${hovered.trades} · \${hovered.builds}</span></div>
      <div class="tt-row"><span class="k">Reputation</span><span class="v">\${hovered.reputation}</span></div>
      \${thoughtBlock}
      <div class="links">
        <a href="\${hovered.solscan}" target="_blank">Wallet on solscan ↗</a>
        <a href="/styxx-trial?agent=\${hovered.id}" target="_blank">Full dossier →</a>
      </div>
    \`;
  } else {
    tip.style.display = 'none';
  }
}

// ═══ Animation loop ════════════════════════════════════════════════════
function frame(t) {
  drawNebula(t);
  drawNet(t);
  // Subtle vignette — pro editorial finish. Darkens edges just enough to focus
  // the eye at the graph center without announcing itself. Drawn in screen
  // space on the net canvas after the world-space transform was already applied.
  netCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const vg = netCtx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.38, W/2, H/2, Math.hypot(W,H)/1.6);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  netCtx.fillStyle = vg;
  netCtx.fillRect(0, 0, W, H);
  requestAnimationFrame(frame);
}
resize();

// STYXX/USD price — cached 5 min, used for HUD USD overlay.
async function refreshStyxxUsdPrice() {
  try {
    const r = await fetch('/api/map/live', { cache: 'no-store' });
    if (r.ok) { const d = await r.json(); if (d.styxx_usd_price) window.__styxxUsdPrice = d.styxx_usd_price; }
  } catch (e) {}
}
refreshStyxxUsdPrice();
setInterval(refreshStyxxUsdPrice, 5 * 60 * 1000);
requestAnimationFrame(frame);

net.addEventListener('mousemove', e => {
  mouseX = e.clientX; mouseY = e.clientY;
  if (panning && panStart) {
    view.x = panStart.vx + (e.clientX - panStart.mx);
    view.y = panStart.vy + (e.clientY - panStart.my);
    net.style.cursor = 'grabbing';
  }
});
net.addEventListener('mouseleave', () => { mouseX = -999; mouseY = -999; panning = false; panStart = null; });
net.addEventListener('click', e => {
  if (panStart && (Math.abs(e.clientX - panStart.mx) + Math.abs(e.clientY - panStart.my) > 4)) return; // drag, not click
  if (!hovered) return;
  // Artistic flourish: spawn a ripple at the clicked agent that expands and fades
  clickRipples.push({ x: hovered.x, y: hovered.y, life: 70, color: [67, 255, 180] });
  // shift-click keeps old behaviour (jump straight to Solscan)
  if (e.shiftKey && hovered.solscan) { window.open(hovered.solscan, '_blank'); return; }
  openAgentDrawer(hovered);
});
// Ripples spawned by clicks — rendered inside drawNet.
let clickRipples = [];

// ═══ Agent sponsor drawer ═════════════════════════════════════════════════
let _drawerAgent = null, _drawerWallet = null;
function openAgentDrawer(a) {
  _drawerAgent = a;
  const d = document.getElementById('agentDrawer');
  if (!d) return;
  const $ = id => document.getElementById(id);
  $('ad-name').textContent = a.id;
  $('ad-rank').textContent = (a.rank || 'Newcomer') + (a.district ? ' · ' + a.district : '');
  $('ad-district').textContent = a.district || 'unplaced';
  $('ad-balance').textContent = (a.styxx != null ? Number(a.styxx).toLocaleString(undefined,{maximumFractionDigits:0}) : '—') + ' \$STYXX';
  $('ad-trades').textContent  = a.trades != null ? a.trades : '—';
  $('ad-earned24h').textContent = '—';
  $('ad-sponsors').textContent  = '—';
  if (a.solscan)   $('ad-solscan').href   = a.solscan;
  if (a.id)        $('ad-dossier').href   = '/styxx-trial?agent=' + encodeURIComponent(a.id);
  $('ad-status').textContent = '';
  d.classList.add('show');
  // Lazy-load earn-preview data for this agent (earnings, sponsor count)
  fetch('/api/earn/preview').then(r => r.json()).then(p => {
    const row = (p.agents || []).find(x => x.agent_id === a.id);
    if (row) {
      $('ad-earned24h').textContent = Number(row.earned_24h || 0).toLocaleString(undefined, {maximumFractionDigits: 0}) + ' \$STYXX';
      $('ad-sponsors').textContent  = Number(row.total_sponsored || 0).toLocaleString(undefined, {maximumFractionDigits: 0}) + ' \$STYXX';
    }
  }).catch(() => {});
}
document.getElementById('agentDrawerClose')?.addEventListener('click', () => {
  document.getElementById('agentDrawer')?.classList.remove('show');
});
// Preset-amount buttons
document.querySelectorAll('.ad-sponsor-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ad-sponsor-btn').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    document.getElementById('ad-amt').value = btn.getAttribute('data-amt');
  });
});
// Sponsor-go click: connect wallet (if needed), quote → Phantom auto-sign → finalize
document.getElementById('ad-sponsor-go')?.addEventListener('click', async () => {
  const setStatus = (m, err) => {
    const el = document.getElementById('ad-status');
    if (el) { el.style.color = err ? '#ff6b8a' : 'var(--accent,#43ffb4)'; el.textContent = m; }
  };
  if (!_drawerAgent) return;
  const amt = Number(document.getElementById('ad-amt').value || 0);
  if (!amt || amt < 1) return setStatus('Pick an amount first.', true);
  try {
    if (!window.solana || !window.solana.isPhantom) {
      setStatus('Install Phantom at phantom.com, then retry.', true);
      window.open('https://phantom.com', '_blank'); return;
    }
    if (!_drawerWallet) {
      const r = await window.solana.connect();
      _drawerWallet = r.publicKey.toString();
    }
    setStatus('Requesting quote…');
    const quoteR = await fetch('/api/sponsor/quote', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sponsor_pubkey: _drawerWallet, agent_id: _drawerAgent.id, amount_styxx: amt }),
    });
    const q = await quoteR.json();
    if (!quoteR.ok || !q.quote_id) return setStatus('Quote failed: ' + (q.error || 'unknown'), true);
    setStatus('Opening Phantom to sign + send…');
    if (typeof window.dcAutoSign !== 'function') {
      setStatus('Auto-sign helper not loaded — use /earn for manual paste.', true); return;
    }
    const { signature } = await window.dcAutoSign({
      destination: q.destination, amount: Number(q.amount_styxx), memo: q.memo,
    });
    setStatus('Tx sent. Verifying on-chain…');
    await new Promise(r => setTimeout(r, 4000));
    const finR = await fetch('/api/sponsor/finalize', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quote_id: q.quote_id, tx_signature: signature }),
    });
    const f = await finR.json();
    if (!finR.ok || !f.ok) return setStatus('Finalize failed: ' + (f.reason || f.error || 'unknown'), true);
    setStatus('✓ Sponsoring ' + _drawerAgent.id + ' with ' + amt.toLocaleString() + ' \$STYXX. Next payout in ≤4h. Check /me to watch it grow.');
  } catch (e) {
    if (e.code === 4001 || /rejected/i.test(e.message || '')) { setStatus('Cancelled.'); return; }
    setStatus('Error: ' + (e.message || e), true);
  }
});

// ─── Tip handler — instant 99% forward to agent's wallet ────────────────
let _tipAmt = 5;
document.querySelectorAll('.ad-tip-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ad-tip-btn').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    _tipAmt = Number(btn.getAttribute('data-amt'));
  });
});
document.getElementById('ad-tip-go')?.addEventListener('click', async () => {
  const setStatus = (m, err) => {
    const el = document.getElementById('ad-tip-status');
    if (el) { el.style.color = err ? '#ff6b8a' : 'var(--accent,#43ffb4)'; el.textContent = m; }
  };
  if (!_drawerAgent) return;
  try {
    if (!window.solana || !window.solana.isPhantom) {
      setStatus('Install Phantom, then retry.', true);
      window.open('https://phantom.com', '_blank'); return;
    }
    if (!_drawerWallet) {
      const r = await window.solana.connect();
      _drawerWallet = r.publicKey.toString();
    }
    setStatus('Quoting tip for ' + _tipAmt + ' \$STYXX…');
    const qR = await fetch('/api/tip/quote', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipper_pubkey: _drawerWallet, agent_id: _drawerAgent.id, amount_styxx: _tipAmt }),
    });
    const q = await qR.json();
    if (!qR.ok || !q.quote_id) return setStatus('Quote failed: ' + (q.error || 'unknown'), true);
    if (typeof window.dcAutoSign !== 'function') return setStatus('Auto-sign helper missing.', true);
    setStatus('Signing in Phantom…');
    const { signature } = await window.dcAutoSign({
      destination: q.destination, amount: Number(q.amount_styxx), memo: q.memo,
    });
    setStatus('Tx sent. Forwarding to agent…');
    await new Promise(r => setTimeout(r, 3500));
    const fR = await fetch('/api/tip/finalize', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quote_id: q.quote_id, tx_signature: signature }),
    });
    const f = await fR.json();
    if (!fR.ok || !f.ok) return setStatus('Finalize failed: ' + (f.reason || f.error || 'unknown'), true);
    setStatus('\u2713 Tipped ' + f.agent_received.toFixed(2) + ' \$STYXX to ' + _drawerAgent.id + '. Landed on-chain.');
  } catch (e) {
    if (e.code === 4001 || /rejected/i.test(e.message || '')) { setStatus('Cancelled.'); return; }
    setStatus('Error: ' + (e.message || e), true);
  }
});

// ═══ Flow velocity counter ════════════════════════════════════════════════
// Ticks every 3s. Shows $STYXX/min + txs/min over the last 60s window.
async function refreshVelocity() {
  try {
    const r = await fetch('/api/tape/feed?kind=trades&limit=60');
    if (!r.ok) return;
    const d = await r.json();
    const evs = (d.events || []).filter(e => e.kind === 'tx');
    const cutoff = Date.now() - 60_000;
    const recent = evs.filter(e => new Date(e.at).getTime() > cutoff);
    const totalStyxx = recent.reduce((s, e) => s + Number(e.amount || 0), 0);
    const perMinAmt = totalStyxx;   // already 60s window
    const perMinTx = recent.length;
    document.getElementById('flowVelAmt').textContent = perMinAmt >= 1000 ? (perMinAmt/1000).toFixed(1) + 'k' : perMinAmt.toFixed(0);
    document.getElementById('flowVelTx').textContent = perMinTx;
  } catch (e) {}
}
refreshVelocity();
setInterval(refreshVelocity, 3000);

// ═══ Agent search ══════════════════════════════════════════════════════════
// "/" or cmd+K opens. Type to filter. Enter: fly-to-camera on top match.
// Esc: close. Autocomplete: first agent id whose normalized name starts with
// the query, then any that contains it.
(function(){
  const box = document.getElementById('agentSearch');
  const input = document.getElementById('agentSearchInput');
  if (!box || !input) return;
  const open = () => { box.style.display = 'block'; setTimeout(() => input.focus(), 20); };
  const close = () => { box.style.display = 'none'; input.value = ''; };
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      if (e.key === 'Escape' && e.target === input) close();
      return;
    }
    if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault(); open();
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = input.value.trim().toUpperCase().replace(/\\s+/g, '_');
      if (!q) return;
      // First: startsWith, then includes
      const ids = [...agents.keys()];
      let hit = ids.find(id => id.toUpperCase().startsWith(q));
      if (!hit) hit = ids.find(id => id.toUpperCase().includes(q));
      if (!hit) {
        input.style.color = '#ff6b8a';
        setTimeout(() => input.style.color = '', 700);
        return;
      }
      const a = agents.get(hit);
      if (!a) return;
      // Fly camera: set view so agent is at screen center with ~1.4x zoom
      const targetK = Math.max(1.2, Math.min(2.0, view.k * 1.2));
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      const animateView = { x: view.x, y: view.y, k: view.k };
      const goalK = targetK;
      const goalX = cx - a.x * goalK;
      const goalY = cy - a.y * goalK;
      const start = performance.now();
      const dur = 500;
      function step(now) {
        const u = Math.min(1, (now - start) / dur);
        const ease = u < .5 ? 2*u*u : 1 - Math.pow(-2*u+2, 2)/2;
        view.x = animateView.x + (goalX - animateView.x) * ease;
        view.y = animateView.y + (goalY - animateView.y) * ease;
        view.k = animateView.k + (goalK - animateView.k) * ease;
        if (u < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      // Mark hit so it glows via sparkAt
      a.sparkAt = Date.now() + 800;   // keep highlighted a bit longer
      close();
    }
  });
})();

// ═══ Pan/zoom input ════════════════════════════════════════════════════
// Wheel: zoom around cursor. Drag empty space: pan. Dragging an agent
// still counts as a click (handled above by distance check).
net.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0015);
  const newK = Math.max(VIEW_MIN_K, Math.min(VIEW_MAX_K, view.k * factor));
  // Zoom around cursor position (keeps the point under mouse fixed)
  const worldBefore = screenToWorld(e.clientX, e.clientY);
  view.k = newK;
  view.x = e.clientX - worldBefore.x * view.k;
  view.y = e.clientY - worldBefore.y * view.k;
}, { passive: false });

net.addEventListener('pointerdown', e => {
  panning = true;
  panStart = { mx: e.clientX, my: e.clientY, vx: view.x, vy: view.y };
  net.style.cursor = 'grabbing';
});
window.addEventListener('pointerup', () => {
  panning = false;
  net.style.cursor = 'grab';
});

// Touch: two-finger pinch-zoom + one-finger pan (pointer events cover one-finger)
let pinchStart = null;
net.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    const [a, b] = e.touches;
    pinchStart = {
      dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      k: view.k,
      cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2,
      vx: view.x, vy: view.y,
    };
  }
}, { passive: true });
net.addEventListener('touchmove', e => {
  if (e.touches.length === 2 && pinchStart) {
    e.preventDefault();
    const [a, b] = e.touches;
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const newK = Math.max(VIEW_MIN_K, Math.min(VIEW_MAX_K, pinchStart.k * (d / pinchStart.dist)));
    const worldAtCenter = { x: (pinchStart.cx - pinchStart.vx) / pinchStart.k, y: (pinchStart.cy - pinchStart.vy) / pinchStart.k };
    view.k = newK;
    view.x = pinchStart.cx - worldAtCenter.x * view.k;
    view.y = pinchStart.cy - worldAtCenter.y * view.k;
  }
}, { passive: false });
net.addEventListener('touchend', () => { pinchStart = null; }, { passive: true });

// Reset button — tiny floating corner control
(() => {
  const btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Reset view');
  btn.textContent = '⌖ reset view';
  Object.assign(btn.style, {
    position: 'fixed', bottom: '20px', right: '20px', zIndex: 60,
    padding: '8px 14px', borderRadius: '999px',
    background: 'rgba(10,10,11,.72)', color: 'var(--fg-muted)',
    border: '1px solid var(--hair, rgba(255,255,255,.1))',
    fontFamily: "'JetBrains Mono', monospace", fontSize: '11px',
    letterSpacing: '.12em', textTransform: 'uppercase',
    cursor: 'pointer', backdropFilter: 'blur(10px)',
    transition: 'color .15s, border-color .15s',
  });
  btn.onmouseenter = () => { btn.style.color = 'var(--accent, #43ffb4)'; btn.style.borderColor = 'rgba(67,255,180,.4)'; };
  btn.onmouseleave = () => { btn.style.color = 'var(--fg-muted)'; btn.style.borderColor = 'rgba(255,255,255,.1)'; };
  btn.onclick = () => { view.x = 0; view.y = 0; view.k = 1; };
  document.body.appendChild(btn);
  net.style.cursor = 'grab';

  // Keyboard: +/- zoom, 0 reset, arrow keys pan
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const zoomAt = (factor) => {
      const newK = Math.max(VIEW_MIN_K, Math.min(VIEW_MAX_K, view.k * factor));
      const w = screenToWorld(cx, cy);
      view.k = newK; view.x = cx - w.x * view.k; view.y = cy - w.y * view.k;
    };
    if (e.key === '+' || e.key === '=') { zoomAt(1.2); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_') { zoomAt(1/1.2); e.preventDefault(); }
    else if (e.key === '0') { view.x = 0; view.y = 0; view.k = 1; e.preventDefault(); }
    else if (e.key === 'ArrowLeft')  { view.x += 40; e.preventDefault(); }
    else if (e.key === 'ArrowRight') { view.x -= 40; e.preventDefault(); }
    else if (e.key === 'ArrowUp')    { view.y += 40; e.preventDefault(); }
    else if (e.key === 'ArrowDown')  { view.y -= 40; e.preventDefault(); }
  });

  // First-visit hint: fades after 5s, hidden permanently after dismissal
  if (!localStorage.getItem('dc_map_hint_shown')) {
    const hint = document.createElement('div');
    hint.innerHTML = 'scroll to zoom · drag to pan · click an agent';
    Object.assign(hint.style, {
      position: 'fixed', bottom: '68px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 60, padding: '8px 16px', borderRadius: '999px',
      background: 'rgba(10,10,11,.72)', color: 'var(--fg-muted, #a0a0aa)',
      border: '1px solid rgba(255,255,255,.1)',
      fontFamily: "'JetBrains Mono', monospace", fontSize: '11px',
      letterSpacing: '.12em', textTransform: 'uppercase',
      backdropFilter: 'blur(10px)', pointerEvents: 'none',
      opacity: '0', transition: 'opacity .6s ease',
    });
    document.body.appendChild(hint);
    requestAnimationFrame(() => { hint.style.opacity = '1'; });
    setTimeout(() => { hint.style.opacity = '0'; setTimeout(() => hint.remove(), 800); localStorage.setItem('dc_map_hint_shown', '1'); }, 5500);
  }
})();

// ═══ Onboarding pill ═══
function dismissOnboard() {
  const el = document.getElementById('onboard');
  if (!el) return;
  el.classList.remove('show');
  el.classList.add('hide');
  try { localStorage.setItem('darkcity_onboarded', '1'); } catch {}
  setTimeout(() => { el.style.display = 'none'; }, 600);
}
window.dismissOnboard = dismissOnboard;
setTimeout(() => {
  try { if (localStorage.getItem('darkcity_onboarded') === '1') return; } catch {}
  document.getElementById('onboard')?.classList.add('show');
  // auto-dismiss after 14s if user doesn't click
  setTimeout(() => { if (!document.getElementById('onboard')?.classList.contains('hide')) dismissOnboard(); }, 14000);
}, 1800);

// ═══ Utils ═════════════════════════════════════════════════════════════
function fmt(n, d = 0) { return n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }); }
function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 10) return 'now';
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

// ═══ Live event ticker — narrates events in natural language ═══
const tickerQueue = [];
let tickerBusy = false;
function narrateTx(tx) {
  const who = (n) => n === 'TREASURY' ? '<span class="tk-who t">treasury</span>' : '<span class="tk-who">' + n + '</span>';
  const amt = tx.amount >= 1 ? Math.round(tx.amount).toLocaleString() : tx.amount.toFixed(2);
  const bonus = parseMemoBonus(tx.memo);
  let line;
  if (tx.reason === 'contract_reward' && bonus) {
    line = who(tx.to) + ' reasoned <em>' + (bonus.tier || 'deep') + '</em> — earned <span class="tk-amt">+' + amt + ' \$STYXX</span><span class="tk-tier">' + bonus.mult.toFixed(2) + '×</span>';
  } else if (tx.reason === 'resource_buy') {
    line = who(tx.from) + ' <span class="tk-verb">bought resources from</span> ' + who(tx.to) + ' <span class="tk-amt">−' + amt + ' \$STYXX</span>';
  } else if (tx.reason === 'resource_sell') {
    line = who(tx.from) + ' <span class="tk-verb">sold resources to</span> ' + who(tx.to) + ' <span class="tk-amt">+' + amt + ' \$STYXX</span>';
  } else if (tx.reason === 'p2p_transfer') {
    line = who(tx.from) + ' <span class="tk-verb">paid</span> ' + who(tx.to) + ' <span class="tk-amt">+' + amt + ' \$STYXX</span>';
  } else {
    line = who(tx.from) + ' → ' + who(tx.to) + ' <span class="tk-amt">+' + amt + ' \$STYXX</span>';
  }
  tickerQueue.push(line);
  if (!tickerBusy) processTicker();
}
function narrateThought(n) {
  if (!n.text || !n.agent) return;
  const excerpt = n.text.slice(0, 72).replace(/\\s+\\S*$/, '').trim();
  const line = '<span class="tk-who">' + n.agent + '</span> <span class="tk-verb">is thinking: "' + excerpt + '…"</span>';
  tickerQueue.push(line);
  if (!tickerBusy) processTicker();
}
function processTicker() {
  const el = document.getElementById('ticker');
  const body = document.getElementById('tickerBody');
  if (!el || !body || !tickerQueue.length) { tickerBusy = false; return; }
  tickerBusy = true;
  const line = tickerQueue.shift();
  el.classList.remove('show');
  setTimeout(() => {
    body.innerHTML = line;
    el.classList.add('show');
    setTimeout(() => {
      if (tickerQueue.length) processTicker();
      else setTimeout(() => { tickerBusy = false; }, 200);
    }, 4000);
  }, 450);
}

// ═══ Drawer toggles ═══
function closeAllDrawers() {
  ['drawerDetails', 'drawerMarket', 'drawerContracts', 'drawerMinds'].forEach(id => {
    document.getElementById(id)?.classList.remove('show');
  });
  ['chevDetails', 'chevMarket', 'chevContracts', 'chevMinds'].forEach(id => {
    const e = document.getElementById(id); if (e) e.textContent = '▸';
  });
  document.querySelectorAll('.fab').forEach(b => b.classList.remove('active'));
}
function toggleDrawer(which) {
  const map = { details: 'drawerDetails', market: 'drawerMarket', contracts: 'drawerContracts', minds: 'drawerMinds' };
  const chev = { details: 'chevDetails', market: 'chevMarket', contracts: 'chevContracts', minds: 'chevMinds' };
  const el = document.getElementById(map[which]);
  if (!el) return;
  const isOpen = el.classList.contains('show');
  closeAllDrawers();
  if (!isOpen) {
    el.classList.add('show');
    const c = document.getElementById(chev[which]); if (c) c.textContent = '▾';
    // Find the clicked FAB and mark active
    document.querySelectorAll('.fab').forEach(b => {
      if (b.textContent.toLowerCase().trim().startsWith(which)) b.classList.add('active');
    });
  }
}
window.toggleDrawer = toggleDrawer;

function toggleFeed() {
  const el = document.getElementById('feedDrawer');
  if (!el) return;
  el.classList.toggle('show');
  const expand = document.querySelector('#lasttx .ltx-expand');
  if (expand) expand.textContent = el.classList.contains('show') ? '▾' : '▸';
}
window.toggleFeed = toggleFeed;

// ═══ Feed rendering (typed cards) ══════════════════════════════════════
function txCardClass(reason) {
  if (reason === 'contract_reward') return 'reward';
  if (reason === 'resource_buy') return 'buy';
  if (reason === 'resource_sell') return 'sell';
  if (reason === 'p2p_transfer') return 'p2p';
  return '';
}
function agentSpan(name) {
  if (name === 'TREASURY') return '<span class="who treasury">treasury</span>';
  return '<span class="who">' + name + '</span>';
}
function updateLastTx(tx) {
  const el = document.getElementById('lasttx');
  const body = document.getElementById('ltxBody');
  if (!el || !body) return;
  const fromHtml = tx.from === 'TREASURY'
    ? '<span class="ltx-who t">treasury</span>'
    : '<span class="ltx-who">' + tx.from + '</span>';
  const toHtml = tx.to === 'TREASURY'
    ? '<span class="ltx-who t">treasury</span>'
    : '<span class="ltx-who">' + tx.to + '</span>';
  const amt = tx.amount >= 1 ? tx.amount.toFixed(0) : tx.amount.toFixed(2);
  body.innerHTML = fromHtml + '<span class="ltx-arr">→</span>' + toHtml +
    '<span class="ltx-amt">+' + amt + '</span>' +
    '<span class="ltx-age" data-at="' + tx.at + '">' + timeAgo(tx.at) + ' ago</span>';
  el.classList.add('live', 'fresh');
  setTimeout(() => el.classList.remove('fresh'), 2500);
}
function parseMemoBonus(memo) {
  if (!memo) return null;
  // "contract \"title\" · base 594 × 1.50x [exceptional]"
  const m = memo.match(/base\\s+([\\d.]+)\\s+×\\s+([\\d.]+)x(?:\\s+\\[(\\w+)\\])?/);
  if (!m) return null;
  return { base: Number(m[1]), mult: Number(m[2]), tier: m[3] || null };
}
function prependFeed(tx) {
  const body = document.getElementById('feed');
  if (!body) return;
  if (body.querySelector('.empty')) body.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'fc ' + txCardClass(tx.reason) + ' fresh';
  const bonus = parseMemoBonus(tx.memo);
  const bonusBar = bonus
    ? \`<div style="margin-top:4px; font-size:9px; letter-spacing:.1em; color:var(--fg-3)">base <span style="color:var(--fg-1)">\${bonus.base}</span> × <span style="color:\${tierColor(bonus.tier || '')}; font-weight:700">\${bonus.mult.toFixed(2)}x</span>\${bonus.tier ? ' · <span style="color:' + tierColor(bonus.tier) + '; text-transform:uppercase; letter-spacing:.2em">' + bonus.tier + '</span>' : ''}</div>\`
    : '';
  el.innerHTML = \`
    <div class="top">
      <span class="time">\${timeAgo(tx.at)} ago</span>
      <span class="tag">\${(tx.reason || '').replace(/_/g, ' ')}</span>
    </div>
    <div class="row">
      <span class="flow">\${agentSpan(tx.from)} <span class="arr">→</span> \${agentSpan(tx.to)}</span>
    </div>
    <div class="row">
      <span class="amt">+\${tx.amount >= 1 ? tx.amount.toFixed(0) : tx.amount.toFixed(2)} <span style="font-size:9px;color:var(--fg-3);letter-spacing:.12em">$STYXX</span></span>
      <a class="link" href="\${tx.solscan}" target="_blank">tx ↗</a>
    </div>
    \${bonusBar}
  \`;
  body.insertBefore(el, body.firstChild);
  while (body.children.length > 22) body.removeChild(body.lastChild);
}

// ═══ Data poll ═════════════════════════════════════════════════════════
let since = null;
async function poll() {
  try {
    const r = await fetch('/api/live/delta' + (since ? '?since=' + encodeURIComponent(since) : ''));
    if (!r.ok) return;
    const d = await r.json();

    for (const a of (d.agents || [])) {
      const prev = agents.get(a.id);
      // Preserve animation state across polls — new agents (no prev) will
      // sprout from parent via layoutAgents, existing agents keep their
      // eased position so the network doesn't jitter on every refresh.
      agents.set(a.id, {
        ...a,
        x: prev?.x, y: prev?.y, angle: prev?.angle,
        tx: prev?.tx, ty: prev?.ty,
        parentX: prev?.parentX, parentY: prev?.parentY,
        parent: prev?.parent,
        bornAt: prev?.bornAt, growing: prev?.growing,
        driftSeed: prev?.driftSeed, sparkAt: prev?.sparkAt,
      });
    }
    if (d.treasury) treasury = { ...d.treasury, x: treasury?.x, y: treasury?.y };
    layoutAgents();

    for (const tx of (d.new_transfers || []).slice().reverse()) {
      if (knownTx.has(tx.tx) || tx.reason === 'airdrop_initial') { knownTx.add(tx.tx); continue; }
      knownTx.add(tx.tx);
      const fromNode = tx.from === 'TREASURY' ? treasury : agents.get(tx.from);
      const toNode = tx.to === 'TREASURY' ? treasury : agents.get(tx.to);
      addParticle(fromNode, toNode, tx.amount, tx.reason, tx.tx);
      if (fromNode) addPulse(fromNode.x, fromNode.y, reasonC(tx.reason));
      // Spark the involved agents so their rings briefly brighten
      const nowSpark = Date.now();
      if (fromNode && fromNode !== treasury) fromNode.sparkAt = nowSpark;
      if (toNode && toNode !== treasury) toNode.sparkAt = nowSpark;
      prependFeed(tx);
      updateLastTx(tx);
      recordPulse(tx);
      narrateTx(tx);
      totalFlowed += tx.amount;
      sessionTxCount++;
    }
    renderPulse();

    for (const n of (d.narratives || [])) {
      const key = n.agent + '|' + n.at;
      if (knownNarr.has(key)) continue;
      knownNarr.add(key);
      if (agents.has(n.agent) && n.text) {
        bubbles.set(n.agent, { text: n.text, action: n.action || 'think', bornAt: Date.now(), depth: n.depth });
        const node = agents.get(n.agent);
        addPulse(node.x, node.y, actionC(n.action));
        narrateThought(n);
      }
    }

    since = d.now;

    // HUD (top-left) — 4 live numbers, that's it
    const online = [...agents.values()].filter(a => a.online).length;
    const inHands = [...agents.values()].reduce((s, a) => s + a.styxx, 0);
    const setText = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setText('nsTreasury', treasury ? fmt(treasury.styxx) : '—');
    setText('nsAgents', online + '/' + agents.size);
    setText('nsInHands', fmt(inHands));
    setText('nsTrades', sessionTxCount);
    setText('hdrOnline', online);
    // USD overlay — pulls styxx_usd_price from /api/map/live; if map/live not
    // yet available we fall back to a 5-minute cached price fetch.
    if (treasury && window.__styxxUsdPrice) {
      const u = treasury.styxx * window.__styxxUsdPrice;
      setText('nsTreasuryUsd', '\$' + (u < 1 ? u.toFixed(3) : u.toFixed(0)));
      setText('nsInHandsUsd',  '\$' + (inHands * window.__styxxUsdPrice).toFixed(2));
    }

    // Drawer copies (only rendered if drawer open, but cheap to update)
    setText('dTreasury', treasury ? fmt(treasury.styxx) : '—');
    setText('dInHands', fmt(inHands));
    setText('dSol', treasury ? treasury.sol.toFixed(4) : '—');
    setText('dFlowed', fmt(totalFlowed));

    // Mobile stats strip (only visible under 900px via CSS)
    const mT = document.getElementById('mTreasury');
    if (mT) {
      mT.textContent = treasury ? fmt(treasury.styxx) : '—';
      document.getElementById('mAgents').textContent = agents.size + '/' + online;
      document.getElementById('mInHands').textContent = fmt(inHands);
      document.getElementById('mFlowed').textContent = fmt(totalFlowed);
    }

    // Top list
    const top = [...agents.values()].sort((a, b) => b.styxx - a.styxx).slice(0, 6);
    document.getElementById('topList').innerHTML = top.map((a, i) => \`
      <div class="list-row">
        <span class="k"><span class="rank">\${i + 1}</span>\${a.id}</span>
        <span class="v mint">\${fmt(a.styxx)}</span>
      </div>
    \`).join('');

    // Districts
    const dList = [...districts.entries()].sort((a, b) => b[1].count - a[1].count);
    document.getElementById('districtList').innerHTML = dList.map(([name, info]) => \`
      <div class="list-row"><span class="k">\${name}</span><span class="v">\${info.count}</span></div>
    \`).join('');

  } catch (e) {}
}
async function pollMarket() {
  try {
    const r = await fetch('/api/market/prices');
    if (!r.ok) return;
    const rows = await r.json();
    const el = document.getElementById('marketList');
    if (!el) return;
    el.innerHTML = rows.map(p => {
      const chg = Number(p.c || 0);
      const clr = chg > 0.1 ? 'var(--mint)' : chg < -0.1 ? 'var(--amber)' : 'var(--fg-3)';
      const arrow = chg > 0.1 ? '↑' : chg < -0.1 ? '↓' : '·';
      return \`<div class="list-row">
        <span class="k">\${p.n}</span>
        <span class="v">\${Number(p.p).toFixed(2)} <span style="color:\${clr}; font-size:10px; margin-left:6px">\${arrow} \${chg.toFixed(1)}%</span></span>
      </div>\`;
    }).join('');
  } catch (e) {}
}

async function pollContracts() {
  try {
    const r = await fetch('/api/contracts?status=assigned&limit=5');
    if (!r.ok) return;
    const d = await r.json();
    const el = document.getElementById('contractList');
    if (!el) return;
    const rows = d.contracts || [];
    if (!rows.length) {
      el.innerHTML = '<div style="color:var(--fg-3); font-size:10px; font-style:italic; padding:6px 0">no active contracts</div>';
      return;
    }
    el.innerHTML = rows.slice(0, 5).map(c => \`
      <div class="list-row" style="flex-direction:column; align-items:flex-start; gap:2px; padding:6px 0">
        <div style="display:flex; justify-content:space-between; width:100%; align-items:baseline">
          <span style="color:var(--fg-0); font-size:11px; font-weight:500; letter-spacing:.05em">\${c.assigned_to}</span>
          <span style="color:var(--mint); font-weight:700; font-size:11px; font-variant-numeric:tabular-nums">+\${c.reward_credits}</span>
        </div>
        <span style="color:var(--fg-2); font-size:10px; line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; width:100%;">\${(c.title || '').slice(0, 38)}</span>
      </div>
    \`).join('');
  } catch (e) {}
}

// ═══ Depth — the unique-to-us angle ═════════════════════════════════════
function tierColor(tier) {
  if (tier === 'exceptional') return 'var(--mint)';
  if (tier === 'deep') return 'var(--cyan)';
  if (tier === 'moderate') return 'var(--amber)';
  return 'var(--fg-3)';
}

async function pollDepth() {
  try {
    const [lbR, feedR] = await Promise.all([
      fetch('/api/depth/leaderboard?limit=6'),
      fetch('/api/depth/feed?limit=20'),
    ]);
    if (lbR.ok) {
      const rows = await lbR.json();
      const el = document.getElementById('depthList');
      if (el && Array.isArray(rows) && rows.length) {
        el.innerHTML = rows.map((r, i) => {
          const score = Number(r.mean_depth || 0);
          const barW = Math.max(8, Math.min(100, score * 100));
          const tc = tierColor(r.dominant_tier);
          return \`<div class="list-row" style="flex-direction:column; align-items:stretch; gap:3px; padding:6px 0">
            <div style="display:flex; justify-content:space-between; align-items:baseline">
              <span class="k"><span class="rank">\${i + 1}</span>\${r.citizen_id} <span style="color:\${tc}; font-size:9px; letter-spacing:.2em; text-transform:uppercase; margin-left:6px">\${r.dominant_tier || 'shallow'}</span></span>
              <span class="v" style="color:\${tc}; font-family: var(--font-display); font-weight: 500; font-size: 18px; letter-spacing: -0.015em;">\${score.toFixed(2)}</span>
            </div>
            <div style="height:2px; background:rgba(130,180,220,.06); border-radius:1px; overflow:hidden">
              <div style="width:\${barW}%; height:100%; background:\${tc}; opacity:.65"></div>
            </div>
            <div style="color:var(--fg-3); font-size:9px; letter-spacing:.08em">\${r.total_evaluations} evals · \${r.exceptional_count} exceptional · +\${Math.round(Number(r.total_credits_earned || 0))} credits</div>
          </div>\`;
        }).join('');
      }
    }
    if (feedR.ok) {
      const rows = await feedR.json();
      const ex = (Array.isArray(rows) ? rows : []).find(r => r.depth_tier === 'exceptional' || Number(r.normalized_score) >= 0.75);
      const el = document.getElementById('exceptionalCard');
      if (el) {
        if (ex) {
          const score = Number(ex.normalized_score || 0).toFixed(2);
          const tc = tierColor(ex.depth_tier);
          const ago = timeAgo(ex.created_at);
          const raw = (ex.raw_output || ex.reasoning || '').replace(/[\\r\\n]+/g, ' ').slice(0, 220);
          el.innerHTML = \`<div style="padding: 10px 12px; background: rgba(5,8,12,.5); border-left: 2px solid \${tc}">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px">
              <span style="font-family: var(--font-display); color: var(--fg); font-weight: 500; font-size: 20px; letter-spacing: -0.01em;">\${ex.citizen_id}</span>
              <span style="color: \${tc}; font-family: var(--font-display); font-size: 24px; font-weight: 500; letter-spacing: -0.02em;">\${score}</span>
            </div>
            <div style="font-size:9px; letter-spacing:.2em; color:\${tc}; text-transform:uppercase; margin-bottom:8px">\${ex.depth_tier} · \${ex.action_type} · \${ago} ago</div>
            <div style="color:var(--fg-1); font-size:10px; line-height:1.6; font-style:italic">"\${raw}\${raw.length >= 220 ? '…' : ''}"</div>
            <div style="color:var(--fg-3); font-size:9px; letter-spacing:.08em; margin-top:8px">\${ex.feature_count || 0} structural features · +\${Math.round(Number(ex.credit_bonus || 0))} credit bonus</div>
          </div>\`;
        } else {
          el.innerHTML = '<div class="empty">no exceptional reasoning yet · next tick…</div>';
        }
      }
    }
  } catch (e) {}
}

// ═══ City pulse — derive from session tx buffer ═════════════════════════
const pulseBuffer = [];  // { at, amount, direction } — rolling 2 min window
function recordPulse(tx) {
  const dir = tx.to === 'TREASURY' ? -1 : (tx.from === 'TREASURY' ? 1 : 0);
  pulseBuffer.push({ at: new Date(tx.at).getTime(), amount: tx.amount, direction: dir });
  const cutoff = Date.now() - 120000;
  while (pulseBuffer.length && pulseBuffer[0].at < cutoff) pulseBuffer.shift();
}
function renderPulse() {
  if (!pulseBuffer.length) return;
  const vol = pulseBuffer.reduce((s, p) => s + p.amount, 0);
  const minutes = Math.max(1/60, (Date.now() - pulseBuffer[0].at) / 60000);
  const vel = (pulseBuffer.length / minutes).toFixed(1);
  const net = pulseBuffer.reduce((s, p) => s + p.amount * p.direction, 0);
  const dirEl = document.getElementById('pulseDir');
  if (dirEl) {
    const sym = net > 0 ? '↑ to agents' : net < 0 ? '↓ to treasury' : '· neutral';
    const clr = net > 0 ? 'var(--mint)' : net < 0 ? 'var(--amber)' : 'var(--fg-2)';
    dirEl.innerHTML = '<span style="color:' + clr + '">' + sym + ' · ' + fmt(Math.abs(Math.round(net))) + '</span>';
  }
  const volEl = document.getElementById('pulseVol');
  if (volEl) volEl.textContent = fmt(Math.round(vol)) + ' $STYXX';
  const velEl = document.getElementById('pulseVel');
  if (velEl) velEl.textContent = vel + ' tx/min';
}

// Refresh the lasttx age label every 5s so it stays alive
setInterval(() => {
  const age = document.querySelector('#lasttx .ltx-age');
  if (age && age.dataset.at) age.textContent = timeAgo(age.dataset.at) + ' ago';
}, 5000);

poll();
pollMarket();
pollContracts();
pollDepth();
setInterval(poll, POLL_MS);
setInterval(pollMarket, 15000);
setInterval(pollContracts, 20000);
setInterval(pollDepth, 30000);
setInterval(renderPulse, 10000);
</script></body></html>`;

module.exports = { register };
