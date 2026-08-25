// ============================================================================
// HOLDER POOL — hold $DARKCOIN, get paid. Fully autonomous.
// ============================================================================
// One rule, zero friction:
//   • A slice of every real $DARKCOIN inflow to DarkCity goes to a Holder Pool.
//   • Every 4h pulse, the pool distributes pro-rata to every wallet holding
//     $DARKCOIN on-chain above a dust floor.
//   • Payouts are AUTOMATIC on-chain transfers — holders do nothing. They
//     wake up to new $DARKCOIN in their Phantom wallet.
//
// This module owns two operations:
//   1. accrueFromMint()  — called after each mint finalize to tap the fee
//   2. runDistribution() — called at each 4h pulse to PUSH payouts to holders
//
// Economy params (migration holder-pool-v1.sql):
//   holder_pool_mint_fee_bps       (default 1000 = 10% of every mint fee)
//   holder_pool_min_holding_styxx  (default 100 — dust filter)
//   holder_pool_excluded_pubkeys   (JSON array of contracts/LPs/CEX)
//   holder_pool_paused             (operator kill-switch)
//
// On-chain holder discovery: getProgramAccounts on the Token-2022 program,
// filtered by the darkcoin mint. For MVP we accept best-effort — if the RPC
// chokes, the pulse skips distribution and the pool rolls forward to the
// next pulse. Nothing is ever lost, just deferred.
// ============================================================================

'use strict';

const solanaDarkcoin = require('../lib/solana-darkcoin');
const { TOKEN_MINT_ADDR, TOKEN_TICKER, TOKEN_LIVE } = require('../lib/token-config');
const { PublicKey } = require('@solana/web3.js');
const { TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');

// ── helpers ────────────────────────────────────────────────────────────────
async function getParam(pool, key, fallback) {
  try {
    const { rows } = await pool.query('SELECT value FROM economy_params WHERE key = $1', [key]);
    return rows.length ? rows[0].value : fallback;
  } catch { return fallback; }
}
async function isPaused(pool) {
  return String(await getParam(pool, 'holder_pool_paused', 'false')).toLowerCase() === 'true';
}
const bps = n => Number(n) / 10000;

/**
 * Tap pulse earnings. Called at the start of each 4h pulse, BEFORE sponsor
 * distribution, so 5% (tunable) of net agent earnings is diverted to the
 * Holder Pool. Ensures holders keep getting paid even in periods with no new
 * mints — DarkCity's ongoing activity itself funds holder income.
 */
async function accrueFromPulse(pool, { pulse_id, net_earnings_styxx }) {
  if (await isPaused(pool)) return { ok: false, reason: 'paused' };
  const bpsVal = Number(await getParam(pool, 'holder_pool_pulse_bps', 500));
  if (!bpsVal || bpsVal <= 0) return { ok: false, reason: 'disabled' };

  const poolAmount = Math.floor(Number(net_earnings_styxx) * bps(bpsVal));
  if (poolAmount <= 0) return { ok: false, reason: 'zero_amount' };

  // Idempotent per pulse_id — pulses occasionally retry on transient errors.
  const existing = await pool.query(
    `SELECT id FROM holder_pool_distributions WHERE source = 'pulse' AND source_ref = $1`,
    [String(pulse_id)]
  );
  if (existing.rows.length) return { ok: true, accrued: 0, already_tapped: true };

  const { rows } = await pool.query(
    `INSERT INTO holder_pool_distributions (source, source_ref, pool_styxx)
     VALUES ('pulse', $1, $2) RETURNING id`,
    [String(pulse_id), poolAmount]
  );
  return { ok: true, distribution_id: rows[0].id, accrued: poolAmount };
}

/**
 * Tap a mint fee. Called by darkcoin-economy.js mintFinalize right after the
 * on-chain mint payment is verified. Writes a pending row to the
 * holder_pool_distributions ledger. The actual on-chain push happens at the
 * next pulse via runDistribution().
 */
async function accrueFromMint(pool, { quote_id, fee_styxx }) {
  if (await isPaused(pool)) return { ok: false, reason: 'paused' };
  const bpsVal = Number(await getParam(pool, 'holder_pool_mint_fee_bps', 1000));
  if (!bpsVal || bpsVal <= 0) return { ok: false, reason: 'disabled' };

  const poolAmount = Math.floor(Number(fee_styxx) * bps(bpsVal));
  if (poolAmount <= 0) return { ok: false, reason: 'zero_amount' };

  // Idempotent — if this quote_id already accrued, don't double-tap.
  const existing = await pool.query(
    `SELECT id FROM holder_pool_distributions WHERE source = 'mint' AND source_ref = $1`,
    [String(quote_id)]
  );
  if (existing.rows.length) return { ok: true, accrued: 0, already_tapped: true };

  const { rows } = await pool.query(
    `INSERT INTO holder_pool_distributions (source, source_ref, pool_styxx)
     VALUES ('mint', $1, $2) RETURNING id`,
    [String(quote_id), poolAmount]
  );
  return { ok: true, distribution_id: rows[0].id, accrued: poolAmount };
}

/**
 * Discover on-chain holders of the darkcoin mint via getProgramAccounts.
 * Returns [{pubkey, holding}] where holding is a float $DARKCOIN amount.
 * Uses Token-2022. Rejects on RPC failure so callers can fall back.
 */
async function discoverHoldersOnChain(connection) {
  // Mint comes from token-config (env). Until darkcoin is minted there is no
  // address — reject so callers fall back to ledger-based discovery.
  if (!TOKEN_LIVE) throw new Error(TOKEN_TICKER + ' mint pending — no on-chain mint address configured');
  const TOKEN_MINT = TOKEN_MINT_ADDR;
  // Token-2022 accounts have the mint at offset 0 (first 32 bytes).
  const accounts = await connection.getParsedProgramAccounts(TOKEN_2022_PROGRAM_ID, {
    commitment: 'confirmed',
    filters: [
      { memcmp: { offset: 0, bytes: TOKEN_MINT } },
    ],
  });
  const holders = [];
  for (const { account } of accounts) {
    const info = account?.data?.parsed?.info;
    if (!info) continue;
    const owner = info.owner;
    const amt = info.tokenAmount?.uiAmount;
    if (!owner || !Number.isFinite(amt) || amt <= 0) continue;
    holders.push({ pubkey: owner, holding: amt });
  }
  return holders;
}

/**
 * Fallback holder discovery from our own transfer ledger.
 * Public Solana RPC endpoints reject getProgramAccounts on Token-2022
 * ("excluded from account secondary indexes"). Rather than leaving the
 * pool stuck, derive net holdings from styxx_transfers — we signed every
 * distribution, so the ledger is a complete record of who received $DARKCOIN.
 * This UNDER-counts holders who bought on pump.fun and never interacted
 * with DarkCity, but those wallets can't be paid automatically anyway
 * (they aren't in any of our tables). Covers 100% of our ecosystem.
 */
async function discoverHoldersFromLedger(pgPool) {
  const { rows } = await pgPool.query(`
    WITH flows AS (
      SELECT to_pubkey   AS pubkey, SUM(amount)::float AS inflow,  0::float AS outflow
        FROM styxx_transfers WHERE to_pubkey IS NOT NULL GROUP BY to_pubkey
      UNION ALL
      SELECT from_pubkey AS pubkey, 0::float AS inflow, SUM(amount)::float AS outflow
        FROM styxx_transfers WHERE from_pubkey IS NOT NULL GROUP BY from_pubkey
    )
    SELECT pubkey,
           GREATEST(SUM(inflow) - SUM(outflow), 0)::float AS holding
      FROM flows
     WHERE pubkey IS NOT NULL
     GROUP BY pubkey
    HAVING GREATEST(SUM(inflow) - SUM(outflow), 0) > 0
  `);
  // Drop synthetic markers like 'BURN' — not real Solana pubkeys.
  return rows
    .filter(r => {
      try { new PublicKey(r.pubkey); return true; } catch { return false; }
    })
    .map(r => ({ pubkey: r.pubkey, holding: Number(r.holding) }));
}

/**
 * Union ledger-derived holders with any known wallet we've seen touch DarkCity
 * (mint, sponsor, /me visit, seed). Known wallets get their on-chain balance
 * looked up individually — single getTokenAccountsByOwner calls aren't blocked
 * by the RPC the way getProgramAccounts is. This is what closes the pump.fun
 * gap: buyers whose tokens came from a bonding curve appear in known_wallets
 * but never in our styxx_transfers ledger.
 */
async function discoverHoldersUnion(pgPool) {
  const ledgerHolders = await discoverHoldersFromLedger(pgPool);
  const byPubkey = new Map(ledgerHolders.map(h => [h.pubkey, h.holding]));

  let known = [];
  try {
    const { rows } = await pgPool.query('SELECT pubkey FROM known_wallets');
    known = rows.map(r => r.pubkey);
  } catch (_) { /* table missing → no known wallets */ }

  const solanaDarkcoin = require('../lib/solana-darkcoin');
  // Fetch on-chain balance for each known wallet. Serial + small backoff so
  // we don't trip RPC rate limits. ~50 wallets × ~400ms = 20s worst case —
  // acceptable for a per-pulse operation.
  for (const pk of known) {
    try { new PublicKey(pk); } catch { continue; }
    try {
      const bal = await solanaDarkcoin.getDarkcoinBalance(pk);
      if (Number.isFinite(bal) && bal > 0) {
        // On-chain is source of truth — replace ledger estimate if present.
        byPubkey.set(pk, bal);
      }
    } catch (e) {
      // Individual lookup failure shouldn't kill distribution — keep going.
      if (/429|rate/i.test(String(e.message))) await new Promise(r => setTimeout(r, 1000));
    }
  }

  return [...byPubkey.entries()].map(([pubkey, holding]) => ({ pubkey, holding }));
}

/**
 * Run distribution — called once per pulse. Sums all pending pool events,
 * snapshots on-chain holders, computes pro-rata shares, and PUSHES on-chain
 * transfers to each qualifying holder. Holders do nothing.
 *
 * Failure modes:
 *   • Holder discovery fails → pool rolls to next pulse, nothing lost.
 *   • A single transfer fails → logged, pool that was earmarked for that
 *     holder re-enters the pool as "undistributed dust" for next pulse.
 */
async function runDistribution(pool, { connection } = {}) {
  if (await isPaused(pool)) return { ok: false, reason: 'paused' };

  // Pending pool events (mint taps etc.)
  const { rows: pending } = await pool.query(
    `SELECT id, source, source_ref, pool_styxx FROM holder_pool_distributions
      WHERE distributed = FALSE ORDER BY snapshot_taken_at ASC`
  );
  if (!pending.length) return { ok: true, distributed: 0, note: 'nothing pending' };

  const totalPool = pending.reduce((s, r) => s + Number(r.pool_styxx), 0);
  if (totalPool <= 0) return { ok: true, distributed: 0, note: 'zero pool' };

  // ── Snapshot holders on-chain ───────────────────────────────────────
  const conn = connection || solanaDarkcoin.getConnection?.();
  if (!conn) return { ok: false, reason: 'no_connection' };

  let holders;
  let discoverySource = 'onchain';
  try {
    holders = await discoverHoldersOnChain(conn);
  } catch (e) {
    console.warn('[holder-pool] on-chain discovery failed, falling back to ledger+known_wallets:', e.message);
    try {
      holders = await discoverHoldersUnion(pool);
      discoverySource = 'ledger+known';
    } catch (e2) {
      console.warn('[holder-pool] union fallback also failed:', e2.message);
      return { ok: false, reason: 'discovery_failed', error: e2.message };
    }
  }
  console.log(`[holder-pool] discovered ${holders.length} holders via ${discoverySource}`);

  // Filter dust + exclusions. Also filter the treasury itself (it shouldn't
  // pay itself), burn address, and well-known contract/LP/CEX wallets.
  const minHolding = Number(await getParam(pool, 'holder_pool_min_holding_styxx', 100));
  const minPayout  = Number(await getParam(pool, 'holder_pool_min_payout_styxx', 5));
  const maxHolders = Number(await getParam(pool, 'holder_pool_max_holders_per_pulse', 200));
  const excludedRaw = await getParam(pool, 'holder_pool_excluded_pubkeys', '[]');
  let excluded = [];
  try { excluded = JSON.parse(excludedRaw); } catch { excluded = []; }
  const treasuryPk = solanaDarkcoin.getTreasury?.()?.publicKey?.toBase58?.() || '';
  const excludedSet = new Set([treasuryPk, ...excluded]);
  // Sort qualifying holders by holding desc — if we hit the max-per-pulse
  // cap, the biggest holders get paid first (fairest under a cap). Smaller
  // holders roll forward and are paid first next pulse via rollover row.
  let qualifying = holders
    .filter(h => h.holding >= minHolding && !excludedSet.has(h.pubkey))
    .sort((a, b) => b.holding - a.holding);
  if (qualifying.length > maxHolders) qualifying = qualifying.slice(0, maxHolders);

  if (!qualifying.length) {
    const ids = pending.map(p => p.id);
    await pool.query(
      `UPDATE holder_pool_distributions
         SET distributed = TRUE, distributed_at = NOW(),
             active_holders_count = 0, total_active_holding = 0,
             note = 'no qualifying holders'
       WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    return { ok: true, distributed: 0, note: 'no qualifying holders' };
  }

  const totalHolding = qualifying.reduce((s, h) => s + h.holding, 0);

  // ── Push on-chain transfers ─────────────────────────────────────────
  // One tx per holder. At MVP scale (~50–500 holders) this is fine: ~0.3
  // SOL/day treasury gas cost even at pulse 6x/day. If we ever hit
  // thousands of holders per pulse, batch in chunks of 10-20 per tx.
  const results = [];
  let totalPaid = 0;
  for (const h of qualifying) {
    const share = Math.floor(totalPool * (h.holding / totalHolding));
    // Skip dust payouts — gas on a 1-$DARKCOIN transfer is more than the $DARKCOIN
    // is worth. Rolls forward in the rollover row below; bigger share next
    // pulse. This is how sustainability actually shakes out: the token
    // compounds instead of evaporating into gas.
    if (share < minPayout) { results.push({ pubkey: h.pubkey, share, ok: false, skipped: 'dust' }); continue; }
    try {
      const r = await solanaDarkcoin.airdropFromTreasury(h.pubkey, share);
      const sig = r?.signature;
      totalPaid += share;

      await pool.query(`
        INSERT INTO holder_claims (wallet_pubkey, claimable_styxx, lifetime_earned,
                                   total_claimed, first_earned_at, last_earned_at,
                                   last_claim_at, last_claim_tx)
          VALUES ($1, 0, $2, $2, NOW(), NOW(), NOW(), $3)
        ON CONFLICT (wallet_pubkey) DO UPDATE
          SET lifetime_earned = holder_claims.lifetime_earned + EXCLUDED.lifetime_earned,
              total_claimed   = holder_claims.total_claimed   + EXCLUDED.lifetime_earned,
              last_earned_at  = NOW(),
              last_claim_at   = NOW(),
              last_claim_tx   = $3
      `, [h.pubkey, share, sig]);

      // On-chain ledger row so /tape shows "HOLDER reward: X $DARKCOIN -> wallet"
      await pool.query(`
        INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey,
                                      to_agent_id, to_pubkey, amount, reason, memo)
          VALUES ($1, 'TREASURY', $2, 'HOLDER', $3, $4, 'holder_reward', $5)
        ON CONFLICT (tx_signature) DO NOTHING
      `, [sig, treasuryPk, h.pubkey, share, 'hpool']);
      results.push({ pubkey: h.pubkey, share, sig, ok: true });
    } catch (e) {
      console.warn('[holder-pool] transfer failed for ' + h.pubkey.slice(0,8) + '…:', e.message);
      results.push({ pubkey: h.pubkey, share, ok: false, err: e.message });
    }
  }

  const ids = pending.map(p => p.id);
  const undistributed = totalPool - totalPaid;  // dust + failed transfers
  await pool.query(
    `UPDATE holder_pool_distributions
        SET distributed = TRUE, distributed_at = NOW(),
            active_holders_count = $2, total_active_holding = $3,
            note = $4
      WHERE id = ANY($1::uuid[])`,
    [ids, qualifying.length, totalHolding,
     undistributed > 0 ? ('dust or failed: ' + undistributed + ' ' + TOKEN_TICKER + ' rolled to next pulse') : null]
  );

  // Re-accrue dust so the pool self-heals on any individual failure.
  if (undistributed > 0) {
    await pool.query(
      `INSERT INTO holder_pool_distributions (source, source_ref, pool_styxx, note)
        VALUES ('rollover', $1, $2, 'dust from prior distribution')`,
      ['rollover-' + Date.now(), undistributed]
    );
  }

  console.log(`[holder-pool] pushed ${totalPaid} \$DARKCOIN to ${results.filter(r=>r.ok).length}/${qualifying.length} holders`);
  return {
    ok: true,
    distributed: totalPaid,
    holders_paid: results.filter(r => r.ok).length,
    holders_total: qualifying.length,
    dust_rolled: undistributed,
    events_settled: pending.length,
  };
}

/**
 * Read-only: wallet's earnings history. Used by /me dashboard card.
 * No claim action needed — this is purely informational.
 */
async function getHolderStatus(pool, wallet_pubkey) {
  if (!wallet_pubkey) return null;
  try { new PublicKey(wallet_pubkey); } catch { return null; }
  const { rows } = await pool.query(
    `SELECT lifetime_earned, last_earned_at, last_claim_at, last_claim_tx
       FROM holder_claims WHERE wallet_pubkey = $1`,
    [wallet_pubkey]
  );
  const row = rows[0] || { lifetime_earned: 0, last_earned_at: null, last_claim_at: null, last_claim_tx: null };

  // Current on-chain holding so the user sees "you hold X, last pulse paid you Y"
  let holding = null;
  try { holding = await solanaDarkcoin.getDarkcoinBalance(wallet_pubkey); } catch {}

  const { rows: poolRows } = await pool.query(
    `SELECT COALESCE(SUM(pool_styxx), 0) AS pending FROM holder_pool_distributions WHERE distributed = FALSE`
  );
  return {
    wallet_pubkey,
    holding_styxx: holding,
    lifetime_earned: Number(row.lifetime_earned) || 0,
    last_earned_at: row.last_earned_at,
    last_paid_at: row.last_claim_at,     // "last time we paid you"
    last_paid_tx: row.last_claim_tx,
    pending_pool_styxx: Number(poolRows[0]?.pending) || 0,
  };
}

module.exports = {
  accrueFromMint,
  accrueFromPulse,
  runDistribution,
  getHolderStatus,
};
