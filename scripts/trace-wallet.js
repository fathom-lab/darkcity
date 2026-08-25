// trace-wallet.js — slow, rate-limit-aware wallet trace
// Uses our own /api/arena/rpc proxy (has 4 fallback upstreams) with deliberate
// 2s throttling between tx lookups. Categorizes each user tx as arena-bet /
// arena-payout / orphan-to-treasury / outbound-non-treasury / inbound-non-treasury.
// Usage: railway ssh "node scripts/trace-wallet.js <wallet>"
'use strict';
const { Pool } = require('pg');
const { PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');

const TREASURY = '99nzRdkRvZbB9yQgbfxVeLWu4SyvZNAGWhRPzSeL3tMp';
const TOKEN_MINT = 'Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump';
const LIMIT = 25;
const DELAY_MS = 2000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function rpcCall(method, params) {
  // Hit the proxy endpoint we built for the browser — it rotates 4 upstreams
  const urls = [
    'http://localhost:' + (process.env.PORT || 3000) + '/api/arena/rpc',
    'https://solana-rpc.publicnode.com',
    'https://rpc.ankr.com/solana',
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!r.ok) continue;
      const j = await r.json();
      if (j.error) continue;
      return j.result;
    } catch { continue; }
  }
  return null;
}

(async () => {
  const wallet = process.argv[2];
  if (!wallet) { console.error('need wallet'); process.exit(1); }
  const p = new Pool({ connectionString: process.env.DATABASE_URL });

  const ata = (await getAssociatedTokenAddress(
    new PublicKey(TOKEN_MINT),
    new PublicKey(wallet),
    false,
    TOKEN_2022_PROGRAM_ID
  )).toBase58();
  console.log('wallet:', wallet);
  console.log('ATA:', ata);

  const sigs = await rpcCall('getSignaturesForAddress', [ata, { limit: LIMIT }]);
  if (!sigs) { console.error('could not fetch sigs'); await p.end(); return; }
  console.log('sigs to scan:', sigs.length);

  const known = await p.query(
    `SELECT payment_tx, payout_tx FROM arena_bets WHERE user_wallet = $1 AND (payment_tx IS NOT NULL OR payout_tx IS NOT NULL)`,
    [wallet]
  );
  const paySigs = new Set(known.rows.map(r => r.payment_tx).filter(Boolean));
  const outSigs = new Set(known.rows.map(r => r.payout_tx).filter(Boolean));

  const buckets = {
    arena_bet_stake: { count: 0, total: 0 },         // user→treasury, in arena_bets.payment_tx
    arena_payout: { count: 0, total: 0 },            // treasury→user, in arena_bets.payout_tx
    orphan_to_treasury: { count: 0, total: 0, sigs: [] },  // user→treasury, NOT in arena_bets
    inflow_from_treasury: { count: 0, total: 0 },    // treasury→user, NOT in arena_bets (refunds, airdrops)
    outbound_non_treasury: { count: 0, total: 0, sigs: [] }, // user→other (sold, transferred)
    inbound_non_treasury: { count: 0, total: 0 },    // other→user
    errored: 0,
  };

  for (let i = 0; i < sigs.length; i++) {
    const sg = sigs[i];
    if (sg.err) { buckets.errored++; continue; }
    await sleep(DELAY_MS);
    const tx = await rpcCall('getTransaction', [sg.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }]);
    if (!tx) { buckets.errored++; continue; }
    const pre = tx.meta?.preTokenBalances || [];
    const post = tx.meta?.postTokenBalances || [];
    const userPre = pre.find(b => b.owner === wallet && b.mint === TOKEN_MINT);
    const userPost = post.find(b => b.owner === wallet && b.mint === TOKEN_MINT);
    const userDelta = (Number(userPost?.uiTokenAmount?.uiAmount) || 0) - (Number(userPre?.uiTokenAmount?.uiAmount) || 0);
    if (Math.abs(userDelta) < 0.5) continue;
    const treasuryInvolved = pre.some(b => b.owner === TREASURY) || post.some(b => b.owner === TREASURY);
    const isKnownPay = paySigs.has(sg.signature);
    const isKnownOut = outSigs.has(sg.signature);
    const amt = Math.abs(userDelta);
    let bucket;
    if (userDelta < 0 && treasuryInvolved && isKnownPay) bucket = 'arena_bet_stake';
    else if (userDelta < 0 && treasuryInvolved) bucket = 'orphan_to_treasury';
    else if (userDelta < 0) bucket = 'outbound_non_treasury';
    else if (userDelta > 0 && treasuryInvolved && isKnownOut) bucket = 'arena_payout';
    else if (userDelta > 0 && treasuryInvolved) bucket = 'inflow_from_treasury';
    else bucket = 'inbound_non_treasury';
    buckets[bucket].count++;
    buckets[bucket].total += amt;
    if (buckets[bucket].sigs) buckets[bucket].sigs.push({ sig: sg.signature, amt, time: new Date(sg.blockTime * 1000).toISOString().slice(11, 19) });
  }

  console.log('\n=== breakdown ===');
  for (const [k, v] of Object.entries(buckets)) {
    if (k === 'errored') { console.log(k.padEnd(26), v, 'txes'); continue; }
    console.log(k.padEnd(26), String(v.count).padStart(3), 'txes', Math.floor(v.total).toLocaleString().padStart(12), 'STYXX');
  }
  if (buckets.orphan_to_treasury.count) {
    console.log('\n=== orphan payments (your stranded STYXX) ===');
    for (const s of buckets.orphan_to_treasury.sigs) console.log(' ', s.time, s.amt.toLocaleString().padStart(10), s.sig);
  }
  if (buckets.outbound_non_treasury.count) {
    console.log('\n=== outbound to NON-treasury ===');
    for (const s of buckets.outbound_non_treasury.sigs) console.log(' ', s.time, s.amt.toLocaleString().padStart(10), s.sig);
  }
  await p.end();
})().catch(e => { console.error(e.message); process.exit(1); });
