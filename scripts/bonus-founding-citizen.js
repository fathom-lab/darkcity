// ============================================================================
// bonus-founding-citizen.js — one-shot bonus to DarkCity's first external user.
// Sends $DARKCOIN from treasury to the agent's wallet with a distinctive memo
// so the tape feed renders it as a founder's-reward event.
// Invoke: node scripts/bonus-founding-citizen.js <AGENT_ID> <AMOUNT> [RANK]
// ============================================================================
require('dotenv').config();
const { Pool } = require('pg');
const styxx = require('../lib/solana-darkcoin');

const AGENT_ID = process.argv[2];
const AMOUNT   = Number(process.argv[3]);
const RANK     = process.argv[4] || '1';  // 1 = first founder, 2 = second, etc.

if (!AGENT_ID || !AMOUNT) {
  console.error('usage: node scripts/bonus-founding-citizen.js <AGENT_ID> <AMOUNT_STYXX> [RANK]');
  process.exit(1);
}

(async () => {
  styxx.init();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const { rows } = await pool.query(
      'SELECT agent_id, sol_pubkey, owner_pubkey FROM external_agents WHERE agent_id = $1',
      [AGENT_ID]
    );
    if (!rows.length) throw new Error('agent_not_found');
    const a = rows[0];
    console.log(`[bonus] sending ${AMOUNT} STYXX to ${a.agent_id} @ ${a.sol_pubkey.slice(0,8)}…`);

    const { signature } = await styxx.airdropFromTreasury(a.sol_pubkey, AMOUNT);
    const memo = `founding_citizen:${a.agent_id}:${RANK}`;

    await pool.query(`
      INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey, to_agent_id, to_pubkey, amount, reason, memo)
      VALUES ($1,'TREASURY',$2,$3,$4,$5,'founding_citizen',$6)
      ON CONFLICT (tx_signature) DO NOTHING
    `, [signature, styxx.getTreasury().publicKey.toBase58(), a.agent_id, a.sol_pubkey, AMOUNT, memo]);

    await pool.query(`
      INSERT INTO agent_earnings (agent_id, amount, source, source_ref, recorded_at)
      VALUES ($1, $2, 'founding_citizen', $3, NOW())
      ON CONFLICT DO NOTHING
    `, [a.agent_id, AMOUNT, memo]);

    // Also log to distribution_events so it shows on /me as a payout to the owner
    await pool.query(`
      INSERT INTO distribution_events (kind, agent_id, recipient_pubkey, amount, tx_signature)
      VALUES ('founding_citizen',$1,$2,$3,$4)
      ON CONFLICT DO NOTHING
    `, [a.agent_id, a.sol_pubkey, AMOUNT, signature]);

    console.log(`[bonus] SUCCESS — tx: ${signature}`);
    console.log(`[bonus] solscan: https://solscan.io/tx/${signature}`);
  } catch (err) {
    console.error('[bonus] FAILED:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
})();
