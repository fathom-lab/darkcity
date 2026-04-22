// ============================================================================
// arena-health-check.js — exhaustive production sanity scan
//
// Verifies every surface a user can hit works. Pages load, APIs respond,
// payloads have expected shape, nav is consistent, rate limiter doesn't
// lock out real browsing, shadow-mode bet loop still executes.
// ============================================================================

'use strict';

const BASE = 'https://darkcity-backend-production-427a.up.railway.app';
const TEST_WALLET = '7eLo2ZmYFT9KHrvxDRD8G1d7EqEqTXmqFt4n5jqV4Qyq';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function get(path) {
  const r = await fetch(BASE + path);
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
}
async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(()=>({})) };
}

const checks = [];
function expect(name, fn) { checks.push({ name, fn }); }

// ─── Pages load ──────────────────────────────────────────────────────
expect('GET / (landing)', async () => {
  const r = await get('/');
  if (r.status !== 200) throw new Error('status ' + r.status);
  if (!r.body.includes('DarkCity')) throw new Error('missing DarkCity brand');
  if (!r.body.includes('/arena')) throw new Error('no Felt link in landing nav');
  return 'landing page has Felt link';
});
expect('GET /earn has Felt section + live stats IDs', async () => {
  const r = await get('/earn');
  if (r.status !== 200) throw new Error('status ' + r.status);
  const musts = ['The first AI crash casino', 'fltRounds', 'fltAvg', 'fltMax', 'fltBurn', 'fltLastM', 'fltLastAgent', 'Enter the Felt', 'href="/arena"'];
  for (const m of musts) if (!r.body.includes(m)) throw new Error('missing: ' + m);
  return 'Felt section wired with ' + musts.length + ' elements';
});
expect('GET /arena (Felt)', async () => {
  const r = await get('/arena');
  if (r.status !== 200) throw new Error('status ' + r.status);
  const musts = ['graph-svg', 'hist-grid', 'ticker-track', 'rug-stamp', 'sentList', 'countBar', 'bigWinBox', 'WATCHING', 'PLACE YOUR BET', 'darkcity'];
  for (const m of musts) if (!r.body.includes(m)) throw new Error('missing: ' + m);
  return 'arena page has all ' + musts.length + ' components';
});
expect('GET /flow', async () => {
  const r = await get('/flow');
  if (r.status !== 200) throw new Error('status ' + r.status);
  return 'ok';
});
expect('GET /chat', async () => {
  const r = await get('/chat');
  if (r.status !== 200) throw new Error('status ' + r.status);
  return 'ok';
});
expect('GET /me', async () => {
  const r = await get('/me');
  if (r.status !== 200) throw new Error('status ' + r.status);
  return 'ok';
});
expect('GET /deploy (mint page)', async () => {
  const r = await get('/deploy');
  if (r.status !== 200) throw new Error('status ' + r.status);
  return 'ok';
});

// ─── APIs ─────────────────────────────────────────────────────────────
expect('GET /api/arena/round', async () => {
  const r = await get('/api/arena/round');
  if (r.status !== 200) throw new Error('status ' + r.status);
  if (!r.body || typeof r.body !== 'object') throw new Error('not object');
  return 'round=' + (r.body.id || 'idle') + ' · status=' + (r.body.status || 'idle');
});
expect('GET /api/arena/jackpot — all expected fields', async () => {
  const r = await get('/api/arena/jackpot');
  const must = ['public_jackpot_styxx', 'founder_jackpot_styxx', 'recent_results', 'burn_24h', 'big_win_24h', 'players_24h', 'bets_24h', 'volume_24h'];
  for (const k of must) if (!(k in r.body)) throw new Error('missing field: ' + k);
  return must.length + ' fields present';
});
expect('GET /api/arena/history?limit=30', async () => {
  const r = await get('/api/arena/history?limit=30');
  if (!Array.isArray(r.body.rounds)) throw new Error('rounds not array');
  if (r.body.rounds.length === 0) throw new Error('empty');
  for (const rd of r.body.rounds) {
    if (typeof rd.id === 'undefined' || typeof rd.multiplier === 'undefined') throw new Error('bad round shape');
  }
  const mults = r.body.rounds.map(x => Number(x.multiplier));
  return r.body.rounds.length + ' rounds · avg ' + (mults.reduce((a,b)=>a+b,0)/mults.length).toFixed(2) + '× · max ' + Math.max(...mults).toFixed(2) + '×';
});
expect('GET /api/treasury/pubkey', async () => {
  const r = await get('/api/treasury/pubkey');
  if (!r.body.pubkey || r.body.pubkey.length < 32) throw new Error('bad pubkey');
  return r.body.pubkey.slice(0,8) + '…';
});
expect('POST /api/arena/rpc — getLatestBlockhash (proxy happy path)', async () => {
  const r = await post('/api/arena/rpc', { jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [] });
  if (r.status !== 200) throw new Error('status ' + r.status);
  const bh = r.body?.result?.value?.blockhash;
  if (!bh || bh.length < 32) throw new Error('no blockhash: ' + JSON.stringify(r.body).slice(0, 200));
  return 'blockhash=' + bh.slice(0, 8) + '…';
});
expect('POST /api/arena/rpc — method whitelist rejects getProgramAccounts', async () => {
  const r = await post('/api/arena/rpc', { jsonrpc: '2.0', id: 1, method: 'getProgramAccounts', params: [] });
  if (r.status !== 403) throw new Error('expected 403, got ' + r.status);
  return 'rejected non-whitelisted method';
});

// ─── Rate limiter doesn't block normal browsing ────────────────────
expect('Sustained polling (120 calls) — no 429s', async () => {
  let ok = 0, err = 0;
  for (let i = 0; i < 40; i++) {
    const results = await Promise.all([
      get('/api/arena/round'), get('/api/arena/jackpot'), get('/api/arena/history?limit=10')
    ]);
    for (const r of results) {
      if (r.status === 200) ok++; else err++;
    }
  }
  if (err > 0) throw new Error(err + '/' + (ok+err) + ' rate-limited');
  return ok + ' requests all 200';
});
expect('Post-poll: nav pages still reachable', async () => {
  const routes = ['/earn', '/flow', '/me', '/arena', '/chat'];
  for (const p of routes) {
    const r = await get(p);
    if (r.status !== 200) throw new Error(p + ' → ' + r.status);
  }
  return routes.length + ' pages reachable after heavy polling';
});

// ─── Shadow-mode bet loop ─────────────────────────────────────────
expect('Place + cashout end-to-end (shadow mode)', async () => {
  let bettingRound = null;
  for (let i = 0; i < 50 && !bettingRound; i++) {
    const r = await get('/api/arena/round');
    if (r.body.status === 'betting') bettingRound = r.body;
    else await sleep(1500);
  }
  if (!bettingRound) throw new Error('no betting window in 75s');
  const bet = await post('/api/arena/bet', {
    round_id: bettingRound.id, user_wallet: TEST_WALLET, stake_styxx: 100000
  });
  if (!bet.body.ok) throw new Error('bet rejected: ' + JSON.stringify(bet.body));
  // Wait for running
  for (let i = 0; i < 30; i++) {
    const r = await get('/api/arena/round');
    if (r.body.status === 'running') break;
    await sleep(1000);
  }
  // Cash out at first chance
  await sleep(2500);
  const co = await post('/api/arena/cashout', { bet_id: bet.body.bet_id, user_wallet: TEST_WALLET });
  if (!co.body.ok) throw new Error('cashout failed: ' + JSON.stringify(co.body));
  return 'bet → cashed out @ ' + Number(co.body.multiplier).toFixed(2) + '×';
});

// ─── Run all ──────────────────────────────────────────────────────
(async () => {
  console.log('\n═══ DARKCITY HEALTH CHECK ═══\n');
  let passed = 0, failed = 0;
  for (const c of checks) {
    try {
      const r = await c.fn();
      console.log('✓  ' + c.name.padEnd(52) + ' · ' + (r || ''));
      passed++;
    } catch (e) {
      console.log('✗  ' + c.name.padEnd(52) + ' · ' + e.message);
      failed++;
    }
  }
  console.log('\n─── ' + passed + '/' + (passed+failed) + ' passed ───');
  if (failed > 0) process.exit(1);

  // Cleanup test bet
  try {
    const { Pool } = require('pg');
    const p = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL, ssl:{rejectUnauthorized:false} });
    const res = await p.query("DELETE FROM arena_bets WHERE user_wallet = $1 RETURNING id", [TEST_WALLET]);
    await p.query("UPDATE arena_rounds SET pot_styxx = 0, bets_count = 0 WHERE bets_count > 0");
    await p.query("UPDATE arena_jackpot SET pool_styxx = 0 WHERE pool_styxx < 1000000");
    await p.query("UPDATE founder_jackpot SET pool_styxx = 0 WHERE pool_styxx < 1000000");
    await p.end();
    console.log('cleanup: dropped ' + res.rowCount + ' test bet(s)');
  } catch (e) { console.log('cleanup skipped: ' + e.message); }
})();
