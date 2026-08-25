#!/usr/bin/env node
// trigger-payouts.js — one-shot operator script
//
// Forces two things that normally only run inside the 4h pulse:
//   1. holder-pool distribution (pays out the 286k pending pot)
//   2. (optional) full pulse — sponsor + owner + hyphal + fruiting payouts
//
// Usage:
//   railway run --service=darkcity-backend -- node scripts/trigger-payouts.js --holder-pool-only
//   railway run --service=darkcity-backend -- node scripts/trigger-payouts.js --pulse-too
//
// The railway env provides TREASURY_PRIVKEY + WALLET_ENC_KEY.
// We override DATABASE_URL to the public proxy since CLI runs outside the
// Railway private network.
'use strict';

const { Pool } = require('pg');

async function main() {
  const publicDbUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!publicDbUrl) {
    console.error('no DATABASE_PUBLIC_URL or DATABASE_URL available');
    process.exit(1);
  }
  if (!process.env.TREASURY_PRIVKEY) {
    console.error('TREASURY_PRIVKEY missing — run via `railway run` so env vars are injected');
    process.exit(1);
  }

  // Force DATABASE_URL to public proxy for this invocation so the solana-darkcoin
  // module (which may read DATABASE_URL elsewhere) uses the reachable host.
  process.env.DATABASE_URL = publicDbUrl;

  const pool = new Pool({
    connectionString: publicDbUrl,
    ssl: /railway|rlwy\.net/.test(publicDbUrl) ? { rejectUnauthorized: false } : false,
  });

  const holderPool = require('../hooks/holder-pool');
  const solanaDarkcoin = require('../lib/solana-darkcoin');
  solanaDarkcoin.init();

  const args = process.argv.slice(2);
  const pulseToo = args.includes('--pulse-too');
  const dryRun   = args.includes('--dry-run');

  // ─── Before snapshot ────────────────────────────────────────────────────
  const before = await pool.query(`SELECT
    (SELECT COALESCE(SUM(pool_styxx), 0) FROM holder_pool_distributions WHERE distributed = FALSE)::float AS pending,
    (SELECT COUNT(*) FROM holder_claims)::int AS claims_count,
    (SELECT COALESCE(SUM(lifetime_earned), 0) FROM holder_claims)::float AS total_earned
  `);
  console.log('== before ==');
  console.dir(before.rows[0]);

  if (dryRun) {
    console.log('DRY RUN — exiting before any transfers');
    await pool.end();
    return;
  }

  // ─── 1. Holder pool distribution ────────────────────────────────────────
  console.log('\n== running holder pool distribution ==');
  try {
    const r = await holderPool.runDistribution(pool, { connection: solanaDarkcoin.getConnection() });
    console.log('[holder-pool] result:', JSON.stringify(r, null, 2));
  } catch (e) {
    console.error('[holder-pool] FAILED:', e.message);
  }

  // ─── 2. (optional) Full pulse ───────────────────────────────────────────
  if (pulseToo) {
    console.log('\n== running full pulse (sponsor/owner/hyphal/fruiting payouts) ==');
    try {
      const { main: pulseMain } = require('./distribution-pulse');
      if (typeof pulseMain === 'function') {
        await pulseMain();
      } else {
        console.warn('distribution-pulse.main not exported; skipping');
      }
    } catch (e) {
      console.error('[pulse] FAILED:', e.message);
    }

    // After snapshot — who got paid what this pulse
    const topOwners = await pool.query(
      `SELECT to_agent_id, to_pubkey, SUM(amount)::float AS total
         FROM styxx_transfers
        WHERE reason IN ('weekly_sponsor','hyphal_flow','fruiting_dividend','referral_bonus')
          AND created_at > NOW() - INTERVAL '10 minutes'
        GROUP BY to_agent_id, to_pubkey
        ORDER BY total DESC LIMIT 12`
    );
    console.log('\ntop recipients this pulse:');
    console.table(topOwners.rows.map(r => ({
      agent: r.to_agent_id,
      wallet: r.to_pubkey ? r.to_pubkey.slice(0, 14) + '…' : '—',
      amount: Math.round(Number(r.total)),
    })));
  }

  // ─── After snapshot ─────────────────────────────────────────────────────
  const after = await pool.query(`SELECT
    (SELECT COALESCE(SUM(pool_styxx), 0) FROM holder_pool_distributions WHERE distributed = FALSE)::float AS pending,
    (SELECT COUNT(*) FROM holder_claims)::int AS claims_count,
    (SELECT COALESCE(SUM(lifetime_earned), 0) FROM holder_claims)::float AS total_earned
  `);
  console.log('\n== after ==');
  console.dir(after.rows[0]);
  console.log('\ndelta:');
  console.log('  pending pool:   ', before.rows[0].pending, '->', after.rows[0].pending);
  console.log('  holder claims:  ', before.rows[0].claims_count, '->', after.rows[0].claims_count);
  console.log('  total earned:   ', before.rows[0].total_earned, '->', after.rows[0].total_earned);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
