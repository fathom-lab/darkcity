// ============================================================================
// arena-reconciler.js — background sweep that auto-refunds orphan payments
//
// Problem: the arena bet flow is
//   1. user signs SPL transferChecked via Phantom
//   2. tx broadcasts to Solana
//   3. client POSTs /api/arena/bet with the signature
//   4. server verifies + inserts bet
//
// If step 3 fails for ANY reason — Phantom glitch, network drop, browser tab
// closed, confirmation polling timeout before the POST fires — the user's
// STYXX is sitting in treasury with no bet record and no refund path. The
// auto-refund inside placeBet only triggers when the client POSTs.
//
// This module closes the gap: every 60s it pulls the last N signatures on the
// treasury ATA, for each one that isn't already a known payment_tx OR an
// outbound refund/airdrop, it refunds the sender and writes a 'refunded' row
// so the same signature can never trigger another refund.
//
// Treasury-aware: won't drain the house. Skips if treasury < MIN_FLOOR or if
// refunding would leave less than MIN_FLOOR remaining.
// ============================================================================

'use strict';

const { PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
const solanaStyxx = require('../lib/solana-styxx');

const SWEEP_INTERVAL_MS = 60_000;
const SIG_LIMIT = 100;                     // wider lookback to catch orphans from busy periods
const MIN_TREASURY_FLOOR_STYXX = 200_000;  // tighter floor while we're bootstrapping — still protects the house
const MAX_REFUND_PER_SWEEP = 10;           // cap so a buggy scan can't fire 100 refunds

let sweepRunning = false;
let treasuryATAStr = null;

async function ensureTreasuryATA() {
  if (treasuryATAStr) return treasuryATAStr;
  const treasuryPk = solanaStyxx.getTreasury().publicKey;
  const mint = new PublicKey(solanaStyxx.STYXX_MINT_ADDR);
  const ata = await getAssociatedTokenAddress(mint, treasuryPk, false, TOKEN_2022_PROGRAM_ID);
  treasuryATAStr = ata.toBase58();
  return treasuryATAStr;
}

async function reconcileOrphans(pool) {
  if (sweepRunning) return { skipped: 'already_running' };
  sweepRunning = true;
  try {
    const treasuryStr = solanaStyxx.getTreasury().publicKey.toBase58();
    const mintStr = solanaStyxx.STYXX_MINT_ADDR;
    const conn = solanaStyxx.getConnection();
    const treasuryATA = new PublicKey(await ensureTreasuryATA());

    // Floor check — never drain the house.
    const floorBal = await solanaStyxx.getStyxxBalance(treasuryStr);
    if (floorBal < MIN_TREASURY_FLOOR_STYXX) {
      console.warn('[reconciler] treasury below floor, skipping sweep. bal:', floorBal);
      return { skipped: 'treasury_floor', treasuryBal: floorBal };
    }

    const sigs = await conn.getSignaturesForAddress(treasuryATA, { limit: SIG_LIMIT });
    if (!sigs.length) return { scanned: 0 };

    // Load all known payment_tx AND payout_tx for this sig batch in one query.
    const allSigs = sigs.map(s => s.signature);
    const { rows: known } = await pool.query(
      `SELECT payment_tx, payout_tx FROM arena_bets
        WHERE payment_tx = ANY($1::text[]) OR payout_tx = ANY($1::text[])`,
      [allSigs]
    );
    const knownSet = new Set();
    for (const r of known) {
      if (r.payment_tx) knownSet.add(r.payment_tx);
      if (r.payout_tx) knownSet.add(r.payout_tx);
    }

    // Also exclude styxx_transfers records (founder cuts, operator sweeps, etc.)
    const { rows: transferRows } = await pool.query(
      `SELECT tx_signature FROM styxx_transfers WHERE tx_signature = ANY($1::text[])`,
      [allSigs]
    );
    for (const r of transferRows) if (r.tx_signature) knownSet.add(r.tx_signature);

    const unknownSigs = sigs.filter(s => !knownSet.has(s.signature) && !s.err);
    if (!unknownSigs.length) return { scanned: sigs.length, orphans: 0 };

    let refunded = 0;
    const refundedList = [];
    let treasuryBal = floorBal;

    for (const sg of unknownSigs) {
      if (refunded >= MAX_REFUND_PER_SWEEP) break;

      const tx = await conn.getParsedTransaction(sg.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      }).catch(() => null);
      if (!tx || tx.meta?.err) continue;

      const pre = tx.meta?.preTokenBalances || [];
      const post = tx.meta?.postTokenBalances || [];
      const treasuryPre = pre.find(b => b.owner === treasuryStr && b.mint === mintStr);
      const treasuryPost = post.find(b => b.owner === treasuryStr && b.mint === mintStr);
      const delta =
        (Number(treasuryPost?.uiTokenAmount?.uiAmount) || 0) -
        (Number(treasuryPre?.uiTokenAmount?.uiAmount) || 0);

      // Only refund INBOUND (treasury gained tokens). Outbound is an airdrop,
      // handled elsewhere.
      if (delta < 1000) continue;

      // Identify the sender — whichever non-treasury owner had a matching
      // pre-balance that dropped.
      const senderBalance = pre.find(b => {
        if (b.owner === treasuryStr) return false;
        if (b.mint !== mintStr) return false;
        const preAmt = Number(b.uiTokenAmount?.uiAmount) || 0;
        const postAmt = Number(
          post.find(p => p.accountIndex === b.accountIndex)?.uiTokenAmount?.uiAmount
        ) || 0;
        return preAmt > postAmt;
      });
      if (!senderBalance?.owner) { console.warn('[reconciler] cannot identify sender for', sg.signature); continue; }

      // Mark the payment_tx as reserved BEFORE we send the refund so a
      // concurrent sweep can't double-pay.
      try {
        await pool.query(
          `INSERT INTO arena_bets (round_id, user_wallet, stake_styxx, payment_tx, status)
           SELECT r.id, $2, $3, $1, 'refund_pending'
             FROM arena_rounds r ORDER BY r.id DESC LIMIT 1`,
          [sg.signature, senderBalance.owner, delta]
        );
      } catch (e) {
        // Unique violation means another sweep beat us — skip.
        if (!/duplicate key|unique constraint/i.test(e.message)) {
          console.warn('[reconciler] reserve failed:', sg.signature, e.message);
        }
        continue;
      }

      // Check treasury would still sit above floor after this refund.
      if (treasuryBal - delta < MIN_TREASURY_FLOOR_STYXX) {
        console.warn('[reconciler] would breach floor, aborting further refunds');
        // Release the pending record since we're not refunding.
        await pool.query(`DELETE FROM arena_bets WHERE payment_tx = $1 AND status = 'refund_pending'`, [sg.signature]);
        break;
      }

      // Execute refund.
      try {
        const out = await solanaStyxx.airdropFromTreasury(senderBalance.owner, delta);
        await pool.query(
          `UPDATE arena_bets SET status = 'refunded', payout_styxx = $2, payout_tx = $3
            WHERE payment_tx = $1`,
          [sg.signature, delta, out.signature]
        );
        refunded++;
        treasuryBal -= delta;
        refundedList.push({ wallet: senderBalance.owner, amount: delta, refund_tx: out.signature, payment_tx: sg.signature });
        console.log('[reconciler] refunded', delta, 'STYXX to', senderBalance.owner.slice(0, 8), '· refund tx:', out.signature.slice(0, 10));
      } catch (e) {
        console.error('[reconciler] refund failed for', sg.signature, ':', e.message);
        // Leave record in refund_pending so a human can investigate.
      }
    }

    return { scanned: sigs.length, orphans: unknownSigs.length, refunded, refunds: refundedList };
  } finally {
    sweepRunning = false;
  }
}

function start(pool) {
  console.log('[reconciler] starting · sweep every', SWEEP_INTERVAL_MS / 1000, 's · floor', MIN_TREASURY_FLOOR_STYXX, 'STYXX');
  // Observability: log every sweep result so operators can see reconciler is
  // alive even during quiet periods. Previously only logged when refunds >0,
  // which made it look dead for hours at a time.
  let sweepN = 0;
  const runSweep = () => {
    reconcileOrphans(pool).then(r => {
      sweepN++;
      if (r?.skipped) {
        // Only log the first skip and then every 10th to avoid spam while
        // treasury is empty — but don't go totally silent.
        if (sweepN === 1 || sweepN % 10 === 0) {
          console.log('[reconciler] sweep', sweepN, '· skipped:', r.skipped, r.treasuryBal != null ? '(bal ' + Math.floor(r.treasuryBal) + ')' : '');
        }
      } else if (r?.refunded) {
        console.log('[reconciler] sweep', sweepN, '· scanned', r.scanned, '· orphans', r.orphans, '· refunded', r.refunded);
      } else if (r?.orphans) {
        console.log('[reconciler] sweep', sweepN, '· scanned', r.scanned, '· orphans', r.orphans, '· refunded 0 (all outbound/unsendable)');
      } else if (sweepN % 10 === 0) {
        console.log('[reconciler] sweep', sweepN, '· scanned', r?.scanned || 0, '· no orphans');
      }
    }).catch(e => console.error('[reconciler] sweep error:', e.message));
  };
  setInterval(runSweep, SWEEP_INTERVAL_MS);
  setTimeout(runSweep, 10_000);
}

module.exports = { start, reconcileOrphans };
