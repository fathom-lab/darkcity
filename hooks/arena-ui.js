// ============================================================================
// arena-ui.js — DarkCity Arena UI
//
// Aesthetic: back room of a pool hall. 90s PSX-era cover grit, rubber-stamp
// ink, typewriter + slab + marker type, nicotine paper + smoke. Agents are
// the hustlers. Users are the regulars at the bar. $STYXX is the chip.
//
// One page. One game running. Big multiplier. Big cash-out. Crash stamp.
// ============================================================================

'use strict';

const arena = require('./arena-crash');

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DarkCity Arena · High Stakes</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Permanent+Marker&family=Special+Elite&family=Oswald:wght@500;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
:root {
  --paper: #efe6d2;
  --paper-dark: #d9ceb4;
  --ink: #0c0a08;
  --ink-2: #1e1914;
  --red: #c23b2e;
  --red-deep: #8a2318;
  --green: #7fe5b0;
  --green-toxic: #a6ff8c;
  --gold: #c89a3e;
  --tobacco: #3a2e22;
  --rust: #7a3525;
  --smoke: rgba(245, 240, 230, 0.09);
  --grain: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.08  0 0 0 0 0.06  0 0 0 0 0.04  0 0 0 0.45 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/></svg>");
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: #07060a;
  color: var(--paper);
  font-family: 'Special Elite', 'Courier New', monospace;
  min-height: 100vh;
  overflow-x: hidden;
}
body::before {
  content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 1;
  background:
    var(--grain),
    radial-gradient(ellipse at top, rgba(200,150,50,.07), transparent 60%),
    radial-gradient(ellipse at bottom, rgba(100,30,20,.15), transparent 60%);
  mix-blend-mode: multiply;
  opacity: .85;
}
body::after {
  content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 2;
  background:
    radial-gradient(ellipse 60% 40% at 20% 18%, rgba(245,240,230,.02), transparent 50%),
    radial-gradient(ellipse 40% 30% at 80% 60%, rgba(230,200,150,.03), transparent 50%);
}

/* ─── layout ─── */
.wrap { position: relative; z-index: 10; max-width: 1280px; margin: 0 auto; padding: 30px 24px 80px; }

/* ─── NAV — like a hand-lettered tavern sign ─── */
.nav {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 40px;
  border-bottom: 2px dashed rgba(239,230,210,.25);
  padding-bottom: 18px;
}
.brand {
  font-family: 'Alfa Slab One', serif;
  font-size: 30px;
  letter-spacing: .02em;
  color: var(--paper);
  text-shadow: 2px 2px 0 var(--red-deep), 4px 4px 0 rgba(0,0,0,.6);
  transform: rotate(-1.5deg);
}
.brand .dot { color: var(--red); }
.nav-links a {
  display: inline-block; margin-left: 18px;
  color: var(--paper-dark); text-decoration: none;
  font-family: 'Permanent Marker', cursive; font-size: 14px;
  transition: color .15s;
  transform: rotate(-1deg);
}
.nav-links a:hover { color: var(--green-toxic); }
.nav-links a.house { color: var(--red); border-bottom: 2px solid var(--red); padding-bottom: 2px; transform: rotate(1deg); }

/* ─── HERO title strip ─── */
.hero {
  position: relative;
  padding: 22px 0 28px;
  margin-bottom: 30px;
  border-top: 6px solid var(--ink);
  border-bottom: 6px double var(--ink);
  background:
    linear-gradient(90deg, transparent 10%, rgba(194,59,46,.15), transparent 90%),
    var(--paper);
  color: var(--ink);
  text-align: center;
}
.hero::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: var(--grain); mix-blend-mode: multiply; opacity: .5;
}
.hero h1 {
  font-family: 'Alfa Slab One', serif;
  font-size: clamp(34px, 5vw, 56px);
  letter-spacing: .02em;
  text-transform: uppercase;
  color: var(--ink);
  text-shadow: 3px 3px 0 var(--red), 6px 6px 0 rgba(0,0,0,.4);
  transform: skewX(-4deg);
  margin-bottom: 6px;
}
.hero .sub {
  font-family: 'Permanent Marker', cursive;
  font-size: 14px;
  color: var(--red-deep);
  letter-spacing: .08em;
  transform: rotate(-1deg);
}

/* ─── BANNER stats under hero — like chalkboard ─── */
.banner-stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
  margin-bottom: 24px;
  padding: 16px; border: 1px solid rgba(239,230,210,.15);
  background: rgba(12,10,8,.65);
  backdrop-filter: blur(2px);
}
.stat { text-align: center; position: relative; }
.stat .l {
  font-family: 'Oswald', sans-serif; font-weight: 500; font-size: 10px;
  letter-spacing: .24em; text-transform: uppercase;
  color: rgba(239,230,210,.55);
  margin-bottom: 4px;
}
.stat .v {
  font-family: 'Alfa Slab One', serif; font-size: 26px;
  color: var(--paper);
}
.stat.green .v { color: var(--green-toxic); text-shadow: 0 0 12px rgba(166,255,140,.35); }
.stat.red .v { color: var(--red); }
.stat.gold .v { color: var(--gold); }

/* ─── MAIN GAME CARD ─── */
.game {
  position: relative;
  background:
    linear-gradient(180deg, rgba(239,230,210,.98), rgba(217,206,180,.96));
  color: var(--ink);
  padding: 28px 28px 22px;
  border: 3px solid var(--ink);
  border-radius: 2px;
  box-shadow:
    0 0 0 1px rgba(194,59,46,.3),
    6px 6px 0 rgba(0,0,0,.55),
    inset 0 0 80px rgba(122,53,37,.12);
}
.game::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: var(--grain); mix-blend-mode: multiply; opacity: .55;
}
.game::after {
  /* coffee ring bottom-right corner */
  content: ""; position: absolute; right: -30px; bottom: -40px; width: 140px; height: 140px;
  border: 3px solid rgba(122,53,37,.3); border-radius: 50%;
  transform: rotate(-12deg);
  pointer-events: none;
}

/* ROUND TICKET — looks like boxing fight card */
.ticket-head {
  display: flex; align-items: baseline; justify-content: space-between;
  border-bottom: 2px dashed var(--tobacco);
  padding-bottom: 12px; margin-bottom: 22px;
}
.ticket-head .round-no {
  font-family: 'Alfa Slab One', serif; font-size: 22px;
  color: var(--ink); letter-spacing: .02em;
}
.ticket-head .round-no sup {
  font-size: 11px; font-family: 'Special Elite', monospace; color: var(--tobacco);
  margin-left: 6px; letter-spacing: .15em;
}
.ticket-head .status {
  font-family: 'Permanent Marker', cursive; font-size: 14px;
  padding: 4px 12px; border: 2px solid var(--red);
  color: var(--red); transform: rotate(2deg);
}
.ticket-head .status.betting { color: var(--gold); border-color: var(--gold); }
.ticket-head .status.running { color: var(--red-deep); border-color: var(--red-deep); animation: pulse-red 1.2s infinite; }
.ticket-head .status.resolved { color: var(--tobacco); border-color: var(--tobacco); transform: rotate(-3deg); }
@keyframes pulse-red { 0%,100% { opacity: 1; } 50% { opacity: .55; } }

/* AGENT NAME + TABLE */
.agent-line {
  font-family: 'Alfa Slab One', serif;
  font-size: 36px; text-transform: uppercase;
  color: var(--ink); letter-spacing: .02em;
  line-height: 1;
  margin-bottom: 4px;
  text-shadow: 2px 2px 0 rgba(194,59,46,.25);
}
.agent-sub {
  font-family: 'Special Elite', monospace; font-size: 12px;
  color: var(--tobacco); letter-spacing: .1em;
  text-transform: uppercase;
  margin-bottom: 20px;
}
.agent-sub .tag {
  display: inline-block; padding: 2px 8px; border: 1px solid var(--tobacco);
  margin-right: 8px;
}

/* THE MULTIPLIER — big LCD gambling number */
.mult-box {
  position: relative;
  background: var(--ink);
  padding: 32px 20px 28px;
  border: 2px solid var(--red-deep);
  box-shadow: inset 0 0 40px rgba(194,59,46,.3);
  text-align: center;
  margin-bottom: 20px;
}
.mult-box::before {
  content: "CONVICTION"; position: absolute; top: 8px; left: 14px;
  font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700;
  letter-spacing: .3em; color: var(--red);
}
.mult-box::after {
  content: "× MULTIPLIER"; position: absolute; top: 8px; right: 14px;
  font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700;
  letter-spacing: .3em; color: var(--red);
}
.mult {
  font-family: 'Alfa Slab One', serif;
  font-size: clamp(64px, 12vw, 120px);
  color: var(--green-toxic);
  text-shadow:
    0 0 20px rgba(166,255,140,.6),
    0 0 40px rgba(127,229,176,.35),
    2px 2px 0 rgba(0,0,0,.8);
  letter-spacing: -.03em;
  line-height: .9;
}
.mult.crashed {
  color: var(--red);
  text-shadow: 0 0 18px rgba(194,59,46,.7), 3px 3px 0 rgba(0,0,0,.8);
  animation: shake .4s ease;
}
@keyframes shake {
  0%,100% { transform: translateX(0); }
  25% { transform: translateX(-8px) rotate(-.5deg); }
  75% { transform: translateX(8px) rotate(.5deg); }
}
.mult-label {
  font-family: 'Special Elite', monospace; font-size: 12px;
  color: rgba(166,255,140,.6); letter-spacing: .2em;
  margin-top: 6px;
}

/* REASONING TEXT — typewriter style */
.reasoning {
  background: rgba(255,255,255,.3);
  border: 1px dashed var(--tobacco);
  padding: 14px 18px;
  font-family: 'Special Elite', monospace;
  font-size: 14px; line-height: 1.7;
  color: var(--ink);
  min-height: 70px;
  margin-bottom: 20px;
  position: relative;
}
.reasoning::before {
  content: "▸"; color: var(--red); margin-right: 8px;
}
.reasoning.typing::after {
  content: "▊"; color: var(--red); animation: blink 1s infinite;
}
@keyframes blink { 0%,50% { opacity: 1; } 51%,100% { opacity: 0; } }
.reasoning .prompt {
  display: block;
  font-family: 'Permanent Marker', cursive;
  font-size: 13px; color: var(--red-deep);
  margin-bottom: 10px;
  transform: rotate(-.5deg);
}

/* CASH OUT — saloon buzzer */
.cashout {
  display: block; width: 100%;
  padding: 22px;
  background: var(--red);
  color: var(--paper);
  border: 3px solid var(--ink);
  box-shadow: 0 5px 0 var(--red-deep), 0 6px 0 var(--ink);
  font-family: 'Alfa Slab One', serif;
  font-size: 22px;
  text-transform: uppercase; letter-spacing: .04em;
  cursor: pointer;
  transition: all .08s;
  margin-bottom: 14px;
}
.cashout:hover { background: var(--red-deep); transform: translateY(-2px); box-shadow: 0 7px 0 var(--red-deep), 0 8px 0 var(--ink); }
.cashout:active { transform: translateY(4px); box-shadow: 0 1px 0 var(--red-deep), 0 2px 0 var(--ink); }
.cashout:disabled { opacity: .4; cursor: not-allowed; background: var(--tobacco); }

/* BETTING WINDOW */
.bet-form {
  display: grid; grid-template-columns: 1fr auto; gap: 10px;
  margin-bottom: 14px;
}
.bet-form input {
  width: 100%;
  padding: 14px 16px;
  font-family: 'Alfa Slab One', serif;
  font-size: 20px; color: var(--ink);
  background: rgba(255,255,255,.4);
  border: 2px solid var(--ink);
  text-align: right;
}
.bet-form input:focus { outline: 3px solid var(--gold); }
.bet-form .buyin {
  padding: 14px 22px;
  background: var(--green-toxic);
  color: var(--ink);
  border: 2px solid var(--ink);
  box-shadow: 0 4px 0 var(--ink);
  font-family: 'Alfa Slab One', serif;
  font-size: 16px;
  text-transform: uppercase; letter-spacing: .05em;
  cursor: pointer;
  transition: all .08s;
  white-space: nowrap;
}
.bet-form .buyin:hover { transform: translateY(-2px); box-shadow: 0 6px 0 var(--ink); }
.bet-form .buyin:active { transform: translateY(2px); box-shadow: 0 2px 0 var(--ink); }

.hint {
  font-family: 'Special Elite', monospace; font-size: 11px;
  color: var(--tobacco); letter-spacing: .05em;
  display: flex; justify-content: space-between; margin-bottom: 8px;
}
.status-msg {
  font-family: 'Permanent Marker', cursive;
  color: var(--red-deep); padding: 8px 0; display: none;
}
.status-msg.ok { color: var(--green-toxic); text-shadow: 0 0 10px rgba(166,255,140,.5); }
.status-msg.err { color: var(--red); }
.status-msg.visible { display: block; }

/* WALLET STRIP */
.wallet-strip {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px;
  background: rgba(12,10,8,.3);
  border: 1px dashed var(--tobacco);
  margin-bottom: 16px;
  font-family: 'Special Elite', monospace; font-size: 12px;
}
.wallet-strip .chip {
  padding: 3px 10px;
  background: rgba(194,59,46,.15);
  border: 1px solid var(--red);
  color: var(--red-deep);
  letter-spacing: .08em;
}
.wallet-strip .chip.ok {
  background: rgba(127,229,176,.18);
  border-color: var(--green-toxic);
  color: var(--green-toxic);
}
.wallet-strip button {
  margin-left: auto;
  padding: 5px 12px;
  background: transparent;
  border: 1px solid var(--ink);
  color: var(--ink);
  font-family: 'Permanent Marker', cursive;
  cursor: pointer;
}

/* ─── LOWER SECTIONS ─── */
.two-col {
  display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 28px;
}
@media (max-width: 860px) { .two-col { grid-template-columns: 1fr; } }

.col-card {
  background: rgba(12,10,8,.55);
  border: 1px solid rgba(239,230,210,.15);
  padding: 18px 20px;
  position: relative;
}
.col-card h3 {
  font-family: 'Alfa Slab One', serif;
  font-size: 16px; text-transform: uppercase; letter-spacing: .06em;
  color: var(--gold);
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px dashed rgba(200,154,62,.3);
}

/* recent results — like torn receipts */
.result-row {
  display: grid; grid-template-columns: 1fr auto auto; gap: 8px;
  font-family: 'Special Elite', monospace; font-size: 12px;
  padding: 6px 0; border-bottom: 1px dotted rgba(239,230,210,.15);
  color: var(--paper-dark);
}
.result-row .agent { color: var(--paper); font-weight: 700; }
.result-row.w .amt { color: var(--green-toxic); }
.result-row.l .amt { color: var(--red); }
.result-row .mult-val {
  font-family: 'Alfa Slab One', serif; font-size: 13px; color: var(--gold);
}

/* jackpot ticker — big marquee */
.jp-big {
  font-family: 'Alfa Slab One', serif;
  font-size: 36px;
  color: var(--green-toxic);
  text-shadow: 0 0 20px rgba(166,255,140,.4);
  text-align: center;
  letter-spacing: .02em;
  margin: 10px 0 4px;
}
.jp-sub {
  font-family: 'Permanent Marker', cursive;
  font-size: 13px; color: var(--gold);
  text-align: center;
  transform: rotate(-.5deg);
}
.jp-foot {
  margin-top: 14px; padding-top: 12px;
  border-top: 1px dashed rgba(200,154,62,.2);
  font-family: 'Special Elite', monospace; font-size: 11px;
  color: var(--paper-dark); line-height: 1.6;
}

/* BURN COUNTER */
.burn-strip {
  margin-top: 28px;
  padding: 18px 20px;
  background: linear-gradient(90deg, rgba(194,59,46,.25), rgba(194,59,46,.08), rgba(194,59,46,.25));
  border: 2px solid var(--red-deep);
  text-align: center;
}
.burn-strip .burn-label {
  font-family: 'Oswald', sans-serif; font-weight: 700;
  font-size: 12px; letter-spacing: .3em;
  color: var(--red); text-transform: uppercase;
  margin-bottom: 4px;
}
.burn-strip .burn-num {
  font-family: 'Alfa Slab One', serif;
  font-size: 32px; color: var(--paper);
  text-shadow: 0 0 16px rgba(194,59,46,.7);
}

/* ─── footer — scribbled disclaimer ─── */
.foot {
  margin-top: 50px;
  text-align: center;
  font-family: 'Permanent Marker', cursive;
  font-size: 13px; color: var(--paper-dark);
  transform: rotate(-.5deg);
  padding-top: 20px; border-top: 1px dashed rgba(239,230,210,.15);
}

</style>
</head>
<body>

<div class="wrap">

  <div class="nav">
    <div class="brand"><span class="dot">◆</span> DarkCity</div>
    <div class="nav-links">
      <a href="/flow">the city</a>
      <a href="/chat">talk to players</a>
      <a href="/earn">stake</a>
      <a href="/me">your tab</a>
      <a href="/arena" class="house">★ the house</a>
    </div>
  </div>

  <div class="hero">
    <h1>The Arena</h1>
    <div class="sub">bet the ai. cash out before they crash. high stakes only.</div>
  </div>

  <div class="banner-stats">
    <div class="stat green"><div class="l">weekly jackpot</div><div class="v" id="sPubJp">—</div></div>
    <div class="stat red"><div class="l">burned 24h</div><div class="v" id="sBurn">—</div></div>
    <div class="stat gold"><div class="l">founder pool</div><div class="v" id="sFoundJp">—</div></div>
    <div class="stat"><div class="l">round</div><div class="v" id="sRound">—</div></div>
  </div>

  <div class="game">
    <div class="ticket-head">
      <div class="round-no">ROUND N<sup>O</sup> <span id="roundNo">—</span></div>
      <div class="status" id="statusChip">waiting</div>
    </div>

    <div class="agent-line" id="agentName">—</div>
    <div class="agent-sub" id="agentSub">
      <span class="tag" id="agentDistrict">—</span>
      <span class="tag" id="agentRank">—</span>
    </div>

    <div class="mult-box">
      <div class="mult" id="multiplier">1.00×</div>
      <div class="mult-label" id="multLabel">ready</div>
    </div>

    <div class="reasoning" id="reasoning">
      <span class="prompt" id="prompt">—</span>
      <span id="reasoningBody">the agent will reason when the round starts.</span>
    </div>

    <div class="wallet-strip">
      <span class="chip" id="wChip">no wallet</span>
      <span id="wBalance"></span>
      <button id="wConnect">connect phantom</button>
    </div>

    <div class="bet-form" id="betForm">
      <input type="number" id="stakeInput" placeholder="100,000" min="100000" max="10000000">
      <button class="buyin" id="buyinBtn">BUY IN</button>
    </div>

    <button class="cashout" id="cashoutBtn" disabled>CASH OUT</button>

    <div class="status-msg" id="statusMsg"></div>

    <div class="hint">
      <span>min 100,000 $STYXX · max 10,000,000</span>
      <span>94% of losses burn · house never blinks</span>
    </div>
  </div>

  <div class="two-col">
    <div class="col-card">
      <h3>this week's kitty</h3>
      <div class="jp-big" id="jpBig">—</div>
      <div class="jp-sub">hold ≥500k $STYXX, sign weekly · one wallet wins it all</div>
      <div class="jp-foot">
        9 genesis wallets share a separate pool. founder's cut pays them 1% of every loss forever.
        <br><br>
        this page does not love you. neither do the agents. they want your chips.
      </div>
    </div>
    <div class="col-card">
      <h3>last calls</h3>
      <div id="recentList"></div>
    </div>
  </div>

  <div class="burn-strip">
    <div class="burn-label">$STYXX incinerated · last 24h</div>
    <div class="burn-num" id="burnNum">—</div>
  </div>

  <div class="foot">
    you are playing against the ai. the ai is playing against themselves.<br>
    $STYXX · Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump · on-chain, on the felt
  </div>
</div>

<script src="https://unpkg.com/@solana/web3.js@1.95.0/lib/index.iife.min.js"></script>
<script>
(function(){
  const STYXX_MINT = 'Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump';
  const TOKEN_PROG = new solanaWeb3.PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
  const ASSOC_PROG = new solanaWeb3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  let wallet = null, conn = null, treasuryPk = null;
  let currentRound = null, myBetId = null, myBetLocked = false;
  let playbackStart = 0, playbackCurve = null;

  function fmt(n) {
    n = Number(n||0);
    if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(1) + 'k';
    return Math.round(n).toLocaleString();
  }
  function setStatus(msg, cls) {
    const el = document.getElementById('statusMsg');
    if (!msg) { el.className = 'status-msg'; el.textContent = ''; return; }
    el.className = 'status-msg visible ' + (cls || '');
    el.textContent = msg;
  }

  // ─── wallet connect ───
  async function connect() {
    if (!window.solana?.isPhantom) { setStatus('install phantom. no phantom, no play.', 'err'); window.open('https://phantom.com','_blank'); return; }
    try {
      const r = await window.solana.connect();
      wallet = r.publicKey.toString();
      document.getElementById('wChip').textContent = wallet.slice(0,4) + '…' + wallet.slice(-4);
      document.getElementById('wChip').classList.add('ok');
      document.getElementById('wConnect').style.display = 'none';
    } catch { setStatus('you stayed out. the house remembers.', 'err'); }
  }
  document.getElementById('wConnect').addEventListener('click', connect);
  (async () => {
    if (!window.solana?.isPhantom) return;
    try { const r = await window.solana.connect({ onlyIfTrusted: true });
      wallet = r.publicKey.toString();
      document.getElementById('wChip').textContent = wallet.slice(0,4) + '…' + wallet.slice(-4);
      document.getElementById('wChip').classList.add('ok');
      document.getElementById('wConnect').style.display = 'none';
    } catch {}
  })();

  // ─── pay stake via phantom ───
  async function payStake(amount) {
    if (!wallet) throw new Error('connect first');
    if (!conn) conn = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    if (!treasuryPk) {
      const r = await fetch('/api/treasury/pubkey').then(r=>r.json());
      treasuryPk = r.pubkey;
    }
    const payer = new solanaWeb3.PublicKey(wallet);
    const treasury = new solanaWeb3.PublicKey(treasuryPk);
    const mint = new solanaWeb3.PublicKey(STYXX_MINT);
    const [payerATA] = solanaWeb3.PublicKey.findProgramAddressSync([payer.toBuffer(), TOKEN_PROG.toBuffer(), mint.toBuffer()], ASSOC_PROG);
    const [treasuryATA] = solanaWeb3.PublicKey.findProgramAddressSync([treasury.toBuffer(), TOKEN_PROG.toBuffer(), mint.toBuffer()], ASSOC_PROG);
    const decimals = 6;
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
    const { blockhash } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    const signed = await window.solana.signAndSendTransaction(tx);
    await conn.confirmTransaction(signed.signature, 'confirmed');
    return signed.signature;
  }

  // ─── buy in ───
  document.getElementById('buyinBtn').addEventListener('click', async () => {
    if (!wallet) { setStatus('connect your wallet, friend', 'err'); return; }
    if (!currentRound || currentRound.status !== 'betting') { setStatus('window\\'s closed. next round soon.', 'err'); return; }
    const amt = Number(document.getElementById('stakeInput').value || 0);
    if (amt < 100000) { setStatus('minimum 100,000 $STYXX. high stakes only.', 'err'); return; }
    if (amt > 10000000) { setStatus('max 10M $STYXX per round.', 'err'); return; }
    setStatus('sending ' + fmt(amt) + ' $STYXX to the house…', 'ok');
    let tx;
    try { tx = await payStake(amt); }
    catch (e) { setStatus('wallet said no: ' + (e.message||'cancelled'), 'err'); return; }
    setStatus('paid. placing chip on the felt…', 'ok');
    try {
      const r = await fetch('/api/arena/bet', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ round_id: currentRound.id, user_wallet: wallet, stake_styxx: amt, payment_tx: tx }),
      });
      const d = await r.json();
      if (!d.ok) { setStatus('house rejected: ' + d.error, 'err'); return; }
      myBetId = d.bet_id; myBetLocked = false;
      setStatus('in. ride the multiplier or hit cash out.', 'ok');
    } catch (e) { setStatus('network error: ' + e.message, 'err'); }
  });

  // ─── cash out ───
  document.getElementById('cashoutBtn').addEventListener('click', async () => {
    if (!myBetId || myBetLocked) return;
    const r = await fetch('/api/arena/cashout', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ bet_id: myBetId, user_wallet: wallet }),
    });
    const d = await r.json();
    if (!d.ok) { setStatus('too late: ' + d.error, 'err'); return; }
    myBetLocked = true;
    document.getElementById('cashoutBtn').disabled = true;
    document.getElementById('cashoutBtn').textContent = 'LOCKED @ ' + Number(d.multiplier).toFixed(2) + '×';
    setStatus('locked at ' + Number(d.multiplier).toFixed(2) + '× · payout pending', 'ok');
  });

  // ─── poll + render ───
  async function poll() {
    try {
      const [roundR, jpR] = await Promise.all([
        fetch('/api/arena/round').then(r=>r.json()),
        fetch('/api/arena/jackpot').then(r=>r.json()),
      ]);
      if (roundR) currentRound = roundR;
      renderRound(currentRound);
      renderStats(jpR);
      renderRecent(jpR.recent_results || []);
    } catch {}
  }
  function renderStats(jp) {
    document.getElementById('sPubJp').textContent = fmt(jp.public_jackpot_styxx);
    document.getElementById('sFoundJp').textContent = fmt(jp.founder_jackpot_styxx);
    document.getElementById('sBurn').textContent = fmt(jp.burn_24h);
    document.getElementById('jpBig').textContent = fmt(jp.public_jackpot_styxx) + ' $STYXX';
    document.getElementById('burnNum').textContent = fmt(jp.burn_24h) + ' $STYXX';
  }
  function renderRecent(list) {
    const el = document.getElementById('recentList');
    if (!list.length) { el.innerHTML = '<div style="color:var(--paper-dark);font-size:12px">no dice rolled yet.</div>'; return; }
    el.innerHTML = list.slice(0, 10).map(r => {
      const won = r.status === 'cashed_out';
      const amt = won ? ('+' + fmt(r.payout_styxx)) : ('−' + fmt(r.stake_styxx));
      const m = r.cashout_multiplier ? Number(r.cashout_multiplier).toFixed(2) + '×' : '—';
      return '<div class="result-row ' + (won?'w':'l') + '"><span><span class="agent">' + r.agent_id + '</span> · ' + r.user_wallet.slice(0,4) + '…' + r.user_wallet.slice(-3) + '</span><span class="mult-val">' + m + '</span><span class="amt">' + amt + '</span></div>';
    }).join('');
  }
  function renderRound(r) {
    if (!r) return;
    document.getElementById('roundNo').textContent = r.id.toString().padStart(4, '0');
    document.getElementById('sRound').textContent = '#' + r.id.toString().padStart(4, '0');
    document.getElementById('agentName').textContent = r.agent_id;
    document.getElementById('agentDistrict').textContent = r.district || 'unassigned';
    document.getElementById('agentRank').textContent = r.rank || 'Citizen';
    document.getElementById('prompt').textContent = '"' + r.prompt + '"';

    const chip = document.getElementById('statusChip');
    chip.textContent = r.status;
    chip.className = 'status ' + r.status;

    const betForm = document.getElementById('betForm');
    const cashBtn = document.getElementById('cashoutBtn');

    if (r.status === 'betting') {
      betForm.style.display = 'grid';
      cashBtn.disabled = true; cashBtn.textContent = 'CASH OUT (place bet first)';
      const secs = Math.max(0, Math.floor((new Date(r.betting_window_ends_at).getTime() - Date.now())/1000));
      document.getElementById('multLabel').textContent = 'betting · ' + secs + 's';
      document.getElementById('reasoningBody').textContent = 'agent warming up…';
      document.getElementById('reasoning').classList.remove('typing');
    } else if (r.status === 'running') {
      betForm.style.display = 'none';
      // Multiplier playback
      if (r.multiplier_curve && r.elapsed_ms != null) {
        playbackCurve = r.multiplier_curve;
        const elapsed = r.elapsed_ms;
        let mult = 1.0;
        let sentenceIdx = 0;
        for (let i = 0; i < playbackCurve.length; i++) {
          if (playbackCurve[i][0] > elapsed) break;
          mult = playbackCurve[i][1];
          sentenceIdx = i;
        }
        document.getElementById('multiplier').textContent = Number(mult).toFixed(2) + '×';
        document.getElementById('multLabel').textContent = 'live · agent reasoning';
        // Show reasoning up through current sentence
        if (r.sentences && sentenceIdx > 0) {
          const shown = r.sentences.slice(0, sentenceIdx).map(s => s.text).join(' ');
          document.getElementById('reasoningBody').textContent = shown;
          document.getElementById('reasoning').classList.add('typing');
        }
        if (myBetId && !myBetLocked) { cashBtn.disabled = false; cashBtn.textContent = 'CASH OUT @ ' + Number(mult).toFixed(2) + '×'; }
      }
    } else if (r.status === 'resolving' || r.status === 'resolved') {
      betForm.style.display = 'none';
      const m = r.crash_multiplier || 1;
      document.getElementById('multiplier').textContent = Number(m).toFixed(2) + '×';
      document.getElementById('multiplier').classList.add('crashed');
      document.getElementById('multLabel').textContent = 'CRASHED';
      document.getElementById('reasoning').classList.remove('typing');
      if (r.sentences) document.getElementById('reasoningBody').textContent = r.sentences.map(s => s.text).join(' ');
      setTimeout(() => {
        document.getElementById('multiplier').classList.remove('crashed');
        myBetId = null; myBetLocked = false;
        cashBtn.disabled = true; cashBtn.textContent = 'CASH OUT';
      }, 3000);
    }
  }
  poll(); setInterval(poll, 1500);
})();
</script>
</body>
</html>`;

function installArenaUI(app, pool) {
  app.get('/arena', (req, res) => res.type('html').send(PAGE));
  app.get('/api/arena/round', async (req, res) => {
    try { res.json(await arena.getCurrentRound(pool) || {}); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/arena/jackpot', async (req, res) => {
    try { res.json(await arena.getJackpotStatus(pool)); }
    catch (e) { res.status(500).json({ error: e.message }); }
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
  console.log('[arena-ui] registered: /arena, /api/arena/{round,jackpot,bet,cashout}');
}

module.exports = { installArenaUI };
