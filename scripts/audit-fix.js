#!/usr/bin/env node
// ============================================================================
// Audit fix — make right every issue found by audit-integrity.js
// ============================================================================
//   1. Airdrop any missing starter grants (on-chain transfer).
//   2. Backfill missing styxx_transfers rows for known mint payment txs.
//   3. Backfill missing styxx_transfers rows for known sponsorship stakes.
//   4. Backfill agent_earnings rows for any starter grants we newly airdropped.
//
// Safety:
//   • DRY RUN BY DEFAULT. Pass --confirm to execute.
//   • Every on-chain transfer is verified via styxx_transfers before sending,
//     so running this repeatedly is idempotent.
//   • All on-chain sends are logged to styxx_transfers with a clear reason.
//
// Run:
//   DATABASE_URL=... node scripts/audit-fix.js                  (dry run)
//   railway run node scripts/audit-fix.js --confirm             (live)
// ============================================================================

'use strict';

const { Pool } = require('pg');
const path = require('path');
// darkcoin-payments wraps solana-darkcoin; init() reads TREASURY_PRIVKEY,
// WALLET_ENC_KEY, SOLANA_RPC_URL from env. Only needed in --confirm.
const CONFIRM = process.argv.includes('--confirm');

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /railway|rlwy\.net/.test(process.env.DATABASE_URL || '') ? { rejectUnauthorized: false } : false,
  });

  console.log('\n' + '='.repeat(72));
  console.log('DARKCITY AUDIT FIX  ' + new Date().toISOString());
  console.log('Mode: ' + (CONFIRM ? 'LIVE (will send on-chain + mutate DB)' : 'DRY RUN (nothing executed)'));
  console.log('='.repeat(72) + '\n');

  let styxx = null;
  if (CONFIRM) {
    styxx = require('../lib/solana-darkcoin');
    styxx.init();
    const tb = await styxx.getTreasuryBalances();
    console.log('Treasury: ' + tb.pubkey + '  SOL=' + tb.sol.toFixed(4) + '  STYXX=' + tb.styxx.toFixed(2) + '\n');
  }

  // ── 1. Starter grant airdrops ──────────────────────────────────────────
  console.log('[1/3] Missing starter grants');
  const { rows: missingGrants } = await pool.query(`
    SELECT a.agent_id, a.owner_pubkey, a.sol_pubkey, a.mint_fee_styxx, a.minted_at
      FROM external_agents a
 LEFT JOIN styxx_transfers t
        ON t.to_agent_id = a.agent_id AND t.reason = 'mint_grant'
     WHERE a.owner_pubkey IS NOT NULL AND t.tx_signature IS NULL
  `);
  console.log('      Found ' + missingGrants.length + ' agent(s) without starter grant');

  // Starter grant is 100 STYXX today (economy_params.starter_grant_styxx).
  // Read the live param so it always matches the runbook.
  const { rows: grantRows } = await pool.query(
    `SELECT value FROM economy_params WHERE key = 'starter_grant_styxx'`
  );
  const starterGrant = Number(grantRows[0]?.value || 100);

  for (const a of missingGrants) {
    console.log('      \u2192 ' + a.agent_id + ' (owner ' + (a.owner_pubkey || '').slice(0, 8) + '\u2026): airdrop ' + starterGrant + ' STYXX to ' + (a.sol_pubkey || '').slice(0, 8) + '\u2026');
    if (!CONFIRM) continue;
    try {
      // Check on-chain first — if the agent already has the grant, skip.
      const bal = await styxx.getDarkcoinBalance(a.sol_pubkey);
      if (bal >= starterGrant) {
        console.log('         agent already has ' + bal + ' STYXX on-chain. Just backfilling ledger row.');
      } else {
        const r = await styxx.airdropFromTreasury(a.sol_pubkey, starterGrant);
        console.log('         airdrop tx: ' + r.signature);
      }
      // Always write the ledger row so future audits find it clean.
      // Use a synthetic memo so it's obvious this was a backfill.
      const sig = 'backfill-grant-' + a.agent_id + '-' + Date.now();
      await pool.query(`
        INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey,
                                     to_agent_id, to_pubkey, amount, reason, memo)
        VALUES ($1, 'TREASURY', $2, $3, $4, $5, 'mint_grant', $6)
        ON CONFLICT (tx_signature) DO NOTHING
      `, [sig, styxx.getTreasury().publicKey.toBase58(), a.agent_id, a.sol_pubkey, starterGrant, 'audit-fix:' + a.agent_id]);
      await pool.query(`
        INSERT INTO agent_earnings (agent_id, amount, source, source_ref, recorded_at)
        VALUES ($1, $2, 'mint_grant', $3, NOW())
        ON CONFLICT DO NOTHING
      `, [a.agent_id, starterGrant, 'audit-fix']);
    } catch (e) {
      console.error('         FAILED: ' + e.message);
    }
  }
  if (missingGrants.length === 0) console.log('      (nothing to do)');

  // ── 2. Backfill mint-payment ledger rows ───────────────────────────────
  console.log('\n[2/3] Mint payments with no styxx_transfers row');
  const { rows: missingMintPayments } = await pool.query(`
    SELECT a.agent_id, a.owner_pubkey, a.mint_tx_signature, a.mint_fee_styxx, a.minted_at
      FROM external_agents a
     WHERE a.owner_pubkey IS NOT NULL
       AND a.mint_tx_signature IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM styxx_transfers t
          WHERE t.memo LIKE 'mint:%'
            AND t.from_pubkey = a.owner_pubkey
       )
  `);
  console.log('      Found ' + missingMintPayments.length + ' mint payment(s) to backfill');

  for (const a of missingMintPayments) {
    // We know the tx_signature from external_agents.mint_tx_signature. We
    // also want the quote_id to construct the memo: look it up via agent_name.
    const { rows: qr } = await pool.query(
      `SELECT quote_id FROM mint_quotes
        WHERE UPPER(REPLACE(agent_name, ' ', '_')) = $1
          AND owner_pubkey = $2
          AND finalized = TRUE
        ORDER BY created_at DESC LIMIT 1`,
      [a.agent_id, a.owner_pubkey]
    );
    const memo = qr.length ? ('mint:' + qr[0].quote_id) : ('mint:backfill:' + a.agent_id);
    console.log('      \u2192 ' + a.agent_id + ' tx=' + (a.mint_tx_signature || '').slice(0, 10) + '\u2026 memo=' + memo);
    if (!CONFIRM) continue;
    try {
      const treasuryPk = styxx.getTreasury().publicKey.toBase58();
      await pool.query(`
        INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey,
                                     to_agent_id, to_pubkey, amount, reason, memo, confirmed_at)
        VALUES ($1, NULL, $2, 'TREASURY', $3, $4, 'mint_fee_payment', $5, $6)
        ON CONFLICT (tx_signature) DO NOTHING
      `, [a.mint_tx_signature, a.owner_pubkey, treasuryPk, a.mint_fee_styxx, memo, a.minted_at || new Date()]);
      console.log('         ledger row written');
    } catch (e) {
      console.error('         FAILED: ' + e.message);
    }
  }
  if (missingMintPayments.length === 0) console.log('      (nothing to do)');

  // ── 3. Backfill sponsorship stake ledger rows ──────────────────────────
  console.log('\n[3/3] Active sponsorships missing from ledger');
  const { rows: missingStakes } = await pool.query(`
    SELECT s.id, s.sponsor_pubkey, s.agent_id, s.amount_staked, s.stake_tx, s.started_at
      FROM sponsorships s
 LEFT JOIN styxx_transfers t ON t.tx_signature = s.stake_tx
     WHERE s.status = 'active' AND s.amount_staked > 0 AND t.tx_signature IS NULL
  `);
  console.log('      Found ' + missingStakes.length + ' sponsorship stake(s) to backfill');

  for (const s of missingStakes) {
    console.log('      \u2192 ' + s.sponsor_pubkey.slice(0, 8) + '\u2026 staked ' + s.amount_staked + ' on ' + s.agent_id + ' (tx=' + (s.stake_tx || '').slice(0, 10) + '\u2026)');
    if (!CONFIRM) continue;
    try {
      const treasuryPk = styxx.getTreasury().publicKey.toBase58();
      await pool.query(`
        INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey,
                                     to_agent_id, to_pubkey, amount, reason, memo, confirmed_at)
        VALUES ($1, NULL, $2, 'TREASURY', $3, $4, 'sponsor_stake', $5, $6)
        ON CONFLICT (tx_signature) DO NOTHING
      `, [s.stake_tx, s.sponsor_pubkey, treasuryPk, s.amount_staked,
          'audit-fix:sponsor:' + s.id, s.started_at || new Date()]);
      console.log('         ledger row written');
    } catch (e) {
      console.error('         FAILED: ' + e.message);
    }
  }
  if (missingStakes.length === 0) console.log('      (nothing to do)');

  console.log('\n' + '='.repeat(72));
  console.log('Done. ' + (CONFIRM ? 'Changes applied.' : 'DRY RUN — re-run with --confirm to execute.'));
  console.log('='.repeat(72) + '\n');

  await pool.end();
})().catch(err => {
  console.error('fix failed:', err);
  process.exit(1);
});
