// diag-wallet.js — quick read-only diagnostics for a user wallet
// Usage: railway run node scripts/diag-wallet.js <partial-or-full-pubkey>
'use strict';
const { Pool } = require('pg');

(async () => {
  const pattern = (process.argv[2] || '').trim();
  if (!pattern) { console.error('usage: node scripts/diag-wallet.js <pubkey-prefix>'); process.exit(1); }
  const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const bets = await p.query(
      `SELECT b.id, b.user_wallet, b.stake_styxx, b.cashout_multiplier, b.payout_styxx, b.status,
              b.payment_tx, b.payout_tx, b.placed_at, b.round_id, r.agent_id, r.crash_multiplier
         FROM arena_bets b
         JOIN arena_rounds r ON r.id = b.round_id
        WHERE b.user_wallet LIKE $1 || '%'
        ORDER BY b.placed_at DESC LIMIT 25`,
      [pattern]
    );
    console.log(`=== bets for ${pattern}* (${bets.rows.length}) ===`);
    for (const b of bets.rows) {
      const stake = Number(b.stake_styxx).toLocaleString();
      const mult = b.cashout_multiplier ? Number(b.cashout_multiplier).toFixed(2) + 'x' : '-';
      const payout = b.payout_styxx ? Number(b.payout_styxx).toLocaleString() : '-';
      const crash = Number(b.crash_multiplier).toFixed(2) + 'x';
      console.log(
        b.placed_at.toISOString().slice(11, 19),
        `r${b.round_id}`.padEnd(6),
        b.status.padEnd(15),
        'stake', stake.padStart(12),
        'mult', mult.padStart(7),
        'payout', payout.padStart(12),
        'crash@', crash,
        b.agent_id
      );
    }
    const sum = await p.query(
      `SELECT COUNT(*) AS n,
              SUM(stake_styxx)::numeric AS total_in,
              SUM(COALESCE(payout_styxx,0))::numeric AS total_out,
              SUM(stake_styxx - COALESCE(payout_styxx,0))::numeric AS net_loss
         FROM arena_bets WHERE user_wallet LIKE $1 || '%'`,
      [pattern]
    );
    console.log('\n=== totals ===');
    console.log(sum.rows[0]);

    // Pending payouts (wins that haven't paid yet)
    const pend = await p.query(
      `SELECT id, stake_styxx, cashout_multiplier, payout_styxx, status
         FROM arena_bets
        WHERE user_wallet LIKE $1 || '%' AND status IN ('payout_pending','cashed_out')
          AND payout_tx IS NULL`,
      [pattern]
    );
    console.log('\n=== unpaid wins ===');
    console.log(pend.rows.length ? pend.rows : 'none');

    // Did we see any payment_tx land but bet not insert? Check styxx_transfers
    const transfers = await p.query(
      `SELECT tx_signature, from_pubkey, to_pubkey, amount, reason, created_at
         FROM styxx_transfers
        WHERE (from_pubkey LIKE $1 || '%' OR to_pubkey LIKE $1 || '%')
          AND created_at > NOW() - INTERVAL '2 hours'
        ORDER BY created_at DESC LIMIT 20`,
      [pattern]
    );
    console.log('\n=== recent transfers (2h) ===');
    for (const t of transfers.rows) {
      console.log(
        t.created_at.toISOString().slice(11, 19),
        t.reason.padEnd(20),
        Number(t.amount).toLocaleString().padStart(12),
        (t.from_pubkey || '').slice(0, 8),
        '→',
        (t.to_pubkey || '').slice(0, 8),
        t.tx_signature?.slice(0, 10)
      );
    }
  } finally {
    await p.end();
  }
})().catch(e => { console.error('error:', e.message); process.exit(1); });
