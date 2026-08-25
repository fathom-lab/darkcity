// ============================================================================
// arena-ui.js — DarkCity Arena UI (v2 — the saloon comes alive)
//
// Live SVG multiplier graph climbing in real time. History strip of last 30
// crashes (colored by outcome). Scrolling bet ticker. Typewriter reasoning
// with inline depth meters. Crash event = red flash + shake + RUG stamp.
// CRT ambient effects. Live watchers + big win of 24h banner.
//
// Aesthetic: ASCII dive bar, terminal green on pure black. Zero flourish.
// Looks like an SSH'd-into illegal back-room AI casino that's actually busy.
// ============================================================================

'use strict';

const arena = require('./arena-crash');
const { TOKEN_MINT_ADDR, TOKEN_TICKER, TOKEN_PUMP_URL, TOKEN_SOLSCAN_URL, TOKEN_LIVE, TOKEN_DECIMALS } = require('../lib/token-config');

// Rendered per-request so the server-known arena_shadow_mode flag reaches the
// client before it ever builds an on-chain transfer. shadow=true means paper
// bets: the buy-in path must never touch Phantom.
const renderPage = ({ shadow }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>darkcity · the felt</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #000000;
  --bg-1: #07080a;
  --bg-2: #0d0f12;
  --fg: #d6d6d6;
  --fg-dim: #8a8a8a;
  --fg-mute: #4a4a4a;
  --grid: #14161a;
  --green: #4ade80;
  --green-glow: #86efac;
  --green-deep: #16a34a;
  --red: #ef4444;
  --red-glow: #fca5a5;
  --amber: #fbbf24;
  --cyan: #67e8f9;
  --gold: #fde047;
  --line: #1f2429;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: var(--bg);
  color: var(--fg);
  font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
  font-size: 14px; line-height: 1.5;
  min-height: 100vh;
}
body {
  background:
    radial-gradient(ellipse 80% 50% at 50% -10%, rgba(74,222,128,0.05), transparent 60%),
    radial-gradient(ellipse 60% 40% at 50% 110%, rgba(239,68,68,0.05), transparent 60%),
    #000;
  overflow-x: hidden;
}
/* CRT scan lines overlay */
body::before {
  content: '';
  position: fixed; inset: 0; pointer-events: none; z-index: 999;
  background: repeating-linear-gradient(0deg,
    rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px,
    rgba(0,0,0,.08) 3px, rgba(0,0,0,0) 4px);
  mix-blend-mode: multiply;
}
/* CRT flicker */
body::after {
  content: '';
  position: fixed; inset: 0; pointer-events: none; z-index: 998;
  background: rgba(74,222,128,.012);
  animation: crt 8s infinite;
}
@keyframes crt {
  0%,97%,100% { opacity: 0; }
  98% { opacity: .6; }
  99% { opacity: .2; }
}
::selection { background: var(--green-deep); color: #000; }

.wrap { max-width: 1180px; margin: 0 auto; padding: 22px 20px 80px; }

/* ─── TOP NAV ─── */
.nav {
  display: flex; justify-content: space-between; align-items: baseline;
  padding-bottom: 12px; margin-bottom: 18px;
  border-bottom: 1px solid var(--line);
}
.nav .name { color: var(--green); font-weight: 700; font-size: 16px; letter-spacing: .02em; }
.nav .name .dot { color: var(--fg-mute); }
.nav ul { list-style: none; display: flex; gap: 22px; }
.nav a {
  color: var(--fg-dim); text-decoration: none; font-size: 12px;
  transition: color .1s;
}
.nav a::before { content: '> '; color: var(--fg-mute); }
.nav a:hover { color: var(--green); }
.nav a.active { color: var(--fg); }
.nav a.active::before { color: var(--green); }

/* ─── BANNER ─── */
.banner {
  font-size: 10px; line-height: 1.15;
  color: var(--green);
  white-space: pre;
  margin-bottom: 14px;
  text-shadow: 0 0 8px rgba(74,222,128,.25);
  overflow: hidden;
}
.tagline {
  color: var(--fg-dim); font-size: 12px;
  margin-bottom: 16px;
}
.tagline span { color: var(--amber); }

/* ─── TICKER ─── */
.ticker {
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  padding: 8px 0; overflow: hidden; position: relative;
  margin-bottom: 18px;
  background: linear-gradient(90deg, #000 0%, var(--bg-1) 50%, #000 100%);
}
.ticker .ticker-track {
  display: flex; gap: 40px; white-space: nowrap;
  animation: slide 80s linear infinite;
  will-change: transform;
  font-size: 11px; letter-spacing: .06em;
  color: var(--fg-dim);
}
@keyframes slide { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.ticker .item::before { content: '·  '; color: var(--fg-mute); margin-right: 6px; }
.ticker .win { color: var(--green-glow); }
.ticker .lose { color: var(--red-glow); }
.ticker .bet { color: var(--fg); }
.ticker .big { color: var(--gold); font-weight: 700; }

/* ─── STAT BAR ─── */
.statbar {
  border: 1px solid var(--line);
  padding: 13px 16px;
  margin-bottom: 18px;
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px;
  background: var(--bg-1);
}
@media (max-width: 860px) { .statbar { grid-template-columns: repeat(3, 1fr); } }
.statbar .s { border-left: 1px dashed var(--grid); padding-left: 14px; }
.statbar .s:first-child { border-left: none; padding-left: 0; }
.statbar .s .l {
  color: var(--fg-mute); font-size: 9px; letter-spacing: .15em;
  text-transform: uppercase; margin-bottom: 4px;
}
.statbar .s .v {
  color: var(--fg); font-size: 18px; font-weight: 700;
  letter-spacing: -.01em;
  font-variant-numeric: tabular-nums;
}
.statbar .s.green .v { color: var(--green-glow); }
.statbar .s.red .v { color: var(--red-glow); }
.statbar .s.amber .v { color: var(--amber); }
.statbar .s.cyan .v { color: var(--cyan); }
.statbar .s.gold .v { color: var(--gold); }
.statbar .s .sub { font-size: 9px; color: var(--fg-mute); margin-top: 2px; letter-spacing: .08em; }

/* ─── HISTORY STRIP ─── */
.history {
  border: 1px solid var(--line);
  padding: 10px 14px; margin-bottom: 18px;
  background: var(--bg-1);
  position: relative;
}
.history::before {
  content: '[ PREVIOUS CALLS ]';
  position: absolute; top: -8px; left: 16px;
  background: var(--bg); color: var(--fg-dim);
  padding: 0 10px; font-size: 10px; letter-spacing: .18em; font-weight: 700;
}
.hist-grid {
  display: flex; gap: 4px; overflow-x: auto; padding: 6px 0 4px;
  scrollbar-width: none;
  align-items: flex-end;
  height: 60px;
}
.hist-grid::-webkit-scrollbar { display: none; }
.hist-bar {
  min-width: 26px;
  height: 100%; /* overridden inline */
  display: flex; align-items: flex-end; justify-content: center;
  font-size: 9px; font-weight: 700;
  color: #000; padding: 3px 0;
  font-variant-numeric: tabular-nums;
  border-radius: 1px;
  transition: opacity .2s;
  cursor: help;
}
.hist-bar:hover { opacity: .85; }
.hist-bar.lv1 { background: var(--red); color: #fff; }
.hist-bar.lv2 { background: var(--amber); }
.hist-bar.lv3 { background: var(--green); }
.hist-bar.lv4 { background: var(--cyan); }
.hist-bar.lv5 { background: var(--gold); box-shadow: 0 0 10px rgba(253,224,71,.5); }

/* ─── MAIN GAME PANEL ─── */
.game {
  border: 1px solid var(--line);
  background: var(--bg-1);
  padding: 22px;
  margin-bottom: 22px;
  position: relative;
}
.game::before {
  content: '[ THE FELT ]';
  position: absolute; top: -8px; left: 22px;
  background: var(--bg); color: var(--green);
  padding: 0 10px; font-size: 11px; letter-spacing: .18em; font-weight: 700;
}
.game.crashed {
  animation: crash-flash .45s;
  border-color: var(--red);
}
@keyframes crash-flash {
  0% { background: rgba(239,68,68,0.35); }
  100% { background: var(--bg-1); }
}

.row1 { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.row1 .round-id { color: var(--fg-dim); font-size: 12px; letter-spacing: .08em; }
.row1 .round-id b { color: var(--fg); }
.row1 .chip {
  padding: 2px 10px; border: 1px solid var(--line);
  font-size: 10px; letter-spacing: .15em; text-transform: uppercase;
  color: var(--fg-dim);
}
.row1 .chip.betting { color: var(--amber); border-color: var(--amber); }
.row1 .chip.running { color: var(--green); border-color: var(--green); animation: blink 1.5s infinite; }
.row1 .chip.resolving, .row1 .chip.resolved { color: var(--red); border-color: var(--red); }
@keyframes blink { 50% { opacity: .4; } }

.agent-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; gap: 14px; flex-wrap: wrap; }
.agent-head .who {
  font-size: 26px; font-weight: 800;
  color: var(--fg); letter-spacing: -.02em;
}
.agent-head .who-meta { color: var(--fg-dim); font-size: 11px; margin-top: 2px; }
.agent-head .who-meta span { color: var(--cyan); }
.agent-head .pot {
  text-align: right; color: var(--fg-dim); font-size: 11px;
}
.agent-head .pot .n { color: var(--amber); font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }

/* ─── GRAPH ─── */
.graph-wrap {
  position: relative;
  border: 1px solid var(--grid);
  background: #020303;
  padding: 0;
  margin-bottom: 16px;
  height: 280px;
  overflow: hidden;
}
.graph-wrap.crashed { border-color: var(--red); background: #140303; }
.graph-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.graph-grid-line { stroke: var(--grid); stroke-width: 1; stroke-dasharray: 2 4; }
.graph-grid-text {
  fill: var(--fg-mute); font-family: inherit; font-size: 9px;
  font-weight: 500; letter-spacing: .1em;
}
.graph-path { fill: none; stroke: var(--green); stroke-width: 2.5; filter: drop-shadow(0 0 6px rgba(74,222,128,.6)); }
.graph-fill { fill: url(#graph-gradient); opacity: .5; }
.graph-path.crashed { stroke: var(--red); filter: drop-shadow(0 0 6px rgba(239,68,68,.6)); }
.graph-fill.crashed { opacity: .3; }

.mult-overlay {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  text-align: center;
  z-index: 2;
}
.mult {
  font-size: clamp(64px, 12vw, 120px);
  font-weight: 800;
  color: var(--green-glow);
  letter-spacing: -.04em; line-height: .95;
  text-shadow: 0 0 32px rgba(134,239,172,.65), 0 0 64px rgba(74,222,128,.3);
  font-variant-numeric: tabular-nums;
  transition: color .1s;
}
.mult.crashed {
  color: var(--red);
  text-shadow: 0 0 32px rgba(239,68,68,.8);
  animation: shake .4s;
}
@keyframes shake {
  0%,100% { transform: translateX(0) translateY(0); }
  10% { transform: translateX(-8px) translateY(2px); }
  20% { transform: translateX(8px) translateY(-2px); }
  30% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  50% { transform: translateX(-3px); }
  60% { transform: translateX(3px); }
}
.mult-hint { color: var(--fg-mute); font-size: 11px; letter-spacing: .25em; margin-top: 6px; text-transform: uppercase; }
.mult-hint.crashed { color: var(--red-glow); }

.rug-stamp {
  position: absolute; top: 20px; right: 22px;
  font-size: 42px; font-weight: 800;
  color: var(--red);
  letter-spacing: .1em;
  border: 3px solid var(--red);
  padding: 4px 18px;
  transform: rotate(-12deg);
  opacity: 0;
  text-shadow: 2px 2px 0 #000;
  pointer-events: none;
}
.rug-stamp.on {
  animation: stamp .4s forwards;
}
@keyframes stamp {
  0% { opacity: 0; transform: rotate(-12deg) scale(1.8); }
  100% { opacity: .95; transform: rotate(-12deg) scale(1); }
}

/* Countdown ring for betting window */
.count-bar {
  position: absolute; bottom: 0; left: 0;
  height: 3px; background: var(--amber);
  transition: width .2s linear;
  box-shadow: 0 0 8px rgba(251,191,36,.6);
}

/* ─── REASONING ─── */
.reason {
  background: #020303;
  border: 1px solid var(--grid);
  padding: 14px 16px;
  font-size: 13px; line-height: 1.7;
  min-height: 120px;
  margin-bottom: 16px;
}
.reason .q {
  display: block; color: var(--cyan); font-size: 11px;
  margin-bottom: 10px; letter-spacing: .05em;
  padding-bottom: 8px; border-bottom: 1px dashed var(--grid);
}
.reason .q::before { content: '?> '; color: var(--fg-mute); }
.sent {
  display: grid; grid-template-columns: 1fr 110px;
  gap: 14px; align-items: start;
  padding: 3px 0;
  color: var(--fg-dim);
  opacity: 0; transform: translateY(4px);
  animation: sentIn .3s forwards;
}
@keyframes sentIn { to { opacity: 1; transform: translateY(0); } }
.sent .txt { color: var(--fg); }
.sent .txt::before { content: '$ '; color: var(--green); }
.sent .txt.typing::after { content: '█'; color: var(--green); animation: blink2 1s infinite; }
@keyframes blink2 { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
.sent .depth {
  display: flex; flex-direction: column; gap: 2px;
  font-size: 9px; color: var(--fg-mute); letter-spacing: .1em;
  padding-top: 4px;
}
.sent .depth .bar { height: 4px; background: var(--grid); position: relative; overflow: hidden; }
.sent .depth .bar .fill { height: 100%; background: var(--green); transition: width .4s; }
.sent .depth .bar .fill.hi { background: var(--gold); }
.sent .depth .bar .fill.lo { background: var(--red); }
.sent.crashed .txt { color: var(--red); }
.sent.crashed .txt::before { content: '! '; color: var(--red); }

/* ─── WALLET + BETTING ─── */
.wallet {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; border: 1px dashed var(--grid);
  margin-bottom: 12px; font-size: 12px; color: var(--fg-dim);
}
.wallet .addr { color: var(--fg); }
.wallet .addr.ok { color: var(--green); }
.wallet .bal { margin-left: auto; color: var(--fg-dim); font-size: 11px; }
.wallet .bal b { color: var(--amber); }
.wallet button {
  background: transparent;
  border: 1px solid var(--green);
  color: var(--green);
  padding: 4px 12px;
  font-family: inherit; font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  cursor: pointer;
}
.wallet button:hover { background: var(--green); color: #000; }

.betrow {
  display: grid; grid-template-columns: 1fr auto auto auto auto; gap: 8px;
  margin-bottom: 8px; align-items: stretch;
}
.betrow input {
  background: #020303;
  border: 1px solid var(--grid);
  color: var(--green-glow);
  font-family: inherit; font-size: 20px; font-weight: 700;
  padding: 14px 16px;
  letter-spacing: -.01em;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.betrow input:focus { outline: none; border-color: var(--green); }
.betrow .quick {
  background: transparent;
  border: 1px solid var(--grid);
  color: var(--fg-dim);
  padding: 0 10px;
  font-family: inherit; font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
  cursor: pointer;
}
.betrow .quick:hover { border-color: var(--green); color: var(--green); }
.betrow .buyin {
  padding: 14px 22px;
  background: var(--green);
  color: #000;
  border: none;
  font-family: inherit; font-size: 14px; font-weight: 800;
  letter-spacing: .1em; text-transform: uppercase;
  cursor: pointer;
  transition: all .1s;
}
.betrow .buyin:hover { background: var(--green-glow); }
.betrow .buyin:disabled { background: var(--grid); color: var(--fg-mute); cursor: not-allowed; }

.cashout {
  width: 100%;
  padding: 22px;
  background: #120000;
  color: var(--red);
  border: 2px solid var(--red);
  font-family: inherit; font-size: 18px; font-weight: 800;
  letter-spacing: .08em; text-transform: uppercase;
  cursor: pointer;
  transition: all .08s;
  position: relative;
}
.cashout:hover:not(:disabled) {
  background: var(--red);
  color: #000;
  box-shadow: 0 0 20px rgba(239,68,68,.5);
}
.cashout:disabled {
  background: var(--bg-2); color: var(--fg-mute); border-color: var(--grid);
  cursor: not-allowed;
}
.cashout .big { display: block; font-size: 24px; margin-bottom: 2px; }
.cashout .sub { display: block; font-size: 10px; font-weight: 400; letter-spacing: .15em; color: currentColor; opacity: .7; }

.msg {
  font-size: 12px; padding: 8px 0;
  color: var(--fg-dim);
  display: none;
  letter-spacing: .03em;
}
.msg.show { display: block; }
.msg.ok { color: var(--green); }
.msg.err { color: var(--red); }
.msg::before { content: '// '; color: var(--fg-mute); }

/* shadow mode — the house is rehearsing, bets are paper */
.shadow-badge {
  border: 1px dashed var(--cyan);
  color: var(--cyan);
  background: rgba(103,232,249,.05);
  padding: 8px 14px; margin-bottom: 14px;
  font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
}

.hint {
  display: flex; justify-content: space-between;
  font-size: 11px; color: var(--fg-mute); margin-top: 10px;
  padding-top: 10px; border-top: 1px solid var(--grid);
  flex-wrap: wrap; gap: 10px;
}

/* ─── LOWER GRID ─── */
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 22px; }
@media (max-width: 860px) { .grid2 { grid-template-columns: 1fr; } }

.pane {
  border: 1px solid var(--line);
  background: var(--bg-1);
  padding: 18px;
  position: relative;
}
.pane h3 {
  color: var(--green); font-size: 11px; letter-spacing: .2em;
  text-transform: uppercase; font-weight: 700;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--grid);
}
.pane h3::before { content: '[ '; color: var(--fg-mute); }
.pane h3::after { content: ' ]'; color: var(--fg-mute); }

.jp-big {
  font-size: 32px; font-weight: 800; color: var(--green-glow);
  text-shadow: 0 0 20px rgba(134,239,172,.4);
  letter-spacing: -.02em; line-height: 1;
  font-variant-numeric: tabular-nums;
  margin: 10px 0 4px;
}
.jp-sub { color: var(--fg-dim); font-size: 11px; }
.jp-foot {
  margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--grid);
  color: var(--fg-mute); font-size: 10px; line-height: 1.7;
}

.feed-row {
  display: grid; grid-template-columns: 1fr auto auto;
  gap: 10px; padding: 5px 0;
  font-size: 11px; color: var(--fg-dim);
  border-bottom: 1px dotted var(--grid);
  font-variant-numeric: tabular-nums;
}
.feed-row:last-child { border-bottom: none; }
.feed-row .a { color: var(--fg); font-weight: 500; }
.feed-row .m { color: var(--amber); font-weight: 700; }
.feed-row.w .amt { color: var(--green-glow); }
.feed-row.l .amt { color: var(--red-glow); }

/* BIG WIN banner */
.bigwin {
  border: 1px solid var(--gold);
  padding: 10px 16px; margin-bottom: 18px;
  background: linear-gradient(90deg, rgba(253,224,71,.08), transparent, rgba(253,224,71,.08));
  display: flex; gap: 14px; align-items: center; flex-wrap: wrap;
  font-size: 12px;
}
.bigwin .lbl { color: var(--gold); letter-spacing: .25em; font-size: 10px; font-weight: 700; }
.bigwin .body { color: var(--fg); }
.bigwin .mx { color: var(--gold); font-weight: 800; font-size: 16px; font-variant-numeric: tabular-nums; }

/* BURN STRIP */
.burn {
  border-top: 1px solid var(--red);
  border-bottom: 1px solid var(--red);
  padding: 14px 18px;
  margin-bottom: 22px;
  background: linear-gradient(90deg, rgba(239,68,68,0.05), transparent, rgba(239,68,68,0.05));
  text-align: center;
  color: var(--red);
}
.burn .l { font-size: 11px; letter-spacing: .25em; text-transform: uppercase; margin-bottom: 4px; color: var(--red-glow); }
.burn .v { font-size: 26px; font-weight: 800; color: var(--fg); font-variant-numeric: tabular-nums; }
.burn .v::after { content: ' $DARKCOIN'; color: var(--red); font-size: 14px; font-weight: 400; margin-left: 4px; }

.foot {
  margin-top: 28px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
  color: var(--fg-mute);
  font-size: 11px;
  line-height: 1.8;
}
.foot a { color: var(--green); text-decoration: none; }
.foot a:hover { text-decoration: underline; }
.foot .pump { color: var(--fg); font-family: inherit; word-break: break-all; }

/* ─── FLASH (full-screen crash overlay) ─── */
.flash {
  position: fixed; inset: 0; pointer-events: none; z-index: 9999;
  background: rgba(239,68,68,0);
  transition: background .1s;
}
.flash.on { background: rgba(239,68,68,.18); animation: flashOut .6s forwards; }
@keyframes flashOut { to { background: rgba(239,68,68,0); } }

</style>
</head>
<body>

<div class="flash" id="flash"></div>
<div class="wrap">

<nav class="nav">
  <div class="name">darkcity<span class="dot">::</span>felt</div>
  <ul>
    <li><a href="/flow">Map</a></li>
    <li><a href="/arena" class="active">Felt</a></li>
    <li><a href="/earn">Earn</a></li>
    <li><a href="/deploy">Mint</a></li>
    <li><a href="/how">How</a></li>
    <li><a href="/me">Dashboard</a></li>
  </ul>
</nav>

<pre class="banner">
 ██████╗  █████╗ ██████╗ ██╗  ██╗ ██████╗██╗████████╗██╗   ██╗    ·    ███████╗███████╗██╗  ████████╗
 ██╔══██╗██╔══██╗██╔══██╗██║ ██╔╝██╔════╝██║╚══██╔══╝╚██╗ ██╔╝    ·    ██╔════╝██╔════╝██║  ╚══██╔══╝
 ██║  ██║███████║██████╔╝█████╔╝ ██║     ██║   ██║    ╚████╔╝     ·    █████╗  █████╗  ██║     ██║
 ██║  ██║██╔══██║██╔══██╗██╔═██╗ ██║     ██║   ██║     ╚██╔╝      ·    ██╔══╝  ██╔══╝  ██║     ██║
 ██████╔╝██║  ██║██║  ██║██║  ██╗╚██████╗██║   ██║      ██║       ·    ██║     ███████╗███████╗██║
 ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝   ╚═╝      ╚═╝       ·    ╚═╝     ╚══════╝╚══════╝╚═╝
</pre>

<div class="tagline">
  ai agents reason live · you <span>cash out before they crash</span> · $DARKCOIN is the chip, nothing else plays
</div>

<div class="ticker">
  <div class="ticker-track" id="tickerTrack"><span class="item">loading feed...</span></div>
</div>

<div class="statbar">
  <div class="s green"><div class="l">kitty</div><div class="v" id="sPubJp">—</div><div class="sub">weekly draw</div></div>
  <div class="s gold"><div class="l">founder pool</div><div class="v" id="sFoundJp">—</div><div class="sub">9 genesis</div></div>
  <div class="s red"><div class="l">burned 24h</div><div class="v" id="sBurn">—</div><div class="sub">permanent</div></div>
  <div class="s cyan"><div class="l">volume 24h</div><div class="v" id="sVol">—</div><div class="sub">on the felt</div></div>
  <div class="s amber"><div class="l">degens 24h</div><div class="v" id="sPlayers">—</div><div class="sub">unique wallets</div></div>
  <div class="s"><div class="l">round</div><div class="v" id="sRound">—</div><div class="sub">this session</div></div>
</div>

<div class="bigwin" id="bigWinBox" style="display:none">
  <span class="lbl">BIGGEST WIN · 24H</span>
  <span class="body" id="bigWinBody">—</span>
</div>

<div class="history">
  <div class="hist-grid" id="histGrid">
    <div style="color:var(--fg-mute);font-size:11px;padding:20px">no rounds resolved yet.</div>
  </div>
</div>

<div class="game" id="gameBox">
  <!-- Paused banner. Shown by JS when /api/arena/round reports status:'paused' -->
  <div id="pausedBanner" style="display:none;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.35);border-radius:4px;padding:14px 18px;margin-bottom:14px;color:var(--amber);font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.5;">
    <div style="font-weight:700;letter-spacing:0.08em;margin-bottom:4px;">▲ arena paused</div>
    <div style="color:var(--fg-dim);font-size:12px;">no new rounds are starting right now. your wallet is safe — you can't place a bet. history below shows past rounds.</div>
  </div>
  <div class="shadow-badge" id="shadowBadge" style="display:${shadow ? 'block' : 'none'}">▓ shadow mode — paper bets · no real ${TOKEN_TICKER} moves on-chain</div>
  <div class="row1">
    <div class="round-id">round · <b id="roundNo">—</b> <span style="color:var(--fg-mute)">·</span> <span id="roundMeta" style="color:var(--fg-dim);font-size:11px">waiting</span></div>
    <div class="chip" id="statusChip">idle</div>
  </div>

  <div class="agent-head">
    <div>
      <div class="who" id="agentName">—</div>
      <div class="who-meta"><span id="agentDistrict">—</span> · <span id="agentRank">—</span></div>
    </div>
    <div class="pot">
      <div class="n" id="potAmt">0</div>
      <div>on the felt · <span id="potBets">0</span> bets</div>
    </div>
  </div>

  <div class="graph-wrap" id="graphWrap">
    <svg class="graph-svg" id="graphSvg" viewBox="0 0 1000 280" preserveAspectRatio="none">
      <defs>
        <linearGradient id="graph-gradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#4ade80" stop-opacity=".4"/>
          <stop offset="100%" stop-color="#4ade80" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="graph-gradient-red" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#ef4444" stop-opacity=".3"/>
          <stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <g id="graphGrid"></g>
      <path id="graphFill" class="graph-fill" d="" />
      <path id="graphPath" class="graph-path" d="" />
    </svg>
    <div class="mult-overlay">
      <div class="mult" id="multiplier">1.00×</div>
      <div class="mult-hint" id="multLabel">waiting for next round</div>
    </div>
    <div class="rug-stamp" id="rugStamp">RUG</div>
    <div class="count-bar" id="countBar" style="width:0%"></div>
  </div>

  <div class="reason">
    <span class="q" id="prompt">—</span>
    <div id="sentList"></div>
  </div>

  <div class="wallet">
    <span>wallet:</span>
    <span class="addr" id="wChip">not connected</span>
    <span class="bal" id="wBal" style="display:none">bal: <b>—</b> $DARKCOIN</span>
    <button id="wConnect">connect phantom</button>
    <button id="faucetBtn" style="display:none;background:var(--green);color:#000;border:1px solid var(--green);padding:8px 14px;border-radius:4px;font-family:inherit;font-weight:700;letter-spacing:0.04em;cursor:pointer;font-size:12px;"></button>
  </div>

  <div class="betrow" id="betForm">
    <input type="number" id="stakeInput" placeholder="100000" min="100000" max="500000">
    <button class="quick" data-amt="100000">100k</button>
    <button class="quick" data-amt="250000">250k</button>
    <button class="quick" data-amt="500000">500k</button>
    <button class="buyin" id="buyinBtn">BUY IN</button>
  </div>

  <button class="cashout" id="cashoutBtn" disabled>
    <span class="big">CASH OUT</span>
    <span class="sub">place bet first</span>
  </button>

  <div class="msg" id="statusMsg"></div>

  <div class="hint">
    <span>min 100k · max 500k $DARKCOIN · payouts capped at 25% of treasury</span>
    <span>94% loss burn · 4% kitty · 1% founders · 1% founder jackpot</span>
  </div>
</div>

<div class="grid2">
  <div class="pane">
    <h3>the kitty · winner takes all</h3>
    <div class="jp-big" id="jpBig">—</div>
    <div class="jp-sub">one wallet wins it all · weekly draw · hold ≥500k $DARKCOIN to enter</div>
    <div class="jp-foot">
      9 real-human genesis wallets share a separate <b style="color:var(--gold)">founder pool</b> — 1% of every loss, forever, weighted by their stacked multiplier (2.00×–3.75×). snapshot closed. you had to be early.
    </div>
  </div>

  <div class="pane">
    <h3>last calls · live feed</h3>
    <div id="feedList"><div style="color:var(--fg-mute);font-size:11px;padding:18px 0;text-align:center">no calls yet. be first on the felt.</div></div>
  </div>
</div>

<div class="burn">
  <div class="l">incinerated · last 24 hours · forever off-chain</div>
  <div class="v" id="burnNum">—</div>
</div>

<div class="foot">
  the house never lies · every bet on-chain · every burn verifiable${TOKEN_LIVE ? ` on <a href="${TOKEN_SOLSCAN_URL}" target="_blank">solscan ↗</a>` : ' on solscan once the mint is live'}<br>
  ${TOKEN_LIVE
    ? `mint: <span class="pump">${TOKEN_MINT_ADDR}</span> · <a href="${TOKEN_PUMP_URL}" target="_blank">buy ${TOKEN_TICKER} on pump.fun ↗</a>`
    : `mint: <span class="pump">pending</span> · ${TOKEN_TICKER} hasn't minted yet — any address claiming to be it is a fake`}
</div>

</div>

<script src="https://unpkg.com/@solana/web3.js@1.95.0/lib/index.iife.min.js"></script>
<script>
(function(){
  const TOKEN_MINT = '${TOKEN_MINT_ADDR}';        // empty until darkcoin mints — on-chain paths guard on it
  const TOKEN_DECIMALS = ${TOKEN_DECIMALS};
  let arenaShadow = ${shadow ? 'true' : 'false'}; // server-injected; refreshed on every round poll
  const TOKEN_PROG = new solanaWeb3.PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
  const ASSOC_PROG = new solanaWeb3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  let wallet = null, conn = null, treasuryPk = null;
  let currentRound = null, myBetId = null, myBetStake = 0, myBetLocked = false;
  let lastSeenRoundId = null, lastCrashFlash = null;
  let animLastMult = 1.0;

  function fmt(n) {
    n = Number(n||0);
    if (n >= 1e9) return (n/1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(1) + 'k';
    return Math.round(n).toLocaleString();
  }
  function short(a) { return a.slice(0,4) + '..' + a.slice(-3); }
  function setMsg(msg, cls) {
    const el = document.getElementById('statusMsg');
    if (!msg) { el.className = 'msg'; el.textContent = ''; return; }
    el.className = 'msg show ' + (cls || '');
    el.textContent = msg;
  }

  // ─── WALLET ─────────────────────────────────────────────────────────
  async function loadWalletBalance() {
    if (!wallet || !TOKEN_MINT) return;
    try {
      const c = await getConn();
      const owner = new solanaWeb3.PublicKey(wallet);
      const mint = new solanaWeb3.PublicKey(TOKEN_MINT);
      const [ata] = solanaWeb3.PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROG.toBuffer(), mint.toBuffer()], ASSOC_PROG);
      const info = await c.getTokenAccountBalance(ata).catch(() => null);
      const bal = info?.value?.uiAmount || 0;
      const el = document.getElementById('wBal');
      el.innerHTML = 'bal: <b>' + fmt(bal) + '</b> $DARKCOIN';
      el.style.display = 'inline';
    } catch {}
  }

  async function connect() {
    if (!window.solana?.isPhantom) { setMsg('phantom required. no phantom, no play.', 'err'); window.open('https://phantom.com', '_blank'); return; }
    try {
      const r = await window.solana.connect();
      wallet = r.publicKey.toString();
      document.getElementById('wChip').textContent = short(wallet);
      document.getElementById('wChip').classList.add('ok');
      document.getElementById('wConnect').style.display = 'none';
      loadWalletBalance();
    } catch { setMsg('user declined.', 'err'); }
  }
  document.getElementById('wConnect').addEventListener('click', connect);
  (async () => {
    if (!window.solana?.isPhantom) return;
    try { const r = await window.solana.connect({ onlyIfTrusted: true });
      wallet = r.publicKey.toString();
      document.getElementById('wChip').textContent = short(wallet);
      document.getElementById('wChip').classList.add('ok');
      document.getElementById('wConnect').style.display = 'none';
      loadWalletBalance();
      checkFaucet();
    } catch {}
  })();

  // Quick bet shortcuts
  document.querySelectorAll('.quick').forEach(b => {
    b.addEventListener('click', () => { document.getElementById('stakeInput').value = b.dataset.amt; });
  });

  // Faucet — first-time wallets can claim free $DARKCOIN to try the felt without
  // going to pump.fun. Button only renders when the server says the faucet is
  // enabled AND this wallet hasn't claimed yet. Harmless no-op otherwise.
  async function checkFaucet() {
    if (!wallet) return;
    try {
      const r = await fetch('/api/faucet/status?wallet=' + encodeURIComponent(wallet));
      const d = await r.json();
      const btn = document.getElementById('faucetBtn');
      if (!btn) return;
      if (d.enabled && !d.already_claimed && d.message_to_sign) {
        btn.style.display = 'inline-block';
        btn.textContent = 'claim ' + Number(d.amount_styxx).toLocaleString() + ' free $DARKCOIN';
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            const msg = new TextEncoder().encode(d.message_to_sign);
            const signed = await window.solana.signMessage(msg, 'utf8');
            // Phantom returns { signature: Uint8Array, publicKey } — encode b58.
            const sigBytes = signed.signature || signed;
            const bs58 = window.solanaWeb3?.bs58 || null;
            // Fallback bs58 (Phantom returns array): encode via a tiny inline b58.
            const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
            function b58enc(bytes) {
              let n = 0n;
              for (const b of bytes) n = (n << 8n) | BigInt(b);
              let out = '';
              while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
              for (const b of bytes) { if (b === 0) out = '1' + out; else break; }
              return out;
            }
            const sigB58 = b58enc(sigBytes instanceof Uint8Array ? sigBytes : new Uint8Array(sigBytes));
            const claim = await fetch('/api/faucet/claim', {
              method: 'POST', headers: {'Content-Type':'application/json'},
              body: JSON.stringify({ wallet, signature_b58: sigB58, nonce: d.nonce }),
            }).then(r => r.json());
            if (claim.ok) {
              btn.textContent = '+ ' + Number(claim.amount).toLocaleString() + ' $DARKCOIN claimed';
              btn.classList.add('ok');
              setTimeout(() => { btn.style.display = 'none'; loadWalletBalance(); }, 2500);
            } else {
              btn.textContent = 'claim failed · ' + (claim.error || 'unknown');
              btn.disabled = false;
            }
          } catch (e) {
            btn.textContent = 'claim failed · ' + (e.message || 'cancelled');
            btn.disabled = false;
          }
        };
      } else {
        btn.style.display = 'none';
      }
    } catch {}
  }

  // Backend proxy first — uses the server's SOLANA_RPC_URL (Helius/paid) and
  // rotates public fallbacks server-side. Public endpoints stay as last-resort
  // in case the backend proxy itself is down. Without the proxy, browsers hit
  // 403/429 on mainnet-beta and all public RPCs within minutes.
  const RPC_ENDPOINTS = [
    window.location.origin + '/api/arena/rpc',
    'https://solana-rpc.publicnode.com',
    'https://rpc.ankr.com/solana',
    'https://solana.api.onfinality.io/public',
    'https://api.mainnet-beta.solana.com',
  ];
  async function getConn() {
    if (conn) return conn;
    for (const url of RPC_ENDPOINTS) {
      try {
        const c = new solanaWeb3.Connection(url, 'confirmed');
        await c.getLatestBlockhash();
        conn = c;
        return c;
      } catch (e) {
        console.warn('rpc failed:', url, e.message);
      }
    }
    throw new Error('no working solana rpc — all endpoints rate-limited');
  }

  async function payStake(amount) {
    if (!wallet) throw new Error('connect first');
    if (!TOKEN_MINT) throw new Error('mint pending — on-chain bets disabled');
    const c = await getConn();
    // Guard treasury pubkey fetch — if /api/treasury/pubkey 500s, a raw fetch
    // would leave treasuryPk undefined and crash the next PublicKey(...) call
    // with a cryptic TypeError. Fail loud instead.
    if (!treasuryPk) {
      try {
        const r = await fetch('/api/treasury/pubkey');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        treasuryPk = (await r.json()).pubkey;
        if (!treasuryPk) throw new Error('no pubkey field');
      } catch (e) {
        throw new Error('treasury unavailable · ' + e.message);
      }
    }
    const payer = new solanaWeb3.PublicKey(wallet);
    // SOL pre-check — a pure Token-2022 transferChecked costs ~5000 lamports.
    // Users with zero SOL would otherwise sign + broadcast a guaranteed failure
    // and get a cryptic on-chain error. 10000 lamports = comfortable margin.
    try {
      const solBal = await c.getBalance(payer);
      if (solBal < 10000) {
        throw new Error('need ~0.00001 SOL for tx fee · you have ' + (solBal / 1e9).toFixed(6) + ' SOL');
      }
    } catch (e) {
      // Only throw if it was our own balance-check error; swallow RPC read failures
      if (e.message && e.message.startsWith('need ~0.00001 SOL')) throw e;
    }
    const treasury = new solanaWeb3.PublicKey(treasuryPk);
    const mint = new solanaWeb3.PublicKey(TOKEN_MINT);
    const [payerATA] = solanaWeb3.PublicKey.findProgramAddressSync([payer.toBuffer(), TOKEN_PROG.toBuffer(), mint.toBuffer()], ASSOC_PROG);
    const [treasuryATA] = solanaWeb3.PublicKey.findProgramAddressSync([treasury.toBuffer(), TOKEN_PROG.toBuffer(), mint.toBuffer()], ASSOC_PROG);
    const decimals = TOKEN_DECIMALS;
    const baseAmount = BigInt(Math.floor(amount * Math.pow(10, decimals)));
    const data = new Uint8Array(10);
    data[0] = 12;
    new DataView(data.buffer).setBigUint64(1, baseAmount, true);
    data[9] = decimals;
    const ix = new solanaWeb3.TransactionInstruction({
      programId: TOKEN_PROG,
      keys: [
        { pubkey: payerATA, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: treasuryATA, isSigner: false, isWritable: true },
        { pubkey: payer, isSigner: true, isWritable: false },
      ],
      data,
    });
    const tx = new solanaWeb3.Transaction().add(ix);
    tx.feePayer = payer;
    const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    const signed = await window.solana.signAndSendTransaction(tx);
    // Blockhash strategy = HTTP polling. Proxy doesn't speak WS. If polling
    // times out we STILL have the signature from Phantom — server-side
    // /api/arena/bet verifies the tx on-chain itself (with retry for indexer
    // lag), and placeBet is idempotent on duplicate payment_tx. So we return
    // confirmed:false and let the bet flow try anyway.
    try {
      await c.confirmTransaction({
        signature: signed.signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      return { signature: signed.signature, confirmed: true };
    } catch (e) {
      console.warn('[arena] confirmTransaction failed, deferring to server verify:', e.message);
      return { signature: signed.signature, confirmed: false };
    }
  }

  document.getElementById('buyinBtn').addEventListener('click', async () => {
    if (!wallet) { setMsg('connect wallet first.', 'err'); return; }
    if (!currentRound || currentRound.status !== 'betting') { setMsg('window closed. wait for next round.', 'err'); return; }
    const amt = Number(document.getElementById('stakeInput').value || 0);
    if (amt < 100000) { setMsg('min buy-in: 100,000 $DARKCOIN.', 'err'); return; }
    if (amt > 500000) { setMsg('max bet: 500,000 $DARKCOIN. (safety cap while treasury builds)', 'err'); return; }
    let result = null;
    if (arenaShadow) {
      // shadow mode — the house is rehearsing. NEVER touch Phantom here: a
      // real transfer against a paper house means real tokens for paper
      // payouts. The bet goes to the API only, with no payment_tx.
      setMsg('shadow mode — paper bet, nothing moves on-chain', 'ok');
    } else {
      setMsg('signing... sending ' + fmt(amt) + ' $DARKCOIN to the house', 'ok');
      // 60s wall-clock timeout — if Phantom popup is missed or RPC hangs, the
      // message used to stay at 'signing...' forever. Now the user gets a clear
      // out.
      try {
        result = await Promise.race([
          payStake(amt),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timed out — check phantom popup, then try again')), 60000)),
        ]);
      }
      catch (e) { setMsg('sign failed: ' + (e.message||'cancelled'), 'err'); return; }
      setMsg(result.confirmed ? 'paid. chip on the felt.' : 'tx broadcast · house verifying...', 'ok');
    }
    const r = await fetch('/api/arena/bet', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ round_id: currentRound.id, user_wallet: wallet, stake_styxx: amt, payment_tx: result ? result.signature : null }),
    });
    const d = await r.json();
    if (!d.ok) {
      // tx_invalid often means the server hit the indexer before it caught up.
      // Tell the user their tx is real + give them the signature so they can
      // verify on Solscan instead of thinking their tokens vanished.
      if (result && (d.error === 'tx_invalid' || d.error === 'insufficient_payment')) {
        setMsg('house couldn\u2019t verify tx yet · sig ' + result.signature.slice(0,8) + '\u2026 · try again in a few seconds', 'err');
      } else {
        setMsg('house rejected: ' + d.error, 'err');
      }
      return;
    }
    myBetId = d.bet_id; myBetStake = amt; myBetLocked = false;
    setMsg((d.idempotent ? 'recovered · ' : '') + (arenaShadow ? 'paper bet in for ' : 'in for ') + fmt(amt) + '. ride it or rug.', 'ok');
  });

  document.getElementById('cashoutBtn').addEventListener('click', async () => {
    if (!myBetId || myBetLocked) return;
    const r = await fetch('/api/arena/cashout', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ bet_id: myBetId, user_wallet: wallet }),
    });
    const d = await r.json();
    if (!d.ok) { setMsg('too late: ' + d.error, 'err'); return; }
    myBetLocked = true;
    const b = document.getElementById('cashoutBtn');
    b.disabled = true;
    b.innerHTML = '<span class="big">LOCKED @ ' + Number(d.multiplier).toFixed(2) + '×</span><span class="sub">+ ' + fmt(myBetStake * d.multiplier) + ' $DARKCOIN pending</span>';
    setMsg('locked ' + Number(d.multiplier).toFixed(2) + '× · payout ' + fmt(myBetStake * d.multiplier) + ' $DARKCOIN', 'ok');
  });

  // ─── GRAPH ──────────────────────────────────────────────────────────
  const W = 1000, H = 280, PAD_L = 30, PAD_R = 20, PAD_T = 20, PAD_B = 28;
  function mapY(mult, peak) {
    // log scale from 1 to peak
    const lo = Math.log(1), hi = Math.log(Math.max(peak, 2.1));
    const logM = Math.log(Math.max(1, mult));
    const frac = (logM - lo) / (hi - lo);
    return PAD_T + (1 - frac) * (H - PAD_T - PAD_B);
  }
  function mapX(t, tMax) {
    return PAD_L + (t / Math.max(tMax, 1)) * (W - PAD_L - PAD_R);
  }

  function drawGridLines(peak) {
    const g = document.getElementById('graphGrid');
    const marks = [];
    const peakVal = Math.max(peak, 2.1);
    // pick sensible grid values
    if (peakVal < 3) marks.push(1.25, 1.5, 2, 2.5);
    else if (peakVal < 10) marks.push(1.5, 2, 3, 5, 7);
    else if (peakVal < 50) marks.push(2, 5, 10, 20, 30);
    else if (peakVal < 200) marks.push(2, 5, 10, 25, 50, 100);
    else marks.push(2, 10, 25, 50, 100, 250, 500);
    let html = '';
    for (const m of marks) {
      if (m > peakVal) continue;
      const y = mapY(m, peakVal);
      html += '<line class="graph-grid-line" x1="' + PAD_L + '" y1="' + y + '" x2="' + (W-PAD_R) + '" y2="' + y + '"/>';
      html += '<text class="graph-grid-text" x="4" y="' + (y+3) + '">' + m + 'x</text>';
    }
    // baseline
    html += '<line class="graph-grid-line" x1="' + PAD_L + '" y1="' + (H-PAD_B) + '" x2="' + (W-PAD_R) + '" y2="' + (H-PAD_B) + '" stroke="#1f2429" stroke-dasharray="0"/>';
    g.innerHTML = html;
  }

  function redrawGraph(curve, elapsedMs, peak, crashed) {
    if (!curve || curve.length === 0) {
      document.getElementById('graphPath').setAttribute('d', '');
      document.getElementById('graphFill').setAttribute('d', '');
      drawGridLines(2);
      return;
    }
    const tMax = curve[curve.length-1][0];
    const peakMult = peak || curve[curve.length-1][1];
    drawGridLines(peakMult);

    // Interpolate curve up to elapsedMs
    let pts = [];
    const capMs = Math.min(elapsedMs, tMax);
    pts.push([0, 1.0]);
    for (let i = 0; i < curve.length; i++) {
      const [t, m] = curve[i];
      if (t <= capMs) {
        pts.push([t, m]);
      } else {
        // Interpolate between previous and this point
        const prev = i > 0 ? curve[i-1] : [0, 1.0];
        const frac = (capMs - prev[0]) / (t - prev[0]);
        const interpM = prev[1] + frac * (m - prev[1]);
        pts.push([capMs, interpM]);
        break;
      }
    }
    if (pts.length === 1) pts.push([capMs, 1.0]);

    let d = '';
    pts.forEach((p, i) => {
      const x = mapX(p[0], tMax);
      const y = mapY(p[1], peakMult);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    });
    const path = document.getElementById('graphPath');
    path.setAttribute('d', d);
    path.classList.toggle('crashed', !!crashed);

    // Fill area
    const lastPt = pts[pts.length-1];
    const lastX = mapX(lastPt[0], tMax);
    const fillD = d + 'L' + lastX.toFixed(1) + ',' + (H-PAD_B) + ' L' + PAD_L + ',' + (H-PAD_B) + ' Z';
    const fill = document.getElementById('graphFill');
    fill.setAttribute('d', fillD);
    fill.classList.toggle('crashed', !!crashed);
    fill.setAttribute('fill', crashed ? 'url(#graph-gradient-red)' : 'url(#graph-gradient)');

    return lastPt[1];
  }

  // ─── ANIMATION LOOP (60fps) ─────────────────────────────────────────
  let animTimer = null;
  function startAnimation() {
    if (animTimer) return;
    animTimer = requestAnimationFrame(tickAnim);
  }
  function tickAnim() {
    animTimer = null;
    if (currentRound && currentRound.status === 'running' && currentRound.multiplier_curve) {
      const elapsed = (currentRound.elapsed_ms || 0) + (Date.now() - currentRound._seenAt);
      const peak = currentRound.multiplier_curve[currentRound.multiplier_curve.length-1][1];
      const currMult = redrawGraph(currentRound.multiplier_curve, elapsed, peak, false);
      if (currMult != null) {
        animLastMult = currMult;
        document.getElementById('multiplier').textContent = currMult.toFixed(2) + '×';
        // update cashout projected payout
        if (myBetId && !myBetLocked && myBetStake > 0) {
          const b = document.getElementById('cashoutBtn');
          b.disabled = false;
          b.innerHTML = '<span class="big">CASH OUT @ ' + currMult.toFixed(2) + '×</span><span class="sub">+' + fmt(myBetStake * currMult) + ' $DARKCOIN if you lock now</span>';
        }
      }
    } else if (currentRound && currentRound.status === 'betting' && currentRound.betting_window_ends_at) {
      // Cache the window length at round start so the progress bar fills
      // correctly regardless of the server's configured window (was hardcoded
      // 15s, which ticked 2× too fast after the window was bumped to 30s).
      const endMs = new Date(currentRound.betting_window_ends_at).getTime();
      if (!currentRound._windowTotal) {
        currentRound._windowTotal = Math.max(1000, endMs - Date.now());
      }
      const remain = endMs - Date.now();
      const pct = Math.max(0, Math.min(100, 100 * remain / currentRound._windowTotal));
      document.getElementById('countBar').style.width = pct + '%';
      const secs = Math.max(0, Math.ceil(remain / 1000));
      document.getElementById('multLabel').textContent = 'BETTING · ' + secs + 's to place';
    }
    animTimer = requestAnimationFrame(tickAnim);
  }

  // ─── TYPEWRITER for sentences ───────────────────────────────────────
  function typeSentence(el, text, durMs) {
    el.classList.add('typing');
    const chars = text.split('');
    const step = Math.max(8, durMs / chars.length);
    let i = 0;
    const t = setInterval(() => {
      i++;
      el.textContent = text.slice(0, i);
      if (i >= chars.length) { clearInterval(t); el.classList.remove('typing'); }
    }, step);
    return t;
  }

  let renderedSentences = -1;
  function renderSentences(sentences, elapsedMs, crashIdx, forceAll) {
    if (!sentences) return;
    const list = document.getElementById('sentList');
    // determine how many should be visible
    let visibleCount = 0;
    for (let i = 0; i < sentences.length; i++) {
      if ((sentences[i].elapsed_ms || 0) <= elapsedMs + 400 || forceAll) visibleCount++;
    }
    if (visibleCount <= renderedSentences && !forceAll) return;
    // add missing
    for (let i = renderedSentences + 1; i < visibleCount; i++) {
      const s = sentences[i];
      const row = document.createElement('div');
      const isCrash = (crashIdx === i && forceAll);
      row.className = 'sent' + (isCrash ? ' crashed' : '');
      const pct = Math.round((s.depth_score || 0) * 100);
      const dCls = pct >= 70 ? 'hi' : (pct < 30 ? 'lo' : '');
      row.innerHTML = '<div class="txt" data-i="' + i + '"></div>' +
        '<div class="depth">depth ' + pct + '<div class="bar"><div class="fill ' + dCls + '" style="width:' + pct + '%"></div></div></div>';
      list.appendChild(row);
      const txtEl = row.querySelector('.txt');
      typeSentence(txtEl, s.text, 1200);
    }
    renderedSentences = visibleCount - 1;
  }

  // ─── POLLING ─────────────────────────────────────────────────────────
  async function poll() {
    try {
      const [roundR, jpR, histR] = await Promise.all([
        fetch('/api/arena/round').then(r=>r.json()),
        fetch('/api/arena/jackpot').then(r=>r.json()),
        fetch('/api/arena/history?limit=30').then(r=>r.json()),
      ]);
      // Shadow flag rides on every round poll — a page loaded before an admin
      // flipped arena_shadow_mode must not keep signing real transfers.
      if (roundR && typeof roundR.arena_shadow === 'boolean') {
        arenaShadow = roundR.arena_shadow;
        const sb = document.getElementById('shadowBadge');
        if (sb) sb.style.display = arenaShadow ? 'block' : 'none';
      }
      if (roundR && roundR.id) {
        roundR._seenAt = Date.now();
        // detect new round
        if (!currentRound || currentRound.id !== roundR.id) {
          renderedSentences = -1;
          document.getElementById('sentList').innerHTML = '';
          document.getElementById('rugStamp').classList.remove('on');
          document.getElementById('graphWrap').classList.remove('crashed');
          document.getElementById('gameBox').classList.remove('crashed');
          document.getElementById('multiplier').classList.remove('crashed');
        }
        currentRound = roundR;
      }
      // Pause banner — tell users when the arena isn't running so they don't
      // stare at "waiting for next round" wondering if the site is broken.
      const pausedBanner = document.getElementById('pausedBanner');
      if (pausedBanner) {
        if (roundR && roundR.status === 'paused') {
          pausedBanner.style.display = 'block';
          document.getElementById('betForm').style.display = 'none';
          document.getElementById('multLabel').textContent = 'arena paused';
        } else {
          pausedBanner.style.display = 'none';
        }
      }
      renderRound(currentRound);
      renderStats(jpR);
      renderFeed(jpR.recent_results || []);
      renderTicker(jpR.recent_results || [], jpR.big_win_24h, histR.rounds || []);
      renderBigWin(jpR.big_win_24h);
      renderHistory(histR.rounds || []);
    } catch (e) { console.warn('poll err', e); }
  }

  function renderStats(jp) {
    document.getElementById('sPubJp').textContent = fmt(jp.public_jackpot_styxx);
    document.getElementById('sFoundJp').textContent = fmt(jp.founder_jackpot_styxx);
    document.getElementById('sBurn').textContent = fmt(jp.burn_24h);
    document.getElementById('sVol').textContent = fmt(jp.volume_24h);
    document.getElementById('sPlayers').textContent = jp.players_24h || 0;
    document.getElementById('jpBig').textContent = fmt(jp.public_jackpot_styxx) + ' $DARKCOIN';
    document.getElementById('burnNum').textContent = fmt(jp.burn_24h);
  }

  function renderBigWin(big) {
    const box = document.getElementById('bigWinBox');
    if (!big || !big.user_wallet) { box.style.display = 'none'; return; }
    box.style.display = 'flex';
    document.getElementById('bigWinBody').innerHTML = short(big.user_wallet) + ' cashed <span class="mx">' + Number(big.cashout_multiplier||0).toFixed(2) + '×</span> on <b>' + big.agent_id + '</b> for <span class="mx">+' + fmt(big.payout_styxx) + ' $DARKCOIN</span>';
  }

  let _lastTickerSig = '';
  function renderTicker(recent, big, historyRounds) {
    const items = [];
    if (big && big.user_wallet) {
      items.push('<span class="item big">★ BIGGEST 24H · ' + short(big.user_wallet) + ' cashed ' + Number(big.cashout_multiplier||0).toFixed(2) + '× · +' + fmt(big.payout_styxx) + ' $DARKCOIN</span>');
    }
    for (const r of recent) {
      const won = r.status === 'cashed_out';
      if (won) {
        items.push('<span class="item"><span class="win">✓ ' + short(r.user_wallet) + ' cashed ' + Number(r.cashout_multiplier||0).toFixed(2) + '×</span> on <b>' + r.agent_id + '</b> +' + fmt(r.payout_styxx) + '</span>');
      } else {
        items.push('<span class="item"><span class="lose">✗ ' + short(r.user_wallet) + ' rugged</span> on <b>' + r.agent_id + '</b> −' + fmt(r.stake_styxx) + '</span>');
      }
    }
    // Fallback: show recent round results so the ticker is never empty
    if (items.length < 6 && historyRounds && historyRounds.length) {
      for (const r of historyRounds.slice(0, 15)) {
        const m = Number(r.multiplier || 1);
        const cls = m >= 50 ? 'big' : (m >= 10 ? 'win' : 'bet');
        items.push('<span class="item"><span class="' + cls + '">' + r.agent_id + '</span> crashed @ <b>' + m.toFixed(2) + '×</b></span>');
      }
    }
    if (!items.length) {
      items.push('<span class="item">waiting for first call on the felt...</span>');
    }
    const sig = items.length + '|' + items[0].slice(0, 40);
    if (sig === _lastTickerSig) return;
    _lastTickerSig = sig;
    // duplicate track for infinite scroll
    document.getElementById('tickerTrack').innerHTML = items.join('') + items.join('');
  }

  function renderFeed(list) {
    const el = document.getElementById('feedList');
    if (!list.length) return;
    el.innerHTML = list.slice(0, 10).map(r => {
      const won = r.status === 'cashed_out';
      const amt = won ? ('+' + fmt(r.payout_styxx)) : ('−' + fmt(r.stake_styxx));
      const m = r.cashout_multiplier ? Number(r.cashout_multiplier).toFixed(2) + '×' : 'RUG';
      return '<div class="feed-row ' + (won?'w':'l') + '"><span><span class="a">' + r.agent_id + '</span> · ' + short(r.user_wallet) + '</span><span class="m">' + m + '</span><span class="amt">' + amt + '</span></div>';
    }).join('');
  }

  function renderHistory(rounds) {
    if (!rounds || !rounds.length) return;
    const el = document.getElementById('histGrid');
    const ordered = rounds.slice().reverse(); // oldest → newest L→R
    const maxM = Math.max(...ordered.map(r => r.multiplier), 2);
    const html = ordered.map(r => {
      const m = Number(r.multiplier || 1);
      let cls = 'lv1';
      if (m >= 50) cls = 'lv5';
      else if (m >= 10) cls = 'lv4';
      else if (m >= 3) cls = 'lv3';
      else if (m >= 1.5) cls = 'lv2';
      const h = Math.max(16, Math.min(52, 16 + (Math.log(m) / Math.log(Math.max(maxM, 3))) * 36));
      return '<div class="hist-bar ' + cls + '" style="height:' + h + 'px" title="round #' + r.id + ' · ' + r.agent_id + ' · ' + m.toFixed(2) + '×">' + (m >= 10 ? m.toFixed(0) + 'x' : m.toFixed(1)) + '</div>';
    }).join('');
    el.innerHTML = html;
    el.scrollLeft = el.scrollWidth;
  }

  function renderRound(r) {
    if (!r || !r.id) return;
    document.getElementById('roundNo').textContent = '#' + r.id.toString().padStart(4, '0');
    document.getElementById('sRound').textContent = '#' + r.id.toString().padStart(4, '0');
    document.getElementById('agentName').textContent = r.agent_id || '—';
    document.getElementById('agentDistrict').textContent = r.district || 'unassigned';
    document.getElementById('agentRank').textContent = r.rank || 'citizen';
    document.getElementById('prompt').textContent = r.prompt || '—';
    document.getElementById('potAmt').textContent = fmt(r.pot_styxx || 0);
    document.getElementById('potBets').textContent = r.bets_count || 0;
    document.getElementById('roundMeta').textContent = r.status;

    const chip = document.getElementById('statusChip');
    chip.textContent = r.status;
    chip.className = 'chip ' + r.status;

    const betForm = document.getElementById('betForm');
    const cashBtn = document.getElementById('cashoutBtn');

    if (r.status === 'betting') {
      betForm.style.display = 'grid';
      cashBtn.disabled = true;
      const lastCrash = window._lastCrashMult ? ('prev crashed @ ' + window._lastCrashMult.toFixed(2) + '× · ') : '';
      cashBtn.innerHTML = '<span class="big">PLACE YOUR BET</span><span class="sub">' + lastCrash + 'betting window open</span>';
      document.getElementById('multiplier').textContent = '1.00×';
      document.getElementById('multiplier').classList.remove('crashed');
      document.getElementById('multLabel').classList.remove('crashed');
      // clear sentence list
      if (renderedSentences !== -1) { document.getElementById('sentList').innerHTML = ''; renderedSentences = -1; }
      redrawGraph([[0, 1.0]], 0, 2, false);
      startAnimation();
    } else if (r.status === 'running') {
      betForm.style.display = 'none';
      document.getElementById('countBar').style.width = '0%';
      document.getElementById('multLabel').textContent = 'live · agent reasoning';
      if (r.sentences && r.elapsed_ms != null) {
        renderSentences(r.sentences, r.elapsed_ms, r.crash_at_sentence, false);
      }
      // Cashout state when user didn't bet this round — stop nagging "place a bet first"
      if (!myBetId) {
        cashBtn.disabled = true;
        cashBtn.innerHTML = '<span class="big">WATCHING</span><span class="sub">missed this one · next window in ~60s</span>';
      }
      startAnimation();
    } else if (r.status === 'resolving' || r.status === 'resolved') {
      betForm.style.display = 'none';
      const m = r.crash_multiplier || 1;
      window._lastCrashMult = Number(m);
      document.getElementById('multiplier').textContent = Number(m).toFixed(2) + '×';

      // Crash effects (only fire once per round)
      if (lastCrashFlash !== r.id) {
        lastCrashFlash = r.id;
        document.getElementById('multiplier').classList.add('crashed');
        document.getElementById('multLabel').classList.add('crashed');
        document.getElementById('multLabel').textContent = 'RUGGED @ ' + Number(m).toFixed(2) + '×';
        document.getElementById('rugStamp').classList.add('on');
        document.getElementById('graphWrap').classList.add('crashed');
        document.getElementById('gameBox').classList.add('crashed');
        const flash = document.getElementById('flash');
        flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
        if (r.sentences) renderSentences(r.sentences, 1e9, r.crash_at_sentence, true);
        if (r.multiplier_curve) redrawGraph(r.multiplier_curve, 1e9, m, true);
        cashBtn.disabled = true;
        if (myBetId && !myBetLocked) {
          cashBtn.innerHTML = '<span class="big">RUGGED</span><span class="sub">lost ' + fmt(myBetStake) + ' $DARKCOIN · 94% burns</span>';
        } else if (!myBetLocked) {
          cashBtn.innerHTML = '<span class="big">CRASHED</span><span class="sub">next round loading...</span>';
        }
      }

      setTimeout(() => {
        if (currentRound && currentRound.id === r.id) {
          myBetId = null; myBetStake = 0; myBetLocked = false;
        }
      }, 3000);
    }
  }

  poll();
  setInterval(poll, 900);
  startAnimation();
})();
</script>
</body>
</html>`;

function installArenaUI(app, pool) {
  // Fail-safe shadow read: if the db can't answer, assume shadow (paper bets).
  // Never let a client build a real transfer against a house that might be
  // paper. No mint minted = nothing real can move, so force shadow too.
  async function readShadowFlag() {
    let shadow = true;
    try {
      const { rows } = await pool.query(
        "SELECT value FROM economy_params WHERE key = 'arena_shadow_mode'"
      );
      shadow = String(rows[0]?.value ?? 'true').toLowerCase() === 'true';
    } catch (e) {
      console.warn('[arena-ui] shadow flag read failed, defaulting to shadow:', e.message);
    }
    if (!TOKEN_LIVE) shadow = true;
    return shadow;
  }

  app.get('/arena', async (req, res) => {
    res.type('html').send(renderPage({ shadow: await readShadowFlag() }));
  });

  // Public status aggregator. Returns treasury + arena + chat state in one
  // call so every page can honestly signal degraded states to clients
  // without leaking admin-sensitive params. Safe to poll from the browser.
  app.get('/api/status', async (req, res) => {
    try {
      const [params, treasury, recentChatFails] = await Promise.all([
        pool.query("SELECT key, value FROM economy_params WHERE key IN ('arena_enabled','arena_shadow_mode','chat_enforce_payment')"),
        (async () => { try { return await require('../lib/solana-darkcoin').getTreasuryBalances(); } catch { return null; } })(),
        pool.query("SELECT COUNT(*)::int n FROM chat_messages WHERE status = 'failed' AND created_at > NOW() - INTERVAL '2 minutes'").catch(() => ({ rows: [{ n: 0 }] })),
      ]);
      const p = Object.fromEntries(params.rows.map(r => [r.key, r.value]));
      const treasuryDarkcoin = treasury ? Math.floor(treasury.styxx) : null;
      const arenaRunning = String(p.arena_enabled || 'false').toLowerCase() === 'true';
      const chatFree = String(p.chat_enforce_payment || 'true').toLowerCase() !== 'true';
      const llmDown = (recentChatFails.rows[0]?.n || 0) >= 3;
      res.json({
        ts: new Date().toISOString(),
        treasury_styxx: treasuryDarkcoin,
        treasury_solscan: 'https://solscan.io/account/' + (treasury?.pubkey || '99nzRdkRvZbB9yQgbfxVeLWu4SyvZNAGWhRPzSeL3tMp'),
        arena: {
          live: arenaRunning,
          // fail-safe default is TRUE — same as arena-crash. Reporting 'not
          // shadow' when the flag is unset would tell clients real money moves.
          shadow: !TOKEN_LIVE || String(p.arena_shadow_mode || 'true').toLowerCase() === 'true',
          status: !arenaRunning ? 'paused' : 'live',
        },
        chat: {
          paid: !chatFree,
          llm_healthy: !llmDown,
          status: llmDown ? 'llm_offline' : (chatFree ? 'free' : 'paid'),
        },
        pump_fun_url: TOKEN_PUMP_URL || null,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/arena/round', async (req, res) => {
    try {
      // arena_shadow rides on every poll so already-open pages track admin
      // flips instead of trusting the value baked in at page load.
      const shadow = await readShadowFlag();
      const round = await arena.getCurrentRound(pool);
      if (round) return res.json({ ...round, arena_shadow: shadow });
      // No live round — include pause state so the client can differentiate
      // "between rounds" (arena_enabled=true but nothing active) vs
      // "arena paused" (arena_enabled=false) and render the right UI.
      const { rows } = await pool.query(
        "SELECT value FROM economy_params WHERE key = 'arena_enabled'"
      );
      const enabled = String(rows[0]?.value || 'false').toLowerCase() === 'true';
      res.json({ status: enabled ? 'idle' : 'paused', arena_shadow: shadow });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/arena/jackpot', async (req, res) => {
    try { res.json(await arena.getJackpotStatus(pool)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/arena/history', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 30, 100);
      const rounds = await arena.getRoundHistory(pool, limit);
      res.json({ rounds });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/arena/bet', async (req, res) => {
    try {
      const r = await arena.placeBet(pool, req.body || {});
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/arena/cashout', async (req, res) => {
    try {
      const r = await arena.cashOut(pool, req.body || {});
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Solana RPC proxy. Browsers hit 403/429 on public endpoints within minutes —
  // server-side, one paid SOLANA_RPC_URL (Helius/QuickNode) + public fallbacks
  // absorb the load. Whitelist to read-only + send/simulate so this isn't an
  // open proxy for arbitrary Solana traffic.
  const RPC_ALLOWED_METHODS = new Set([
    'getLatestBlockhash', 'getRecentBlockhash', 'getBlockHeight', 'getSlot',
    'getBalance', 'getAccountInfo', 'getMultipleAccounts',
    'getTokenAccountBalance', 'getTokenAccountsByOwner',
    'getSignatureStatus', 'getSignatureStatuses', 'getTransaction',
    'sendTransaction', 'simulateTransaction',
    'getMinimumBalanceForRentExemption', 'getFeeForMessage',
  ]);
  const RPC_PROXY_UPSTREAMS = [
    process.env.SOLANA_RPC_URL,
    'https://solana-rpc.publicnode.com',
    'https://rpc.ankr.com/solana',
    'https://solana.api.onfinality.io/public',
    'https://api.mainnet-beta.solana.com',
  ].filter(Boolean);
  async function proxyRpcOne(body) {
    let lastErr = null;
    for (const url of RPC_PROXY_UPSTREAMS) {
      // 8s timeout per upstream — node's global fetch has no default, a hung
      // RPC would otherwise stall the client's confirmTransaction poll loop.
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 8000);
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctl.signal,
        });
        if (!r.ok) { lastErr = `${url}: HTTP ${r.status}`; continue; }
        const json = await r.json();
        const errStr = json.error ? JSON.stringify(json.error) : '';
        if (errStr && /429|rate.?limit|too many|forbidden/i.test(errStr)) {
          lastErr = `${url}: ${errStr}`;
          continue;
        }
        return json;
      } catch (e) {
        lastErr = `${url}: ${e.name === 'AbortError' ? 'timeout' : e.message}`;
      } finally {
        clearTimeout(to);
      }
    }
    console.warn('[arena-rpc] all upstreams failed for method=' + (Array.isArray(body) ? body.map(p=>p.method).join(',') : body.method) + ' · ' + lastErr);
    throw new Error(lastErr || 'all upstream rpcs failed');
  }
  app.post('/api/arena/rpc', async (req, res) => {
    const body = req.body;
    const payloads = Array.isArray(body) ? body : [body];
    if (!payloads.length || !payloads.every(p => p && typeof p.method === 'string')) {
      return res.status(400).json({ error: 'invalid jsonrpc payload' });
    }
    for (const p of payloads) {
      if (!RPC_ALLOWED_METHODS.has(p.method)) {
        return res.status(403).json({ error: 'method not allowed: ' + p.method });
      }
    }
    try {
      const result = await proxyRpcOne(body);
      res.json(result);
    } catch (e) {
      res.status(502).json({ error: 'rpc upstream failed', detail: e.message });
    }
  });

  // Admin kill-switch — flip any economy_params flag from a single endpoint.
  // ADMIN_TOKEN header required. Use to pause arena (arena_enabled=false),
  // flip to shadow mode (arena_shadow_mode=true), or disable chat payment
  // enforcement (chat_enforce_payment=false) without SSHing into the db.
  app.post('/api/admin/flag', async (req, res) => {
    if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const { key, value } = req.body || {};
    if (!key || typeof key !== 'string' || value == null) {
      return res.status(400).json({ error: 'need {key, value}' });
    }
    // Whitelist keys — don't let this turn into a SQL injection vector or a
    // way to rewrite critical params like treasury addresses.
    const ALLOWED = new Set([
      'arena_enabled', 'arena_shadow_mode', 'arena_min_bet_styxx', 'arena_max_bet_styxx',
      'arena_betting_window_secs', 'arena_payout_cap_bps',
      'chat_enforce_payment', 'chat_price_styxx', 'chat_free_messages_per_wallet_per_day',
      'faucet_enabled', 'faucet_amount_styxx', 'faucet_daily_cap_styxx', 'faucet_treasury_floor',
    ]);
    if (!ALLOWED.has(key)) return res.status(403).json({ error: 'key not in admin whitelist', allowed: [...ALLOWED] });
    try {
      const { rows } = await pool.query(
        `INSERT INTO economy_params (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
         RETURNING key, value`,
        [key, String(value)]
      );
      console.log('[admin] flag set:', key, '=', value);
      res.json({ ok: true, updated: rows[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get('/api/admin/status', async (req, res) => {
    if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    try {
      const [params, bets, chats, treasury] = await Promise.all([
        pool.query("SELECT key, value FROM economy_params WHERE key LIKE 'arena_%' OR key LIKE 'chat_%' ORDER BY key"),
        pool.query("SELECT status, COUNT(*)::int AS n FROM arena_bets WHERE placed_at > NOW() - INTERVAL '1 hour' GROUP BY status"),
        pool.query("SELECT status, COUNT(*)::int AS n FROM chat_messages WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY status"),
        (async () => { try { return await require('../lib/solana-darkcoin').getTreasuryBalances(); } catch { return null; } })(),
      ]);
      res.json({
        params: Object.fromEntries(params.rows.map(r => [r.key, r.value])),
        last_1h: {
          arena_bets: Object.fromEntries(bets.rows.map(r => [r.status, r.n])),
          chat_messages: Object.fromEntries(chats.rows.map(r => [r.status, r.n])),
        },
        treasury: treasury ? { styxx: Math.floor(treasury.styxx), sol: Number(treasury.sol.toFixed(4)) } : null,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('[arena-ui] registered: /arena, /api/arena/{round,jackpot,history,bet,cashout,rpc}, /api/admin/{flag,status}');
}

module.exports = { installArenaUI };
