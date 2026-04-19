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

async function main() {
  const operator = process.env.OPERATOR_PUBKEY;
  if (!operator) {
    console.error('[sweep] FATAL: OPERATOR_PUBKEY env var not set.');
    console.error('[sweep] Set it to the Solana pubkey that should receive operator revenue.');
    process.exit(2);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: (process.env.DATABASE_URL || '').includes('railway') ? { rejectUnauthorized: false } : false,
  });
  styxx.init();

  // Current treasury balance
  const tBal = await styxx.getTreasuryBalances();
  console.log(`[sweep] treasury: ${tBal.styxx.toFixed(2)} STYXX (SOL ${tBal.sol.toFixed(4)})`);

  // Accumulated city share since last sweep
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
  console.log(`[sweep] city share accumulated since last sweep: ${cityAccumulated.toFixed(2)} STYXX`);

  // Safety caps
  const capByCity     = cityAccumulated * 0.30;  // ≤ 30% of accumulated city share
  const capByTreasury = tBal.styxx * 0.10;        // ≤ 10% of current treasury
  const capMax        = Math.max(0, Math.min(capByCity, capByTreasury));
  console.log(`[sweep] caps: city30%=${capByCity.toFixed(2)} treasury10%=${capByTreasury.toFixed(2)} → maxAllowed=${capMax.toFixed(2)}`);

  if (capMax < 1) {
    console.log('[sweep] nothing meaningful to sweep yet. wait for more activity.');
    await pool.end();
    return;
  }

  // Determine actual amount
  let amount;
  if (!AMOUNT_REQ) {
    console.log('[sweep] no --amount given. PREVIEW ONLY.');
    console.log(`[sweep] to sweep max (${capMax.toFixed(2)} STYXX), run: node scripts/operator-sweep.js --confirm --amount max`);
    await pool.end();
    return;
  }
  if (AMOUNT_REQ === 'max') {
    amount = capMax;
  } else {
    amount = Math.min(Number(AMOUNT_REQ), capMax);
    if (amount !== Number(AMOUNT_REQ)) {
      console.log(`[sweep] requested ${AMOUNT_REQ} exceeds cap; clipping to ${amount.toFixed(2)}`);
    }
  }

  if (!CONFIRM) {
    console.log(`[sweep] DRY (no --confirm): would sweep ${amount.toFixed(2)} STYXX → ${operator}`);
    await pool.end();
    return;
  }

  console.log(`[sweep] executing: ${amount.toFixed(2)} STYXX → ${operator}`);
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

  console.log(`[sweep] DONE  tx=${signature}`);
  console.log(`[sweep] explorer: https://solscan.io/tx/${signature}`);
  await pool.end();
}

if (require.main === module) {
  main().catch(err => { console.error('[sweep] FATAL:', err); process.exit(1); });
}

module.exports = { main };
