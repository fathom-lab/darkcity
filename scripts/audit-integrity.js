#!/usr/bin/env node
// ============================================================================
// Integrity audit — find anyone who paid and got screwed.
// ============================================================================
// Read-only. Run: railway run node scripts/audit-integrity.js
//   or with public URL: DATABASE_URL=... node scripts/audit-integrity.js
//
// Quote rows don't store tx_signature. Payments match via memo:
//   mint:<quote_id>     in styxx_transfers.memo
//   sponsor:<quote_id>  "
//   tip:<quote_id>      "
// ============================================================================

'use strict';
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /railway|rlwy\.net/.test(process.env.DATABASE_URL || '') ? { rejectUnauthorized: false } : false,
  });

  const sections = [];
  const push = (title, rows, note) => sections.push({ title, rows, note, count: rows.length });

  // 1. Mint quotes finalized=true but no agent row
  {
    const { rows } = await pool.query(`
      SELECT q.quote_id, q.owner_pubkey, q.agent_name, q.fee_styxx, q.created_at
        FROM mint_quotes q
   LEFT JOIN external_agents a
          ON UPPER(REPLACE(q.agent_name, ' ', '_')) = a.agent_id
       WHERE q.finalized = TRUE AND a.agent_id IS NULL
    `);
    push('Finalized mint quotes with no agent row', rows,
      'User paid + quote claimed but agent was not provisioned. Re-run finalize.');
  }

  // 2. Agents with owner_pubkey but no starter_grant transfer on-chain
  {
    const { rows } = await pool.query(`
      SELECT a.agent_id, a.owner_pubkey, a.minted_at, a.mint_fee_styxx, a.sol_pubkey, a.mint_tx_signature
        FROM external_agents a
   LEFT JOIN styxx_transfers t
          ON t.to_agent_id = a.agent_id AND t.reason = 'mint_grant'
       WHERE a.owner_pubkey IS NOT NULL AND t.tx_signature IS NULL
    `);
    push('Minted agents missing starter grant on-chain', rows,
      'Agent exists but the 100 $DARKCOIN seed transfer never landed. Airdrop needed.');
  }

  // 3. Mint quotes where user DID pay on-chain (memo matches) but quote is not finalized
  {
    const { rows } = await pool.query(`
      SELECT q.quote_id, q.owner_pubkey, q.agent_name, q.fee_styxx, q.expires_at, q.finalized,
             t.tx_signature AS on_chain_tx, t.amount AS on_chain_amount, t.confirmed_at
        FROM mint_quotes q
        JOIN styxx_transfers t
          ON t.memo = 'mint:' || q.quote_id
          AND t.reason IS DISTINCT FROM 'mint_grant'
          AND t.reason IS DISTINCT FROM 'mint_fee_burn'
       WHERE q.finalized = FALSE
    `);
    push('Paid on-chain but mint quote not finalized', rows,
      'TOP PRIORITY — user actually paid, we can see it in styxx_transfers, but finalize never ran. Re-run finalize against the on-chain tx.');
  }

  // 4. Agents with referred_by_pubkey set but no referral_mint_bonus paid
  {
    const { rows } = await pool.query(`
      SELECT a.agent_id, a.owner_pubkey, a.referred_by_pubkey, a.minted_at, a.mint_fee_styxx
        FROM external_agents a
   LEFT JOIN styxx_transfers t
          ON t.to_pubkey = a.referred_by_pubkey AND t.reason = 'referral_mint_bonus'
       WHERE a.referred_by_pubkey IS NOT NULL AND t.tx_signature IS NULL
    `);
    push('Missing referral bonus payouts', rows,
      'Agent minted with a referrer, referrer never paid. Backpay 10% of mint fee.');
  }

  // 5. Sponsor quotes finalized=true with no active sponsorship row
  {
    const { rows } = await pool.query(`
      SELECT sq.quote_id, sq.sponsor_pubkey, sq.agent_id, sq.amount_styxx, sq.created_at
        FROM sponsor_quotes sq
   LEFT JOIN sponsorships s
          ON s.sponsor_pubkey = sq.sponsor_pubkey AND s.agent_id = sq.agent_id
       WHERE sq.finalized = TRUE AND s.id IS NULL
    `);
    push('Finalized sponsor quotes missing sponsorship row', rows,
      'Sponsor paid, quote claimed, but no active sponsorship. Backfill via memo-match on styxx_transfers.');
  }

  // 6. Sponsor quotes where user paid on-chain (memo matches) but not finalized
  {
    const { rows } = await pool.query(`
      SELECT sq.quote_id, sq.sponsor_pubkey, sq.agent_id, sq.amount_styxx, sq.expires_at, sq.finalized,
             t.tx_signature AS on_chain_tx, t.amount AS on_chain_amount, t.confirmed_at
        FROM sponsor_quotes sq
        JOIN styxx_transfers t
          ON t.memo = 'sponsor:' || sq.quote_id
       WHERE sq.finalized = FALSE
    `);
    push('Paid on-chain but sponsor quote not finalized', rows,
      'Sponsor paid, finalize never ran. Re-run sponsor finalize.');
  }

  // 7. Tip quotes paid on-chain but not finalized
  {
    const { rows } = await pool.query(`
      SELECT tq.quote_id, tq.tipper_pubkey, tq.agent_id, tq.amount_styxx, tq.expires_at, tq.finalized,
             t.tx_signature AS on_chain_tx
        FROM tip_quotes tq
        JOIN styxx_transfers t
          ON t.memo = 'tip:' || tq.quote_id
       WHERE tq.finalized = FALSE
    `);
    push('Paid on-chain but tip not finalized', rows,
      'User tipped, backend never credited the agent. Re-run tip finalize or manual backfill.');
  }

  // 8. Sponsorships with stake_tx NOT in styxx_transfers (ledger gap)
  {
    const { rows } = await pool.query(`
      SELECT s.id, s.sponsor_pubkey, s.agent_id, s.amount_staked, s.stake_tx, s.started_at
        FROM sponsorships s
   LEFT JOIN styxx_transfers t ON t.tx_signature = s.stake_tx
       WHERE s.status = 'active' AND s.amount_staked > 0 AND t.tx_signature IS NULL
    `);
    push('Active sponsorships whose stake_tx is missing from the ledger', rows,
      'Ledger gap. Insert a ledger row keyed off the stake_tx so dashboards reflect the stake.');
  }

  // 9. External agents with mint_fee_styxx > 0 but no 'mint:...' payment row anywhere
  // (catches agents that somehow got provisioned without payment proof)
  {
    const { rows } = await pool.query(`
      SELECT a.agent_id, a.owner_pubkey, a.mint_fee_styxx, a.mint_tx_signature, a.minted_at
        FROM external_agents a
       WHERE a.owner_pubkey IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM styxx_transfers t
            WHERE t.memo LIKE 'mint:%'
              AND t.from_pubkey = a.owner_pubkey
         )
    `);
    push('Minted agents with no mint-payment row in ledger', rows,
      'Either the agent was seeded (NPC), or the payment tx was not logged to styxx_transfers.');
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(72));
  console.log('DARKCITY INTEGRITY AUDIT  ' + new Date().toISOString());
  console.log('='.repeat(72));

  let totalAffected = 0;
  for (const s of sections) {
    const tag = s.count ? '[' + s.count + ']' : '[ok]';
    console.log('\n' + tag + '  ' + s.title);
    console.log('       ' + s.note);
    if (s.count > 0) {
      totalAffected += s.count;
      for (const r of s.rows.slice(0, 6)) {
        // Compact JSON per row, 240 char cap
        console.log('       \u2022 ' + JSON.stringify(r).slice(0, 240));
      }
      if (s.count > 6) console.log('       \u2026 +' + (s.count - 6) + ' more');
    }
  }

  console.log('\n' + '='.repeat(72));
  console.log('TOTAL ROWS WITH ISSUES: ' + totalAffected);
  console.log('='.repeat(72) + '\n');

  // Quick baseline counts for context
  try {
    const { rows: counts } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM external_agents WHERE owner_pubkey IS NOT NULL) AS minted_agents,
        (SELECT COUNT(*) FROM sponsorships WHERE status = 'active')            AS active_sponsorships,
        (SELECT COUNT(*) FROM mint_quotes WHERE finalized = TRUE)              AS finalized_mints,
        (SELECT COUNT(*) FROM mint_quotes)                                     AS total_mint_quotes,
        (SELECT COUNT(*) FROM styxx_transfers WHERE reason = 'mint_grant')     AS starter_grants_paid,
        (SELECT COUNT(*) FROM styxx_transfers WHERE reason = 'referral_mint_bonus') AS referral_bonuses_paid
    `);
    console.log('Baseline counts:', JSON.stringify(counts[0], null, 2));
  } catch {}

  await pool.end();
})().catch(err => {
  console.error('audit failed:', err);
  process.exit(1);
});
