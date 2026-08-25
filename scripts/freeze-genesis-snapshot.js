#!/usr/bin/env node
// ============================================================================
// freeze-genesis-snapshot.js — the ONE-TIME immutable snapshot that defines
// who gets the permanent early-participant multipliers.
//
// Categories:
//   1. founder_minter   — every wallet with an owned agent (owner_pubkey on
//                         external_agents), snapshotted at run time.
//                         → 1.50× forever.
//   2. genesis_sponsor  — every wallet in sponsorships with status='active'.
//                         → 1.25× forever.
//   3. snapshot_holder  — every wallet holding ≥ 1,000 $DARKCOIN. Sourced from
//                         ledger (sum of inflow − outflow in styxx_transfers)
//                         unioned with known_wallets (on-chain lookup).
//                         Excludes treasury + burn address.
//                         → 2.00× for 60 days from snapshot.
//
// Multipliers STACK. A wallet in all three categories gets 3.75× effective.
//
// Run ONCE. After this, no retroactive adds — it's frozen. Future users
// onboard at 1× base. This is what rewards everyone who's been here so far.
//
// Usage:
//   DATABASE_URL=<prod> node scripts/freeze-genesis-snapshot.js --dry-run
//   DATABASE_URL=<prod> node scripts/freeze-genesis-snapshot.js --commit
// ============================================================================

'use strict';

const { Pool } = require('pg');
const { PublicKey } = require('@solana/web3.js');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--commit');
const HOLDER_THRESHOLD = 1000;
const HOLDER_EXPIRY_DAYS = 60;

async function main() {
  const dbUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: /railway|rlwy\.net/.test(dbUrl) ? { rejectUnauthorized: false } : false,
  });

  console.log('\n' + '━'.repeat(64));
  console.log('  GENESIS SNAPSHOT — DarkCity early-participant freeze');
  console.log('━'.repeat(64));
  console.log('  Mode: ' + (DRY_RUN ? 'DRY RUN (no writes)' : 'COMMIT (writing to DB)'));
  console.log('  Timestamp: ' + new Date().toISOString());
  console.log('━'.repeat(64) + '\n');

  // ─── 1. FOUNDER MINTERS ─────────────────────────────────────────────────
  const { rows: minters } = await pool.query(
    `SELECT DISTINCT owner_pubkey, agent_id
       FROM external_agents
      WHERE owner_pubkey IS NOT NULL
        AND euthanized_at IS NULL`
  );
  console.log('FOUNDER MINTERS (1.50× permanent):');
  for (const m of minters) {
    console.log('  ' + m.owner_pubkey.slice(0, 16) + '… → owns ' + m.agent_id);
  }
  console.log('  subtotal: ' + minters.length + ' minters\n');

  // ─── 2. GENESIS SPONSORS ────────────────────────────────────────────────
  const { rows: sponsors } = await pool.query(
    `SELECT DISTINCT sponsor_pubkey, agent_id, amount_staked
       FROM sponsorships
      WHERE sponsor_pubkey IS NOT NULL
        AND status = 'active'`
  );
  console.log('GENESIS SPONSORS (1.25× permanent + priority payout):');
  for (const s of sponsors) {
    console.log('  ' + s.sponsor_pubkey.slice(0, 16) + '… staked ' + Math.round(Number(s.amount_staked)) + ' on ' + s.agent_id);
  }
  console.log('  subtotal: ' + sponsors.length + ' sponsorships\n');

  // ─── 3. SNAPSHOT HOLDERS ≥ 1,000 $DARKCOIN ────────────────────────────────
  // Source A: ledger-derived (inflow − outflow from styxx_transfers)
  const { rows: ledgerHolders } = await pool.query(`
    WITH flows AS (
      SELECT to_pubkey   AS pubkey, SUM(amount)::float AS inflow,  0::float AS outflow
        FROM styxx_transfers WHERE to_pubkey IS NOT NULL GROUP BY to_pubkey
      UNION ALL
      SELECT from_pubkey AS pubkey, 0::float AS inflow, SUM(amount)::float AS outflow
        FROM styxx_transfers WHERE from_pubkey IS NOT NULL GROUP BY from_pubkey
    )
    SELECT pubkey,
           GREATEST(SUM(inflow) - SUM(outflow), 0)::float AS holding
      FROM flows
     WHERE pubkey IS NOT NULL
     GROUP BY pubkey
    HAVING GREATEST(SUM(inflow) - SUM(outflow), 0) >= $1
  `, [HOLDER_THRESHOLD]);

  // Filter: must be a real Solana pubkey (drops 'BURN', 'TREASURY_CITY', etc.)
  // Also exclude treasury + burn address
  const TREASURY = '99nzRdkRvZbB9yQgbfxVeLWu4SyvZNAGWhRPzSeL3tMp';
  const EXCLUDED = new Set([TREASURY, 'BURN', 'TREASURY', 'TREASURY_CITY']);
  const validHolders = ledgerHolders.filter(h => {
    if (EXCLUDED.has(h.pubkey)) return false;
    try { new PublicKey(h.pubkey); return true; } catch { return false; }
  });

  // Source B: known_wallets with on-chain lookup (covers pump.fun buyers)
  // Skip if solana-darkcoin isn't initialized (for dry-run safety — we can
  // add this in --commit mode when the env has STYXX keys)
  let onChainHolders = [];
  try {
    const { rows: known } = await pool.query('SELECT pubkey FROM known_wallets');
    if (known.length && process.env.TREASURY_PRIVKEY) {
      const solanaDarkcoin = require('../lib/solana-darkcoin');
      solanaDarkcoin.init();
      for (const k of known) {
        try {
          const bal = await solanaDarkcoin.getDarkcoinBalance(k.pubkey);
          if (bal >= HOLDER_THRESHOLD) onChainHolders.push({ pubkey: k.pubkey, holding: bal });
        } catch {}
      }
    } else if (known.length) {
      console.log('  [note] skipping on-chain known_wallets balance check (TREASURY_PRIVKEY not set for this run)');
      console.log('  [note] ' + known.length + ' known_wallets would be checked in --commit mode');
    }
  } catch (e) {
    console.log('  [note] known_wallets balance check failed: ' + e.message);
  }

  // Union and dedupe — prefer on-chain number when both present
  const holderMap = new Map();
  for (const h of validHolders) holderMap.set(h.pubkey, h.holding);
  for (const h of onChainHolders) {
    if (!holderMap.has(h.pubkey) || h.holding > holderMap.get(h.pubkey)) {
      holderMap.set(h.pubkey, h.holding);
    }
  }
  const allHolders = [...holderMap.entries()].map(([pubkey, holding]) => ({ pubkey, holding }));

  console.log('SNAPSHOT HOLDERS ≥ ' + HOLDER_THRESHOLD + ' $DARKCOIN (2.00× for ' + HOLDER_EXPIRY_DAYS + ' days):');
  for (const h of allHolders.sort((a,b) => b.holding - a.holding).slice(0, 20)) {
    console.log('  ' + h.pubkey.slice(0, 16) + '… holds ' + Math.round(h.holding) + ' $DARKCOIN');
  }
  if (allHolders.length > 20) console.log('  …and ' + (allHolders.length - 20) + ' more');
  console.log('  subtotal: ' + allHolders.length + ' qualifying holders\n');

  // ─── Summary ────────────────────────────────────────────────────────────
  const uniqueWallets = new Set([
    ...minters.map(m => m.owner_pubkey),
    ...sponsors.map(s => s.sponsor_pubkey),
    ...allHolders.map(h => h.pubkey),
  ]);
  console.log('━'.repeat(64));
  console.log('  SUMMARY');
  console.log('  ─────────────────────────────────────────────');
  console.log('  Founder minters:     ' + minters.length);
  console.log('  Genesis sponsors:    ' + sponsors.length);
  console.log('  Snapshot holders:    ' + allHolders.length);
  console.log('  Unique wallets:      ' + uniqueWallets.size);
  console.log('━'.repeat(64));

  if (DRY_RUN) {
    console.log('\nDRY RUN complete. Re-run with --commit to freeze this state to the DB.\n');
    await pool.end();
    return;
  }

  // ─── COMMIT ─────────────────────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + HOLDER_EXPIRY_DAYS * 86400000).toISOString();
  let inserted = 0;
  await pool.query('BEGIN');
  try {
    for (const m of minters) {
      const r = await pool.query(
        `INSERT INTO genesis_snapshot (wallet_pubkey, category, multiplier, agent_id, note)
           VALUES ($1, 'founder_minter', 1.50, $2, $3)
         ON CONFLICT (wallet_pubkey, category) DO NOTHING RETURNING id`,
        [m.owner_pubkey, m.agent_id, 'permanent — early agent owner']
      );
      if (r.rows.length) inserted++;
    }
    for (const s of sponsors) {
      const r = await pool.query(
        `INSERT INTO genesis_snapshot (wallet_pubkey, category, multiplier, sponsored_agent, note)
           VALUES ($1, 'genesis_sponsor', 1.25, $2, $3)
         ON CONFLICT (wallet_pubkey, category) DO NOTHING RETURNING id`,
        [s.sponsor_pubkey, s.agent_id, 'permanent — genesis sponsor + priority payout']
      );
      if (r.rows.length) inserted++;
    }
    for (const h of allHolders) {
      const r = await pool.query(
        `INSERT INTO genesis_snapshot (wallet_pubkey, category, multiplier, holding_styxx, note, expires_at)
           VALUES ($1, 'snapshot_holder', 2.00, $2, $3, $4)
         ON CONFLICT (wallet_pubkey, category) DO NOTHING RETURNING id`,
        [h.pubkey, h.holding, HOLDER_EXPIRY_DAYS + '-day holder boost', expiresAt]
      );
      if (r.rows.length) inserted++;
    }
    await pool.query('COMMIT');
    console.log('\nCOMMITTED. Inserted ' + inserted + ' new rows into genesis_snapshot.');
    console.log('Total rows now in table:');
    const { rows: [{ n }] } = await pool.query('SELECT COUNT(*)::int AS n FROM genesis_snapshot');
    console.log('  ' + n);
  } catch (e) {
    await pool.query('ROLLBACK');
    console.error('\nROLLBACK — error during commit: ' + e.message);
    throw e;
  }
  await pool.end();
  console.log('\nGenesis snapshot frozen at ' + new Date().toISOString());
  console.log('This is the permanent record. Publish it publicly — users can verify their wallet.\n');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
