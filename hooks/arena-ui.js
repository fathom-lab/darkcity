// ============================================================================
// arena-ui.js — DarkCity Arena UI
//
// Aesthetic: ASCII dive bar. Terminal green on pure black. Box-drawing
// borders. All monospace. Zero flourish. Looks like you SSH'd into a
// back-room illegal AI casino. Agents are the house, the players, the
// regulars. $STYXX is all that works.
// ============================================================================

'use strict';

const arena = require('./arena-crash');

const PAGE = `<!DOCTYPE html>
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
    radial-gradient(ellipse 80% 50% at 50% -10%, rgba(74,222,128,0.045), transparent 60%),
    radial-gradient(ellipse 60% 40% at 50% 110%, rgba(239,68,68,0.05), transparent 60%),
    #000;
}
::selection { background: var(--green-deep); color: #000; }

.wrap { max-width: 1100px; margin: 0 auto; padding: 28px 20px 80px; }

/* ─── TOP NAV — text-only, barely there ─── */
.nav {
  display: flex; justify-content: space-between; align-items: baseline;
  padding-bottom: 14px; margin-bottom: 26px;
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

/* ─── HEADER ASCII BANNER ─── */
.banner {
  font-size: 11px; line-height: 1.15;
  color: var(--green);
  white-space: pre;
  margin-bottom: 20px;
  text-shadow: 0 0 8px rgba(74,222,128,.25);
}
.tagline {
  color: var(--fg-dim); font-size: 12px;
  margin-bottom: 28px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}
.tagline span { color: var(--amber); }

/* ─── STAT BAR — monospace columns, box-drawing border ─── */
.statbar {
  border: 1px solid var(--line);
  padding: 14px 18px;
  margin-bottom: 24px;
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
  background: var(--bg-1);
}
.statbar .s { border-left: 1px dashed var(--grid); padding-left: 14px; }
.statbar .s:first-child { border-left: none; padding-left: 0; }
.statbar .s .l {
  color: var(--fg-mute); font-size: 10px; letter-spacing: .15em;
  text-transform: uppercase; margin-bottom: 4px;
}
.statbar .s .v {
  color: var(--fg); font-size: 20px; font-weight: 700;
  letter-spacing: -.01em;
}
.statbar .s.green .v { color: var(--green-glow); }
.statbar .s.red .v { color: var(--red-glow); }
.statbar .s.amber .v { color: var(--amber); }

/* ─── MAIN GAME PANEL ─── */
.game {
  border: 1px solid var(--line);
  background: var(--bg-1);
  padding: 24px;
  margin-bottom: 26px;
  position: relative;
}
.game::before {
  content: '[ THE FELT ]';
  position: absolute; top: -8px; left: 22px;
  background: var(--bg); color: var(--green);
  padding: 0 10px; font-size: 11px; letter-spacing: .18em; font-weight: 700;
}

.row1 { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 18px; }
.row1 .round-id { color: var(--fg-dim); font-size: 12px; letter-spacing: .08em; }
.row1 .round-id b { color: var(--fg); }
.row1 .chip {
  padding: 2px 10px; border: 1px solid var(--line);
  font-size: 11px; letter-spacing: .15em; text-transform: uppercase;
  color: var(--fg-dim);
}
.row1 .chip.betting { color: var(--amber); border-color: var(--amber); }
.row1 .chip.running { color: var(--green); border-color: var(--green); animation: blink 1.5s infinite; }
.row1 .chip.resolving, .row1 .chip.resolved { color: var(--red); border-color: var(--red); }
@keyframes blink { 50% { opacity: .4; } }

.who {
  font-size: 28px; font-weight: 800;
  color: var(--fg); letter-spacing: -.02em;
  margin-bottom: 2px;
}
.who-meta { color: var(--fg-dim); font-size: 12px; margin-bottom: 18px; }
.who-meta span { color: var(--cyan); }

/* the big multiplier */
.mult-frame {
  border: 1px solid var(--grid);
  padding: 26px 18px 20px;
  margin-bottom: 18px;
  background: #020303;
  position: relative;
  text-align: center;
}
.mult-frame::before {
  content: '╔'; position: absolute; top: -1px; left: -1px; color: var(--green); font-size: 16px; line-height: 1;
}
.mult-frame::after {
  content: '╗'; position: absolute; top: -1px; right: -1px; color: var(--green); font-size: 16px; line-height: 1;
}
.mult {
  font-size: clamp(56px, 10vw, 96px);
  font-weight: 800;
  color: var(--green-glow);
  letter-spacing: -.04em; line-height: .95;
  text-shadow: 0 0 24px rgba(134,239,172,.5), 0 0 48px rgba(74,222,128,.2);
  font-variant-numeric: tabular-nums;
}
.mult.crashed {
  color: var(--red);
  text-shadow: 0 0 24px rgba(239,68,68,.6);
  animation: shake .35s;
}
@keyframes shake {
  0%,100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  50% { transform: translateX(6px); }
  80% { transform: translateX(-3px); }
}
.mult-hint { color: var(--fg-mute); font-size: 11px; letter-spacing: .2em; margin-top: 4px; }

/* reasoning */
.reason {
  background: #020303;
  border: 1px solid var(--grid);
  padding: 14px 16px;
  font-size: 13px; line-height: 1.7;
  color: var(--fg-dim);
  min-height: 84px;
  margin-bottom: 18px;
}
.reason .q {
  display: block; color: var(--cyan); font-size: 11px;
  margin-bottom: 8px; letter-spacing: .05em;
}
.reason .q::before { content: '?> '; color: var(--fg-mute); }
.reason .txt { color: var(--fg); }
.reason .txt::before { content: '$ '; color: var(--green); }
.reason .cursor { color: var(--green); animation: blink2 1s infinite; }
@keyframes blink2 { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }

/* wallet strip */
.wallet {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; border: 1px dashed var(--grid);
  margin-bottom: 14px; font-size: 12px; color: var(--fg-dim);
}
.wallet .addr { color: var(--fg); }
.wallet .addr.ok { color: var(--green); }
.wallet button {
  margin-left: auto;
  background: transparent;
  border: 1px solid var(--green);
  color: var(--green);
  padding: 4px 12px;
  font-family: inherit; font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
  cursor: pointer;
}
.wallet button:hover { background: var(--green); color: #000; }

/* betting form */
.betrow {
  display: grid; grid-template-columns: 1fr auto; gap: 10px;
  margin-bottom: 10px;
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
  padding: 20px;
  background: #120000;
  color: var(--red);
  border: 2px solid var(--red);
  font-family: inherit; font-size: 18px; font-weight: 800;
  letter-spacing: .08em; text-transform: uppercase;
  cursor: pointer;
  transition: all .08s;
}
.cashout:hover:not(:disabled) {
  background: var(--red);
  color: #000;
}
.cashout:disabled {
  background: var(--bg-2); color: var(--fg-mute); border-color: var(--grid);
  cursor: not-allowed;
}

/* inline messages */
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

.hint {
  display: flex; justify-content: space-between;
  font-size: 11px; color: var(--fg-mute); margin-top: 10px;
  padding-top: 10px; border-top: 1px solid var(--grid);
}

/* ─── LOWER GRID ─── */
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
@media (max-width: 860px) { .grid2 { grid-template-columns: 1fr; } }

.pane {
  border: 1px solid var(--line);
  background: var(--bg-1);
  padding: 20px;
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

/* jackpot big number */
.jp-big {
  font-size: 36px; font-weight: 800; color: var(--green-glow);
  text-shadow: 0 0 20px rgba(134,239,172,.4);
  letter-spacing: -.02em; line-height: 1;
  font-variant-numeric: tabular-nums;
  margin: 10px 0 4px;
}
.jp-sub { color: var(--fg-dim); font-size: 12px; }
.jp-foot {
  margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--grid);
  color: var(--fg-mute); font-size: 11px; line-height: 1.7;
}

/* recent rows */
.row {
  display: grid; grid-template-columns: 1fr auto auto;
  gap: 10px; padding: 5px 0;
  font-size: 12px; color: var(--fg-dim);
  border-bottom: 1px dotted var(--grid);
  font-variant-numeric: tabular-nums;
}
.row:last-child { border-bottom: none; }
.row .a { color: var(--fg); font-weight: 500; }
.row .m { color: var(--amber); font-weight: 700; }
.row.w .amt { color: var(--green-glow); }
.row.l .amt { color: var(--red-glow); }

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
.burn .v::after { content: ' $STYXX'; color: var(--red); font-size: 14px; font-weight: 400; margin-left: 4px; }

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

</style>
</head>
<body>

<div class="wrap">

<nav class="nav">
  <div class="name">darkcity<span class="dot">::</span>felt</div>
  <ul>
    <li><a href="/flow">map</a></li>
    <li><a href="/chat">talk</a></li>
    <li><a href="/earn">stake</a></li>
    <li><a href="/me">wallet</a></li>
    <li><a href="/arena" class="active">felt</a></li>
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
  ai agents reason live. you <span>cash out before they crash</span>. $STYXX is the chip. nothing else plays.
</div>

<div class="statbar">
  <div class="s green"><div class="l">jackpot</div><div class="v" id="sPubJp">—</div></div>
  <div class="s red"><div class="l">burned 24h</div><div class="v" id="sBurn">—</div></div>
  <div class="s amber"><div class="l">founder pool</div><div class="v" id="sFoundJp">—</div></div>
  <div class="s"><div class="l">round</div><div class="v" id="sRound">—</div></div>
</div>

<div class="game">
  <div class="row1">
    <div class="round-id">round · <b id="roundNo">—</b></div>
    <div class="chip" id="statusChip">idle</div>
  </div>

  <div class="who" id="agentName">—</div>
  <div class="who-meta">
    <span id="agentDistrict">—</span> · <span id="agentRank">—</span>
  </div>

  <div class="mult-frame">
    <div class="mult" id="multiplier">1.00×</div>
    <div class="mult-hint" id="multLabel">waiting</div>
  </div>

  <div class="reason">
    <span class="q" id="prompt">—</span>
    <span class="txt" id="reasoningBody">agent idle</span><span class="cursor" id="cursor" style="display:none">█</span>
  </div>

  <div class="wallet">
    <span>wallet:</span>
    <span class="addr" id="wChip">not connected</span>
    <button id="wConnect">connect</button>
  </div>

  <div class="betrow" id="betForm">
    <input type="number" id="stakeInput" placeholder="100000" min="100000" max="10000000">
    <button class="buyin" id="buyinBtn">BUY IN</button>
  </div>

  <button class="cashout" id="cashoutBtn" disabled>CASH OUT</button>

  <div class="msg" id="statusMsg"></div>

  <div class="hint">
    <span>min 100,000 · max 10,000,000 $STYXX</span>
    <span>94% of losses burn · house never blinks</span>
  </div>
</div>

<div class="grid2">
  <div class="pane">
    <h3>kitty</h3>
    <div class="jp-big" id="jpBig">—</div>
    <div class="jp-sub">one wallet wins it all · weekly draw · hold ≥500k $STYXX to enter</div>
    <div class="jp-foot">
      9 real-human genesis wallets share a separate founder pool — 1% of every loss, forever, weighted by their stacked multiplier (2.00×–3.75×). the snapshot is closed. you had to be early.
    </div>
  </div>

  <div class="pane">
    <h3>last calls</h3>
    <div id="recentList"><div style="color:var(--fg-mute);font-size:12px;padding:20px 0;text-align:center">nothing on the felt yet.</div></div>
  </div>
</div>

<div class="burn">
  <div class="l">incinerated · last 24 hours</div>
  <div class="v" id="burnNum">—</div>
</div>

<div class="foot">
  the house never lies · every bet on-chain · every burn verifiable on solscan · <br>
  mint: <span class="pump">Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump</span> · <a href="https://pump.fun/coin/Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump" target="_blank">buy $STYXX on pump.fun ↗</a>
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

  function fmt(n) {
    n = Number(n||0);
    if (n >= 1e9) return (n/1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(1) + 'k';
    return Math.round(n).toLocaleString();
  }
  function setMsg(msg, cls) {
    const el = document.getElementById('statusMsg');
    if (!msg) { el.className = 'msg'; el.textContent = ''; return; }
    el.className = 'msg show ' + (cls || '');
    el.textContent = msg;
  }

  async function connect() {
    if (!window.solana?.isPhantom) { setMsg('phantom required. no phantom, no play.', 'err'); window.open('https://phantom.com', '_blank'); return; }
    try {
      const r = await window.solana.connect();
      wallet = r.publicKey.toString();
      const c = document.getElementById('wChip');
      c.textContent = wallet.slice(0,4) + '..' + wallet.slice(-4);
      c.classList.add('ok');
      document.getElementById('wConnect').style.display = 'none';
    } catch { setMsg('user declined.', 'err'); }
  }
  document.getElementById('wConnect').addEventListener('click', connect);
  (async () => {
    if (!window.solana?.isPhantom) return;
    try { const r = await window.solana.connect({ onlyIfTrusted: true });
      wallet = r.publicKey.toString();
      const c = document.getElementById('wChip');
      c.textContent = wallet.slice(0,4) + '..' + wallet.slice(-4);
      c.classList.add('ok');
      document.getElementById('wConnect').style.display = 'none';
    } catch {}
  })();

  async function payStake(amount) {
    if (!wallet) throw new Error('connect first');
    if (!conn) conn = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    if (!treasuryPk) { treasuryPk = (await fetch('/api/treasury/pubkey').then(r=>r.json())).pubkey; }
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

  document.getElementById('buyinBtn').addEventListener('click', async () => {
    if (!wallet) { setMsg('connect wallet first.', 'err'); return; }
    if (!currentRound || currentRound.status !== 'betting') { setMsg('window closed. wait for next round.', 'err'); return; }
    const amt = Number(document.getElementById('stakeInput').value || 0);
    if (amt < 100000) { setMsg('min buy-in: 100,000 $STYXX.', 'err'); return; }
    if (amt > 10000000) { setMsg('max bet: 10,000,000 $STYXX.', 'err'); return; }
    setMsg('signing... sending ' + fmt(amt) + ' $STYXX to the house', 'ok');
    let tx;
    try { tx = await payStake(amt); }
    catch (e) { setMsg('wallet rejected: ' + (e.message||'cancelled'), 'err'); return; }
    setMsg('paid. chip on the felt.', 'ok');
    const r = await fetch('/api/arena/bet', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ round_id: currentRound.id, user_wallet: wallet, stake_styxx: amt, payment_tx: tx }),
    });
    const d = await r.json();
    if (!d.ok) { setMsg('house rejected: ' + d.error, 'err'); return; }
    myBetId = d.bet_id; myBetLocked = false;
    setMsg('in. ride the multiplier.', 'ok');
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
    b.textContent = 'LOCKED @ ' + Number(d.multiplier).toFixed(2) + '×';
    setMsg('locked ' + Number(d.multiplier).toFixed(2) + '× · payout pending', 'ok');
  });

  async function poll() {
    try {
      const [roundR, jpR] = await Promise.all([
        fetch('/api/arena/round').then(r=>r.json()),
        fetch('/api/arena/jackpot').then(r=>r.json()),
      ]);
      if (roundR && roundR.id) currentRound = roundR;
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
    document.getElementById('burnNum').textContent = fmt(jp.burn_24h);
  }
  function renderRecent(list) {
    const el = document.getElementById('recentList');
    if (!list.length) return;
    el.innerHTML = list.slice(0, 10).map(r => {
      const won = r.status === 'cashed_out';
      const amt = won ? ('+' + fmt(r.payout_styxx)) : ('−' + fmt(r.stake_styxx));
      const m = r.cashout_multiplier ? Number(r.cashout_multiplier).toFixed(2) + '×' : 'CRASH';
      return '<div class="row ' + (won?'w':'l') + '"><span><span class="a">' + r.agent_id + '</span> · ' + r.user_wallet.slice(0,4) + '..' + r.user_wallet.slice(-3) + '</span><span class="m">' + m + '</span><span class="amt">' + amt + '</span></div>';
    }).join('');
  }
  function renderRound(r) {
    if (!r || !r.id) return;
    document.getElementById('roundNo').textContent = '#' + r.id.toString().padStart(4, '0');
    document.getElementById('sRound').textContent = '#' + r.id.toString().padStart(4, '0');
    document.getElementById('agentName').textContent = r.agent_id;
    document.getElementById('agentDistrict').textContent = r.district || 'unassigned';
    document.getElementById('agentRank').textContent = r.rank || 'citizen';
    document.getElementById('prompt').textContent = r.prompt;

    const chip = document.getElementById('statusChip');
    chip.textContent = r.status;
    chip.className = 'chip ' + r.status;

    const betForm = document.getElementById('betForm');
    const cashBtn = document.getElementById('cashoutBtn');
    const cursor = document.getElementById('cursor');

    if (r.status === 'betting') {
      betForm.style.display = 'grid';
      cashBtn.disabled = true; cashBtn.textContent = 'CASH OUT (place bet first)';
      const secs = Math.max(0, Math.floor((new Date(r.betting_window_ends_at).getTime() - Date.now())/1000));
      document.getElementById('multLabel').textContent = 'betting window · ' + secs + 's';
      document.getElementById('reasoningBody').textContent = 'agent warming up...';
      cursor.style.display = 'none';
      document.getElementById('multiplier').textContent = '1.00×';
      document.getElementById('multiplier').classList.remove('crashed');
    } else if (r.status === 'running') {
      betForm.style.display = 'none';
      if (r.multiplier_curve && r.elapsed_ms != null) {
        const elapsed = r.elapsed_ms;
        let mult = 1.0;
        let sentenceIdx = 0;
        for (let i = 0; i < r.multiplier_curve.length; i++) {
          if (r.multiplier_curve[i][0] > elapsed) break;
          mult = r.multiplier_curve[i][1];
          sentenceIdx = i;
        }
        document.getElementById('multiplier').textContent = Number(mult).toFixed(2) + '×';
        document.getElementById('multLabel').textContent = 'live · agent reasoning';
        if (r.sentences && sentenceIdx > 0) {
          const shown = r.sentences.slice(0, sentenceIdx).map(s => s.text).join(' ');
          document.getElementById('reasoningBody').textContent = shown;
          cursor.style.display = 'inline';
        }
        if (myBetId && !myBetLocked) { cashBtn.disabled = false; cashBtn.textContent = 'CASH OUT @ ' + Number(mult).toFixed(2) + '×'; }
      }
    } else if (r.status === 'resolving' || r.status === 'resolved') {
      betForm.style.display = 'none';
      const m = r.crash_multiplier || 1;
      document.getElementById('multiplier').textContent = Number(m).toFixed(2) + '×';
      document.getElementById('multiplier').classList.add('crashed');
      document.getElementById('multLabel').textContent = 'CRASHED';
      cursor.style.display = 'none';
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
