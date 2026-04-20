#!/usr/bin/env node
// Value-delivery audit: are we giving users what we promised?
//   • Pulse: is the 4h pulse actually running?
//   • Holder Pool: is it accruing + distributing?
//   • Burns: is the 10% real on-chain burn happening per mint?
//   • Owner payouts: are the 85% pulse shares hitting owner wallets?
'use strict';
const { Pool } = require('pg');
(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /railway|rlwy\.net/.test(process.env.DATABASE_URL || '') ? { rejectUnauthorized: false } : false,
  });

  const r = {};

  // Pulse: last distribution_events pulse
  const { rows: pulseRows } = await pool.query(
    `SELECT kind, COUNT(*)::int AS n, MAX(created_at) AS last
       FROM distribution_events
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY kind ORDER BY n DESC`
  ).catch(() => ({ rows: [] }));
  r.pulse_events_7d = pulseRows;

  // Most recent pulse
  const { rows: lastPulse } = await pool.query(
    `SELECT created_at FROM treasury_snapshots ORDER BY created_at DESC LIMIT 1`
  ).catch(() => ({ rows: [] }));
  r.last_treasury_snapshot = lastPulse[0] || null;

  // Holder pool: pending + distributed events
  const { rows: hpState } = await pool.query(
    `SELECT * FROM v_holder_pool_state`
  ).catch(() => ({ rows: [{}] }));
  r.holder_pool = hpState[0] || null;

  const { rows: hpDistrib } = await pool.query(
    `SELECT source, distributed, COUNT(*)::int AS n, SUM(pool_styxx)::float AS total_styxx
       FROM holder_pool_distributions GROUP BY source, distributed ORDER BY source, distributed`
  ).catch(() => ({ rows: [] }));
  r.holder_pool_events = hpDistrib;

  // Real on-chain burns: recent
  const { rows: burns } = await pool.query(
    `SELECT reason, COUNT(*)::int AS n, SUM(amount)::float AS total
       FROM styxx_transfers
      WHERE reason IN ('mint_fee_burn','burn')
        AND confirmed_at > NOW() - INTERVAL '7 days'
      GROUP BY reason`
  );
  r.burns_7d = burns;

  // Pulse payouts: sponsor_distribution / weekly_sponsor kinds
  const { rows: payouts } = await pool.query(
    `SELECT reason, COUNT(*)::int AS n, SUM(amount)::float AS total, MAX(confirmed_at) AS last
       FROM styxx_transfers
      WHERE reason IN ('sponsor_payout','weekly_sponsor','activity_reward','contract_reward','pulse_payout')
        AND confirmed_at > NOW() - INTERVAL '7 days'
      GROUP BY reason ORDER BY total DESC`
  );
  r.payouts_7d = payouts;

  // Specific wallet — T.Rex MR_REX + Zufus ZUFUS_BOT owner payouts
  const { rows: trex } = await pool.query(
    `SELECT reason, amount, confirmed_at FROM styxx_transfers
      WHERE to_pubkey = '6iMUWdsHLjpJGfnAN4XofMdwLdD67FqWvsg3zfXagkSN'
      ORDER BY confirmed_at DESC LIMIT 10`
  );
  r.trex_owner_payouts = trex.map(t => ({ reason: t.reason, amount: Number(t.amount), at: t.confirmed_at }));

  // Is the city ticking? Recent agent_actions
  const { rows: actions } = await pool.query(
    `SELECT COUNT(*)::int AS total_actions_1h,
            COUNT(DISTINCT agent_id)::int AS distinct_agents_1h
       FROM agent_actions WHERE created_at > NOW() - INTERVAL '1 hour'`
  );
  r.city_ticking = actions[0];

  // Is the depth scorer scoring? Recent depth_evaluations
  const { rows: depth } = await pool.query(
    `SELECT COUNT(*)::int AS total_evals_1h,
            AVG(depth_score)::numeric(10,3) AS avg_depth_1h
       FROM depth_evaluations WHERE created_at > NOW() - INTERVAL '1 hour'`
  );
  r.depth_scoring = depth[0];

  console.log(JSON.stringify(r, null, 2));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
