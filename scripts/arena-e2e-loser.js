// ============================================================================
// arena-e2e-loser.js — verify the loss split (94% burn / 4% kitty / 1% founder
// cut / 1% founder jackpot) by placing a bet and intentionally not cashing
// out. Records state before + after and compares.
// ============================================================================

'use strict';

const BASE = 'https://darkcity-backend-production-427a.up.railway.app';
const TEST_WALLET = '4KvXHNoyf9BEEaoC2ugcRRAEu2DJMKztWrqVEtesQLNw';
const STAKE = 500000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('\n═══ LOSER PATH TEST ═══\n');

  // Before
  const before = await (await fetch(BASE + '/api/arena/jackpot')).json();
  console.log('before · kitty ' + before.public_jackpot_styxx + ' · founder_jp ' + before.founder_jackpot_styxx + ' · burn24h ' + before.burn_24h.toFixed(0));

  // Wait for betting window
  let r;
  for (let i = 0; i < 60; i++) {
    r = await (await fetch(BASE + '/api/arena/round')).json();
    if (r && r.id && r.status === 'betting') break;
    await sleep(1500);
  }
  if (!r || r.status !== 'betting') throw new Error('no betting window');
  console.log('caught round #' + r.id + ' · agent ' + r.agent_id);

  // Place bet
  const bRes = await fetch(BASE + '/api/arena/bet', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ round_id: r.id, user_wallet: TEST_WALLET, stake_styxx: STAKE }),
  }).then(r => r.json());
  if (!bRes.ok) throw new Error('bet rejected: ' + JSON.stringify(bRes));
  console.log('bet placed · ' + STAKE + ' STYXX · bet_id ' + bRes.bet_id);

  // DO NOT CASH OUT. Wait for resolution.
  let resolved;
  for (let i = 0; i < 50; i++) {
    const h = await (await fetch(BASE + '/api/arena/history?limit=5')).json();
    resolved = h.rounds.find(x => String(x.id) === String(r.id));
    if (resolved) break;
    await sleep(1500);
  }
  if (!resolved) throw new Error('round never resolved');
  console.log('round crashed @ ' + Number(resolved.multiplier).toFixed(2) + '× (lost ' + STAKE + ' STYXX)');

  await sleep(2000);

  const after = await (await fetch(BASE + '/api/arena/jackpot')).json();
  console.log('after  · kitty ' + after.public_jackpot_styxx + ' · founder_jp ' + after.founder_jackpot_styxx + ' · burn24h ' + after.burn_24h.toFixed(0));

  // Verify deltas
  const expectedBurn = STAKE * 0.94;
  const expectedKitty = STAKE * 0.04;
  const expectedFounderJp = STAKE * 0.01;

  const dKitty = after.public_jackpot_styxx - before.public_jackpot_styxx;
  const dFounderJp = after.founder_jackpot_styxx - before.founder_jackpot_styxx;
  const dBurn = after.burn_24h - before.burn_24h;

  console.log('\nexpected splits (from ' + STAKE + ' stake):');
  console.log('  burn    ' + expectedBurn + ' STYXX (94%)');
  console.log('  kitty   ' + expectedKitty + ' STYXX (4%)');
  console.log('  f_cut   ' + (STAKE*0.01) + ' STYXX (1%) — logged, settles at next 5min pulse');
  console.log('  f_jp    ' + expectedFounderJp + ' STYXX (1%)');

  console.log('\nobserved deltas:');
  console.log('  burn    +' + dBurn.toFixed(0));
  console.log('  kitty   +' + dKitty.toFixed(0));
  console.log('  f_jp    +' + dFounderJp.toFixed(0));

  const ok = Math.abs(dBurn - expectedBurn) < 10 && Math.abs(dKitty - expectedKitty) < 10 && Math.abs(dFounderJp - expectedFounderJp) < 10;
  console.log('\n' + (ok ? '✓ loss split verified — money routes correctly' : '✗ loss split mismatch — investigate'));

  // Verify the lost bet surfaces as 'crashed'
  const myLoss = after.recent_results.find(x => x.user_wallet === TEST_WALLET && String(x.stake_styxx) === String(STAKE + '.000000'));
  if (myLoss && myLoss.status === 'crashed') {
    console.log('✓ bet recorded as crashed · stake ' + myLoss.stake_styxx + ' · payout 0');
  } else {
    console.log('! bet not found in recent_results (or not marked crashed)');
  }
}

main().catch(e => { console.error('✗', e.message); process.exit(1); });
