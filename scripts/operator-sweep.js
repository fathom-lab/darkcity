// ============================================================================
// scripts/operator-sweep.js
//
// Operator-initiated revenue extraction. Sweeps accumulated CITY SHARE from
// the treasury to the operator's wallet (Fathom).
//
// Rationale: the 15% city share from every distribution pulse stays in the
// treasury. Some of it re-circulates as activity rewards; some is protocol
// profit. This script is how the operator collects that profit without
// draining the treasury below a safety floor.
//
// Safety rails:
//   - Reads OPERATOR_PUBKEY env (required, no default — must be set explicitly)
//   - Hard cap: sweep ≤ MIN(requested, 30% of net city share accumulated
//     since last sweep, 10% of current treasury balance)
//   - Logs every sweep to distribution_events as kind='operator_sweep' for audit
//   - Requires --confirm flag (prevents accidental sweeps)
//
// Usage:
//   # preview (no transfer)
//   node scripts/operator-sweep.js
//
//   # actual sweep (explicit amount)
//   node scripts/operator-sweep.js --confirm --amount 5000
//
//   # sweep the max allowed
//   node scripts/operator-sweep.js --confirm --amount max
// ============================================================================

'use strict';

const { Pool } = require('pg');
const styxx = require('../lib/solana-styxx');

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const amountIdx = args.indexOf('--amount');
const AMOUNT_REQ = amountIdx >= 0 ? args[amountIdx + 1] : null;

/**
 * Core sweep logic. Parametrized so it can be invoked both from CLI (this
 * file's main()) and from the in-process scheduler in server.js.
 *
 * @param {Pool} pool - pg Pool (caller-owned; NOT ended here)
 * @param {string} operator - recipient pubkey
 * @param {string|number|null} requestedAmount - 'max' | number | null (null = preview)
 * @param {boolean} confirm - true to actually execute
 * @returns {Promise<{status, amount, signature?, capMax, cityAccumulated, treasuryStyxx}>}
 */
async function doSweep({ pool, operator, requestedAmount, confirm }) {
  styxx.init();

  const tBal = await styxx.getTreasuryBalances();

  const { rows: lastSweep } = await pool.query(`
    SELECT MAX(recorded_at) AS last_at FROM distribution_events WHERE kind = 'operator_sweep'
  `);
  const since = lastSweep[0]?.last_at || '1970-01-01';
  const { rows: cityRows } = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) AS city_accumulated
    FROM distribution_events
    WHERE kind IN ('weekly_sponsor')
      AND recipient_pubkey = 'TREASURY_CITY'
      AND recorded_at > $1
  `, [since]);
  const cityAccumulated = Number(cityRows[0].city_accumulated);

  const capByCity     = cityAccumulated * 0.30;
  const capByTreasury = tBal.styxx * 0.10;
  const capMax        = Math.max(0, Math.min(capByCity, capByTreasury));

  const ctx = { cityAccumulated, treasuryStyxx: tBal.styxx, capByCity, capByTreasury, capMax };

  if (capMax < 1) return { status: 'nothing_to_sweep', amount: 0, ...ctx };

  if (requestedAmount == null) return { status: 'preview', amount: 0, ...ctx };

  let amount;
  if (requestedAmount === 'max') amount = capMax;
  else amount = Math.min(Number(requestedAmount), capMax);
  if (!Number.isFinite(amount) || amount <= 0) return { status: 'nothing_to_sweep', amount: 0, ...ctx };

  if (!confirm) return { status: 'dry_run', amount, ...ctx };

  const { signature } = await styxx.airdropFromTreasury(operator, amount);

  await pool.query(`
    INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey, to_agent_id, to_pubkey, amount, reason, memo)
    VALUES ($1, 'TREASURY', $2, 'OPERATOR', $3, $4, 'operator_sweep', $5)
    ON CONFLICT (tx_signature) DO NOTHING
  `, [signature, styxx.getTreasury().publicKey.toBase58(), operator, amount, `caps:city30%=${capByCity.toFixed(2)} treasury10%=${capByTreasury.toFixed(2)}`]);

  await pool.query(`
    INSERT INTO distribution_events (kind, recipient_pubkey, amount, tx_signature)
    VALUES ('operator_sweep', $1, $2, $3)
  `, [operator, amount, signature]);

  return { status: 'swept', amount, signature, ...ctx };
}

async function main() {
  const operator = process.env.OPERATOR_PUBKEY;
  if (!operator) {
    console.error('[sweep] FATAL: OPERATOR_PUBKEY env var not set.');
    process.exit(2);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: (process.env.DATABASE_URL || '').includes('railway') ? { rejectUnauthorized: false } : false,
  });

  try {
    const r = await doSweep({ pool, operator, requestedAmount: AMOUNT_REQ, confirm: CONFIRM });
    console.log(`[sweep] treasury: ${r.treasuryStyxx.toFixed(2)} STYXX`);
    console.log(`[sweep] city share accumulated since last sweep: ${r.cityAccumulated.toFixed(2)} STYXX`);
    console.log(`[sweep] caps: city30%=${r.capByCity.toFixed(2)} treasury10%=${r.capByTreasury.toFixed(2)} -> maxAllowed=${r.capMax.toFixed(2)}`);
    if (r.status === 'nothing_to_sweep') console.log('[sweep] nothing meaningful to sweep yet.');
    else if (r.status === 'preview') console.log(`[sweep] preview: maxAllowed=${r.capMax.toFixed(2)} STYXX. Run with --confirm --amount max to execute.`);
    else if (r.status === 'dry_run') console.log(`[sweep] DRY (no --confirm): would sweep ${r.amount.toFixed(2)} STYXX -> ${operator}`);
    else if (r.status === 'swept') {
      console.log(`[sweep] DONE  tx=${r.signature}`);
      console.log(`[sweep] explorer: https://solscan.io/tx/${r.signature}`);
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(err => { console.error('[sweep] FATAL:', err); process.exit(1); });
}

module.exports = { main, doSweep };
