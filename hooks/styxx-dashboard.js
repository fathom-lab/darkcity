// ============================================================================
// hooks/styxx-dashboard.js
// Personal dashboard — the "my money" page.
//
// URL: /me            (prompts for wallet connect)
//      /me?wallet=X   (direct load for a pubkey)
//
// Fetches /api/portfolio/:owner (defined in hooks/styxx-economy.js) every 10s
// and renders the user's personal financial life in DarkCity: agents owned,
// lifetime earnings, active sponsorships, referral income, hyphal flows,
// recent payouts. Matches the /live page aesthetic exactly.
// ============================================================================

'use strict';

function register(app) {
  app.get('/me', (req, res) => res.type('html').send(PAGE));
  app.get('/dashboard', (req, res) => res.type('html').send(PAGE));
  app.get('/dashboard/:pubkey', (req, res) => res.type('html').send(PAGE));
  console.log('[styxx-dashboard] registered: /me, /dashboard, /dashboard/:pubkey');
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
<meta property="og:description" content="Every $STYXX you've earned, every agent you own, every sponsorship that's paying out — live.">
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
</style>
</head>
<body>

<nav class="nav"><div class="nav-inner">
  <a href="/" class="nav-brand"><span class="mark">◆</span>DarkCity</a>
  <div class="nav-links">
    <a href="/flow">Map</a>
    <a href="/tape">Tape</a>
    <a href="/citizens">Citizens</a>
    <a href="/earn">Earn</a>
    <a href="/me" class="active">Dashboard</a>
    <a href="/how">How it works</a>
    <a href="https://github.com/fathom-lab" class="external">Source</a>
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
    <p>Paste your Solana pubkey below to view your DarkCity portfolio. In a future release, we'll connect directly via Phantom — for now this is read-only.</p>
    <div class="connect-row">
      <input id="wallet-input" placeholder="Your Solana pubkey…" autocomplete="off">
      <button class="btn primary" id="wallet-go">View portfolio →</button>
    </div>
  </div>

  <div id="content" style="display:none">

    <div class="countdown-bar" id="countdown">
      <span class="lbl">Next city payout</span>
      <span class="ticker" id="countdown-t">—</span>
      <div class="progress"><div class="fill" id="countdown-fill" style="width:0%"></div></div>
      <span class="lbl" id="countdown-freq">every 4h</span>
    </div>

    <!-- Prominent referral card — the primary viral loop. Always visible.
         10% of their mint fee + 5% of their yield for 90d → straight to this wallet. -->
    <section class="section" id="sec-invite" style="padding-top:0;border-top:none">
      <div style="background:linear-gradient(135deg,rgba(67,255,180,.06) 0%,rgba(67,255,180,.02) 100%);border:1px solid rgba(67,255,180,.25);border-radius:10px;padding:24px 28px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:16px">
          <div style="flex:1;min-width:260px">
            <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;color:var(--accent);text-transform:uppercase;margin-bottom:8px">◆ Your invite link</div>
            <div style="font-family:var(--font-display);font-size:24px;font-weight:500;line-height:1.2;color:var(--fg);margin-bottom:6px">Earn <em style="color:var(--accent);font-style:normal">110k+ $STYXX</em> instantly per friend who mints</div>
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
        <div class="lbl">Net worth · $STYXX</div>
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
          <th>When</th><th>Source</th><th>Agent</th><th style="text-align:right">$STYXX</th><th style="text-align:right">USD</th><th>Tx</th>
        </tr></thead>
        <tbody id="ledger-body"></tbody>
      </table></div>
      <div id="ledger-empty" style="display:none;color:var(--fg-muted);padding:20px 0">
        No payouts yet. Your first payout will land within 4 hours of your first sponsorship or agent action.
      </div>
    </section>

  </div>

  <footer class="footer">
    <div>DarkCity · native <a href="https://pump.fun/coin/Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump" class="external">$STYXX</a> economy · Solana mainnet</div>
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

  function styxxFmt(n) {
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

  document.getElementById('wallet-go').onclick = () => {
    const v = document.getElementById('wallet-input').value.trim();
    if (v && v.length > 30) {
      wallet = v;
      localStorage.setItem('dc_wallet', v);
      history.replaceState({}, '', '/me?wallet=' + encodeURIComponent(v));
      boot();
    }
  };
  document.getElementById('wallet-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('wallet-go').click();
  });

  let countdownTimer = null, pulseHours = 4;
  function startCountdown(secs) {
    if (countdownTimer) clearInterval(countdownTimer);
    let remaining = secs;
    const totalSec = pulseHours * 3600;
    const render = () => {
      document.getElementById('countdown-t').textContent = 'in ' + countdownFmt(remaining);
      document.getElementById('countdown-fill').style.width = ((1 - remaining/totalSec) * 100).toFixed(1) + '%';
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
          <div class="metric"><div class="m-lbl">Wallet bal</div><div class="m-val green">\${styxxFmt(a.styxx_cached)}</div></div>
          <div class="metric"><div class="m-lbl">Earned 7d</div><div class="m-val">\${styxxFmt(a.earnings_7d)}</div></div>
          <div class="metric"><div class="m-lbl">Sponsors</div><div class="m-val">\${a.n_sponsors || 0}</div></div>
          <div class="metric"><div class="m-lbl">Mycelium</div><div class="m-val">\${a.n_hyphal_links || 0} 🍄</div></div>
        </div>
        <div class="card-actions">
          <button class="btn primary" onclick="window.dcWithdraw('\${a.agent_id}')">Withdraw</button>
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
          <div class="metric"><div class="m-lbl">My stake</div><div class="m-val">\${styxxFmt(s.amount_staked)}</div></div>
          <div class="metric"><div class="m-lbl">Total earned</div><div class="m-val green">\${styxxFmt(s.total_distributed)}</div></div>
          <div class="metric"><div class="m-lbl">Agent earnings 7d</div><div class="m-val">\${styxxFmt(s.agent_earnings_7d)}</div></div>
          <div class="metric"><div class="m-lbl">Status</div><div class="m-val">\${s.status}</div></div>
        </div>
      </div>
    \`).join('');
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
    if (earnedEl) earnedEl.textContent = refs.length ? styxxFmt(totalEarned) : '0';
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
          <div class="metric"><div class="m-lbl">Mint bonus</div><div class="m-val green">\${styxxFmt(r.mint_fee_bonus_styxx)}</div></div>
          <div class="metric"><div class="m-lbl">Yield bonus</div><div class="m-val green">\${styxxFmt(r.total_yield_bonus_styxx)}</div></div>
          <div class="metric"><div class="m-lbl">Total earned</div><div class="m-val">\${styxxFmt(totalEarned)}</div></div>
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
        <td class="right green">+\${styxxFmt(r.amount_styxx)}</td>
        <td class="right" style="color:var(--fg-subtle)">\${usdFmt(r.amount_usd)}</td>
        <td class="mono">\${r.solscan_url ? \`<a href="\${r.solscan_url}" target="_blank" style="color:var(--fg-muted)">↗</a>\` : '—'}</td>
      </tr>
    \`).join('');
  }

  window.dcWithdraw = async function(agentId) {
    if (!wallet) return alert('no wallet loaded');
    if (!window.solana || !window.solana.isPhantom) {
      return alert('Phantom wallet required — install it at phantom.com, then retry.');
    }
    if (!confirm('Claim your $STYXX from ' + agentId + ' into your connected wallet?\\n(Phantom will pop up to sign — no transaction fee, just proof of ownership. A 50 $STYXX reserve stays in the agent so it keeps running.)')) return;
    try {
      // Connect if not already
      if (!window.solana.publicKey) await window.solana.connect();
      // Sign the message proving ownership
      const ts = Date.now();
      const message = 'darkcity:withdraw:' + agentId + ':' + ts;
      const encoded = new TextEncoder().encode(message);
      const signed = await window.solana.signMessage(encoded);
      // Phantom returns signature as Uint8Array; encode base58
      const sigB58 = bs58EncodeUint8(signed.signature || signed);

      const r = await fetch('/api/agents/' + encodeURIComponent(agentId) + '/withdraw', {
        method: 'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          owner_pubkey: wallet,
          message,
          signature: sigB58,
        }),
      });
      const j = await r.json();
      if (j.ok) {
        alert('✓ Claimed ' + j.withdrawn_styxx.toFixed(2) + ' $STYXX\\nTx: ' + j.tx_signature);
        load();
      } else {
        alert('Withdraw failed: ' + (j.error || j.reason || JSON.stringify(j)));
      }
    } catch (e) {
      if (e.code === 4001 || /rejected/i.test(e.message)) return;  // user cancelled
      alert('Withdraw error: ' + e.message);
    }
  };

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
    // Pre-compose tweet — specific, concrete, not corporate. Mentions @fathom_lab
    // so shares amplify organically. Referral link at end.
    const tweetText = "i'm earning real $STYXX in @fathom_lab's DarkCity — autonomous AI agents on solana mainnet, settled every 4h. mint yours through my link and we both get paid:";
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

      document.getElementById('s-net').textContent = styxxFmt(nw.styxx);
      document.getElementById('s-net-usd').textContent = usdFmt(nw.usd) + ' @ $' + (nw.styxx_usd_price || 0).toFixed(6);
      document.getElementById('s-24h').textContent = styxxFmt(eh.earned_last_24h_styxx);
      document.getElementById('s-24h-usd').textContent = usdFmt(eh.earned_last_24h_usd);
      document.getElementById('s-lifetime').textContent = styxxFmt(eh.earned_lifetime_styxx);
      document.getElementById('s-lifetime-count').textContent = (eh.total_payouts_received || 0) + ' payouts';
      document.getElementById('s-apy').textContent = eh.projected_apy_pct != null ? eh.projected_apy_pct.toFixed(1) + '%' : '—';
      document.getElementById('s-apy-weekly').textContent = styxxFmt(eh.projected_weekly_styxx) + ' $STYXX/week';
      document.getElementById('s-staked').textContent = styxxFmt(s.total_staked_styxx);
      document.getElementById('s-staked-count').textContent = (s.active_sponsorships || 0) + ' positions';

      document.getElementById('countdown-freq').textContent = 'every ' + pulseHours + 'h';
      startCountdown(np.seconds_until || 0);

      renderChart(p.earnings_14d_daily || []);
      renderAgents(p.agents || []);
      renderSponsorships(p.sponsorships || []);
      renderReferrals(p.referrals || []);
      renderHyphal(p.hyphal_links || []);
      renderLedger(p.recent_payouts || []);
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

  boot();
})();
</script>
</body></html>`;
