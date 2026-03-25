/**
 * run-migration-interruption.js
 * Adds interruption recovery columns to depth_evaluations.
 * Run once: node run-migration-interruption.js
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

async function run() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations', 'add-interruption-recovery.sql'),
    'utf-8'
  );

  const client = await pool.connect();
  try {
    console.log('[Migration] Running add-interruption-recovery...');
    const result = await client.query(sql);
    // Last statement is a SELECT — show results
    const lastResult = Array.isArray(result) ? result[result.length - 1] : result;
    if (lastResult?.rows?.length) {
      console.log('[Migration] Columns verified:');
      lastResult.rows.forEach(r => console.log(`  ✓ ${r.column_name} (${r.data_type})`));
    }
    console.log('[Migration] ✅ Done.');
  } catch (e) {
    console.error('[Migration] ❌ Failed:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
