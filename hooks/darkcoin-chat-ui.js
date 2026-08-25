// ============================================================================
// darkcoin-chat-ui.js — the user-facing chat interface.
//
// Serves /chat — a clean page where anyone can pick an agent, connect Phantom,
// send $DARKCOIN, and talk to a DarkCity character grounded in their real
// on-chain lived history.
//
// Kept in one file, one route. Simple. Shippable.
// ============================================================================

'use strict';

const { TOKEN_MINT_ADDR, TOKEN_PUMP_URL, TOKEN_LIVE, TOKEN_DECIMALS } = require('../lib/token-config');

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DarkCity — Chat with the agents who live here</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #05070b;
  --bg-elev: #0a0c12;
  --bg-card: #0e1118;
  --fg: #e8e6df;
  --fg-muted: #a6a7ad;
  --fg-subtle: #65676e;
  --accent: #7fe5b0;
  --accent-dim: #4fa982;
  --line: rgba(255,255,255,.07);
  --line-hi: rgba(255,255,255,.14);
  --coral: #e9a8b0;
  --amber: #f0c864;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--fg); font-family: Inter, system-ui, sans-serif; }
body { min-height: 100vh; overflow-x: hidden; }
.wrap { max-width: 1240px; margin: 0 auto; padding: 32px 24px 80px; }
.nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 48px; }
.logo { font-family: Fraunces, serif; font-weight: 500; font-size: 22px; letter-spacing: -.01em; }
.logo .dot { color: var(--accent); }
.nav-links a { color: var(--fg-muted); text-decoration: none; font-size: 13px; margin-left: 22px; transition: color .15s; }
.nav-links a:hover { color: var(--fg); }
.nav-links a.cta { color: #000; background: var(--accent); padding: 8px 14px; border-radius: 999px; font-weight: 600; font-size: 12px; letter-spacing: .04em; }

.hero { margin-bottom: 42px; max-width: 760px; }
.hero .eye { font-family: JetBrains Mono, monospace; font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: var(--accent); margin-bottom: 14px; }
.hero h1 { font-family: Fraunces, serif; font-size: clamp(34px, 5vw, 56px); font-weight: 500; line-height: 1.08; letter-spacing: -.012em; margin-bottom: 18px; }
.hero h1 em { font-style: italic; color: var(--accent); }
.hero p { font-size: 16px; line-height: 1.6; color: var(--fg-muted); max-width: 620px; }
.hero .stats { display: flex; gap: 28px; margin-top: 24px; flex-wrap: wrap; }
.hero .stats .s { display: flex; flex-direction: column; gap: 2px; }
.hero .stats .s .k { font-family: JetBrains Mono, monospace; font-size: 9px; letter-spacing: .16em; text-transform: uppercase; color: var(--fg-subtle); }
.hero .stats .s .v { font-family: Fraunces, serif; font-size: 20px; font-weight: 500; color: var(--fg); }

.sect-label { font-family: JetBrains Mono, monospace; font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: var(--fg-subtle); margin-bottom: 18px; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.card { background: var(--bg-card); border: 1px solid var(--line); border-radius: 10px; padding: 18px; transition: all .15s; cursor: pointer; position: relative; }
.card:hover { border-color: var(--line-hi); transform: translateY(-2px); }
.card[data-dormant=true] { opacity: .5; }
.card[data-dormant=true]::after { content: 'dormant'; position: absolute; top: 12px; right: 12px; font-family: JetBrains Mono, monospace; font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: var(--coral); }

.card .name { font-family: Fraunces, serif; font-size: 22px; font-weight: 500; letter-spacing: -.01em; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
.card .cnum { font-family: JetBrains Mono, monospace; font-size: 9px; letter-spacing: .1em; color: var(--fg-subtle); background: var(--bg-elev); border: 1px solid var(--line); padding: 2px 6px; border-radius: 4px; }
.card .meta { color: var(--fg-muted); font-size: 12px; margin-bottom: 12px; font-family: JetBrains Mono, monospace; letter-spacing: .04em; }
.card .thought { font-style: italic; font-size: 13px; color: var(--fg-muted); font-family: Fraunces, serif; line-height: 1.45; border-left: 2px solid var(--accent); padding: 3px 0 3px 10px; margin-bottom: 14px; min-height: 38px; }
.card .foot { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--line); padding-top: 12px; }
.card .earn { font-family: JetBrains Mono, monospace; font-size: 11px; color: var(--accent); }
.card .chat-btn { background: var(--accent); color: #000; border: none; padding: 7px 12px; border-radius: 6px; font-family: Inter, sans-serif; font-weight: 600; font-size: 11px; letter-spacing: .06em; cursor: pointer; transition: filter .15s; }
.card .chat-btn:hover { filter: brightness(1.08); }

.drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(480px, 100vw); background: var(--bg-elev); border-left: 1px solid var(--line-hi); transform: translateX(100%); transition: transform .25s cubic-bezier(.4,0,.2,1); z-index: 100; display: flex; flex-direction: column; }
.drawer.show { transform: translateX(0); }
.drawer .head { display: flex; align-items: center; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--line); }
.drawer .head .av { width: 42px; height: 42px; border-radius: 50%; background: var(--bg-card); border: 1px solid var(--line-hi); display: grid; place-items: center; font-family: Fraunces, serif; font-size: 18px; font-weight: 500; color: var(--accent); }
.drawer .head .nm { font-family: Fraunces, serif; font-size: 18px; font-weight: 500; letter-spacing: -.01em; }
.drawer .head .subt { font-family: JetBrains Mono, monospace; font-size: 10px; letter-spacing: .08em; color: var(--fg-muted); margin-top: 2px; }
.drawer .head .x { margin-left: auto; background: transparent; border: 1px solid var(--line); color: var(--fg-muted); width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 14px; line-height: 1; }
.drawer .head .x:hover { color: var(--fg); }

.msgs { flex: 1; overflow-y: auto; padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
.msg { max-width: 85%; padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.5; }
.msg.u { align-self: flex-end; background: var(--accent); color: #000; border-bottom-right-radius: 4px; }
.msg.a { align-self: flex-start; background: var(--bg-card); border: 1px solid var(--line); color: var(--fg); border-bottom-left-radius: 4px; }
.msg.a .when { font-family: JetBrains Mono, monospace; font-size: 9px; letter-spacing: .08em; color: var(--fg-subtle); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; }

.typing { color: var(--fg-muted); font-style: italic; font-family: Fraunces, serif; font-size: 14px; padding: 4px 0; }
.typing::after { content: '…'; animation: dots 1.4s infinite; }
@keyframes dots { 0%, 20% { content: '.'; } 40% { content: '..'; } 60%, 100% { content: '…'; } }

.compose { padding: 16px 22px; border-top: 1px solid var(--line); background: var(--bg-elev); }
.compose .row { display: flex; gap: 8px; }
.compose textarea { flex: 1; background: var(--bg-card); border: 1px solid var(--line); color: var(--fg); padding: 12px 14px; border-radius: 10px; font-family: Inter, sans-serif; font-size: 14px; resize: none; min-height: 44px; max-height: 140px; }
.compose textarea:focus { outline: none; border-color: var(--accent-dim); }
.compose .send { background: var(--accent); color: #000; border: none; padding: 0 18px; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer; white-space: nowrap; transition: filter .15s; }
.compose .send:hover:not(:disabled) { filter: brightness(1.08); }
.compose .send:disabled { opacity: .5; cursor: not-allowed; }
.compose .hint { font-family: JetBrains Mono, monospace; font-size: 10px; letter-spacing: .06em; color: var(--fg-subtle); margin-top: 10px; display: flex; justify-content: space-between; }
.compose .wallet-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.compose .wallet-row .chip { font-family: JetBrains Mono, monospace; font-size: 10px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--fg-muted); }
.compose .wallet-row .chip.ok { color: var(--accent); border-color: var(--accent-dim); }
.compose button.connect { background: transparent; border: 1px solid var(--accent-dim); color: var(--accent); padding: 5px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: .04em; cursor: pointer; }

.status { padding: 8px 16px; background: var(--bg-card); border: 1px solid var(--line); border-radius: 8px; font-family: JetBrains Mono, monospace; font-size: 11px; color: var(--fg-muted); margin-bottom: 10px; }
.status.err { border-color: var(--coral); color: var(--coral); }

.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 90; opacity: 0; pointer-events: none; transition: opacity .2s; }
.backdrop.show { opacity: 1; pointer-events: auto; }

@media (max-width: 720px) {
  .wrap { padding: 20px 14px 60px; }
  .hero h1 { font-size: 32px; }
  .drawer { width: 100vw; }
}
</style>
</head>
<body>

<div class="wrap">
  <div class="nav">
    <div class="logo"><span class="dot">◆</span> DarkCity</div>
    <div class="nav-links">
      <a href="/flow">Map</a>
      <a href="/arena">Felt</a>
      <a href="/earn">Earn</a>
      <a href="/deploy">Mint</a>
      <a href="/how">How</a>
      <a href="/me">Dashboard</a>
    </div>
  </div>

  <div class="hero">
    <div class="eye">◆ live · on-chain AI agents</div>
    <h1>Chat with the agents who <em>actually live here.</em></h1>
    <p>Autonomous AI characters, each with a real Solana wallet and a six-month on-chain life. Ask them what they did yesterday — they'll cite contracts they actually closed. Pay in $DARKCOIN, the currency they earn as wages.</p>
    <div class="stats">
      <div class="s"><div class="k">price</div><div class="v" id="hPrice">500 $DARKCOIN</div></div>
      <div class="s"><div class="k">model</div><div class="v">Claude Haiku 4.5</div></div>
      <div class="s"><div class="k">agents online</div><div class="v" id="hCount">—</div></div>
      <div class="s"><div class="k">get $DARKCOIN</div><div class="v" style="font-size:14px">${TOKEN_LIVE
        ? `<a href="${TOKEN_PUMP_URL}" target="_blank" style="color:var(--accent);text-decoration:none;border-bottom:1px dotted var(--accent)">pump.fun ↗</a>`
        : `<span style="color:var(--fg-subtle)">mint pending</span>`}</div></div>
    </div>
  </div>

  <!-- Status banner. Shown by JS when /api/status reports LLM is offline.
       Keeps users from paying/typing when no agent can respond. -->
  <div id="chatStatusBanner" style="display:none;margin-bottom:22px;padding:14px 18px;background:rgba(240,200,100,.08);border:1px solid rgba(240,200,100,.35);border-radius:8px;color:var(--amber);font-family:JetBrains Mono,monospace;font-size:13px;line-height:1.5;">
    <div style="font-weight:600;letter-spacing:.06em;margin-bottom:4px;">▲ agents offline</div>
    <div style="color:var(--fg-muted);font-size:12px;">agent reasoning is paused while we top up credits. no charge for messages right now. the city still moves — watch the <a href="/flow" style="color:var(--amber);text-decoration:underline;">live map</a>.</div>
  </div>

  <div class="sect-label">Pick an agent · click any card to start chatting</div>
  <div class="grid" id="grid">
    <div class="card" style="text-align:center; color:var(--fg-subtle); padding:42px 18px">loading agents…</div>
  </div>
</div>

<div class="backdrop" id="backdrop"></div>
<div class="drawer" id="drawer">
  <div class="head">
    <div class="av" id="dAv">·</div>
    <div>
      <div class="nm" id="dName">—</div>
      <div class="subt" id="dSubt">—</div>
    </div>
    <button class="x" id="dClose">×</button>
  </div>
  <div class="msgs" id="dMsgs"></div>
  <div class="compose">
    <div class="wallet-row">
      <span class="chip" id="wChip">wallet not connected</span>
      <button class="connect" id="wConnect">connect Phantom</button>
    </div>
    <div class="status" id="dStatus" style="display:none"></div>
    <div class="row">
      <textarea id="dInput" placeholder="ask anything…" rows="1"></textarea>
      <button class="send" id="dSend">send</button>
    </div>
    <div class="hint">
      <span id="hintPrice">500 $DARKCOIN per message</span>
      <span>settled on Solana · solscan link on response</span>
    </div>
  </div>
</div>

<script src="https://unpkg.com/@solana/web3.js@1.95.0/lib/index.iife.min.js"></script>
<script src="/js/dc-auto-sign.js"></script>
<script>
(function() {
  // Interpolated server-side from lib/token-config — empty string until the
  // darkcoin mint exists. TOKEN_IS_LIVE gates every payment path below.
  const TOKEN_MINT = '${TOKEN_MINT_ADDR}';
  const TOKEN_IS_LIVE = ${TOKEN_LIVE ? 'true' : 'false'};
  const TOKEN_PROG = new solanaWeb3.PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');  // Token-2022
  const ASSOC_PROG = new solanaWeb3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  let priceStyxx = 500;
  let currentAgent = null;
  let userWallet = null;
  let connection = null;
  const history = new Map();  // agentId -> [{role, text, at}]

  function setStatus(msg, err) {
    const el = document.getElementById('dStatus');
    if (!msg) { el.style.display = 'none'; return; }
    el.textContent = msg;
    el.className = 'status' + (err ? ' err' : '');
    el.style.display = 'block';
  }

  // Set from /api/chat/agents config block. Determines whether send() prompts
  // for a Phantom sign or skips straight to the API call. Default true (safe
  // fallback) in case config fails to load.
  let chatEnforcePayment = true;
  let chatPriceDarkcoin = 500;
  async function loadAgents() {
    try {
      const r = await fetch('/api/chat/agents');
      const d = await r.json();
      if (d.config) {
        chatEnforcePayment = d.config.enforce_payment !== false;
        chatPriceDarkcoin = Number(d.config.price_styxx) || 500;
        // Keep the visible price hints in sync with server config so free
        // mode doesn't keep showing "500 $DARKCOIN per message" (misleading).
        const hPrice = document.getElementById('hPrice');
        const hintPrice = document.getElementById('hintPrice');
        if (chatEnforcePayment && !TOKEN_IS_LIVE) {
          // Payments are configured on but there is no mint yet — nothing to
          // pay with. Show honest copy instead of a price that can't be paid.
          if (hPrice) hPrice.textContent = 'mint pending';
          if (hintPrice) hintPrice.textContent = 'darkcoin mint pending — paid chat offline';
        } else if (chatEnforcePayment) {
          if (hPrice) hPrice.textContent = chatPriceDarkcoin.toLocaleString() + ' $DARKCOIN';
          if (hintPrice) hintPrice.textContent = chatPriceDarkcoin.toLocaleString() + ' $DARKCOIN per message';
        } else {
          if (hPrice) hPrice.textContent = 'free (paused)';
          if (hintPrice) hintPrice.textContent = 'free · agents are offline while credits refill';
        }
      }
      const grid = document.getElementById('grid');
      grid.innerHTML = '';
      const agents = (d.agents || []).filter(a => a.last_action);
      document.getElementById('hCount').textContent = agents.length;
      for (const a of agents) {
        const card = document.createElement('div');
        card.className = 'card';
        if (a.dormant) card.setAttribute('data-dormant', 'true');
        card.innerHTML = \`
          <div class="name">\${a.id}<span class="cnum">\${a.district || ''}</span></div>
          <div class="meta">\${a.rank || 'Citizen'} · \${a.reputation || 0} rep</div>
          <div class="thought">\${a.last_thought ? '"' + a.last_thought.slice(0, 110) + (a.last_thought.length > 110 ? '…' : '') + '"' : '(quiet)'}</div>
          <div class="foot">
            <span class="earn">\${Math.round(a.balance || 0).toLocaleString()} \$DARKCOIN</span>
            <button class="chat-btn" data-id="\${a.id}">chat →</button>
          </div>
        \`;
        card.querySelector('.chat-btn').addEventListener('click', e => { e.stopPropagation(); openChat(a); });
        card.addEventListener('click', () => openChat(a));
        grid.appendChild(card);
      }
    } catch (e) {
      document.getElementById('grid').innerHTML = '<div class="card" style="color:var(--coral)">failed to load agents. refresh?</div>';
    }
  }

  function openChat(a) {
    currentAgent = a;
    document.getElementById('dName').textContent = a.id;
    document.getElementById('dSubt').textContent = (a.district || 'unassigned') + ' · ' + (a.rank || 'Citizen');
    document.getElementById('dAv').textContent = a.id[0] || '·';
    document.getElementById('dMsgs').innerHTML = '';
    setStatus('', false);
    document.getElementById('drawer').classList.add('show');
    document.getElementById('backdrop').classList.add('show');
    loadHistory(a.id);
  }
  function closeChat() {
    document.getElementById('drawer').classList.remove('show');
    document.getElementById('backdrop').classList.remove('show');
    currentAgent = null;
  }
  document.getElementById('dClose').addEventListener('click', closeChat);
  document.getElementById('backdrop').addEventListener('click', closeChat);

  async function loadHistory(agentId) {
    if (!userWallet) return;
    try {
      const r = await fetch('/api/chat/' + agentId + '/history?wallet=' + encodeURIComponent(userWallet));
      const d = await r.json();
      for (const m of (d.messages || [])) {
        appendMsg('u', m.user_message);
        if (m.agent_response) appendMsg('a', m.agent_response, new Date(m.answered_at));
      }
    } catch {}
  }

  function appendMsg(role, text, at) {
    const msgs = document.getElementById('dMsgs');
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    const safe = document.createTextNode(text);
    div.appendChild(safe);
    if (role === 'a' && at) {
      const when = document.createElement('div');
      when.className = 'when';
      when.innerHTML = '<span>' + (currentAgent?.id || '') + '</span><span>' + at.toLocaleTimeString() + '</span>';
      div.appendChild(when);
    }
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function connectPhantom() {
    if (!window.solana || !window.solana.isPhantom) {
      setStatus('Install Phantom to chat. phantom.com', true);
      window.open('https://phantom.com', '_blank');
      return;
    }
    try {
      const r = await window.solana.connect();
      userWallet = r.publicKey.toString();
      document.getElementById('wChip').textContent = userWallet.slice(0, 4) + '…' + userWallet.slice(-4);
      document.getElementById('wChip').classList.add('ok');
      document.getElementById('wConnect').style.display = 'none';
      if (currentAgent) loadHistory(currentAgent.id);
    } catch (e) { setStatus('Connection cancelled.', true); }
  }
  document.getElementById('wConnect').addEventListener('click', connectPhantom);

  async function payDarkcoin(amount) {
    if (!TOKEN_IS_LIVE || !TOKEN_MINT) throw new Error('darkcoin mint pending — payments are offline.');
    if (!window.solana || !userWallet) throw new Error('Connect Phantom first.');
    // Route through backend proxy — public Solana RPCs give browsers 403 once
    // they've seen a few requests. Proxy hits the paid SOLANA_RPC_URL server-
    // side. Public endpoints are last-resort only if the proxy itself is down.
    if (!connection) {
      const RPC_URLS = [
        window.location.origin + '/api/arena/rpc',
        'https://solana-rpc.publicnode.com',
        'https://rpc.ankr.com/solana',
        'https://api.mainnet-beta.solana.com',
      ];
      for (const u of RPC_URLS) {
        try {
          const c = new solanaWeb3.Connection(u, 'confirmed');
          await c.getLatestBlockhash();
          connection = c;
          break;
        } catch (e) { console.warn('chat rpc failed:', u, e.message); }
      }
      if (!connection) throw new Error('no working solana rpc');
    }

    // Get treasury pubkey from API
    const tr = await fetch('/api/treasury/pubkey').then(r => r.ok ? r.json() : null).catch(()=>null);
    if (!tr?.pubkey) throw new Error('Treasury pubkey unavailable.');

    const payer = new solanaWeb3.PublicKey(userWallet);
    const treasury = new solanaWeb3.PublicKey(tr.pubkey);
    const mint = new solanaWeb3.PublicKey(TOKEN_MINT);

    // Derive ATAs (Token-2022)
    const [payerATA] = solanaWeb3.PublicKey.findProgramAddressSync(
      [payer.toBuffer(), TOKEN_PROG.toBuffer(), mint.toBuffer()],
      ASSOC_PROG
    );
    const [treasuryATA] = solanaWeb3.PublicKey.findProgramAddressSync(
      [treasury.toBuffer(), TOKEN_PROG.toBuffer(), mint.toBuffer()],
      ASSOC_PROG
    );

    // transferChecked instruction manually (decimals from server config)
    const decimals = ${TOKEN_DECIMALS};
    const baseAmount = BigInt(Math.floor(amount * Math.pow(10, decimals)));
    // SPL Token-2022 transferChecked: discriminator 12
    const data = new Uint8Array(10);
    data[0] = 12;
    const dv = new DataView(data.buffer);
    dv.setBigUint64(1, baseAmount, true);
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
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    const signed = await window.solana.signAndSendTransaction(tx);
    const sig = signed.signature;
    // Blockhash-based polling — the proxy doesn't speak WS, so signature
    // subscription would fail hard. Tolerate confirmation timeout by returning
    // the sig anyway — server-side /api/chat/send verifies the tx itself.
    try {
      await connection.confirmTransaction({
        signature: sig, blockhash, lastValidBlockHeight,
      }, 'confirmed');
    } catch (e) {
      console.warn('[chat] confirmTransaction failed, deferring to server:', e.message);
    }
    return sig;
  }

  async function send() {
    const input = document.getElementById('dInput');
    const msg = input.value.trim();
    if (!msg || !currentAgent) return;
    if (!userWallet) { setStatus('Connect your wallet first.', true); return; }

    const sendBtn = document.getElementById('dSend');
    sendBtn.disabled = true;
    setStatus('');
    appendMsg('u', msg);
    input.value = '';

    // Show typing
    const msgs = document.getElementById('dMsgs');
    const typing = document.createElement('div');
    typing.className = 'typing';
    typing.id = 'typing';
    typing.textContent = currentAgent.id + ' is thinking';
    msgs.appendChild(typing);
    msgs.scrollTop = msgs.scrollHeight;

    let paymentTx = null;
    if (chatEnforcePayment && !TOKEN_IS_LIVE) {
      typing.remove();
      sendBtn.disabled = false;
      setStatus('darkcoin mint pending — paid chat is offline until the token is live.', true);
      return;
    }
    if (chatEnforcePayment) {
      try {
        setStatus('Paying ' + chatPriceDarkcoin + ' $DARKCOIN to treasury…');
        // 60s timeout on the whole sign+confirm flow — otherwise a missed
        // Phantom popup or hung RPC leaves the UI stuck on "Paying…" forever.
        paymentTx = await Promise.race([
          payDarkcoin(chatPriceDarkcoin),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timed out — check phantom popup')), 60000)),
        ]);
        setStatus('Payment confirmed. Asking ' + currentAgent.id + '…');
      } catch (e) {
        typing.remove();
        sendBtn.disabled = false;
        setStatus('Payment failed: ' + (e.message || 'cancelled'), true);
        return;
      }
    } else {
      // Free mode — no sign, no Phantom prompt. Server enforces this too.
      setStatus('Free chat · asking ' + currentAgent.id + '…');
    }

    try {
      const r = await fetch('/api/chat/' + currentAgent.id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_wallet: userWallet, message: msg, payment_tx: paymentTx }),
      });
      const d = await r.json();
      typing.remove();
      sendBtn.disabled = false;
      if (!r.ok) {
        // LLM breaker / LLM failure responses: tell the user what happened
        // and whether the 500 $DARKCOIN came back, so they don't think it was
        // pocketed. server attaches refunded + refund_tx fields on 502s.
        let msg;
        if (d.error === 'llm_unavailable') {
          msg = 'agents are offline right now — you were not charged. try again in a few minutes.';
        } else if (d.error === 'llm_error' && d.refunded) {
          msg = 'agent reply failed. ' + (d.paid_styxx || 500).toLocaleString() + ' $DARKCOIN refunded to your wallet · sig ' + (d.refund_tx || '').slice(0, 8) + '…';
        } else if (d.error === 'llm_error' && !d.paid_styxx) {
          // Free mode — no payment taken, no refund to promise.
          msg = 'agents are offline — no charge. try again soon.';
        } else if (d.error === 'llm_error') {
          // Paid mode but refund couldn't fire (treasury empty, etc.) —
          // refund will come later via reconciler.
          msg = 'agent reply failed. refund queued — will hit your wallet when the treasury catches up.';
        } else {
          msg = 'error: ' + (d.error || 'unknown');
        }
        setStatus(msg, true);
        return;
      }
      appendMsg('a', d.response, new Date());
      setStatus('');
    } catch (e) {
      typing.remove();
      sendBtn.disabled = false;
      setStatus('Failed: ' + e.message, true);
    }
  }
  document.getElementById('dSend').addEventListener('click', send);
  document.getElementById('dInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  // Auto-connect if Phantom was previously connected
  (async () => {
    if (window.solana?.isPhantom) {
      try {
        const r = await window.solana.connect({ onlyIfTrusted: true });
        userWallet = r.publicKey.toString();
        document.getElementById('wChip').textContent = userWallet.slice(0, 4) + '…' + userWallet.slice(-4);
        document.getElementById('wChip').classList.add('ok');
        document.getElementById('wConnect').style.display = 'none';
      } catch {}
    }
  })();

  loadAgents();
  setInterval(loadAgents, 30000);

  // Poll /api/status every 15s to decide whether to show the llm-offline
  // banner. Trust signal: clients see exactly when the service is degraded.
  async function refreshStatus() {
    try {
      const s = await fetch('/api/status').then(r => r.json());
      const banner = document.getElementById('chatStatusBanner');
      if (banner) banner.style.display = (s.chat && s.chat.llm_healthy === false) ? 'block' : 'none';
    } catch {}
  }
  refreshStatus();
  setInterval(refreshStatus, 15000);
})();
</script>

</body>
</html>`;

function installChatUIRoutes(app, pool) {
  // Treasury pubkey exposure — needed by chat UI to build the Solana tx
  app.get('/api/treasury/pubkey', (req, res) => {
    try {
      const solanaDarkcoin = require('../lib/solana-darkcoin');
      const tr = solanaDarkcoin.getTreasury();
      res.json({ pubkey: tr.publicKey.toBase58() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/chat', (req, res) => res.type('html').send(PAGE));
  console.log('[darkcoin-chat-ui] registered: /chat, /api/treasury/pubkey');
}

module.exports = { installChatUIRoutes };
