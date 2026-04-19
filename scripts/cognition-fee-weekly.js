// ============================================================================
// scripts/cognition-fee-weekly.js — DORMANCY CHECKER (renamed semantically)
//
// Cognition fees are now deducted per-pulse (every 4 hours) inside
// scripts/distribution-pulse.js, taken off the top of an agent's activity
// rewards BEFORE the sponsor/owner split. No separate fee-transfer happens.
//
// This weekly cron's remaining job: mark agents dormant if they have NOT
// earned anything in the last 14 days. Dormant agents stop ticking (no
// Claude API cost). They can be revived by earning or by a small reactivation
// fee payment (V1.1 endpoint).
//
// Run: 0 2 * * 0  → Sundays 02:00 UTC
// ============================================================================

'use strict';

const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: (process.env.DATABASE_URL || '').includes('railway') ? { rejectUnauthorized: false } : false,
  });

  // Find minted agents with zero earnings in past 14 days
  const { rows: stale } = await pool.query(`
    SELECT ea.agent_id
    FROM external_agents ea
    WHERE ea.owner_pubkey IS NOT NULL
      AND ea.euthanized_at IS NULL
      AND ea.dormant = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM agent_earnings ae
        WHERE ae.agent_id = ea.agent_id
          AND ae.recorded_at > NOW() - INTERVAL '14 days'
      )
      AND ea.minted_at < NOW() - INTERVAL '14 days'
  `);

  console.log(`[dormancy] ${stale.length} agents stale ≥14 days → marking dormant`);
  for (const { agent_id } of stale) {
    await pool.query('UPDATE external_agents SET dormant = TRUE WHERE agent_id = $1', [agent_id]);
    console.log(`[dormancy] ${agent_id} → dormant`);
  }

  // Euthanize check: agents dormant 30+ days get euthanized (wallet balance 50%
  // to a bounty hunter, 50% to city pool). For V1 we don't auto-euthanize in
  // this cron — it requires a human or bounty-hunter action via a separate
  // endpoint. Just log.
  const { rows: euthanizable } = await pool.query(`
    SELECT agent_id FROM external_agents
    WHERE dormant = TRUE AND euthanized_at IS NULL
      AND minted_at < NOW() - ($1 || ' days')::INTERVAL
  `, [String(30 + 14)]);  // dormant 30d (+14d to dormancy threshold)
  if (euthanizable.length) {
    console.log(`[dormancy] ${euthanizable.length} agents eligible for euthanasia (use /api/agents/:id/euthanize)`);
  }

  await pool.end();
}

if (require.main === module) {
  main().catch(err => { console.error('[dormancy] FATAL:', err); process.exit(1); });
}

module.exports = { main };
