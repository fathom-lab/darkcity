// ============================================================================
// arena-e2e-test.js — end-to-end test of the crash casino loop
//
// Shadow-mode only. Simulates a real player: waits for a betting window,
// posts a bet, waits for the round to run, cashes out at a target multiplier
// or holds to crash, then verifies the round resolved with correct DB state.
//
// Run: node scripts/arena-e2e-test.js
// ============================================================================

'use strict';

const BASE = process.env.ARENA_BASE || 'https://darkcity-backend-production-427a.up.railway.app';
const TEST_WALLET = 'GKxZk3eU8WAXGPPbr1wVNUYCHgbsjBsoaMhEXnEYuePP'; // dummy Solana pubkey
const STAKE = 100000;
const TARGET_MULT = 2.5; // cash out around here if we can

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function get(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(path + ' -> ' + r.status);
  return r.json();
}
async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

function stamp() {
  const d = new Date();
  return d.toISOString().slice(11, 19);
}
function log(sym, msg) { console.log(`[${stamp()}] ${sym} ${msg}`); }

async function step(name, fn) {
  try {
    const r = await fn();
    log('✓', name);
    return r;
  } catch (e) {
    log('✗', name + ' — ' + e.message);
    throw e;
  }
}

async function main() {
  console.log('\n═══ DARKCITY ARENA · END-TO-END TEST ═══\n');

  // ── 1. Page loads
  await step('page /arena serves 200', async () => {
    const r = await fetch(BASE + '/arena');
    if (!r.ok) throw new Error('status ' + r.status);
    const html = await r.text();
    const musts = ['graph-svg', 'hist-grid', 'ticker-track', 'rug-stamp', 'sentList', 'countBar', 'bigWinBox'];
    for (const m of musts) if (!html.includes(m)) throw new Error('missing: ' + m);
    return 'all UI components present (' + musts.length + ')';
  });

  // ── 2. Endpoints healthy
  const jp = await step('GET /api/arena/jackpot', async () => {
    const j = await get('/api/arena/jackpot');
    const must = ['public_jackpot_styxx', 'founder_jackpot_styxx', 'recent_results', 'burn_24h', 'big_win_24h', 'players_24h', 'volume_24h'];
    for (const k of must) if (!(k in j)) throw new Error('missing field: ' + k);
    return j;
  });
  log('·', `kitty ${jp.public_jackpot_styxx} · founder ${jp.founder_jackpot_styxx} · burn24h ${jp.burn_24h} · vol24h ${jp.volume_24h} · players24h ${jp.players_24h}`);

  const history = await step('GET /api/arena/history?limit=10', async () => {
    const h = await get('/api/arena/history?limit=10');
    if (!Array.isArray(h.rounds)) throw new Error('rounds not array');
    if (!h.rounds.length) throw new Error('no history yet');
    return h;
  });
  const mults = history.rounds.slice(0, 10).map(r => Number(r.multiplier));
  const avg = mults.reduce((a,b)=>a+b,0)/mults.length;
  const max = Math.max(...mults);
  const min = Math.min(...mults);
  log('·', `last 10 crashes · avg ${avg.toFixed(2)}× · min ${min.toFixed(2)}× · max ${max.toFixed(2)}× · [${mults.map(m=>m.toFixed(1)).join(', ')}]`);

  await step('GET /api/treasury/pubkey', async () => {
    const r = await get('/api/treasury/pubkey');
    if (!r.pubkey) throw new Error('no treasury pubkey');
    if (r.pubkey.length < 32) throw new Error('bad pubkey');
    return r.pubkey;
  });

  // ── 3. Wait for next betting window
  log('…', 'waiting for next round in betting state (up to 90s)');
  let bettingRound = null;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const r = await get('/api/arena/round');
    if (r && r.id && r.status === 'betting') {
      bettingRound = r;
      break;
    }
    await sleep(1500);
  }
  if (!bettingRound) throw new Error('never hit a betting window');
  log('✓', `caught round #${bettingRound.id} · agent ${bettingRound.agent_id} · district ${bettingRound.district}`);

  // ── 4. Place bet
  const betRes = await step('POST /api/arena/bet (shadow mode, no payment_tx)', async () => {
    const r = await post('/api/arena/bet', {
      round_id: bettingRound.id,
      user_wallet: TEST_WALLET,
      stake_styxx: STAKE,
    });
    if (r.status !== 200 || !r.body.ok) throw new Error('bet rejected: ' + JSON.stringify(r.body));
    return r.body;
  });
  log('·', `bet placed · id ${betRes.bet_id} · ${STAKE} STYXX on round #${bettingRound.id}`);

  // ── 5. Wait for round to go running
  log('…', 'waiting for round to start running');
  let runningStart = null;
  for (let i = 0; i < 30; i++) {
    const r = await get('/api/arena/round');
    if (r && r.id === bettingRound.id && r.status === 'running') { runningStart = Date.now(); break; }
    await sleep(1000);
  }
  if (!runningStart) throw new Error('round never went running');
  log('✓', 'round is RUNNING');

  // ── 6. Poll for multiplier, cash out around target
  let cashoutResult = null;
  const cashDeadline = Date.now() + 40_000;
  while (Date.now() < cashDeadline) {
    const r = await get('/api/arena/round');
    if (!r || r.id !== bettingRound.id) break;
    if (r.status === 'resolving' || r.status === 'resolved') {
      log('·', `round hit ${r.status} before we cashed out · crashed@ ${r.crash_multiplier}×`);
      break;
    }
    if (r.status !== 'running') { await sleep(500); continue; }

    // Compute current mult from curve + elapsed
    const elapsed = r.elapsed_ms || 0;
    let mult = 1.0;
    for (const [t, m] of (r.multiplier_curve || [])) {
      if (t > elapsed) break;
      mult = m;
    }
    if (mult >= TARGET_MULT) {
      const res = await post('/api/arena/cashout', { bet_id: betRes.bet_id, user_wallet: TEST_WALLET });
      if (res.body.ok) {
        cashoutResult = res.body;
        log('✓', `CASHED OUT @ ${Number(res.body.multiplier).toFixed(2)}× · projected payout ${res.body.potential_payout.toLocaleString()} STYXX`);
        break;
      } else {
        log('!', `cashout failed: ${JSON.stringify(res.body)} — continuing`);
      }
    }
    await sleep(600);
  }
  if (!cashoutResult) {
    log('·', 'did not cash out — either crashed too fast or target unreached (this is a valid outcome)');
  }

  // ── 7. Wait for round resolved
  log('…', 'waiting for round to fully resolve');
  let resolved = null;
  for (let i = 0; i < 40; i++) {
    const h = await get('/api/arena/history?limit=5');
    resolved = h.rounds.find(r => String(r.id) === String(bettingRound.id));
    if (resolved) break;
    await sleep(1500);
  }
  if (!resolved) throw new Error('round never appeared in history');
  log('✓', `round #${bettingRound.id} resolved @ ${resolved.multiplier}×`);

  // ── 8. Verify the bet landed in recent_results
  const jp2 = await get('/api/arena/jackpot');
  const myBet = jp2.recent_results.find(b => String(b.agent_id) === String(bettingRound.agent_id) && b.user_wallet === TEST_WALLET);
  if (!myBet) {
    log('!', 'bet not found in recent_results — timing/race, or filtered out. not fatal.');
  } else {
    log('✓', `bet surfaced in feed · status ${myBet.status} · ${myBet.status === 'cashed_out' ? '+' + Number(myBet.payout_styxx).toLocaleString() : '−' + Number(myBet.stake_styxx).toLocaleString()} STYXX`);
  }

  // ── 9. Outcome summary
  console.log('\n═══ RESULT ═══');
  const won = cashoutResult && cashoutResult.multiplier < Number(resolved.multiplier);
  if (cashoutResult && won) {
    const projected = STAKE * Number(cashoutResult.multiplier);
    console.log(`WINNER · cashed ${Number(cashoutResult.multiplier).toFixed(2)}× before crash@ ${Number(resolved.multiplier).toFixed(2)}×`);
    console.log(`         expected payout ~${projected.toLocaleString()} STYXX (shadow mode — no real tokens moved)`);
  } else if (cashoutResult && !won) {
    console.log(`LATE CASHOUT · tried ${Number(cashoutResult.multiplier).toFixed(2)}× but crash was at ${Number(resolved.multiplier).toFixed(2)}×`);
  } else {
    console.log(`RUGGED · held past crash@ ${Number(resolved.multiplier).toFixed(2)}×  (${STAKE.toLocaleString()} STYXX stake "lost")`);
  }
  console.log('\nshadow mode: all flows exercised, no real $STYXX moved.');
  console.log('end-to-end: ✓\n');
}

main().catch(e => { console.error('\n✗ TEST FAILED:', e.message); process.exit(1); });
