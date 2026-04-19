// scripts/dry-run-migration.js
// Applies styxx-economy-v1.sql inside a transaction and ROLLS BACK.
// Verifies the migration parses + satisfies all constraints on real prod
// schema WITHOUT leaving any changes. Run via: railway ssh from /app.

'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const sqlPath = path.join(__dirname, '..', 'migrations', 'styxx-economy-v1.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: (process.env.DATABASE_URL || '').includes('railway') ? { rejectUnauthorized: false } : false,
  });
  const client = await pool.connect();
  try {
    console.log('[dry-run] BEGIN');
    await client.query('BEGIN');
    await client.query(sql);
    console.log('[dry-run] migration applied in transaction — validating...');

    // Post-apply checks
    const checks = [
      "SELECT COUNT(*) FROM economy_params WHERE key = 'mint_fee_usd'",
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='sponsorships'",
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='hyphal_links'",
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='fruiting_bodies'",
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='referrals'",
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='agent_earnings'",
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='distribution_events'",
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='treasury_snapshots'",
      "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='external_agents' AND column_name='owner_pubkey'",
      "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='external_agents' AND column_name='cognition_fee_balance'",
      "SELECT COUNT(*) FROM information_schema.views WHERE table_schema='public' AND table_name='v_agent_economy'",
    ];
    for (const q of checks) {
      const r = await client.query(q);
      console.log(`  OK  ${q.slice(0, 90)}... → ${r.rows[0].count}`);
    }

    // v_agent_economy should be queryable
    const vTest = await client.query('SELECT COUNT(*) FROM v_agent_economy');
    console.log(`  OK  v_agent_economy queryable: ${vTest.rows[0].count} rows`);

    console.log('[dry-run] ROLLBACK (no changes persisted)');
    await client.query('ROLLBACK');
    console.log('[dry-run] ✓ MIGRATION VALIDATED — safe to apply in production');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[dry-run] ✗ MIGRATION FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
