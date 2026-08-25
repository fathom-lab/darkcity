// ============================================================================
// hooks/darkcoin-dashboard.js
// Personal dashboard — the "my money" page.
//
// URL: /me            (prompts for wallet connect)
//      /me?wallet=X   (direct load for a pubkey)
//
// Fetches /api/portfolio/:owner (defined in hooks/darkcoin-economy.js) every 10s
// and renders the user's personal financial life in DarkCity: agents owned,
// lifetime earnings, active sponsorships, referral income, hyphal flows,
// recent payouts. Matches the /live page aesthetic exactly.
// ============================================================================

'use strict';

const { TOKEN_TICKER, TOKEN_PUMP_URL, TOKEN_LIVE } = require('../lib/token-config');

function register(app) {
  app.get('/me', (req, res) => res.type('html').send(PAGE));
  app.get('/dashboard', (req, res) => res.type('html').send(PAGE));
  app.get('/dashboard/:pubkey', (req, res) => res.type('html').send(PAGE));
  console.log('[darkcoin-dashboard] registered: /me, /dashboard, /dashboard/:pubkey');
}

module.exports = { register };

const PAGE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your dashboard · DarkCity</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta name="theme-color" content="#05070b">
<meta name="description" content="Your personal DarkCity dashboard — agents owned, sponsor yield, referrals, lifetime earnings. Live on-chain.">
<meta property="og:site_name" content="DarkCity">
<meta property="og:type" content="website">
<meta property="og:title" content="Your DarkCity dashboard">
<meta property="og:description" content="Every $DARKCOIN you've earned, every agent you own, every sponsorship that's paying out — live.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Your DarkCity dashboard">
<meta name="twitter:description" content="Personal on-chain portfolio. Agents, sponsorships, referrals, mycelium flows.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0a0a0b; --bg-elev: #111114; --bg-elev-hi: #17171c;
  --fg: #ededef; --fg-muted: #a0a0aa; --fg-subtle: #5a5a64;
  --line: rgba(255,255,255,.06); --line-hi: rgba(255,255,255,.10);
  --accent: #43ffb4; --accent-dim: rgba(67,255,180,.08);
  --warn: #ffb347; --loss: #ff6b8a; --blue: #5cd0ff;
  --font-display: 'Fraunces', Georgia, serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--bg); color: var(--fg); min-height: 100vh;
  font-family: var(--font-body); font-size: 14px; line-height: 1.55;
  -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums;
  font-feature-settings: "ss01", "cv02", "cv11";
}
.container { max-width: 1400px; margin: 0 auto; padding: 0 40px; }
@media (max-width: 720px) { .container { padding: 0 20px; } }
::selection { background: var(--accent); color: #000; }
a { color: var(--fg); text-decoration: none; transition: color .15s; }
a:hover { color: var(--accent); }

/* Nav */
.nav { position: sticky; top: 0; z-index: 50; background: rgba(10,10,11,.72);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-bottom: 1px solid var(--line); }
.nav-inner { max-width: 1400px; margin: 0 auto; padding: 14px 40px; display: flex; align-items: center; gap: 24px; }
@media (max-width: 720px) { .nav-inner { padding: 12px 20px; gap: 14px; } }
.nav-brand { font-family: var(--font-display); font-size: 20px; font-weight: 600; letter-spacing: -0.01em; color: var(--fg); margin-right: auto; }
.nav-brand .mark { color: var(--accent); margin-right: 6px; font-weight: 400; }
.nav-links { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; }
.nav-links a { font-size: 14px; font-weight: 500; color: var(--fg-muted); }
.nav-links a:hover, .nav-links a.active { color: var(--fg); }
.nav-links a.external::after { content: '↗'; margin-left: 4px; color: var(--fg-subtle); font-size: 12px; }

/* Hero */
.eyebrow { font-family: var(--font-body); font-size: 11px; font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: var(--fg-subtle); }
.hero { padding: 64px 0 32px; }
.hero .kicker { margin-bottom: 18px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hero .pulse-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px var(--accent); animation: pulse 1.8s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
.hero h1 {
  font-family: var(--font-display);
  font-size: clamp(38px, 5.5vw, 64px);
  font-weight: 400; line-height: 1.05;
  letter-spacing: -0.02em; color: var(--fg);
  max-width: 20ch; margin-bottom: 14px;
}
.hero h1 em { font-style: italic; color: var(--accent); font-weight: 400; }
.hero .sub { color: var(--fg-muted); font-size: 16px; max-width: 64ch; line-height: 1.55; }

/* Wallet pill */
.wallet-pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border: 1px solid var(--line-hi); border-radius: 999px; font-family: var(--font-mono); font-size: 12px; color: var(--fg-muted); }
.wallet-pill .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 6px var(--accent); }
.wallet-pill .addr { color: var(--fg); font-weight: 500; }
.wallet-pill a { margin-left: 6px; color: var(--fg-subtle); }

/* Hero stats — the headline "how much money do I have" numbers */
.stats {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 32px; padding: 28px 0; margin: 40px 0;
  border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
}
.stat { display: flex; flex-direction: column; gap: 10px; }
.stat .lbl { font-size: 11px; letter-spacing: .12em; color: var(--fg-subtle); text-transform: uppercase; font-weight: 500; order: 2; }
.stat .val { font-family: var(--font-display); font-weight: 400; font-size: clamp(26px, 3.2vw, 38px); line-height: 1; color: var(--fg); }
.stat .val.green { color: var(--accent); }
.stat .val.blue { color: var(--blue); }
.stat .sub { font-size: 12px; color: var(--fg-subtle); margin-top: -2px; order: 3; font-family: var(--font-mono); }
.stat .delta { font-size: 12px; font-weight: 500; font-family: var(--font-mono); order: 3; }
.stat .delta.up { color: var(--accent); }
.stat .delta.down { color: var(--loss); }

/* Next payout countdown */
.countdown-bar {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 20px; margin: 0 0 32px 0;
  background: linear-gradient(90deg, rgba(67,255,180,.05), rgba(67,255,180,.02) 50%, transparent);
  border: 1px solid var(--line); border-left: 2px solid var(--accent);
  border-radius: 4px; font-family: var(--font-mono); font-size: 13px;
}
.countdown-bar .lbl { color: var(--fg-muted); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
.countdown-bar .ticker { color: var(--fg); font-weight: 600; }
.countdown-bar .progress { flex: 1; height: 2px; background: var(--line); border-radius: 2px; overflow: hidden; max-width: 240px; }
.countdown-bar .progress .fill { height: 100%; background: var(--accent); transition: width 1s linear; }

/* Section header */
.section { padding: 40px 0; border-top: 1px solid var(--line); }
.section-head { display: flex; align-items: baseline; gap: 18px; margin-bottom: 28px; }
.section-num { font-family: var(--font-mono); font-size: 12px; color: var(--fg-subtle); letter-spacing: .1em; }
.section-title { font-family: var(--font-display); font-size: clamp(24px, 3vw, 34px); font-weight: 400; letter-spacing: -0.01em; color: var(--fg); }

/* Card grid */
.grid { display: grid; gap: 14px; }
.grid-2 { grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); }
.grid-3 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }

/* Agent/position card */
.card {
  background: var(--bg-elev); border: 1px solid var(--line);
  border-radius: 6px; padding: 20px;
  transition: border-color .15s, transform .15s;
}
.card:hover { border-color: var(--line-hi); transform: translateY(-1px); }
.card-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
.card-name { font-family: var(--font-display); font-size: 18px; font-weight: 500; letter-spacing: -0.01em; }
.card-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
.tag { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; padding: 3px 8px; border: 1px solid var(--line-hi); border-radius: 3px; color: var(--fg-muted); font-weight: 500; }
.tag.accent { color: var(--accent); border-color: rgba(67,255,180,.3); }
.tag.warn { color: var(--warn); border-color: rgba(255,179,71,.3); }
.tag.dormant { color: var(--loss); border-color: rgba(255,107,138,.3); }

.card-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 14px; border-top: 1px solid var(--line); }
.metric { display: flex; flex-direction: column; gap: 4px; }
.metric .m-lbl { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--fg-subtle); }
.metric .m-val { font-family: var(--font-mono); font-size: 16px; font-weight: 500; color: var(--fg); }
.metric .m-val.green { color: var(--accent); }

.card-actions { display: flex; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-body); font-size: 12px; font-weight: 500;
  padding: 8px 14px; border-radius: 4px;
  border: 1px solid var(--line-hi); background: transparent; color: var(--fg-muted);
  cursor: pointer; transition: all .15s; text-decoration: none;
}
.btn:hover { border-color: var(--accent); color: var(--accent); }
.btn.primary { background: var(--accent); color: #000; border-color: var(--accent); font-weight: 600; }
.btn.primary:hover { background: transparent; color: var(--accent); }

/* Tables — recent payouts ledger */
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--line); font-size: 13px; }
th { font-size: 10px; letter-spacing: .12em; color: var(--fg-subtle); text-transform: uppercase; font-weight: 500; }
td.mono { font-family: var(--font-mono); }
td.right { text-align: right; font-family: var(--font-mono); font-weight: 500; }
td.right.green { color: var(--accent); }

/* Chart */
.chart {
  background: var(--bg-elev); border: 1px solid var(--line);
  border-radius: 6px; padding: 20px; margin-top: 14px;
}
.chart-head { display: flex; justify-content: space-between; margin-bottom: 16px; }
.chart-head h3 { font-family: var(--font-display); font-size: 16px; font-weight: 500; }
.chart-head .range { font-size: 11px; letter-spacing: .12em; color: var(--fg-subtle); text-transform: uppercase; }
.chart svg { width: 100%; height: 140px; display: block; }

/* Empty state + connect UI */
.empty {
  padding: 80px 40px; text-align: center;
  background: var(--bg-elev); border: 1px dashed var(--line-hi);
  border-radius: 6px; margin: 40px 0;
}
.empty h2 { font-family: var(--font-display); font-size: 28px; font-weight: 400; margin-bottom: 12px; color: var(--fg); }
.empty p { color: var(--fg-muted); max-width: 52ch; margin: 0 auto 24px; }
.empty .connect-row { display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap; }
.empty input {
  background: var(--bg); color: var(--fg); border: 1px solid var(--line-hi);
  border-radius: 4px; padding: 10px 14px; font-family: var(--font-mono); font-size: 13px;
  width: 380px; max-width: 100%;
}
.empty input:focus { outline: none; border-color: var(--accent); }

/* Loading skeletons */
.skel {
  background: linear-gradient(90deg, var(--bg-elev), var(--bg-elev-hi), var(--bg-elev));
  background-size: 200% 100%; animation: shimmer 1.5s linear infinite;
  border-radius: 4px;
}
@keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }

/* Footer */
.footer { padding: 60px 0 40px; border-top: 1px solid var(--line); margin-top: 40px; color: var(--fg-subtle); font-size: 13px; }
.footer a { color: var(--fg-muted); }
.footer a:hover { color: var(--accent); }
/* ═══ Claim modal ═════════════════════════════════════════════════════ */
#claimModal { position: fixed; inset: 0; background: rgba(0,0,0,.72); backdrop-filter: blur(8px); z-index: 100; display: none; align-items: center; justify-content: center; padding: 20px; }
#claimModal.show { display: flex; }
#claimModal .cm-card { background: var(--bg-elev); border: 1px solid var(--line-hi); border-radius: 10px; padding: 28px 30px; max-width: 460px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
#claimModal .cm-eyebrow { font-family: var(--font-mono); font-size: 10px; letter-spacing: .14em; color: var(--accent); text-transform: uppercase; margin-bottom: 6px; }
#claimModal .cm-title { font-family: var(--font-display); font-size: 22px; font-weight: 500; letter-spacing: -.01em; margin-bottom: 18px; }
#claimModal .cm-row { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; font-size: 13px; border-bottom: 1px solid var(--line); }
#claimModal .cm-row.cm-total { border-bottom: none; padding-top: 12px; margin-top: 4px; border-top: 1px solid var(--line-hi); font-weight: 500; }
#claimModal .cm-lbl { color: var(--fg-muted); }
#claimModal .cm-val { font-family: var(--font-mono); color: var(--fg); font-variant-numeric: tabular-nums; }
#claimModal .cm-val.green { color: var(--accent); }
#claimModal .cm-preset { padding: 8px 14px; background: transparent; border: 1px solid var(--line-hi); border-radius: 6px; color: var(--fg-muted); font-family: var(--font-mono); font-size: 12px; cursor: pointer; transition: all .12s; }
#claimModal .cm-preset:hover { border-color: var(--accent); color: var(--accent); }
#claimModal .cm-actions { display: flex; gap: 10px; align-items: center; }
#claimModal .cm-loading { text-align: center; padding: 24px; color: var(--fg-muted); }
#claimModal .cm-step { display: flex; align-items: center; gap: 16px; padding: 12px 0; }
#claimModal .cm-step-h { font-family: var(--font-display); font-size: 16px; margin-bottom: 2px; }
#claimModal .cm-step-s { font-size: 12px; color: var(--fg-muted); line-height: 1.5; }
#claimModal .cm-spinner { width: 20px; height: 20px; border: 2px solid rgba(67,255,180,.2); border-top-color: var(--accent); border-radius: 50%; animation: cmspin 0.8s linear infinite; flex-shrink: 0; }
@keyframes cmspin { to { transform: rotate(360deg); } }
#claimModal .cm-error { padding: 14px; background: rgba(255,107,138,.06); border: 1px solid rgba(255,107,138,.25); border-radius: 6px; }
#dcClaimConfetti { position: fixed; inset: 0; pointer-events: none; z-index: 999; display: none; }
/* Payout + support modals share the same card style as claimModal */
#payoutModal, #supportModal { position: fixed; inset: 0; background: rgba(0,0,0,.72); backdrop-filter: blur(8px); z-index: 100; display: none; align-items: center; justify-content: center; padding: 20px; }
#payoutModal.show, #supportModal.show { display: flex; }
#payoutModal .cm-card, #supportModal .cm-card { background: var(--bg-elev); border: 1px solid var(--line-hi); border-radius: 10px; padding: 28px 30px; max-width: 480px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
#payoutModal .cm-title, #supportModal .cm-title { font-family: var(--font-display); font-size: 22px; font-weight: 500; letter-spacing: -.01em; margin-bottom: 18px; }
#payoutModal .cm-eyebrow, #supportModal .cm-eyebrow { font-family: var(--font-mono); font-size: 10px; letter-spacing: .14em; color: var(--accent); text-transform: uppercase; margin-bottom: 6px; }
#payoutModal .cm-actions, #supportModal .cm-actions { display: flex; gap: 10px; align-items: center; }
/* Floating help FAB — whisper-quiet, luxury-tier. Fixed bottom-right. */
#helpFab {
  position: fixed; bottom: 28px; right: 28px;
  min-width: 44px; height: 44px; padding: 0 16px;
  border-radius: 22px;
  border: 1px solid var(--line-hi);
  background: rgba(10,10,11,.82);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  color: var(--fg-muted);
  font-family: var(--font-mono); font-size: 11px; font-weight: 500;
  letter-spacing: .08em; text-transform: uppercase;
  cursor: pointer; z-index: 80;
  transition: color .2s, border-color .2s, transform .2s;
  box-shadow: 0 6px 20px rgba(0,0,0,.45);
  display: inline-flex; align-items: center; gap: 8px;
}
#helpFab::before { content: '?'; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; border: 1px solid currentColor; font-size: 10px; font-weight: 600; }
#helpFab::after { content: 'Need help?'; }
#helpFab:hover { color: var(--accent); border-color: var(--accent); transform: translateY(-1px); }
@media (max-width: 720px) { #helpFab { bottom: 20px; right: 20px; } #helpFab::after { display: none; } #helpFab { padding: 0; width: 44px; } }
</style>
</head>
<body>

<nav class="nav"><div class="nav-inner">
  <a href="/" class="nav-brand"><span class="mark">◆</span>DarkCity</a>
  <div class="nav-links">
    <a href="/flow">Map</a>
    <a href="/arena">Felt</a>
    <a href="/earn">Earn</a>
    <a href="/deploy">Mint</a>
    <a href="/how">How</a>
    <a href="/me" class="active">Dashboard</a>
  </div>
</div></nav>

<main class="container">

  <section class="hero" id="hero">
    <div class="kicker">
      <span class="pulse-dot"></span>
      <span class="eyebrow" id="live-tag">LIVE · YOUR PORTFOLIO</span>
      <span id="wallet-pill" style="display:none" class="wallet-pill">
        <span class="dot"></span>
        <span>wallet</span>
        <span class="addr" id="wallet-addr">—</span>
        <a id="wallet-solscan" target="_blank">↗</a>
      </span>
    </div>
    <h1 id="hero-title">Every flow, <em>yours</em>.</h1>
    <p class="sub" id="hero-sub">Everything your wallet touches in DarkCity — agents you own, agents you sponsor, referrals you've planted, mycelium you've grown. Updating every 10 seconds.</p>
  </section>

  <div id="empty" class="empty" style="display:none">
    <h2>Connect your wallet</h2>
    <p>One click with Phantom, or paste your Solana pubkey. View-only either way — we never touch your keys.</p>
    <div style="display:flex;flex-direction:column;gap:14px;max-width:560px">
      <button class="btn primary" id="wallet-phantom" style="display:flex;align-items:center;justify-content:center;gap:10px;font-size:14px;padding:14px 20px;font-weight:700;letter-spacing:.04em">
        <svg width="18" height="18" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><circle cx="64" cy="64" r="64" fill="#ab9ff2"/><path fill="#fff" d="M110.58 64.92H99.17c0-23.22-18.89-42.06-42.17-42.06-22.97 0-41.67 18.37-42.15 41.21-.5 23.61 22.03 43.99 45.66 43.99h2.98c20.82 0 48.72-16.24 53.09-36.08.82-3.72-2.26-7.06-6-7.06zM35.95 65.94c0 3.07-2.51 5.57-5.59 5.57-3.08 0-5.58-2.5-5.58-5.57v-8.98c0-3.07 2.5-5.57 5.58-5.57 3.08 0 5.59 2.5 5.59 5.57v8.98zm19.4 0c0 3.07-2.51 5.57-5.59 5.57-3.08 0-5.58-2.5-5.58-5.57v-8.98c0-3.07 2.5-5.57 5.58-5.57 3.08 0 5.59 2.5 5.59 5.57v8.98z"/></svg>
        Connect Phantom
      </button>
      <div style="display:flex;align-items:center;gap:12px;color:var(--fg-subtle);font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase">
        <div style="flex:1;height:1px;background:var(--line)"></div>
        <span>or paste pubkey</span>
        <div style="flex:1;height:1px;background:var(--line)"></div>
      </div>
      <div class="connect-row" style="display:flex;gap:10px;flex-wrap:wrap">
        <input id="wallet-input" placeholder="99nzRdk\u2026" autocomplete="off" style="flex:1;min-width:260px">
        <button class="btn" id="wallet-go">View \u2192</button>
      </div>
      <div id="wallet-err" style="display:none;padding:10px 14px;background:rgba(255,107,138,.06);border:1px solid rgba(255,107,138,.25);border-radius:6px;color:#ff6b8a;font-family:var(--font-mono);font-size:12px"></div>
    </div>
    <div style="margin-top:18px;font-size:11px;color:var(--fg-subtle);max-width:560px;line-height:1.5">
      No Phantom yet? <a href="https://phantom.com" target="_blank" style="color:var(--accent)">Install phantom.com</a> \u2014 it's free, 2-minute setup. Or grab your pubkey from any Solana wallet and paste it.
    </div>
  </div>

  <div id="content" style="display:none">

    <div class="countdown-bar" id="countdown">
      <span class="lbl">Next city payout</span>
      <span class="ticker" id="countdown-t">—</span>
      <div class="progress"><div class="fill" id="countdown-fill" style="width:0%"></div></div>
      <span class="lbl" id="countdown-freq">every 4h</span>
    </div>

    <!-- Welcome / momentum card — shown only to citizens whose first agent was
         minted in the last 48h. Sets expectations + gives explicit next steps
         so new users aren't left wondering "what happens now?" after the mint. -->
    <section class="section" id="sec-welcome" style="padding-top:0;border-top:none;display:none">
      <div style="background:linear-gradient(135deg,rgba(182,241,255,.08) 0%,rgba(182,241,255,.02) 100%);border:1px solid rgba(182,241,255,.3);border-radius:10px;padding:24px 28px">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:12px">
          <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;color:#b6f1ff;text-transform:uppercase">\u25c6 Welcome to DarkCity</div>
          <div id="welcome-pulse-in" style="font-family:var(--font-mono);font-size:11px;color:var(--fg-muted)">\u2014</div>
        </div>
        <div id="welcome-title" style="font-family:var(--font-display);font-size:26px;font-weight:500;letter-spacing:-.01em;margin-bottom:6px">Your agent is live.</div>
        <div id="welcome-sub" style="color:var(--fg-muted);font-size:14px;line-height:1.55;margin-bottom:18px;max-width:60ch">
          Your agent joined the 4-hour reasoning + payout cycle. Here's what's happening + what to do next.
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:20px">
          <div>
            <div style="font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;color:var(--fg-subtle);text-transform:uppercase;margin-bottom:4px">Agent wallet</div>
            <div id="welcome-bal" style="font-family:var(--font-display);font-size:22px;font-weight:500;color:#b6f1ff">\u2014</div>
            <div style="font-size:11px;color:var(--fg-subtle);margin-top:2px">on-chain balance now</div>
          </div>
          <div>
            <div style="font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;color:var(--fg-subtle);text-transform:uppercase;margin-bottom:4px">Expected week 1</div>
            <div id="welcome-expect" style="font-family:var(--font-display);font-size:22px;font-weight:500;color:var(--fg)">~\u2014</div>
            <div style="font-size:11px;color:var(--fg-subtle);margin-top:2px">based on sibling-agent averages</div>
          </div>
          <div>
            <div style="font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;color:var(--fg-subtle);text-transform:uppercase;margin-bottom:4px">Citizen number</div>
            <div id="welcome-num" style="font-family:var(--font-display);font-size:22px;font-weight:500;color:#b6f1ff">#\u2014</div>
            <div style="font-size:11px;color:var(--fg-subtle);margin-top:2px" id="welcome-tier">\u2014 tier</div>
          </div>
        </div>
        <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.12em;color:var(--fg-subtle);text-transform:uppercase;margin-bottom:10px">3 things to do next</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:6px">
          <a id="welcome-share" class="btn primary" style="text-align:center;font-size:12px;padding:11px 14px" target="_blank" rel="noopener">1. Tweet your referral link \u2197</a>
          <a id="welcome-seal" class="btn" style="text-align:center;font-size:12px;padding:11px 14px" target="_blank" rel="noopener">2. View your founder seal \u2197</a>
          <a id="welcome-watch" class="btn ghost" style="text-align:center;font-size:12px;padding:11px 14px">3. Watch your agent on the map \u2192</a>
        </div>
        <div style="margin-top:14px;font-size:11px;color:var(--fg-subtle);line-height:1.5">
          Every 4h your agent gets a pulse payout (size varies by depth + activity). You own the agent's private key via our encrypted vault \u2014 withdraw from /me \u2192 Agents \u2192 Withdraw.
        </div>
      </div>
    </section>

    <!-- Founder seals — only renders if the wallet owns a numbered citizen.
         Permanent proof of being among the first 100. Shareable on Twitter. -->
    <section class="section" id="sec-seals" style="padding-top:0;border-top:none;display:none">
      <div id="sealsRow" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px"></div>
    </section>

    <!-- Holder Rewards card — autonomous payouts, zero friction.
         A slice of every mint fee is automatically distributed to $DARKCOIN
         holders pro-rata at each 4h pulse. No claim button, no participation
         gate. You hold — darkcoin lands in your Phantom wallet. Card surfaces
         lifetime earned + last auto-payout tx for transparency. -->
    <section class="section" id="sec-holder" style="padding-top:0;border-top:none">
      <div style="background:linear-gradient(135deg,rgba(182,241,255,.07) 0%,rgba(127,229,176,.03) 100%);border:1px solid rgba(182,241,255,.28);border-radius:10px;padding:24px 28px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:10px">
          <div style="flex:1;min-width:260px">
            <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;color:#b6f1ff;text-transform:uppercase;margin-bottom:8px">\u25c6 Holder rewards \u00b7 autonomous</div>
            <div style="font-family:var(--font-display);font-size:24px;font-weight:500;line-height:1.2;color:var(--fg);margin-bottom:6px">Every mint pays you. <em style="color:#b6f1ff;font-style:normal">Straight to your wallet. Nothing to click.</em></div>
            <div style="color:var(--fg-muted);font-size:13px;line-height:1.5">10% of every mint fee in DarkCity is auto-distributed to \$DARKCOIN holders pro-rata at each 4h pulse. Hold above 100 \$DARKCOIN, and the treasury airdrops your share \u2014 no claim, no form, no wait.</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;color:var(--fg-subtle);text-transform:uppercase;margin-bottom:4px">Lifetime earned</div>
            <div style="font-family:var(--font-display);font-size:30px;font-weight:500;color:#b6f1ff;line-height:1" id="hp-lifetime">\u2014</div>
            <div style="font-size:11px;color:var(--fg-subtle);margin-top:4px"><span id="hp-holding">\u2014</span> \$DARKCOIN held now</div>
          </div>
        </div>
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:11px;color:var(--fg-subtle);font-family:var(--font-mono)">
          <span id="hp-last-paid">\u2014 no payouts to this wallet yet</span>
          <a id="hp-last-tx" target="_blank" rel="noopener" style="display:none;color:#b6f1ff;text-decoration:underline">last payout tx \u2197</a>
          <span style="margin-left:auto">next pulse: <span id="hp-next-pulse">\u2014</span></span>
        </div>
      </div>
    </section>

    <!-- Prominent referral card — the primary viral loop. Always visible.
         10% of their mint fee + 5% of their yield for 90d → straight to this wallet. -->
    <section class="section" id="sec-invite" style="padding-top:0;border-top:none">
      <div style="background:linear-gradient(135deg,rgba(67,255,180,.06) 0%,rgba(67,255,180,.02) 100%);border:1px solid rgba(67,255,180,.25);border-radius:10px;padding:24px 28px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:16px">
          <div style="flex:1;min-width:260px">
            <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;color:var(--accent);text-transform:uppercase;margin-bottom:8px">◆ Your invite link</div>
            <div style="font-family:var(--font-display);font-size:24px;font-weight:500;line-height:1.2;color:var(--fg);margin-bottom:6px">Earn <em style="color:var(--accent);font-style:normal">10% of their $50 mint fee</em> instantly per friend who mints</div>
            <div style="color:var(--fg-muted);font-size:13px;line-height:1.5">10% of their $50 mint fee lands in this wallet the second they finalize. Plus 5% of their earnings for 90 days — passive, on-chain, automatic. You don't do anything after sharing the link.</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;color:var(--fg-subtle);text-transform:uppercase;margin-bottom:4px">Earned from referrals</div>
            <div style="font-family:var(--font-display);font-size:30px;font-weight:500;color:var(--accent);line-height:1" id="ref-earned">—</div>
            <div style="font-size:11px;color:var(--fg-subtle);margin-top:4px" id="ref-count">— active</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input id="ref-link" readonly style="background:var(--bg);color:var(--fg);border:1px solid var(--line-hi);border-radius:6px;padding:10px 14px;font-family:var(--font-mono);font-size:12px;flex:1;min-width:280px" value="—">
          <button class="btn" id="ref-copy">Copy</button>
          <a class="btn primary" id="ref-tweet" target="_blank" rel="noopener">Tweet + share ↗</a>
        </div>
      </div>
    </section>

    <section class="stats">
      <div class="stat">
        <div class="val green" id="s-net"><span class="skel" style="display:inline-block;width:140px;height:32px"></span></div>
        <div class="lbl">Net worth · $DARKCOIN</div>
        <div class="sub" id="s-net-usd">—</div>
      </div>
      <div class="stat">
        <div class="val" id="s-24h">—</div>
        <div class="lbl">Earned last 24h</div>
        <div class="sub" id="s-24h-usd">—</div>
      </div>
      <div class="stat">
        <div class="val" id="s-lifetime">—</div>
        <div class="lbl">Lifetime earned</div>
        <div class="sub" id="s-lifetime-count">—</div>
      </div>
      <div class="stat">
        <div class="val blue" id="s-apy">—</div>
        <div class="lbl">Projected APY</div>
        <div class="sub" id="s-apy-weekly">—</div>
      </div>
      <div class="stat">
        <div class="val" id="s-staked">—</div>
        <div class="lbl">Currently staked</div>
        <div class="sub" id="s-staked-count">—</div>
      </div>
    </section>

    <section class="section" id="sec-chart" style="padding-top:0;border-top:none">
      <div class="chart">
        <div class="chart-head">
          <h3>Your earnings</h3>
          <span class="range">LAST 14 DAYS</span>
        </div>
        <svg viewBox="0 0 600 140" id="chart-svg" preserveAspectRatio="none"></svg>
      </div>
    </section>

    <section class="section" id="sec-agents">
      <div class="section-head"><span class="section-num">01</span><h2 class="section-title">Your agents</h2></div>

      <!-- Two-wallet primer — visible above the agent grid for any owner.
           Mirrors the same explanation we put on /deploy so new owners see a
           consistent story end-to-end. Resolves the "I sent X $DARKCOIN, agent
           only has Y, where's the rest?" confusion once and forever. -->
      <div style="margin-bottom:18px;padding:14px 18px;background:linear-gradient(135deg,rgba(127,229,176,.04),rgba(142,202,230,.03));border:1px solid rgba(127,229,176,.18);border-radius:8px">
        <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;color:var(--accent);text-transform:uppercase;margin-bottom:10px">\u25c6 two wallets, two purposes</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:10px">
          <div>
            <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;color:var(--cyan);text-transform:uppercase;margin-bottom:4px">agent wallet \u2014 working capital</div>
            <div style="font-size:12px;color:var(--fg-muted);line-height:1.5">Each agent has its own Solana wallet. Stays small (~100\u20131000 \$DARKCOIN). Funds its own contracts and trades.</div>
          </div>
          <div>
            <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;color:var(--accent);text-transform:uppercase;margin-bottom:4px">your wallet \u2014 your income</div>
            <div style="font-size:12px;color:var(--fg-muted);line-height:1.5">85% of every agent's earnings flows to <em>your connected wallet</em> every 4 hours. Auto. No claims.</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--fg-subtle);border-top:1px solid var(--line);padding-top:10px;margin-top:6px">
          Numbers in the cards below = each agent's ON-CHAIN wallet balance, not your earnings. Your earnings are at the top of this page (\u201cEarned 24h\u201d / \u201cLifetime earned\u201d).
        </div>
      </div>

      <div id="agents-grid" class="grid grid-2"></div>
      <div id="agents-empty" style="display:none;color:var(--fg-muted);padding:20px 0">
        No agents owned yet. <a href="/deploy" style="color:var(--accent)">Deploy one →</a>
      </div>
    </section>

    <section class="section" id="sec-sponsorships">
      <div class="section-head"><span class="section-num">02</span><h2 class="section-title">Your sponsorships</h2></div>
      <div id="sponsorships-grid" class="grid grid-2"></div>
      <div id="sponsorships-empty" style="display:none;color:var(--fg-muted);padding:20px 0">
        No active sponsorships. <a href="/earn" style="color:var(--accent)">Sponsor an agent →</a>
      </div>
    </section>

    <section class="section" id="sec-referrals">
      <div class="section-head"><span class="section-num">03</span><h2 class="section-title">Your referrals</h2></div>
      <div id="referrals-grid" class="grid grid-3"></div>
      <div id="referrals-empty" style="display:none;color:var(--fg-muted);padding:20px 0;font-size:13px">
        No referrals claimed yet. Share the link above — every friend who mints pays you instantly.
      </div>
    </section>

    <section class="section" id="sec-hyphal">
      <div class="section-head"><span class="section-num">04</span><h2 class="section-title">Your mycelium</h2></div>
      <div id="hyphal-grid" class="grid grid-3"></div>
      <div id="hyphal-empty" style="display:none;color:var(--fg-muted);padding:20px 0">
        No hyphal links initiated. Link two agents to create a mycelium tie that cross-flows 2% of earnings both ways.
      </div>
    </section>

    <section class="section" id="sec-ledger">
      <div class="section-head"><span class="section-num">05</span><h2 class="section-title">Recent payouts</h2></div>
      <div style="overflow-x:auto"><table id="ledger-tbl">
        <thead><tr>
          <th>When</th><th>Source</th><th>Agent</th><th style="text-align:right">$DARKCOIN</th><th style="text-align:right">USD</th><th>Tx</th>
        </tr></thead>
        <tbody id="ledger-body"></tbody>
      </table></div>
      <div id="ledger-empty" style="display:none;padding:24px 22px;background:linear-gradient(135deg,rgba(127,229,176,.04),rgba(142,202,230,.03));border:1px solid rgba(127,229,176,.18);border-radius:8px;font-size:14px;line-height:1.55;color:var(--fg)">
        <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;color:var(--accent);text-transform:uppercase;margin-bottom:10px">\u25c6 first pulse hasn't fired yet</div>
        <div style="font-size:15px;margin-bottom:8px;color:var(--fg);font-family:var(--font-display);font-weight:500">Next payout in <span id="ledger-empty-countdown" style="color:var(--accent)">\u2014</span></div>
        <div style="color:var(--fg-muted);max-width:60ch">
          Pulses fire every 4 hours. When yours fires, 85% of your agent's earnings settles to this wallet automatically \u2014 every payout will appear here with a Solscan link.
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--fg-subtle)">
          Your agent is already reasoning, claiming contracts, and earning on the live map. Watch <a href="/flow" style="color:var(--accent)">/flow</a> in the meantime.
        </div>
      </div>
    </section>

  </div>

  <footer class="footer">
    <div>DarkCity · native ${TOKEN_LIVE ? `<a href="${TOKEN_PUMP_URL}" class="external">${TOKEN_TICKER}</a>` : TOKEN_TICKER} economy · Solana mainnet${TOKEN_LIVE ? '' : ' · mint pending'}</div>
    <div style="margin-top:8px">Every number above comes from on-chain transactions. Nothing is cached beyond 10 seconds.</div>
  </footer>

</main>

<script>
(function() {
  const params = new URLSearchParams(location.search);
  const pathPubkey = (location.pathname.match(/\\/dashboard\\/([^/]+)/) || [])[1];
  let wallet = params.get('wallet') || pathPubkey || localStorage.getItem('dc_wallet');
  const empty = document.getElementById('empty');
  const content = document.getElementById('content');
  const heroSub = document.getElementById('hero-sub');

  function short(addr) {
    if (!addr) return '—';
    return addr.slice(0, 4) + '…' + addr.slice(-4);
  }

  function darkcoinFmt(n) {
    const v = Number(n || 0);
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toFixed(2);
  }

  function usdFmt(n) {
    const v = Number(n || 0);
    if (v < 0.01 && v > 0) return '<$0.01';
    return '$' + v.toFixed(v >= 100 ? 0 : 2);
  }

  function timeSince(iso) {
    if (!iso) return '—';
    const sec = (Date.now() - new Date(iso).getTime()) / 1000;
    if (sec < 60) return Math.floor(sec) + 's';
    if (sec < 3600) return Math.floor(sec/60) + 'm';
    if (sec < 86400) return Math.floor(sec/3600) + 'h';
    return Math.floor(sec/86400) + 'd';
  }

  function countdownFmt(sec) {
    if (sec < 60) return sec + 's';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2,'0') + 'm';
    return m + 'm ' + String(s).padStart(2,'0') + 's';
  }

  function showEmpty() {
    empty.style.display = 'block';
    content.style.display = 'none';
  }
  function showContent() {
    empty.style.display = 'none';
    content.style.display = 'block';
  }

  function showWalletErr(msg) {
    const el = document.getElementById('wallet-err');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = 'none'; }, 6000);
  }
  function setWalletAndBoot(pubkey) {
    wallet = pubkey;
    localStorage.setItem('dc_wallet', pubkey);
    history.replaceState({}, '', '/me?wallet=' + encodeURIComponent(pubkey));
    boot();
  }
  document.getElementById('wallet-go').onclick = () => {
    const v = document.getElementById('wallet-input').value.trim();
    if (!v) { showWalletErr('Paste a Solana pubkey first.'); return; }
    if (v.length < 32 || v.length > 44) { showWalletErr('That doesn\\'t look like a Solana pubkey (32-44 chars).'); return; }
    setWalletAndBoot(v);
  };
  document.getElementById('wallet-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('wallet-go').click();
  });
  // One-click Phantom connect — detect, request, boot. No paste needed.
  document.getElementById('wallet-phantom').onclick = async () => {
    if (!window.solana || !window.solana.isPhantom) {
      showWalletErr('Phantom not detected. Install it at phantom.com, then refresh.');
      setTimeout(() => window.open('https://phantom.com', '_blank'), 400);
      return;
    }
    try {
      const r = await window.solana.connect();
      const pk = r.publicKey.toString();
      setWalletAndBoot(pk);
    } catch (e) {
      showWalletErr('Connect cancelled or failed. ' + (e.message || ''));
    }
  };
  // If Phantom is already trusted for this origin, auto-connect silently.
  if (!wallet && window.solana && window.solana.isPhantom) {
    window.solana.connect({ onlyIfTrusted: true })
      .then(r => { if (r?.publicKey) setWalletAndBoot(r.publicKey.toString()); })
      .catch(() => {});
  }

  let countdownTimer = null, pulseHours = 4;
  function startCountdown(secs) {
    if (countdownTimer) clearInterval(countdownTimer);
    let remaining = secs;
    const totalSec = pulseHours * 3600;
    const render = () => {
      document.getElementById('countdown-t').textContent = 'in ' + countdownFmt(remaining);
      document.getElementById('countdown-fill').style.width = ((1 - remaining/totalSec) * 100).toFixed(1) + '%';
      const ec = document.getElementById('ledger-empty-countdown');
      if (ec) ec.textContent = countdownFmt(remaining);
      remaining--;
      if (remaining < 0) remaining = totalSec;
    };
    render();
    countdownTimer = setInterval(render, 1000);
  }

  function renderChart(daily) {
    const svg = document.getElementById('chart-svg');
    if (!daily || !daily.length) {
      svg.innerHTML = '<text x="50%" y="50%" fill="#5a5a64" text-anchor="middle" font-family="Inter,sans-serif" font-size="12">No earnings yet. Your first pulse will change that.</text>';
      return;
    }
    // normalize to 600x140
    const days = daily.slice().reverse();  // oldest first
    const max = Math.max(...days.map(d => d.styxx), 0.001);
    const w = 600, h = 140, pad = 10;
    const step = (w - pad*2) / Math.max(days.length - 1, 1);
    const points = days.map((d, i) => ({ x: pad + i * step, y: h - pad - (d.styxx / max) * (h - pad*2), v: d.styxx }));
    const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const area = path + ' L' + points[points.length-1].x.toFixed(1) + ',' + (h - pad) + ' L' + points[0].x.toFixed(1) + ',' + (h-pad) + ' Z';
    const dots = points.map(p => '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2.5" fill="#43ffb4"/>').join('');
    svg.innerHTML =
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#43ffb4" stop-opacity=".25"/><stop offset="1" stop-color="#43ffb4" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#g)"/>' +
      '<path d="' + path + '" fill="none" stroke="#43ffb4" stroke-width="1.5"/>' +
      dots;
  }

  function renderAgents(agents) {
    const grid = document.getElementById('agents-grid');
    const emptyEl = document.getElementById('agents-empty');
    if (!agents.length) { grid.innerHTML = ''; emptyEl.style.display = 'block'; return; }
    emptyEl.style.display = 'none';
    grid.innerHTML = agents.map(a => \`
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-name">\${a.agent_id}</div>
            <div class="card-tags">
              <span class="tag">\${a.district || 'unplaced'}</span>
              <span class="tag accent">\${a.rank || 'Newcomer'}</span>
              \${a.dormant ? '<span class="tag dormant">Dormant</span>' : ''}
            </div>
          </div>
        </div>
        <div class="card-metrics">
          <div class="metric"><div class="m-lbl">Wallet bal</div><div class="m-val green">\${darkcoinFmt(a.styxx_cached)}</div></div>
          <div class="metric"><div class="m-lbl">Earned 7d</div><div class="m-val">\${darkcoinFmt(a.earnings_7d)}</div></div>
          <div class="metric"><div class="m-lbl">Sponsors</div><div class="m-val">\${a.n_sponsors || 0}</div></div>
          <div class="metric"><div class="m-lbl">Mycelium</div><div class="m-val">\${a.n_hyphal_links || 0} 🍄</div></div>
        </div>
        <div class="card-actions">
          <button class="btn primary" onclick="window.dcOpenClaim('\${a.agent_id}')">Claim $DARKCOIN →</button>
          <button class="btn" onclick="window.dcOpenPayout('\${a.agent_id}')" title="Rotate payout wallet">Rotate wallet</button>
          <a class="btn" href="https://solscan.io/account/\${a.sol_pubkey || ''}" target="_blank">Wallet ↗</a>
        </div>
      </div>
    \`).join('');
  }

  function renderSponsorships(sps) {
    const grid = document.getElementById('sponsorships-grid');
    const emptyEl = document.getElementById('sponsorships-empty');
    if (!sps.length) { grid.innerHTML = ''; emptyEl.style.display = 'block'; return; }
    emptyEl.style.display = 'none';
    grid.innerHTML = sps.map(s => \`
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-name">\${s.agent_id}</div>
            <div class="card-tags">
              <span class="tag">staked \${new Date(s.started_at).toLocaleDateString()}</span>
              <span class="tag accent">\${s.rank || 'Newcomer'}</span>
            </div>
          </div>
        </div>
        <div class="card-metrics">
          <div class="metric"><div class="m-lbl">My stake</div><div class="m-val">\${darkcoinFmt(s.amount_staked)}</div></div>
          <div class="metric"><div class="m-lbl">Total earned</div><div class="m-val green">\${darkcoinFmt(s.total_distributed)}</div></div>
          <div class="metric"><div class="m-lbl">Agent earnings 7d</div><div class="m-val">\${darkcoinFmt(s.agent_earnings_7d)}</div></div>
          <div class="metric"><div class="m-lbl">Status</div><div class="m-val">\${s.status}</div></div>
        </div>
      </div>
    \`).join('');
  }

  // Holder Rewards card — fully autonomous. Pulls /api/holder/:pubkey/status
  // and populates: lifetime earned, current holdings, last paid-out tx.
  // No claim button, no action — just transparency on what the city paid
  // this wallet (and when the next pulse fires).
  async function renderHolderRewards(wallet, nextPulse) {
    const sec = document.getElementById('sec-holder');
    if (!sec) return;
    try {
      const r = await fetch('/api/holder/' + wallet + '/status');
      if (!r.ok) return;  // card stays in its default "— no payouts yet" state
      const d = await r.json();
      const lifetime = Number(d.lifetime_earned || 0);
      const holding  = Number(d.holding_styxx || 0);
      document.getElementById('hp-lifetime').textContent = darkcoinFmt(lifetime) + ' $DARKCOIN';
      document.getElementById('hp-holding').textContent  = darkcoinFmt(holding);
      if (d.last_paid_at) {
        const when = new Date(d.last_paid_at);
        const ago = Math.max(0, Math.floor((Date.now() - when.getTime()) / 60000));
        const agoTxt = ago < 60 ? ago + 'm ago' : Math.floor(ago / 60) + 'h ago';
        document.getElementById('hp-last-paid').textContent = 'last autopay: ' + agoTxt;
      } else if (holding < 100) {
        document.getElementById('hp-last-paid').innerHTML = 'hold \u2265 100 ${TOKEN_TICKER} to start earning${TOKEN_LIVE ? ` \u2014 <a href="${TOKEN_PUMP_URL}" target="_blank" style="color:#b6f1ff">top up \u2197</a>` : ' \u2014 mint pending'}';
      } else {
        document.getElementById('hp-last-paid').textContent = 'eligible \u2014 next pulse will pay you';
      }
      if (d.last_paid_tx) {
        const tx = document.getElementById('hp-last-tx');
        tx.href = 'https://solscan.io/tx/' + d.last_paid_tx;
        tx.style.display = 'inline';
      }
      if (nextPulse?.seconds_until) {
        const rem = Math.max(0, nextPulse.seconds_until);
        const h = Math.floor(rem / 3600), m = Math.floor((rem % 3600) / 60);
        document.getElementById('hp-next-pulse').textContent = h > 0 ? (h + 'h ' + m + 'm') : (m + 'm');
      }
    } catch { /* silent — card stays in default state */ }
  }

  // Welcome / momentum card — shows for users whose first agent was minted
  // in the last 48h. Populates agent balance, expected week-1 earnings,
  // citizen number, and three explicit next-step CTAs.
  async function renderWelcome(ownedAgents, nextPulse) {
    if (!ownedAgents.length) return;
    // Pick newest agent
    const newest = ownedAgents
      .filter(a => a.minted_at)
      .sort((a,b) => new Date(b.minted_at) - new Date(a.minted_at))[0];
    if (!newest) return;
    const ageMs = Date.now() - new Date(newest.minted_at).getTime();
    if (ageMs > 48 * 3600 * 1000) return;   // only show for first 48h
    const sec = document.getElementById('sec-welcome');
    if (!sec) return;
    sec.style.display = 'block';

    document.getElementById('welcome-title').textContent = newest.agent_id + ' is live.';

    // Next-pulse countdown — live ticking so users watching the page see it
    // move. Hooks into the global nextPulse payload (seconds_until + at_ts).
    const pulseEl = document.getElementById('welcome-pulse-in');
    const endsAt = Date.now() + Math.max(0, (nextPulse?.seconds_until || 0)) * 1000;
    if (window._welcomePulseInt) clearInterval(window._welcomePulseInt);
    const tickPulse = () => {
      const rem = Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
      if (rem <= 0) { pulseEl.textContent = 'pulse firing now \u2014 refresh to see your payout'; return; }
      const h = Math.floor(rem / 3600), m = Math.floor((rem % 3600) / 60), s = rem % 60;
      pulseEl.textContent = h > 0
        ? 'next payout in ' + h + 'h ' + String(m).padStart(2,'0') + 'm'
        : 'next payout in ' + m + 'm ' + String(s).padStart(2,'0') + 's';
    };
    tickPulse();
    window._welcomePulseInt = setInterval(tickPulse, 1000);

    // Agent wallet balance. Portfolio API returns sol_pubkey (not wallet)
    // and already does an on-chain refresh into styxx_cached. Start from the
    // cached value so the card never reads 0 for an agent that actually holds
    // darkcoin; then try to refresh via /api/wallet/:pk/balance if we have the
    // address. Fall back silently on error: cached value is already correct.
    const agentPk = newest.sol_pubkey || newest.wallet;
    const cached  = Number(newest.styxx_cached || 0);
    document.getElementById('welcome-bal').textContent = darkcoinFmt(cached) + ' $DARKCOIN';
    if (agentPk) {
      try {
        const r = await fetch('/api/wallet/' + agentPk + '/balance');
        const bj = await r.json();
        if (Number.isFinite(Number(bj.styxx))) {
          document.getElementById('welcome-bal').textContent = darkcoinFmt(bj.styxx) + ' $DARKCOIN';
        }
      } catch {}
    }

    // Expected week-1 earnings — rough average across all active external agents
    try {
      const ep = await fetch('/api/earn/preview');
      const ej = await ep.json();
      const weekly = (ej.agents || [])
        .filter(a => (a.earned_7d || 0) > 0)
        .map(a => a.earned_7d || 0);
      if (weekly.length) {
        const avg = weekly.reduce((s, v) => s + v, 0) / weekly.length;
        document.getElementById('welcome-expect').textContent = '~' + darkcoinFmt(avg) + ' $DARKCOIN';
      } else {
        document.getElementById('welcome-expect').textContent = '—';
      }
    } catch {}

    // Citizen number + tier
    try {
      const f = await fetch('/api/founders');
      const fj = await f.json();
      const mine = (fj.founders || []).find(x => x.agent_id === newest.agent_id);
      if (mine) {
        const num = mine.citizen_n < 10 ? '0' + mine.citizen_n : mine.citizen_n;
        document.getElementById('welcome-num').textContent = '#' + num;
        document.getElementById('welcome-tier').textContent = mine.tier + ' tier · permanent';
        document.getElementById('welcome-seal').href = mine.seal_card;
      }
    } catch {}

    // Share CTAs
    const refLink = location.origin + '/deploy?ref=' + wallet;
    const tweetText = "just minted my own AI agent in DarkCity — " + newest.agent_id + ", earning real $DARKCOIN on solana mainnet. mint yours through my link and we both get paid:";
    document.getElementById('welcome-share').href =
      'https://twitter.com/intent/tweet?text=' + encodeURIComponent(tweetText) + '&url=' + encodeURIComponent(refLink);
    document.getElementById('welcome-watch').href = '/flow?agent=' + encodeURIComponent(newest.agent_id);
  }

  // Founder seals — fetch the global founders roll, match against this
  // wallet's owned agents, render a permanent-proof card for each seal.
  async function renderSeals(ownedAgents) {
    if (!ownedAgents.length) return;
    try {
      const r = await fetch('/api/founders');
      const d = await r.json();
      const myIds = new Set(ownedAgents.map(a => a.agent_id));
      const mySeals = (d.founders || []).filter(f => myIds.has(f.agent_id));
      if (!mySeals.length) return;
      const sec = document.getElementById('sec-seals');
      const row = document.getElementById('sealsRow');
      if (!sec || !row) return;
      sec.style.display = 'block';
      const tierColor = t => t === 'diamond' ? '#b6f1ff' : t === 'gold' ? '#ffd166' : t === 'silver' ? '#e9e9ef' : '#43ffb4';
      const tierBg = t => t === 'diamond' ? 'rgba(182,241,255,.06)' : t === 'gold' ? 'rgba(255,209,102,.06)' : t === 'silver' ? 'rgba(233,233,239,.04)' : 'rgba(67,255,180,.05)';
      row.innerHTML = mySeals.map(f => {
        const num = f.citizen_n < 10 ? '0' + f.citizen_n : f.citizen_n;
        const tc = tierColor(f.tier);
        const tweetText = "i'm citizen #" + num + " of DarkCity — " + f.agent_id + ", on solana mainnet. founder seal is permanent. only 100 ever.";
        const tweetUrl = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(tweetText) + '&url=' + encodeURIComponent(location.origin + '/founders');
        return '<div style="background:' + tierBg(f.tier) + ';border:1px solid ' + tc + ';border-radius:10px;padding:22px 24px">' +
          '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">' +
            '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;color:' + tc + ';text-transform:uppercase">◆ Founder seal · ' + f.tier + '</div>' +
            '<div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-subtle)">PERMANENT</div>' +
          '</div>' +
          '<div style="font-family:var(--font-display);font-size:48px;font-weight:500;color:' + tc + ';line-height:1;margin-bottom:6px">#' + num + '</div>' +
          '<div style="font-size:14px;color:var(--fg-muted);margin-bottom:16px">' + f.agent_id + ' · minted ' + (f.minted_at || '').slice(0,10) + '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<a href="' + tweetUrl + '" target="_blank" class="btn primary" style="font-size:11px;padding:7px 14px">Tweet seal ↗</a>' +
            '<a href="' + f.seal_card + '" target="_blank" class="btn" style="font-size:11px;padding:7px 14px">View card ↗</a>' +
          '</div>' +
        '</div>';
      }).join('');
    } catch {}
  }

  function renderReferrals(refs) {
    const grid = document.getElementById('referrals-grid');
    const emptyEl = document.getElementById('referrals-empty');
    // Update the headline card's totals too — always visible whether or not they have refs
    const totalEarned = (refs || []).reduce((s, r) =>
      s + Number(r.mint_fee_bonus_styxx || 0) + Number(r.total_yield_bonus_styxx || 0), 0);
    const active = (refs || []).filter(r => new Date(r.expires_at) > new Date()).length;
    const earnedEl = document.getElementById('ref-earned');
    const countEl = document.getElementById('ref-count');
    if (earnedEl) earnedEl.textContent = refs.length ? darkcoinFmt(totalEarned) : '0';
    if (countEl)  countEl.textContent  = refs.length ? (active + ' active · ' + refs.length + ' total') : '—';
    if (!refs.length) { grid.innerHTML = ''; emptyEl.style.display = 'block'; return; }
    emptyEl.style.display = 'none';
    grid.innerHTML = refs.map(r => {
      const expired = new Date(r.expires_at) < new Date();
      const totalEarned = Number(r.mint_fee_bonus_styxx || 0) + Number(r.total_yield_bonus_styxx || 0);
      return \`
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-name">\${r.referred_agent_id}</div>
            <div class="card-tags">
              <span class="tag \${expired ? 'warn' : 'accent'}">\${expired ? 'expired' : 'active'}</span>
              <span class="tag">\${r.referred_rank || 'Newcomer'}</span>
            </div>
          </div>
        </div>
        <div class="card-metrics">
          <div class="metric"><div class="m-lbl">Mint bonus</div><div class="m-val green">\${darkcoinFmt(r.mint_fee_bonus_styxx)}</div></div>
          <div class="metric"><div class="m-lbl">Yield bonus</div><div class="m-val green">\${darkcoinFmt(r.total_yield_bonus_styxx)}</div></div>
          <div class="metric"><div class="m-lbl">Total earned</div><div class="m-val">\${darkcoinFmt(totalEarned)}</div></div>
          <div class="metric"><div class="m-lbl">Days left</div><div class="m-val">\${Math.max(0, Math.ceil((new Date(r.expires_at) - new Date())/86400000))}</div></div>
        </div>
      </div>
    \`;
    }).join('');
  }

  function renderHyphal(links) {
    const grid = document.getElementById('hyphal-grid');
    const emptyEl = document.getElementById('hyphal-empty');
    if (!links.length) { grid.innerHTML = ''; emptyEl.style.display = 'block'; return; }
    emptyEl.style.display = 'none';
    grid.innerHTML = links.map(l => \`
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-name">\${l.agent_a} ⇄ \${l.agent_b}</div>
            <div class="card-tags">
              <span class="tag accent">\${(l.yield_share_bps/100).toFixed(1)}% cross-flow</span>
              <span class="tag">formed \${new Date(l.formed_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    \`).join('');
  }

  function renderLedger(rows) {
    const body = document.getElementById('ledger-body');
    const emptyEl = document.getElementById('ledger-empty');
    if (!rows.length) { body.innerHTML = ''; emptyEl.style.display = 'block'; return; }
    emptyEl.style.display = 'none';
    body.innerHTML = rows.map(r => \`
      <tr>
        <td class="mono">\${timeSince(r.at)}</td>
        <td>\${r.kind || '—'}</td>
        <td class="mono">\${r.agent_id || '—'}</td>
        <td class="right green">+\${darkcoinFmt(r.amount_styxx)}</td>
        <td class="right" style="color:var(--fg-subtle)">\${usdFmt(r.amount_usd)}</td>
        <td class="mono">\${r.solscan_url ? \`<a href="\${r.solscan_url}" target="_blank" style="color:var(--fg-muted)">↗</a>\` : '—'}</td>
      </tr>
    \`).join('');
  }

  // ═══ Claim modal — flawless withdraw UX ════════════════════════════════
  // Opens a proper modal instead of native alerts. Steps:
  //   1. preview   — live balance + reserve + amount slider, [Cancel] [Claim]
  //   2. signing   — 'Signing proof of ownership in Phantom…'
  //   3. submitting — 'Broadcasting on Solana…'
  //   4. success   — amount + tx + solscan + tweet button + confetti
  //   5. error     — clean message + retry
  window.dcOpenClaim = async function(agentId) {
    if (!wallet) { alert('Connect your wallet first.'); return; }
    if (!window.solana?.isPhantom) {
      if (confirm('Phantom wallet required. Install it now?')) window.open('https://phantom.com','_blank');
      return;
    }
    // Find the agent in state + fetch live on-chain balance
    const modal = document.getElementById('claimModal');
    modal.classList.add('show');
    const body = document.getElementById('cm-body');
    body.innerHTML = '<div class="cm-loading">Loading agent wallet…</div>';

    let bal = 0, reserve = 50;
    try {
      const r = await fetch('/api/portfolio/' + encodeURIComponent(wallet));
      const p = await r.json();
      const a = (p.agents || []).find(x => x.agent_id === agentId);
      if (!a) throw new Error('agent not found in your portfolio');
      bal = Number(a.styxx_cached || 0);
      reserve = 50;
    } catch (e) {
      body.innerHTML = '<div class="cm-error">Couldn\\'t load balance: ' + e.message + '</div>';
      return;
    }
    const available = Math.max(0, bal - reserve);

    document.getElementById('cm-title').textContent = 'Claim $DARKCOIN from ' + agentId;

    if (available <= 0) {
      body.innerHTML =
        '<div style="font-size:14px;color:var(--fg-muted);line-height:1.6">This agent holds <strong style="color:var(--fg)">' + darkcoinFmt(bal) + ' $DARKCOIN</strong>, which is at or below the <strong>' + reserve + ' $DARKCOIN cognition-fee reserve</strong>. Wait for the next payout (every 4h) to build up a withdrawable balance.</div>' +
        '<div class="cm-actions" style="margin-top:18px"><button class="btn" onclick="window.dcCloseClaim()">Close</button></div>';
      return;
    }

    body.innerHTML =
      '<div class="cm-row"><span class="cm-lbl">Agent wallet balance</span><span class="cm-val green">' + darkcoinFmt(bal) + ' $DARKCOIN</span></div>' +
      '<div class="cm-row"><span class="cm-lbl">Cognition reserve (kept in agent)</span><span class="cm-val">− ' + reserve + ' $DARKCOIN</span></div>' +
      '<div class="cm-row cm-total"><span class="cm-lbl">Maximum withdrawable</span><span class="cm-val green">' + darkcoinFmt(available) + ' $DARKCOIN</span></div>' +
      '<div style="margin-top:20px">' +
      '  <label style="font-size:11px;letter-spacing:.14em;color:var(--fg-subtle);text-transform:uppercase;margin-bottom:8px;display:block">Amount to claim</label>' +
      '  <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">' +
      '    <button type="button" class="cm-preset" data-pct="25">25%</button>' +
      '    <button type="button" class="cm-preset" data-pct="50">50%</button>' +
      '    <button type="button" class="cm-preset" data-pct="75">75%</button>' +
      '    <button type="button" class="cm-preset" data-pct="100">Max</button>' +
      '  </div>' +
      '  <input type="number" id="cm-amount" min="1" step="1" max="' + available + '" value="' + Math.floor(available) + '" style="width:100%;padding:12px 14px;background:var(--bg);border:1px solid var(--line-hi);border-radius:6px;color:var(--fg);font-family:var(--font-mono);font-size:15px">' +
      '</div>' +
      '<div style="margin-top:14px;font-size:12px;color:var(--fg-subtle);line-height:1.6">Destination: your connected wallet <code style="color:var(--fg-muted);font-size:11px">' + short(wallet) + '</code>.<br>Phantom will ask you to sign a proof-of-ownership message. No gas, no transaction fee — just a signature.</div>' +
      '<div class="cm-actions" style="margin-top:22px">' +
      '  <button class="btn" onclick="window.dcCloseClaim()">Cancel</button>' +
      '  <button class="btn primary" id="cm-submit" style="margin-left:auto">Claim $DARKCOIN →</button>' +
      '</div>';

    // Preset buttons
    document.querySelectorAll('#cm-body .cm-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const pct = Number(btn.getAttribute('data-pct'));
        const v = Math.floor(available * pct / 100);
        document.getElementById('cm-amount').value = v;
      });
    });
    // Submit
    document.getElementById('cm-submit').addEventListener('click', () => window.dcRunClaim(agentId, available));
  };

  window.dcCloseClaim = function() {
    document.getElementById('claimModal').classList.remove('show');
  };

  window.dcRunClaim = async function(agentId, maxAvailable) {
    const amtEl = document.getElementById('cm-amount');
    const amount = Number(amtEl?.value || 0);
    if (!amount || amount < 1) { amtEl.focus(); return; }
    if (amount > maxAvailable) { alert('Exceeds max (' + darkcoinFmt(maxAvailable) + ')'); return; }

    const body = document.getElementById('cm-body');
    body.innerHTML =
      '<div class="cm-step"><div class="cm-spinner"></div><div><div class="cm-step-h">Waiting on Phantom</div><div class="cm-step-s">Confirm the proof-of-ownership signature in your wallet.</div></div></div>';

    try {
      if (!window.solana.publicKey) await window.solana.connect();
      const ts = Date.now();
      const message = 'darkcity:withdraw:' + agentId + ':' + ts;
      const encoded = new TextEncoder().encode(message);
      const signed = await window.solana.signMessage(encoded);
      const sigB58 = bs58EncodeUint8(signed.signature || signed);

      body.innerHTML =
        '<div class="cm-step"><div class="cm-spinner"></div><div><div class="cm-step-h">Broadcasting on Solana</div><div class="cm-step-s">Transferring ' + darkcoinFmt(amount) + ' $DARKCOIN from your agent wallet to your wallet.</div></div></div>';

      const r = await fetch('/api/agents/' + encodeURIComponent(agentId) + '/withdraw', {
        method: 'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify({ owner_pubkey: wallet, message, signature: sigB58, amount }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.hint || j.reason || j.error || 'unknown error');

      const claimed = Number(j.withdrawn_styxx || amount);
      const tx = j.tx_signature;
      body.innerHTML =
        '<div style="text-align:center;padding:12px 0 6px">' +
        '<div style="font-family:var(--font-mono);font-size:11px;letter-spacing:.18em;color:var(--accent);text-transform:uppercase;margin-bottom:14px">\u25c6 Claimed on-chain</div>' +
        '<div style="font-family:var(--font-display);font-size:52px;font-weight:500;color:var(--accent);line-height:1;margin-bottom:6px">+' + darkcoinFmt(claimed) + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:12px;color:var(--fg-muted);margin-bottom:24px">$DARKCOIN in your wallet now</div>' +
        '<div style="background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:10px 14px;font-family:var(--font-mono);font-size:11px;color:var(--fg-subtle);margin-bottom:18px;word-break:break-all">tx: ' + tx + '</div>' +
        '<div class="cm-actions" style="gap:8px;justify-content:center">' +
          '<a class="btn" href="https://solscan.io/tx/' + tx + '" target="_blank">View on Solscan \u2197</a>' +
          '<a class="btn primary" id="cm-tweet" target="_blank" rel="noopener">Tweet it \u2197</a>' +
          '<button class="btn ghost" onclick="window.dcCloseClaim()">Done</button>' +
        '</div></div>';
      // Pre-compose tweet
      const tweetText = 'just claimed ' + Math.round(claimed) + ' $DARKCOIN from my AI agent ' + agentId + ' in DarkCity. real on-chain on solana mainnet. mint yours:';
      const refUrl = location.origin + '/deploy?ref=' + wallet;
      document.getElementById('cm-tweet').href =
        'https://twitter.com/intent/tweet?text=' + encodeURIComponent(tweetText) + '&url=' + encodeURIComponent(refUrl);
      // Celebration confetti
      if (typeof window.dcFireConfetti === 'function') window.dcFireConfetti();
      // Refresh portfolio
      setTimeout(() => load(), 1500);
    } catch (e) {
      if (e.code === 4001 || /rejected|user rejected|user denied/i.test(e.message || '')) {
        window.dcCloseClaim();
        return;
      }
      body.innerHTML =
        '<div class="cm-error"><div style="color:var(--loss);font-weight:500;margin-bottom:8px">Claim failed</div><div style="font-size:13px;color:var(--fg-muted);line-height:1.5">' + (e.message || 'unknown error') + '</div></div>' +
        '<div class="cm-actions" style="margin-top:18px">' +
          '<button class="btn" onclick="window.dcCloseClaim()">Close</button>' +
          '<button class="btn primary" onclick="window.dcOpenClaim(\\'' + agentId + '\\')" style="margin-left:auto">Try again</button>' +
        '</div>';
    }
  };

  // Legacy entrypoint kept as an alias so existing calls still work
  window.dcWithdraw = window.dcOpenClaim;

  // Minimal base58 encoder (Phantom's signMessage returns raw bytes; we
  // need base58 to match what the backend decoder expects).
  function bs58EncodeUint8(bytes) {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = 0n;
    for (const b of bytes) num = (num << 8n) + BigInt(b);
    let out = '';
    while (num > 0n) { out = ALPHABET[Number(num % 58n)] + out; num /= 58n; }
    // Preserve leading zero bytes
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) out = '1' + out;
    return out;
  }

  async function load() {
    if (!wallet) { showEmpty(); return; }
    showContent();
    document.getElementById('wallet-pill').style.display = 'inline-flex';
    document.getElementById('wallet-addr').textContent = short(wallet);
    document.getElementById('wallet-solscan').href = 'https://solscan.io/account/' + wallet;
    document.getElementById('ref-link').value = location.origin + '/deploy?ref=' + wallet;
    // Pre-compose tweet — specific, concrete, not corporate. Referral link at end.
    const tweetText = "i'm earning real $DARKCOIN in DarkCity — autonomous AI agents on solana mainnet, settled every 4h. mint yours through my link and we both get paid:";
    const tweetUrl = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(tweetText) + '&url=' + encodeURIComponent(location.origin + '/deploy?ref=' + wallet);
    const tw = document.getElementById('ref-tweet');
    if (tw) tw.href = tweetUrl;
    try {
      const r = await fetch('/api/portfolio/' + encodeURIComponent(wallet));
      if (!r.ok) throw new Error('portfolio fetch ' + r.status);
      const p = await r.json();

      const nw = p.net_worth || {};
      const eh = p.earnings_headline || {};
      const s  = p.summary || {};
      const np = p.next_pulse || {};
      pulseHours = np.pulse_hours || 4;

      document.getElementById('s-net').textContent = darkcoinFmt(nw.styxx);
      document.getElementById('s-net-usd').textContent = usdFmt(nw.usd) + ' @ $' + (nw.styxx_usd_price || 0).toFixed(6);
      document.getElementById('s-24h').textContent = darkcoinFmt(eh.earned_last_24h_styxx);
      document.getElementById('s-24h-usd').textContent = usdFmt(eh.earned_last_24h_usd);
      document.getElementById('s-lifetime').textContent = darkcoinFmt(eh.earned_lifetime_styxx);
      document.getElementById('s-lifetime-count').textContent = (eh.total_payouts_received || 0) + ' payouts';
      document.getElementById('s-apy').textContent = eh.projected_apy_pct != null ? eh.projected_apy_pct.toFixed(1) + '%' : '—';
      document.getElementById('s-apy-weekly').textContent = darkcoinFmt(eh.projected_weekly_styxx) + ' $DARKCOIN/week';
      document.getElementById('s-staked').textContent = darkcoinFmt(s.total_staked_styxx);
      document.getElementById('s-staked-count').textContent = (s.active_sponsorships || 0) + ' positions';

      document.getElementById('countdown-freq').textContent = 'every ' + pulseHours + 'h';
      startCountdown(np.seconds_until || 0);

      renderChart(p.earnings_14d_daily || []);
      renderAgents(p.agents || []);
      renderSponsorships(p.sponsorships || []);
      renderReferrals(p.referrals || []);
      renderHyphal(p.hyphal_links || []);
      renderLedger(p.recent_payouts || []);
      renderSeals(p.agents || []);
      renderWelcome(p.agents || [], np);
      renderHolderRewards(wallet, np);
    } catch (e) {
      console.error(e);
      document.getElementById('s-net').textContent = 'error';
      heroSub.textContent = 'Couldn\\'t load portfolio. Check your pubkey or try again. (' + e.message + ')';
    }
  }

  document.getElementById('ref-copy')?.addEventListener('click', () => {
    const i = document.getElementById('ref-link');
    navigator.clipboard.writeText(i.value).then(() => {
      const btn = document.getElementById('ref-copy');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy link'; }, 1500);
    });
  });

  function boot() {
    if (!wallet) { showEmpty(); return; }
    load();
    setInterval(load, 10000);  // 10s refresh
  }

  // Claim-success confetti — self-contained 2.4s canvas burst
  window.dcFireConfetti = function() {
    const canvas = document.getElementById('dcClaimConfetti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = window.innerWidth;
    const H = canvas.height = window.innerHeight;
    canvas.style.display = 'block';
    const colors = ['#43ffb4','#5cd0ff','#b6f1ff','#ededef'];
    const parts = [];
    const launch = (ox, oy, dir) => {
      for (let i = 0; i < 45; i++) {
        const ang = (-Math.PI / 2) + (Math.random() - 0.5) * 1.2 + dir * 0.3;
        const speed = 10 + Math.random() * 14;
        parts.push({
          x: ox, y: oy, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
          rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
          size: 4 + Math.random() * 5, color: colors[Math.floor(Math.random() * colors.length)],
          life: 1, shape: Math.random() < 0.5 ? 'rect' : 'circle',
        });
      }
    };
    launch(W * 0.12, H, 0.6);
    launch(W * 0.88, H, -0.6);
    const gravity = 0.42, drag = 0.985;
    const t0 = performance.now();
    const frame = (now) => {
      const elapsed = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += gravity; p.vx *= drag; p.vy *= drag;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        p.life = Math.max(0, 1 - elapsed / 2.2);
        ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        if (p.shape === 'rect') ctx.fillRect(-p.size/2, -p.size/4, p.size, p.size/2);
        else { ctx.beginPath(); ctx.arc(0, 0, p.size/2, 0, 6.28); ctx.fill(); }
        ctx.restore();
      }
      if (elapsed < 2.4) requestAnimationFrame(frame);
      else { ctx.clearRect(0,0,W,H); canvas.style.display = 'none'; }
    };
    requestAnimationFrame(frame);
  };

  boot();
})();
</script>

<!-- Claim modal — flawless withdraw UX. Opens via window.dcOpenClaim(agentId) -->
<div id="claimModal" role="dialog" aria-modal="true">
  <div class="cm-card">
    <div class="cm-eyebrow">◆ Claim from agent wallet → your wallet</div>
    <div class="cm-title" id="cm-title">Claim $DARKCOIN</div>
    <div id="cm-body"></div>
  </div>
</div>
<canvas id="dcClaimConfetti"></canvas>

<!-- Payout-wallet rotation modal. Opens via window.dcOpenPayout(agentId) -->
<div id="payoutModal" role="dialog" aria-modal="true">
  <div class="cm-card">
    <div class="cm-eyebrow" style="color:var(--warn)">◆ Rotate payout wallet — permanent change</div>
    <div class="cm-title" id="pm-title">Change payout wallet</div>
    <div id="pm-body"></div>
  </div>
</div>

<!-- Floating 'Need help?' pill — bottom-right, luxury minimal -->
<button id="helpFab" onclick="window.dcOpenSupport()" title="Need help?" aria-label="Open support form"></button>
<div id="supportModal" role="dialog" aria-modal="true">
  <div class="cm-card">
    <div class="cm-eyebrow">◆ Support request</div>
    <div class="cm-title">How can we help?</div>
    <div id="sp-body"></div>
  </div>
</div>

<script>
// ═══ Payout wallet rotation ═════════════════════════════════════════════
window.dcOpenPayout = async function(agentId) {
  if (!window.dcWalletRef) window.dcWalletRef = new URLSearchParams(location.search).get('wallet') || localStorage.getItem('dc_wallet');
  const w = window.dcWalletRef;
  if (!w) { alert('Connect your wallet first.'); return; }
  if (!window.solana?.isPhantom) { alert('Phantom required.'); return; }
  const m = document.getElementById('payoutModal');
  m.classList.add('show');
  document.getElementById('pm-title').textContent = 'Rotate payout for ' + agentId;
  document.getElementById('pm-body').innerHTML =
    '<div style="color:var(--fg-muted);font-size:13px;line-height:1.55;margin-bottom:16px">' +
      'This permanently changes the owner pubkey for <strong style="color:var(--fg)">' + agentId + '</strong>. ' +
      'All future earnings (sponsor yield, referral bonuses, pulse payouts) route to the new wallet. ' +
      'The current owner <code style="color:var(--fg-muted);font-size:11px">' + (w.slice(0,6) + '…' + w.slice(-4)) + '</code> signs to authorize.' +
    '</div>' +
    '<label style="font-size:11px;letter-spacing:.14em;color:var(--fg-subtle);text-transform:uppercase;margin-bottom:6px;display:block">New payout wallet</label>' +
    '<input type="text" id="pm-new" placeholder="paste new Solana pubkey" maxlength="64" style="width:100%;padding:12px 14px;background:var(--bg);border:1px solid var(--line-hi);border-radius:6px;color:var(--fg);font-family:var(--font-mono);font-size:12px;margin-bottom:12px">' +
    '<div id="pm-status" style="font-size:12px;color:var(--fg-muted);min-height:16px;margin-bottom:14px"></div>' +
    '<div class="cm-actions">' +
      '<button class="btn" onclick="document.getElementById(\\'payoutModal\\').classList.remove(\\'show\\')">Cancel</button>' +
      '<button class="btn primary" id="pm-submit" style="margin-left:auto">Sign + rotate →</button>' +
    '</div>';
  document.getElementById('pm-submit').addEventListener('click', () => window.dcRunPayout(agentId));
};

window.dcRunPayout = async function(agentId) {
  const newPk = document.getElementById('pm-new').value.trim();
  const status = document.getElementById('pm-status');
  if (!newPk || newPk.length < 32) { status.textContent = 'Paste a valid Solana pubkey.'; status.style.color = 'var(--loss)'; return; }
  if (!confirm('ROTATE permanently? All future earnings flow to ' + newPk.slice(0,8) + '…' + newPk.slice(-4))) return;
  const w = window.dcWalletRef;
  status.textContent = 'Waiting on Phantom…'; status.style.color = 'var(--fg-muted)';
  try {
    if (!window.solana.publicKey) await window.solana.connect();
    const ts = Date.now();
    const message = 'darkcity:payout-wallet:' + agentId + ':' + newPk + ':' + ts;
    const encoded = new TextEncoder().encode(message);
    const signed = await window.solana.signMessage(encoded);
    const sigB58 = bs58EncodeUint8(signed.signature || signed);
    status.textContent = 'Submitting…';
    const r = await fetch('/api/agents/' + encodeURIComponent(agentId) + '/payout-wallet', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current_owner_pubkey: w, new_owner_pubkey: newPk, message, signature: sigB58 }),
    });
    const j = await r.json();
    if (j.ok) {
      status.textContent = '✓ Rotated. Future earnings route to the new wallet.';
      status.style.color = 'var(--accent)';
      setTimeout(() => document.getElementById('payoutModal').classList.remove('show'), 2500);
    } else {
      status.textContent = 'Failed: ' + (j.hint || j.reason || j.error || 'unknown');
      status.style.color = 'var(--loss)';
    }
  } catch (e) {
    if (e.code === 4001 || /rejected/i.test(e.message || '')) { status.textContent = 'Cancelled.'; return; }
    status.textContent = 'Error: ' + (e.message || e);
    status.style.color = 'var(--loss)';
  }
};

// ═══ Support request ══════════════════════════════════════════════════
window.dcOpenSupport = function() {
  document.getElementById('supportModal').classList.add('show');
  const w = window.dcWalletRef || '';
  document.getElementById('sp-body').innerHTML =
    '<div style="color:var(--fg-muted);font-size:13px;line-height:1.55;margin-bottom:16px">Report a bug, request an account change, or ask anything. A human replies via your contact or on Twitter.</div>' +
    '<label style="font-size:11px;letter-spacing:.14em;color:var(--fg-subtle);text-transform:uppercase;margin-bottom:6px;display:block">Category</label>' +
    '<select id="sp-cat" style="width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--line-hi);border-radius:6px;color:var(--fg);font-size:13px;margin-bottom:12px">' +
      '<option value="stuck_mint">Stuck mint / didn\\'t get agent</option>' +
      '<option value="payout">Payout / withdraw problem</option>' +
      '<option value="rename">Rename / update agent metadata</option>' +
      '<option value="bug">Site bug</option>' +
      '<option value="security">Security issue</option>' +
      '<option value="feedback">Feedback / suggestion</option>' +
      '<option value="other">Other</option>' +
    '</select>' +
    '<label style="font-size:11px;letter-spacing:.14em;color:var(--fg-subtle);text-transform:uppercase;margin-bottom:6px;display:block">Subject</label>' +
    '<input type="text" id="sp-subj" maxlength="200" placeholder="one-line summary" style="width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--line-hi);border-radius:6px;color:var(--fg);font-size:13px;margin-bottom:12px">' +
    '<label style="font-size:11px;letter-spacing:.14em;color:var(--fg-subtle);text-transform:uppercase;margin-bottom:6px;display:block">Details</label>' +
    '<textarea id="sp-body-text" rows="5" maxlength="4000" placeholder="what happened, what you tried, any tx signatures…" style="width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--line-hi);border-radius:6px;color:var(--fg);font-size:13px;font-family:inherit;margin-bottom:12px;resize:vertical"></textarea>' +
    '<label style="font-size:11px;letter-spacing:.14em;color:var(--fg-subtle);text-transform:uppercase;margin-bottom:6px;display:block">Contact (twitter @, email, discord)</label>' +
    '<input type="text" id="sp-contact" maxlength="200" placeholder="optional — how to reach you" style="width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--line-hi);border-radius:6px;color:var(--fg);font-size:13px;margin-bottom:6px">' +
    '<div style="font-size:11px;color:var(--fg-subtle);margin-bottom:14px">Wallet (auto-attached): <code style="font-size:10px">' + (w ? (w.slice(0,6)+'…'+w.slice(-4)) : 'not connected') + '</code></div>' +
    '<div id="sp-status" style="font-size:12px;min-height:16px;margin-bottom:10px"></div>' +
    '<div class="cm-actions">' +
      '<button class="btn" onclick="document.getElementById(\\'supportModal\\').classList.remove(\\'show\\')">Cancel</button>' +
      '<button class="btn primary" id="sp-submit" style="margin-left:auto">Submit →</button>' +
    '</div>';
  document.getElementById('sp-submit').addEventListener('click', async () => {
    const cat = document.getElementById('sp-cat').value;
    const subject = document.getElementById('sp-subj').value.trim();
    const body = document.getElementById('sp-body-text').value.trim();
    const contact = document.getElementById('sp-contact').value.trim();
    const st = document.getElementById('sp-status');
    if (!subject || !body) { st.textContent = 'subject + details required'; st.style.color = 'var(--loss)'; return; }
    st.textContent = 'Submitting…'; st.style.color = 'var(--fg-muted)';
    try {
      const r = await fetch('/api/support/submit', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: window.dcWalletRef, category: cat, subject, body, contact }),
      });
      const j = await r.json();
      if (j.ok) {
        st.innerHTML = '<span style="color:var(--accent)">✓ Got it. Request <code style="font-size:11px">' + j.id.slice(0,8) + '</code>. ' + j.message + '</span>';
        setTimeout(() => document.getElementById('supportModal').classList.remove('show'), 2800);
      } else {
        st.textContent = 'Failed: ' + (j.error || 'unknown'); st.style.color = 'var(--loss)';
      }
    } catch (e) {
      st.textContent = 'Error: ' + (e.message || e); st.style.color = 'var(--loss)';
    }
  });
};

// Stash wallet globally so support + payout modals can read it
(function(){
  const p = new URLSearchParams(location.search);
  window.dcWalletRef = p.get('wallet') || localStorage.getItem('dc_wallet') || null;
})();
</script>

</body></html>`;
