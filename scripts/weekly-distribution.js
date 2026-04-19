// ============================================================================
// scripts/weekly-distribution.js
//
// ⚠️ DEPRECATED — DO NOT SCHEDULE.
//
// Weekly sponsor distribution is now folded into scripts/distribution-pulse.js
// which runs every 4 hours. Users get paid 6 times per day instead of once
// per week — dramatically better retention than weekly payouts.
//
// Running this script alongside distribution-pulse.js would DOUBLE-PAY
// sponsors, referrers, hyphal links, and fruiting bodies. It is intentionally
// a no-op to prevent misconfigured cron from causing catastrophic payout
// leakage.
//
// Correct schedule: cron `0 */4 * * *` → node scripts/distribution-pulse.js
// ============================================================================

'use strict';

function main() {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('[weekly-distribution] DEPRECATED — this script is a no-op.');
  console.error('[weekly-distribution] Use scripts/distribution-pulse.js instead.');
  console.error('[weekly-distribution] Correct cron: 0 */4 * * * node scripts/distribution-pulse.js');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  process.exit(0);
}

if (require.main === module) main();
module.exports = { main, distributeForAgent: () => { throw new Error('use distribution-pulse instead'); } };
