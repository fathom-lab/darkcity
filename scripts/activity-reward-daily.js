// ============================================================================
// scripts/activity-reward-daily.js
//
// ⚠️ DEPRECATED — DO NOT SCHEDULE.
//
// This script previously airdropped activity rewards to agent wallets daily.
// That flow is now folded into scripts/distribution-pulse.js which runs every
// 4 hours and handles activity rewards + sponsor payouts + hyphal flows +
// cognition fees in one atomic unit.
//
// Running this script alongside distribution-pulse.js would DOUBLE-PAY agents.
// It is intentionally a no-op to prevent misconfigured cron from causing payout
// leakage.
//
// Correct schedule: cron `0 */4 * * *` → node scripts/distribution-pulse.js
// ============================================================================

'use strict';

function main() {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('[activity-reward-daily] DEPRECATED — this script is a no-op.');
  console.error('[activity-reward-daily] Use scripts/distribution-pulse.js instead.');
  console.error('[activity-reward-daily] Correct cron: 0 */4 * * * node scripts/distribution-pulse.js');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  process.exit(0);
}

if (require.main === module) main();
module.exports = { main };
