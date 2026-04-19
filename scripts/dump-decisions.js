// scripts/dump-decisions.js
// Read-only dump of scored agent decisions for Fathom CSV-to-P&L analysis.
// Run via: railway run node scripts/dump-decisions.js > /dev/null
// (JSON goes to ./decisions.json, progress to stderr)

'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const STDOUT_MODE = process.argv.includes('--stdout');
const OUT_FP = STDOUT_MODE ? null : path.resolve(process.cwd(), 'decisions.json');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('FATAL: DATABASE_URL not set — run via `railway run`');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('railway') || url.includes('supabase')
      ? { rejectUnauthorized: false } : false,
  });

  // Probe which tables exist first
  const { rows: tables } = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('depth_evaluations','styxx_transfers','agent_actions','external_agents')
  `);
  const have = new Set(tables.map(t => t.table_name));
  console.error(`[dump] tables present: ${[...have].join(', ') || '(none)'}`);

  if (!have.has('depth_evaluations')) {
    console.error('[dump] depth_evaluations not present — cannot proceed.');
    console.error('[dump] is NPC brain ticking and depth_scorer wired?');
    process.exit(2);
  }

  // Row counts
  const { rows: cntRows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM depth_evaluations) AS n_total,
      (SELECT COUNT(*) FROM depth_evaluations
         WHERE reasoning_trace IS NOT NULL
           AND depth_score IS NOT NULL
           AND length(reasoning_trace) >= 20) AS n_usable
  `);
  console.error(`[dump] depth_evaluations: ${cntRows[0].n_total} total, ${cntRows[0].n_usable} usable (has reasoning_trace + depth_score)`);

  const hasTransfers = have.has('styxx_transfers');
  const transfersJoinSelect = hasTransfers
    ? `
      COALESCE(
        (SELECT SUM(t.amount)::float FROM styxx_transfers t
         WHERE t.to_agent_id = d.agent_id
           AND t.created_at BETWEEN d.created_at - INTERVAL '5 minutes'
                               AND d.created_at + INTERVAL '5 minutes'), 0.0) AS styxx_inflow_5min,
      COALESCE(
        (SELECT SUM(t.amount)::float FROM styxx_transfers t
         WHERE t.from_agent_id = d.agent_id
           AND t.created_at BETWEEN d.created_at - INTERVAL '5 minutes'
                               AND d.created_at + INTERVAL '5 minutes'), 0.0) AS styxx_outflow_5min
    `
    : `0.0 AS styxx_inflow_5min, 0.0 AS styxx_outflow_5min`;

  // Columns in depth_evaluations vary — probe
  const { rows: cols } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='depth_evaluations'
  `);
  const colSet = new Set(cols.map(c => c.column_name));
  const actionCol = colSet.has('action') ? 'd.action'
    : colSet.has('action_type') ? 'd.action_type'
    : `NULL::text`;

  const q = `
    SELECT
      d.id AS eval_id,
      d.agent_id,
      ${actionCol} AS action_type,
      d.reasoning_trace,
      d.depth_score,
      ${colSet.has('depth_tier') ? 'd.depth_tier' : 'NULL::text'} AS depth_tier,
      ${colSet.has('agent_state') ? 'd.agent_state' : 'NULL::jsonb'} AS agent_state,
      ${colSet.has('counterfactual') ? 'd.counterfactual' : 'NULL::text'} AS counterfactual,
      ${colSet.has('chain_id') ? 'd.chain_id' : 'NULL::text'} AS chain_id,
      d.created_at,
      ${transfersJoinSelect}
    FROM depth_evaluations d
    WHERE d.reasoning_trace IS NOT NULL
      AND d.depth_score IS NOT NULL
      AND length(d.reasoning_trace) >= 20
    ORDER BY d.created_at DESC
    LIMIT 2000
  `;

  console.error('[dump] running main query...');
  const { rows } = await pool.query(q);
  console.error(`[dump] fetched ${rows.length} rows`);

  if (STDOUT_MODE) {
    process.stdout.write(JSON.stringify(rows));
    console.error(`[dump] emitted ${rows.length} rows to stdout`);
  } else {
    fs.writeFileSync(OUT_FP, JSON.stringify(rows), 'utf-8');
    console.error(`[dump] wrote ${OUT_FP} (${(fs.statSync(OUT_FP).size/1024).toFixed(1)} KB)`);
  }

  await pool.end();
}

main().catch(err => {
  console.error('[dump] FATAL:', err.message);
  process.exit(1);
});
