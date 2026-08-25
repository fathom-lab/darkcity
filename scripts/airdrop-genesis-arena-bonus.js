// ============================================================================
// airdrop-genesis-arena-bonus.js — one-shot bankroll to the 9 real-human
// genesis wallets so they can play the felt on day one with size.
//
// Default: 100,000 $STYXX per wallet. Weighted mode (--weighted) multiplies
// by each wallet's effective_multiplier (1.50x - 3.75x) so the earliest
// stackers get the biggest bag.
//
// Idempotent via airdrop_log — re-running is safe, won't double-pay.
//
// Usage:
//   node scripts/airdrop-genesis-arena-bonus.js [AMOUNT] [--weighted] [--dry]
//   node scripts/airdrop-genesis-arena-bonus.js 100000
//   node scripts/airdrop-genesis-arena-bonus.js 100000 --weighted
//   node scripts/airdrop-genesis-arena-bonus.js 100000 --dry       # print only
// ============================================================================

require('dotenv').config();
const { Pool } = require('pg');
const styxx = require('../lib/solana-styxx');

const AMOUNT_BASE = Number(process.argv.find(a => /^\d/.test(a)) || 100000);
const WEIGHTED = process.argv.includes('--weighted');
const DRY = process.argv.includes('--dry');
const CAMPAIGN = WEIGHTED ? 'genesis_arena_bonus_weighted_v1' : 'genesis_arena_bonus_v1';

async function main() {
  if (!DRY) styxx.init();
  const pool = new Pool({
    connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Pull the 9 real-human genesis wallets with their stacked multipliers
    const { rows } = await pool.query(`
      SELECT wallet_pubkey, effective_multiplier, categories
        FROM v_genesis_real_humans
       ORDER BY effective_multiplier DESC
    `);

    if (!rows.length) { console.error('[airdrop] no genesis wallets found — run freeze-genesis-snapshot first'); return; }

    console.log(`\n[airdrop] campaign: ${CAMPAIGN}`);
    console.log(`[airdrop] ${rows.length} real-human genesis wallets`);
    console.log(`[airdrop] base: ${AMOUNT_BASE.toLocaleString()} $STYXX ${WEIGHTED ? '× effective_multiplier' : 'flat'}`);
    if (DRY) console.log('[airdrop] DRY RUN — no tokens will move\n');

    // Check prior payments to skip any already sent
    const { rows: done } = await pool.query(
      'SELECT recipient_wallet FROM airdrop_log WHERE campaign = $1',
      [CAMPAIGN]
    );
    const doneSet = new Set(done.map(d => d.recipient_wallet));

    let totalSent = 0, skipped = 0, failed = 0;

    for (const g of rows) {
      const mult = Number(g.effective_multiplier) || 1;
      const amount = WEIGHTED ? Math.round(AMOUNT_BASE * mult) : AMOUNT_BASE;
      const tag = `${g.wallet_pubkey.slice(0, 6)}..${g.wallet_pubkey.slice(-4)} [${mult.toFixed(2)}× · ${(g.categories || []).join('+')}]`;

      if (doneSet.has(g.wallet_pubkey)) {
        console.log(`  skip   ${tag} · already airdropped`);
        skipped++;
        continue;
      }
      if (DRY) {
        console.log(`  would  ${tag} ← ${amount.toLocaleString()} $STYXX`);
        continue;
      }
      try {
        const { signature } = await styxx.airdropFromTreasury(g.wallet_pubkey, amount);
        await pool.query(
          `INSERT INTO airdrop_log (campaign, recipient_wallet, amount_styxx, tx_signature)
           VALUES ($1, $2, $3, $4) ON CONFLICT (campaign, recipient_wallet) DO NOTHING`,
          [CAMPAIGN, g.wallet_pubkey, amount, signature]
        );
        await pool.query(
          `INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey, to_agent_id, to_pubkey, amount, reason, memo)
           VALUES ($1, 'TREASURY', $2, null, $3, $4, 'genesis_arena_bonus', $5)
           ON CONFLICT (tx_signature) DO NOTHING`,
          [signature, styxx.getTreasury().publicKey.toBase58(), g.wallet_pubkey, amount, CAMPAIGN]
        );
        console.log(`  sent   ${tag} ← ${amount.toLocaleString()} $STYXX · ${signature.slice(0, 12)}..`);
        totalSent += amount;
        // tiny pause so we don't hammer the RPC
        await new Promise(r => setTimeout(r, 400));
      } catch (e) {
        console.warn(`  FAIL   ${tag} · ${e.message}`);
        failed++;
      }
    }

    console.log(`\n[airdrop] done · sent: ${totalSent.toLocaleString()} $STYXX · skipped: ${skipped} · failed: ${failed}\n`);
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error('[airdrop] FATAL', e); process.exit(1); });
