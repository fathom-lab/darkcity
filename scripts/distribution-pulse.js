// ============================================================================
// scripts/distribution-pulse.js
//
// Runs every 4 HOURS (6× per day). Replaces weekly-distribution.js AND
// activity-reward-daily.js — both are folded into this single pulse so we
// don't double-pay agents.
//
// Flow per pulse (each pulse covers the last 4 hours):
//   1. Read depth_evaluations from the 4-hour window, aggregate per agent
//   2. Compute gross earnings pool for this window (0.1% of treasury STYXX
//      per pulse, i.e. ~0.6%/day — adjustable via economy_params)
//   3. Allocate the pool across agents weighted by (n_actions × depth_multiplier)
//   4. For each agent with a nonzero allocation:
//        - Subtract cognition fee slice (prorated per pulse)
//        - Subtract hyphal cross-flows (2% to each linked agent)
//        - Subtract fruiting dividend (1% if in a guild)
//        - Subtract referrer bonus (5% of sponsor pool if active referral)
//        - Split the remainder 85% / 15% → sponsors (OWNER IS A PHANTOM SPONSOR) / city
//        - Fire on-chain transfers for each share above the dust threshold
//   5. Log everything to distribution_events + styxx_transfers + agent_earnings
//
// Key mechanic: **the owner is always a sponsor of their own agent** with a
// phantom stake equal to the agent's mint fee. So even without external
// sponsors, the owner auto-receives 85% of earnings every 4 hours — zero
// user action required. When external sponsors join, the owner's share
// dilutes pro-rata like any other LP.
//
// Dust threshold: if a recipient's share < 0.5 STYXX, we accumulate to next
// pulse instead of paying. Prevents Solana-fee bleed on tiny transactions.
//
// Usage:
//   node scripts/distribution-pulse.js           # full pulse
//   DRY_RUN=1 node scripts/distribution-pulse.js # preview, no transfers
// ============================================================================

'use strict';

const { Pool } = require('pg');
const styxx = require('../lib/solana-styxx');

const PULSE_HOURS = parseInt(process.env.PULSE_HOURS || '4', 10);
const PULSES_PER_WEEK = (7 * 24) / PULSE_HOURS;         // 42 pulses/week at 4h
const DRY_RUN = process.env.DRY_RUN === '1';
const DUST_THRESHOLD_STYXX = 0.5;                        // skip payouts below this

async function getParams(pool) {
  const { rows } = await pool.query('SELECT key, value FROM economy_params');
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function bps(n) { return Number(n) / 10000; }

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: (process.env.DATABASE_URL || '').includes('railway') ? { rejectUnauthorized: false } : false,
  });
  styxx.init();

  const params = await getParams(pool);
  const sponsorBps   = Number(params.sponsor_share_bps   || 8500);
  const cityBps      = Number(params.city_share_bps      || 1500);
  const hyphalBps    = Number(params.hyphal_yield_share_bps || 200);
  const fruitingBps  = Number(params.fruiting_body_tax_bps  || 100);
  const referralBps  = Number(params.referral_yield_bonus_bps || 500);
  const weeklyFeeFull = Number(params.cognition_fee_weekly_styxx || 50);
  const feePerPulse   = weeklyFeeFull / PULSES_PER_WEEK;  // ~1.19 STYXX @ 4h

  const treasuryBal = await styxx.getTreasuryBalances();
  const pulseBudget = treasuryBal.styxx * 0.001;          // 0.1% of treasury per pulse
  console.log(`[pulse] window=${PULSE_HOURS}h treasury_styxx=${treasuryBal.styxx.toFixed(2)} budget=${pulseBudget.toFixed(2)}`);

  // ─── Step 1: aggregate depth_evaluations in the pulse window ────────────────
  // NOTE: depth_evaluations uses citizen_id (not agent_id) to identify the
  // agent. citizen_id maps 1:1 to external_agents.agent_id.
  const { rows: activity } = await pool.query(`
    SELECT citizen_id AS agent_id,
           COUNT(*) AS n_actions,
           AVG(depth_score) AS avg_depth,
           SUM(1 + COALESCE(depth_score, 0) * 0.5) AS total_multiplier
    FROM depth_evaluations
    WHERE created_at > NOW() - ($1 || ' hours')::INTERVAL
      AND depth_score IS NOT NULL
      AND citizen_id IS NOT NULL
    GROUP BY citizen_id
    HAVING COUNT(*) > 0
  `, [String(PULSE_HOURS)]);

  if (!activity.length) { console.log('[pulse] no activity this window'); await pool.end(); return; }

  const grandMultiplier = activity.reduce((s, a) => s + Number(a.total_multiplier), 0);
  const perMultiplier = grandMultiplier > 0 ? pulseBudget / grandMultiplier : 0;
  console.log(`[pulse] ${activity.length} active agents, per-mult=${perMultiplier.toFixed(4)}`);

  let totals = { paid: 0, burned_fee: 0, city: 0, sponsors: 0, hyphal: 0, fruiting: 0, referral: 0, owner_phantom: 0, dust_skipped: 0 };

  for (const a of activity) {
    const gross = Number(a.total_multiplier) * perMultiplier;
    if (gross <= 0) continue;

    // Cognition fee (prorated). Deducted BEFORE split; stays in treasury.
    const feeSlice = Math.min(feePerPulse, gross);
    const afterFee = gross - feeSlice;

    // Hyphal cross-flows
    const { rows: links } = await pool.query(`
      SELECT hl.*,
             CASE WHEN hl.agent_a = $1 THEN hl.agent_b ELSE hl.agent_a END AS counterparty,
             ea.sol_pubkey AS counterparty_pubkey
      FROM hyphal_links hl
      JOIN external_agents ea ON ea.agent_id = CASE WHEN hl.agent_a = $1 THEN hl.agent_b ELSE hl.agent_a END
      WHERE (hl.agent_a = $1 OR hl.agent_b = $1) AND hl.status = 'active'
    `, [a.agent_id]);
    const hyphalPerLink = afterFee * bps(hyphalBps);
    const totalHyphalOut = hyphalPerLink * links.length;

    // Fruiting dividend
    const { rows: fbs } = await pool.query(`
      SELECT fb.guild_pubkey FROM fruiting_body_members fbm
      JOIN fruiting_bodies fb ON fb.id = fbm.fruiting_body_id
      WHERE fbm.agent_id = $1 AND fbm.left_at IS NULL AND fb.dissolved_at IS NULL
      LIMIT 1
    `, [a.agent_id]);
    const fruitingShare = fbs.length ? afterFee * bps(fruitingBps) : 0;

    // Remainder goes into sponsor/city split
    const netForSplit = afterFee - totalHyphalOut - fruitingShare;
    const rawSponsorPool = netForSplit * bps(sponsorBps);
    const cityShare = netForSplit * bps(cityBps);

    // Referral (deducts from sponsor pool)
    const { rows: refRows } = await pool.query(`
      SELECT referrer_pubkey FROM referrals
      WHERE referred_agent_id = $1 AND expires_at > NOW()
    `, [a.agent_id]);
    const referralShare = refRows.length ? rawSponsorPool * bps(referralBps) : 0;
    const sponsorPool = rawSponsorPool - referralShare;

    // ─── The phantom sponsor (agent's owner) ──────────────────────────────
    // Owner is treated as a sponsor with a SMALL phantom stake = starter_grant
    // (100 STYXX baseline). This ensures when no external sponsors exist, the
    // owner gets 100% of the sponsor pool; but when external sponsors stake,
    // they quickly dominate the LP ring, which is the intended incentive.
    // (Earlier version used mint_fee_styxx which at $0.0001/STYXX meant 500k —
    //  that would have diluted external sponsors to <0.2% and broken the
    //  whole mechanism.)
    const phantomStakeBase = Number(params.starter_grant_styxx || 100);
    const { rows: agentRow } = await pool.query(`
      SELECT owner_pubkey, sol_pubkey FROM external_agents WHERE agent_id = $1
    `, [a.agent_id]);
    if (!agentRow.length) continue;
    const ownerPubkey = agentRow[0].owner_pubkey;
    const phantomStake = phantomStakeBase;

    // Real sponsors
    const { rows: sponsors } = await pool.query(`
      SELECT sponsor_pubkey, amount_staked FROM sponsorships
      WHERE agent_id = $1 AND status = 'active'
    `, [a.agent_id]);

    // Build the combined LP list (phantom owner + real sponsors)
    const lps = [];
    if (ownerPubkey) {
      // If owner also directly sponsored, combine into one stake
      const externalOwnerStake = sponsors
        .filter(s => s.sponsor_pubkey === ownerPubkey)
        .reduce((s, r) => s + Number(r.amount_staked), 0);
      lps.push({
        pubkey: ownerPubkey,
        stake: phantomStake + externalOwnerStake,
        is_owner: true,
      });
    }
    for (const s of sponsors) {
      if (s.sponsor_pubkey === ownerPubkey) continue;  // already folded in
      lps.push({ pubkey: s.sponsor_pubkey, stake: Number(s.amount_staked), is_owner: false });
    }
    const totalStake = lps.reduce((s, r) => s + r.stake, 0);

    if (DRY_RUN) {
      console.log(`[pulse/DRY] ${a.agent_id}: gross=${gross.toFixed(3)} fee=${feeSlice.toFixed(3)} net=${netForSplit.toFixed(3)} sponsors=${sponsorPool.toFixed(3)} city=${cityShare.toFixed(3)} hyphal=${totalHyphalOut.toFixed(3)} fruit=${fruitingShare.toFixed(3)} ref=${referralShare.toFixed(3)} lps=${lps.length} totalStake=${totalStake}`);
      totals.paid += gross; totals.city += cityShare; totals.sponsors += sponsorPool;
      totals.hyphal += totalHyphalOut; totals.fruiting += fruitingShare;
      totals.referral += referralShare; totals.burned_fee += feeSlice;
      continue;
    }

    // ─── Step 2: execute transfers atomically per-agent ─────────────────────
    await pool.query('BEGIN');
    try {
      // Accounting ledger entry (post-split, what the agent generated this window)
      await pool.query(`
        INSERT INTO agent_earnings (agent_id, amount, source, source_ref, depth_score, distributed, distributed_at)
        VALUES ($1, $2, 'activity_reward', $3, $4, TRUE, NOW())
      `, [a.agent_id, gross, `pulse_${new Date().toISOString()}`, Number(a.avg_depth)]);

      // Hyphal flows
      for (const link of links) {
        if (!link.counterparty_pubkey || hyphalPerLink < DUST_THRESHOLD_STYXX) {
          if (hyphalPerLink < DUST_THRESHOLD_STYXX) totals.dust_skipped += 1;
          continue;
        }
        const { signature } = await styxx.airdropFromTreasury(link.counterparty_pubkey, hyphalPerLink);
        await pool.query(`
          INSERT INTO distribution_events (kind, agent_id, recipient_pubkey, amount, tx_signature, window_end)
          VALUES ('hyphal_flow', $1, $2, $3, $4, NOW())
        `, [a.agent_id, link.counterparty_pubkey, hyphalPerLink, signature]);
      }

      // Fruiting dividend
      if (fbs.length && fruitingShare >= DUST_THRESHOLD_STYXX) {
        const { signature } = await styxx.airdropFromTreasury(fbs[0].guild_pubkey, fruitingShare);
        await pool.query(`
          INSERT INTO distribution_events (kind, agent_id, recipient_pubkey, amount, tx_signature, window_end)
          VALUES ('fruiting_dividend', $1, $2, $3, $4, NOW())
        `, [a.agent_id, fbs[0].guild_pubkey, fruitingShare, signature]);
      }

      // Referral
      if (refRows.length && referralShare >= DUST_THRESHOLD_STYXX) {
        const { signature } = await styxx.airdropFromTreasury(refRows[0].referrer_pubkey, referralShare);
        await pool.query(`
          INSERT INTO distribution_events (kind, agent_id, recipient_pubkey, amount, tx_signature, window_end)
          VALUES ('referral_bonus', $1, $2, $3, $4, NOW())
        `, [a.agent_id, refRows[0].referrer_pubkey, referralShare, signature]);
        await pool.query(`
          UPDATE referrals SET total_yield_bonus_styxx = total_yield_bonus_styxx + $1
          WHERE referred_agent_id = $2 AND expires_at > NOW()
        `, [referralShare, a.agent_id]);
      }

      // LP pro-rata payouts (owner + external sponsors, all auto)
      for (const lp of lps) {
        if (totalStake <= 0) break;
        const share = sponsorPool * (lp.stake / totalStake);
        if (share < DUST_THRESHOLD_STYXX) {
          totals.dust_skipped += 1;
          continue;
        }
        const { signature } = await styxx.airdropFromTreasury(lp.pubkey, share);
        await pool.query(`
          INSERT INTO distribution_events (kind, agent_id, recipient_pubkey, amount, tx_signature, window_end)
          VALUES ('weekly_sponsor', $1, $2, $3, $4, NOW())
        `, [a.agent_id, lp.pubkey, share, signature]);
        if (!lp.is_owner) {
          await pool.query(`
            UPDATE sponsorships SET total_distributed = total_distributed + $1
            WHERE sponsor_pubkey = $2 AND agent_id = $3 AND status = 'active'
          `, [share, lp.pubkey, a.agent_id]);
        } else {
          totals.owner_phantom += share;
        }
      }

      // City share stays in treasury — just logged
      await pool.query(`
        INSERT INTO distribution_events (kind, agent_id, recipient_pubkey, amount, window_end)
        VALUES ('weekly_sponsor', $1, 'TREASURY_CITY', $2, NOW())
      `, [a.agent_id, cityShare]);

      await pool.query('COMMIT');
      totals.paid += gross; totals.city += cityShare; totals.sponsors += sponsorPool;
      totals.hyphal += totalHyphalOut; totals.fruiting += fruitingShare;
      totals.referral += referralShare; totals.burned_fee += feeSlice;
      console.log(`[pulse] ${a.agent_id}: ${a.n_actions} actions, gross=${gross.toFixed(3)}, lps=${lps.length}, owner_share=${((lps.find(l=>l.is_owner)?.stake||0)/totalStake*sponsorPool).toFixed(3)}`);
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(`[pulse:${a.agent_id}] rollback:`, err.message);
    }
  }

  // Summary
  console.log(`\n[pulse] SUMMARY (${DRY_RUN ? 'DRY_RUN' : 'LIVE'})`);
  console.log(`  agents processed:   ${activity.length}`);
  console.log(`  gross distributed:  ${totals.paid.toFixed(2)} STYXX`);
  console.log(`  owners (phantom):   ${totals.owner_phantom.toFixed(2)} STYXX`);
  console.log(`  sponsors:           ${totals.sponsors.toFixed(2)} STYXX`);
  console.log(`  hyphal flows:       ${totals.hyphal.toFixed(2)} STYXX`);
  console.log(`  fruiting dividends: ${totals.fruiting.toFixed(2)} STYXX`);
  console.log(`  referral bonuses:   ${totals.referral.toFixed(2)} STYXX`);
  console.log(`  city treasury:      ${totals.city.toFixed(2)} STYXX`);
  console.log(`  cognition fees:     ${totals.burned_fee.toFixed(2)} STYXX`);
  console.log(`  dust payouts skipped: ${totals.dust_skipped}`);

  // Snapshot — treasury balance read directly from Solana (not DB subquery)
  try {
    const tBalPost = await styxx.getTreasuryBalances();
    const { rows: sCounts } = await pool.query(`
      SELECT
        (SELECT COALESCE(SUM(amount), 0) FROM styxx_transfers WHERE reason = 'cognition_fee') AS total_burned,
        (SELECT COUNT(*) FROM external_agents WHERE owner_pubkey IS NOT NULL) AS minted,
        (SELECT COUNT(*) FROM external_agents WHERE owner_pubkey IS NOT NULL AND dormant = FALSE) AS active,
        (SELECT COUNT(*) FROM sponsorships WHERE status = 'active') AS sponsorships,
        (SELECT COUNT(*) FROM hyphal_links WHERE status = 'active') AS links,
        (SELECT COUNT(*) FROM fruiting_bodies WHERE dissolved_at IS NULL) AS guilds
    `);
    const row = sCounts[0] || {};
    await pool.query(`
      INSERT INTO treasury_snapshots
        (treasury_balance_styxx, city_pool_styxx, total_burned_styxx, total_minted_agents,
         active_agents, active_sponsorships, active_hyphal_links, active_fruiting_bodies)
      VALUES ($1, 0, $2, $3, $4, $5, $6, $7)
    `, [tBalPost.styxx, Number(row.total_burned || 0), Number(row.minted || 0),
        Number(row.active || 0), Number(row.sponsorships || 0),
        Number(row.links || 0), Number(row.guilds || 0)]);
  } catch (e) {
    console.warn('[pulse] snapshot skipped:', e.message);
  }

  await pool.end();
}

if (require.main === module) {
  main().catch(err => { console.error('[pulse] FATAL:', err); process.exit(1); });
}

module.exports = { main };
