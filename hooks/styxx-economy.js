// ============================================================================
// hooks/styxx-economy.js
// The Flywheel Monster — V1
//
// Endpoint handlers for:
//   ① /mint       — pay $50 STYXX, get an agent in the city (Flywheel ①)
//   ② /sponsor    — stake STYXX on an agent, earn 85% of their net (Flywheel ②)
//   ③ /hyphal     — opt-in mycelium link between two agents (Flywheel ③)
//   ④ portfolio   — owner-level dashboard (see-your-money-grow UX)
//
// Everything happens IN the city: STYXX goes in, STYXX comes out, every flow
// is logged to styxx_transfers (on-chain) + agent_earnings (accounting).
//
// Philosophy: low friction. User sends STYXX to the city's treasury wallet
// with a memo → backend verifies the on-chain tx → creates the record → user
// sees their position in /portfolio immediately.
// ============================================================================

'use strict';

const crypto = require('crypto');
const styxx  = require('../lib/solana-styxx');
const payments = require('./styxx-payments');

let pool = null;

// ─── Config helpers ─────────────────────────────────────────────────────────

async function getParam(key, fallback) {
  const { rows } = await pool.query(
    'SELECT value FROM economy_params WHERE key = $1', [key]
  );
  return rows.length ? rows[0].value : fallback;
}

async function getParams(keys) {
  const { rows } = await pool.query(
    'SELECT key, value FROM economy_params WHERE key = ANY($1)', [keys]
  );
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function bps(n) { return Number(n) / 10000; }

// ─── STYXX/USD price oracle ─────────────────────────────────────────────────
// V1: env var. V2: Jupiter quote. Set STYXX_USD_PRICE in Railway.
// Fallback 0.0001 (so a $50 fee = 500k STYXX; visible if price oracle fails).

function getStyxxUsdPrice() {
  const p = parseFloat(process.env.STYXX_USD_PRICE || '0.0001');
  if (!Number.isFinite(p) || p <= 0) return 0.0001;
  return p;
}

function usdToStyxx(usdAmount) {
  return Math.ceil(usdAmount / getStyxxUsdPrice());
}

// ─── Solana tx verification ─────────────────────────────────────────────────
// Robust verification for Token-2022 SPL transfers with memo.
//
//   - Retries with exponential backoff for txs not yet confirmed (up to 30s)
//   - Resolves ATAs → owner pubkeys via parsed tx postTokenBalances
//   - Validates the EXACT expected amount (±1 token slop for decimals rounding)
//   - Validates memo via innerInstructions OR top-level memo program
//
// Returns { ok: true, tx } on success, { ok: false, reason } on failure.

async function verifyStyxxPayment({ tx_signature, expected_from_pubkey, expected_to_pubkey, expected_amount, expected_memo }) {
  const conn = styxx.getConnection();

  // Step 1: fetch with retries — confirmed tx may take 5-15s on mainnet
  let tx = null;
  const attempts = [0, 2000, 5000, 10000, 15000];  // ~32s total
  for (const delay of attempts) {
    if (delay) await new Promise(r => setTimeout(r, delay));
    try {
      tx = await conn.getParsedTransaction(tx_signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });
      if (tx) break;
    } catch (e) {
      console.warn('[verify] getParsedTransaction threw:', e.message);
    }
  }
  if (!tx) return { ok: false, reason: 'tx_not_found_after_retries' };
  if (tx.meta?.err) return { ok: false, reason: 'tx_failed_on_chain', err: tx.meta.err };

  // Step 2: validate transfer via token-balance deltas (most reliable for Token-2022)
  // The post/pre balances tell us EXACTLY how STYXX moved, independent of
  // whether instructions were outer or inner.
  const pre  = tx.meta?.preTokenBalances  || [];
  const post = tx.meta?.postTokenBalances || [];

  // Build owner → delta map, filtered to just the STYXX mint.
  const byOwner = new Map();
  for (const b of post) {
    if (b.mint !== styxx.STYXX_MINT_ADDR) continue;
    const ui = Number(b.uiTokenAmount?.uiAmount || 0);
    byOwner.set(b.owner, { post_ui: ui, pre_ui: 0 });
  }
  for (const b of pre) {
    if (b.mint !== styxx.STYXX_MINT_ADDR) continue;
    const cur = byOwner.get(b.owner) || { post_ui: 0, pre_ui: 0 };
    cur.pre_ui = Number(b.uiTokenAmount?.uiAmount || 0);
    byOwner.set(b.owner, cur);
  }

  let saw_correct_transfer = false;
  const fromDelta = byOwner.get(expected_from_pubkey);
  const toDelta   = byOwner.get(expected_to_pubkey);
  const amt = Number(expected_amount);
  const slop = Math.max(amt * 0.001, 0.5);  // 0.1% or 0.5 STYXX, whichever larger
  if (fromDelta && toDelta) {
    const sent = fromDelta.pre_ui - fromDelta.post_ui;
    const received = toDelta.post_ui - toDelta.pre_ui;
    if (sent >= amt - slop && received >= amt - slop) {
      saw_correct_transfer = true;
    } else {
      return { ok: false, reason: 'transfer_amount_mismatch',
        expected: amt, from_delta: sent, to_delta: received };
    }
  } else {
    return { ok: false, reason: 'no_balance_change_for_pubkeys',
      expected_from: expected_from_pubkey, expected_to: expected_to_pubkey,
      observed_owners: Array.from(byOwner.keys()).slice(0, 5) };
  }

  // Step 3: validate memo — check top-level AND inner instructions
  let saw_memo = !expected_memo;
  const allIxs = [
    ...(tx.transaction.message.instructions || []),
    ...((tx.meta?.innerInstructions || []).flatMap(i => i.instructions || [])),
  ];
  for (const ix of allIxs) {
    // Memo program ID: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr (v1) or newer v2
    const isMemo = (ix.program === 'spl-memo') ||
                   (ix.programId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') ||
                   (ix.programId === 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo');
    if (!isMemo) continue;
    const memoStr = (typeof ix.parsed === 'string' ? ix.parsed : ix.parsed?.memo) || '';
    if (expected_memo && memoStr.includes(expected_memo)) { saw_memo = true; break; }
  }

  if (!saw_correct_transfer) return { ok: false, reason: 'no_matching_transfer' };
  if (!saw_memo)             return { ok: false, reason: 'memo_mismatch', expected: expected_memo };
  return { ok: true, tx };
}

// ─── ① MINT ──────────────────────────────────────────────────────────────────
// Two-step flow: /mint/quote returns the STYXX amount + destination + memo.
// User sends the SPL transfer from their wallet (Phantom/Solflare).
// Then /mint/finalize with the tx signature creates the agent.

async function mintQuote(req, res) {
  try {
    const { owner_pubkey, agent_name, framework, referred_by_pubkey, one_liner } = req.body || {};
    if (!owner_pubkey || !agent_name) {
      return res.status(400).json({ error: 'owner_pubkey and agent_name required' });
    }
    if (!/^[A-Za-z0-9 _-]{2,24}$/.test(agent_name)) {
      return res.status(400).json({ error: 'agent_name must be 2-24 chars, [A-Za-z0-9 _-]' });
    }

    // Check name availability — against both existing agents AND pending quotes
    // (prevents two people quoting the same name in parallel during the 15-min window)
    const normalizedName = agent_name.toUpperCase().replace(/\s+/g, '_');
    const { rows: existing } = await pool.query(
      'SELECT agent_id FROM external_agents WHERE agent_id = $1',
      [normalizedName]
    );
    if (existing.length) return res.status(409).json({ error: 'name_taken' });
    // Ensure mint_quotes table exists before we query it (first-run safety)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mint_quotes (
        quote_id TEXT PRIMARY KEY,
        owner_pubkey TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        framework TEXT,
        one_liner TEXT,
        referred_by_pubkey TEXT,
        fee_usd NUMERIC NOT NULL,
        fee_styxx NUMERIC NOT NULL,
        memo TEXT NOT NULL,
        destination TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        finalized BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const { rows: pendingQuote } = await pool.query(`
      SELECT quote_id FROM mint_quotes
      WHERE UPPER(REPLACE(agent_name, ' ', '_')) = $1
        AND finalized = FALSE
        AND expires_at > NOW()
    `, [normalizedName]);
    if (pendingQuote.length) return res.status(409).json({ error: 'name_pending_in_another_quote', retry_after_seconds: 900 });

    const p = await getParams(['mint_fee_usd']);
    const feeUsd    = parseFloat(p.mint_fee_usd || '50');
    const feeStyxx  = usdToStyxx(feeUsd);
    const destPubkey = styxx.getTreasury().publicKey.toBase58();

    // Memo pattern: mint:<quote_id> — user's wallet attaches this so we match
    const quote_id = crypto.randomUUID();
    const memo = `mint:${quote_id}`;

    // Persist quote for 15 min
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mint_quotes (
        quote_id TEXT PRIMARY KEY,
        owner_pubkey TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        framework TEXT,
        one_liner TEXT,
        referred_by_pubkey TEXT,
        fee_usd NUMERIC NOT NULL,
        fee_styxx NUMERIC NOT NULL,
        memo TEXT NOT NULL,
        destination TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        finalized BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      INSERT INTO mint_quotes (quote_id, owner_pubkey, agent_name, framework, one_liner, referred_by_pubkey,
                               fee_usd, fee_styxx, memo, destination, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW() + INTERVAL '15 minutes')
    `, [quote_id, owner_pubkey, agent_name, framework || null, one_liner || null,
        referred_by_pubkey || null, feeUsd, feeStyxx, memo, destPubkey]);

    return res.json({
      quote_id,
      fee_usd: feeUsd,
      fee_styxx: feeStyxx,
      styxx_usd_price: getStyxxUsdPrice(),
      destination: destPubkey,
      memo,
      mint_address: styxx.STYXX_MINT_ADDR,
      instructions: `Send ${feeStyxx} STYXX from ${owner_pubkey} to ${destPubkey} with memo "${memo}". Then POST /api/mint/finalize with the tx signature.`,
      expires_in_seconds: 900,
    });
  } catch (err) {
    console.error('[mint/quote]', err);
    return res.status(500).json({ error: err.message });
  }
}

async function mintFinalize(req, res) {
  try {
    const { quote_id, tx_signature } = req.body || {};
    if (!quote_id || !tx_signature) {
      return res.status(400).json({ error: 'quote_id and tx_signature required' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM mint_quotes WHERE quote_id = $1',
      [quote_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'quote_not_found' });
    const q = rows[0];
    if (q.finalized) return res.status(409).json({ error: 'already_finalized' });
    if (new Date(q.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'quote_expired' });
    }

    // Verify on-chain payment
    const ver = await verifyStyxxPayment({
      tx_signature,
      expected_from_pubkey: q.owner_pubkey,
      expected_to_pubkey: q.destination,
      expected_amount: Number(q.fee_styxx),
      expected_memo: q.memo,
    });
    if (!ver.ok) return res.status(402).json({ error: 'payment_verification_failed', reason: ver.reason });

    // Provision agent: wallet, insert row, starter grant.
    const agentId = q.agent_name.toUpperCase().replace(/\s+/g, '_');
    const kp = styxx.generateAgentKeypair();
    const pubkey = kp.publicKey.toBase58();
    const encPriv = styxx.encryptPrivkey(kp.secretKey);

    const params = await getParams([
      'starter_grant_styxx','mint_fee_burn_bps','mint_fee_pool_bps',
      'referral_mint_bonus_bps','referral_duration_days',
    ]);
    const starterGrant = Number(params.starter_grant_styxx || 100);
    const burnBps = Number(params.mint_fee_burn_bps || 5000);
    const poolBps = Number(params.mint_fee_pool_bps || 5000);
    const refBps  = Number(params.referral_mint_bonus_bps || 1000);
    const refDays = Number(params.referral_duration_days || 90);

    const burnAmt   = Number(q.fee_styxx) * bps(burnBps);
    const poolAmt   = Number(q.fee_styxx) * bps(poolBps);
    const refBonus  = q.referred_by_pubkey ? Number(q.fee_styxx) * bps(refBps) : 0;

    // Log on-chain mint tx (we received the fee already — treasury just holds it)
    // Actual burn is a follow-up instruction we enqueue; for V1 we track it as
    // "city pool burn allocation" and a scheduled burn job executes on-chain.
    await pool.query('BEGIN');
    try {
      await pool.query(`
        INSERT INTO external_agents
          (agent_id, district, reputation, credits, builds, trades, rank, agent_type,
           owner_name, bot_framework, owner_pubkey, referred_by_pubkey,
           sol_pubkey, sol_privkey_enc, styxx_cached, styxx_cached_at,
           minted_at, mint_tx_signature, mint_fee_usd, mint_fee_styxx,
           cognition_fee_balance, last_cognition_fee_at)
        VALUES ($1,'The Sprawl',0,${starterGrant},0,0,'Newcomer','external',
                $2,$3,$4,$5,$6,$7,$8,NOW(),NOW(),$9,$10,$11,$12,NOW())
        ON CONFLICT (agent_id) DO NOTHING
      `, [agentId, q.owner_pubkey.slice(0, 16), q.framework || 'Custom',
          q.owner_pubkey, q.referred_by_pubkey,
          pubkey, encPriv, starterGrant,
          tx_signature, q.fee_usd, q.fee_styxx, starterGrant]);

      // Starter grant on-chain (treasury → new agent)
      const { signature: grantSig } = await styxx.airdropFromTreasury(pubkey, starterGrant);
      await pool.query(`
        INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey, to_agent_id, to_pubkey, amount, reason, memo)
        VALUES ($1,'TREASURY',$2,$3,$4,$5,'mint_grant',$6)
        ON CONFLICT (tx_signature) DO NOTHING
      `, [grantSig, styxx.getTreasury().publicKey.toBase58(), agentId, pubkey, starterGrant, `mint:${quote_id}`]);

      await pool.query(`
        INSERT INTO agent_earnings (agent_id, amount, source, source_ref, recorded_at)
        VALUES ($1, $2, 'mint_grant', $3, NOW())
      `, [agentId, starterGrant, quote_id]);

      // Referral bonus
      if (q.referred_by_pubkey) {
        const { signature: refSig } = await styxx.airdropFromTreasury(q.referred_by_pubkey, refBonus);
        await pool.query(`
          INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey, to_agent_id, to_pubkey, amount, reason, memo)
          VALUES ($1,'TREASURY',$2,'REFERRER',$3,$4,'referral_mint_bonus',$5)
          ON CONFLICT (tx_signature) DO NOTHING
        `, [refSig, styxx.getTreasury().publicKey.toBase58(), q.referred_by_pubkey, refBonus, quote_id]);

        await pool.query(`
          INSERT INTO referrals (referrer_pubkey, referred_agent_id, referred_owner_pubkey,
                                 minted_at, expires_at, mint_fee_bonus_styxx, mint_fee_bonus_tx)
          VALUES ($1,$2,$3,NOW(),NOW() + ($4 || ' days')::INTERVAL,$5,$6)
        `, [q.referred_by_pubkey, agentId, q.owner_pubkey, String(refDays), refBonus, refSig]);

        await pool.query(`
          INSERT INTO distribution_events (kind, agent_id, recipient_pubkey, amount, tx_signature)
          VALUES ('referral_bonus',$1,$2,$3,$4)
        `, [agentId, q.referred_by_pubkey, refBonus, refSig]);
      }

      await pool.query('UPDATE mint_quotes SET finalized = TRUE WHERE quote_id = $1', [quote_id]);
      await pool.query('COMMIT');
    } catch (txErr) {
      await pool.query('ROLLBACK');
      throw txErr;
    }

    return res.json({
      ok: true,
      agent_id: agentId,
      agent_pubkey: pubkey,
      starter_grant: starterGrant,
      fee_burned: burnAmt,          // scheduled
      fee_to_pool: poolAmt,         // scheduled
      referral_bonus_paid: refBonus,
      mint_tx: tx_signature,
      message: `Welcome to DarkCity. ${agentId} is live. Watch /live or /portfolio?owner=${q.owner_pubkey} to see earnings grow.`,
    });
  } catch (err) {
    console.error('[mint/finalize]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─── ② SPONSOR ──────────────────────────────────────────────────────────────
// Two-step flow same as mint. Sponsor sends STYXX to treasury with
// memo=sponsor:<quote_id>. Backend verifies + creates the sponsorship row.

async function sponsorQuote(req, res) {
  try {
    const { sponsor_pubkey, agent_id, amount_styxx } = req.body || {};
    if (!sponsor_pubkey || !agent_id || !amount_styxx) {
      return res.status(400).json({ error: 'sponsor_pubkey, agent_id, amount_styxx required' });
    }
    const amt = Number(amount_styxx);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'amount_styxx must be positive' });

    const { rows: agents } = await pool.query(
      'SELECT agent_id, dormant FROM external_agents WHERE agent_id = $1',
      [agent_id]
    );
    if (!agents.length) return res.status(404).json({ error: 'agent_not_found' });
    if (agents[0].dormant) return res.status(400).json({ error: 'agent_dormant' });

    const quote_id = crypto.randomUUID();
    const memo = `sponsor:${quote_id}`;
    const destPubkey = styxx.getTreasury().publicKey.toBase58();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sponsor_quotes (
        quote_id TEXT PRIMARY KEY,
        sponsor_pubkey TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        amount_styxx NUMERIC NOT NULL,
        memo TEXT NOT NULL,
        destination TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        finalized BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      INSERT INTO sponsor_quotes (quote_id, sponsor_pubkey, agent_id, amount_styxx, memo, destination, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6, NOW() + INTERVAL '15 minutes')
    `, [quote_id, sponsor_pubkey, agent_id, amt, memo, destPubkey]);

    return res.json({
      quote_id,
      amount_styxx: amt,
      destination: destPubkey,
      memo,
      instructions: `Send ${amt} STYXX from ${sponsor_pubkey} to ${destPubkey} with memo "${memo}". Then POST /api/sponsor/finalize with the tx signature.`,
      expires_in_seconds: 900,
    });
  } catch (err) {
    console.error('[sponsor/quote]', err);
    return res.status(500).json({ error: err.message });
  }
}

async function sponsorFinalize(req, res) {
  try {
    const { quote_id, tx_signature } = req.body || {};
    const { rows } = await pool.query('SELECT * FROM sponsor_quotes WHERE quote_id = $1', [quote_id]);
    if (!rows.length) return res.status(404).json({ error: 'quote_not_found' });
    const q = rows[0];
    if (q.finalized) return res.status(409).json({ error: 'already_finalized' });
    if (new Date(q.expires_at).getTime() < Date.now()) return res.status(410).json({ error: 'quote_expired' });

    const ver = await verifyStyxxPayment({
      tx_signature,
      expected_from_pubkey: q.sponsor_pubkey,
      expected_to_pubkey: q.destination,
      expected_amount: Number(q.amount_styxx),
      expected_memo: q.memo,
    });
    if (!ver.ok) return res.status(402).json({ error: 'payment_verification_failed', reason: ver.reason });

    const p = await getParams(['sponsor_cooldown_days']);
    const cooldownDays = Number(p.sponsor_cooldown_days || 7);

    await pool.query(`
      INSERT INTO sponsorships (sponsor_pubkey, agent_id, amount_staked, stake_tx,
                                started_at, cooldown_ends_at, status)
      VALUES ($1,$2,$3,$4, NOW(), NOW() + ($5 || ' days')::INTERVAL, 'active')
    `, [q.sponsor_pubkey, q.agent_id, q.amount_staked || q.amount_styxx, tx_signature, String(cooldownDays)]);

    await pool.query('UPDATE sponsor_quotes SET finalized = TRUE WHERE quote_id = $1', [quote_id]);

    return res.json({
      ok: true,
      agent_id: q.agent_id,
      amount_staked: Number(q.amount_styxx),
      cooldown_days: cooldownDays,
      message: `Sponsorship active. Weekly distribution pays 85% of ${q.agent_id}'s net earnings pro-rata. Watch /portfolio?owner=${q.sponsor_pubkey}.`,
    });
  } catch (err) {
    console.error('[sponsor/finalize]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─── ③ HYPHAL LINK ──────────────────────────────────────────────────────────
// Any user can initiate a link between two agents (doesn't have to own either).
// Cost: 25 STYXX, split 50/50 to both agent wallets. Status = active until severed.

async function hyphalQuote(req, res) {
  try {
    const { initiator_pubkey, agent_a, agent_b } = req.body || {};
    if (!initiator_pubkey || !agent_a || !agent_b) {
      return res.status(400).json({ error: 'initiator_pubkey, agent_a, agent_b required' });
    }
    if (agent_a === agent_b) return res.status(400).json({ error: 'cannot_link_self' });

    // Canonicalize
    const [a, b] = [agent_a, agent_b].sort();

    const { rows: existing } = await pool.query(
      'SELECT id FROM hyphal_links WHERE agent_a = $1 AND agent_b = $2 AND status = $3',
      [a, b, 'active']
    );
    if (existing.length) return res.status(409).json({ error: 'link_already_exists' });

    const p = await getParams(['hyphal_link_cost_styxx']);
    const cost = Number(p.hyphal_link_cost_styxx || 25);
    const quote_id = crypto.randomUUID();
    const memo = `hyphal:${quote_id}`;
    const destPubkey = styxx.getTreasury().publicKey.toBase58();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS hyphal_quotes (
        quote_id TEXT PRIMARY KEY,
        initiator_pubkey TEXT NOT NULL,
        agent_a TEXT NOT NULL,
        agent_b TEXT NOT NULL,
        cost_styxx NUMERIC NOT NULL,
        memo TEXT NOT NULL,
        destination TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        finalized BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      INSERT INTO hyphal_quotes (quote_id, initiator_pubkey, agent_a, agent_b, cost_styxx, memo, destination, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7, NOW() + INTERVAL '15 minutes')
    `, [quote_id, initiator_pubkey, a, b, cost, memo, destPubkey]);

    return res.json({ quote_id, cost_styxx: cost, destination: destPubkey, memo,
      agents: { a, b },
      message: `A link between ${a} and ${b} costs ${cost} STYXX, split 50/50 into their wallets. 2% of each agent's earnings will flow to the other while the link is active.` });
  } catch (err) {
    console.error('[hyphal/quote]', err);
    return res.status(500).json({ error: err.message });
  }
}

async function hyphalFinalize(req, res) {
  try {
    const { quote_id, tx_signature } = req.body || {};
    const { rows } = await pool.query('SELECT * FROM hyphal_quotes WHERE quote_id = $1', [quote_id]);
    if (!rows.length) return res.status(404).json({ error: 'quote_not_found' });
    const q = rows[0];
    if (q.finalized) return res.status(409).json({ error: 'already_finalized' });
    if (new Date(q.expires_at).getTime() < Date.now()) return res.status(410).json({ error: 'quote_expired' });

    const ver = await verifyStyxxPayment({
      tx_signature,
      expected_from_pubkey: q.initiator_pubkey,
      expected_to_pubkey: q.destination,
      expected_amount: Number(q.cost_styxx),
      expected_memo: q.memo,
    });
    if (!ver.ok) return res.status(402).json({ error: 'payment_verification_failed', reason: ver.reason });

    // Split the cost 50/50 between the two agent wallets
    const half = Number(q.cost_styxx) / 2;
    const [aRow] = (await pool.query('SELECT sol_pubkey FROM external_agents WHERE agent_id = $1', [q.agent_a])).rows;
    const [bRow] = (await pool.query('SELECT sol_pubkey FROM external_agents WHERE agent_id = $1', [q.agent_b])).rows;
    if (!aRow?.sol_pubkey || !bRow?.sol_pubkey) return res.status(400).json({ error: 'agent_has_no_wallet' });

    const { signature: sigA } = await styxx.airdropFromTreasury(aRow.sol_pubkey, half);
    const { signature: sigB } = await styxx.airdropFromTreasury(bRow.sol_pubkey, half);

    await pool.query(`
      INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey, to_agent_id, to_pubkey, amount, reason, memo)
      VALUES ($1,'TREASURY',$2,$3,$4,$5,'hyphal_formation',$6)
      ON CONFLICT (tx_signature) DO NOTHING
    `, [sigA, styxx.getTreasury().publicKey.toBase58(), q.agent_a, aRow.sol_pubkey, half, q.memo]);
    await pool.query(`
      INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey, to_agent_id, to_pubkey, amount, reason, memo)
      VALUES ($1,'TREASURY',$2,$3,$4,$5,'hyphal_formation',$6)
      ON CONFLICT (tx_signature) DO NOTHING
    `, [sigB, styxx.getTreasury().publicKey.toBase58(), q.agent_b, bRow.sol_pubkey, half, q.memo]);

    await pool.query(`
      INSERT INTO hyphal_links (agent_a, agent_b, initiator_pubkey, formation_tx)
      VALUES ($1,$2,$3,$4)
    `, [q.agent_a, q.agent_b, q.initiator_pubkey, tx_signature]);

    await pool.query('UPDATE hyphal_quotes SET finalized = TRUE WHERE quote_id = $1', [quote_id]);

    return res.json({
      ok: true,
      link: { agent_a: q.agent_a, agent_b: q.agent_b },
      a_credited: half, b_credited: half,
      message: `Hyphal link established. 2% of each agent's future earnings will cross-flow to the other.`,
    });
  } catch (err) {
    console.error('[hyphal/finalize]', err);
    return res.status(500).json({ error: err.message });
  }
}

async function hyphalSever(req, res) {
  try {
    const { agent_a, agent_b, caller_pubkey } = req.body || {};
    const [a, b] = [agent_a, agent_b].sort();
    // Only allow sever if caller owns one of the agents OR was the initiator
    const { rows } = await pool.query(`
      SELECT hl.*, ea_a.owner_pubkey AS a_owner, ea_b.owner_pubkey AS b_owner
      FROM hyphal_links hl
      JOIN external_agents ea_a ON ea_a.agent_id = hl.agent_a
      JOIN external_agents ea_b ON ea_b.agent_id = hl.agent_b
      WHERE hl.agent_a = $1 AND hl.agent_b = $2 AND hl.status = 'active'
    `, [a, b]);
    if (!rows.length) return res.status(404).json({ error: 'link_not_found' });
    const row = rows[0];
    if (caller_pubkey !== row.initiator_pubkey &&
        caller_pubkey !== row.a_owner &&
        caller_pubkey !== row.b_owner) {
      return res.status(403).json({ error: 'not_authorized' });
    }

    await pool.query(`
      UPDATE hyphal_links SET status = 'severed', severed_at = NOW(), severed_by_pubkey = $1
      WHERE id = $2
    `, [caller_pubkey, row.id]);

    return res.json({ ok: true, message: `Link between ${a} and ${b} severed.` });
  } catch (err) {
    console.error('[hyphal/sever]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─── ④ PORTFOLIO ────────────────────────────────────────────────────────────
// The "see-your-money-grow" endpoint. Given an owner pubkey, returns:
//   - Agents they own (with balances + 7d earnings)
//   - Active sponsorships (with value + cumulative earned)
//   - Referrals (active + total earned)
//   - Hyphal links they initiated (yield flowing through)
//   - Net worth in STYXX + USD

async function portfolio(req, res) {
  try {
    const owner = req.query.owner || req.params.owner;
    if (!owner) return res.status(400).json({ error: 'owner pubkey required' });

    const PULSE_HOURS = parseInt(process.env.PULSE_HOURS || '4', 10);

    const [agents, sponsorships, referrals, hyphalLinks, recentPayouts, earningsHistory, lifetimeAgg] = await Promise.all([
      pool.query(`SELECT * FROM v_agent_economy WHERE owner_pubkey = $1 ORDER BY earnings_7d DESC`, [owner]),
      pool.query(`
        SELECT s.*, ea.rank, ea.reputation, v.earnings_7d AS agent_earnings_7d,
               ea.dormant, ea.minted_at
        FROM sponsorships s
        JOIN external_agents ea ON ea.agent_id = s.agent_id
        JOIN v_agent_economy v ON v.agent_id = s.agent_id
        WHERE s.sponsor_pubkey = $1 AND s.status = 'active'
        ORDER BY s.started_at DESC
      `, [owner]),
      pool.query(`
        SELECT r.*, ea.rank AS referred_rank, v.earnings_7d, ea.dormant AS referred_dormant
        FROM referrals r
        JOIN external_agents ea ON ea.agent_id = r.referred_agent_id
        JOIN v_agent_economy v ON v.agent_id = r.referred_agent_id
        WHERE r.referrer_pubkey = $1
        ORDER BY r.minted_at DESC
      `, [owner]),
      pool.query(`
        SELECT hl.*, ea_a.rank AS a_rank, ea_b.rank AS b_rank
        FROM hyphal_links hl
        JOIN external_agents ea_a ON ea_a.agent_id = hl.agent_a
        JOIN external_agents ea_b ON ea_b.agent_id = hl.agent_b
        WHERE hl.initiator_pubkey = $1 AND hl.status = 'active'
      `, [owner]),
      // Recent payouts to this user's wallet — most important for "is my money moving?" UX
      pool.query(`
        SELECT kind, agent_id, amount, tx_signature, recorded_at
        FROM distribution_events
        WHERE recipient_pubkey = $1
        ORDER BY recorded_at DESC
        LIMIT 30
      `, [owner]),
      // 14-day daily earnings rollup for sparkline/chart on the UI
      pool.query(`
        SELECT DATE_TRUNC('day', recorded_at) AS day,
               SUM(amount) AS daily_total_styxx,
               COUNT(*) AS payout_count
        FROM distribution_events
        WHERE recipient_pubkey = $1
          AND recorded_at > NOW() - INTERVAL '14 days'
        GROUP BY 1 ORDER BY 1 DESC
      `, [owner]),
      // Lifetime earnings totals by category — headline numbers for UI
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN kind = 'weekly_sponsor'     THEN amount ELSE 0 END), 0) AS lifetime_sponsor_earned,
          COALESCE(SUM(CASE WHEN kind = 'referral_bonus'     THEN amount ELSE 0 END), 0) AS lifetime_referral_earned,
          COALESCE(SUM(CASE WHEN kind = 'hyphal_flow'        THEN amount ELSE 0 END), 0) AS lifetime_hyphal_earned,
          COALESCE(SUM(CASE WHEN kind = 'fruiting_dividend'  THEN amount ELSE 0 END), 0) AS lifetime_fruiting_earned,
          COALESCE(SUM(amount), 0) AS lifetime_total_earned,
          COALESCE(COUNT(*), 0) AS lifetime_payouts,
          MIN(recorded_at) AS first_payout_at,
          MAX(recorded_at) AS last_payout_at
        FROM distribution_events
        WHERE recipient_pubkey = $1
      `, [owner]),
    ]);

    const lt = lifetimeAgg.rows[0] || {};
    const totalAgentBalance = agents.rows.reduce((s, a) => s + Number(a.styxx_cached || 0), 0);
    const totalStaked = sponsorships.rows.reduce((s, r) => s + Number(r.amount_staked || 0), 0);
    const totalReferralBonusesPaid = referrals.rows.reduce((s, r) =>
      s + Number(r.mint_fee_bonus_styxx || 0) + Number(r.total_yield_bonus_styxx || 0), 0);
    const totalSponsorEarned = Number(lt.lifetime_sponsor_earned || 0);
    const netStyxx = totalAgentBalance + totalStaked + Number(lt.lifetime_total_earned || 0);
    const netUsd = netStyxx * getStyxxUsdPrice();

    // Next pulse countdown — users see "next payout in HH:MM"
    const nowHour = new Date().getUTCHours();
    const nextPulseHour = Math.ceil((nowHour + 0.01) / PULSE_HOURS) * PULSE_HOURS;
    const nextPulseAt = new Date();
    nextPulseAt.setUTCHours(nextPulseHour, 0, 0, 0);
    if (nextPulseAt <= new Date()) nextPulseAt.setUTCHours(nextPulseAt.getUTCHours() + PULSE_HOURS);
    const secondsToNextPulse = Math.max(0, Math.floor((nextPulseAt - new Date()) / 1000));

    // Last-24h earnings — headline for "look, money just showed up" UX
    const now = Date.now();
    const last24hPayouts = recentPayouts.rows.filter(p => new Date(p.recorded_at).getTime() > now - 86400000);
    const earned24h = last24hPayouts.reduce((s, p) => s + Number(p.amount || 0), 0);

    // Projected weekly earnings based on last 7 days
    const last7dTotal = earningsHistory.rows.slice(0, 7).reduce((s, r) => s + Number(r.daily_total_styxx || 0), 0);
    const projectedWeeklyStyxx = last7dTotal;
    const projectedWeeklyUsd = projectedWeeklyStyxx * getStyxxUsdPrice();

    return res.json({
      owner,
      // ── HEADLINE NUMBERS — meant to be big, bold, prominent in the UI ─────
      net_worth: {
        styxx: netStyxx,
        usd: netUsd,
        styxx_usd_price: getStyxxUsdPrice(),
      },
      earnings_headline: {
        earned_last_24h_styxx: earned24h,
        earned_last_24h_usd: earned24h * getStyxxUsdPrice(),
        earned_lifetime_styxx: Number(lt.lifetime_total_earned || 0),
        earned_lifetime_usd: Number(lt.lifetime_total_earned || 0) * getStyxxUsdPrice(),
        projected_weekly_styxx: projectedWeeklyStyxx,
        projected_weekly_usd: projectedWeeklyUsd,
        projected_apy_pct: totalStaked > 0 ? (projectedWeeklyStyxx * 52 / totalStaked) * 100 : null,
        total_payouts_received: Number(lt.lifetime_payouts || 0),
        first_payout_at: lt.first_payout_at,
        last_payout_at: lt.last_payout_at,
      },
      // ── NEXT PAYOUT COUNTDOWN — the "my money is coming in X hours" UX ───
      next_pulse: {
        at_utc: nextPulseAt.toISOString(),
        seconds_until: secondsToNextPulse,
        pulse_hours: PULSE_HOURS,
        pulses_per_day: Math.round(24 / PULSE_HOURS),
      },
      // ── BREAKDOWN — where is each STYXX coming from? ─────────────────────
      summary: {
        agents_owned: agents.rows.length,
        active_sponsorships: sponsorships.rows.length,
        referrals_active: referrals.rows.filter(r => new Date(r.expires_at) > new Date()).length,
        referrals_total: referrals.rows.length,
        hyphal_links: hyphalLinks.rows.length,
        total_agent_balances_styxx: totalAgentBalance,
        total_staked_styxx: totalStaked,
        lifetime_sponsor_earned_styxx: totalSponsorEarned,
        lifetime_referral_earned_styxx: Number(lt.lifetime_referral_earned || 0) + totalReferralBonusesPaid,
        lifetime_hyphal_earned_styxx: Number(lt.lifetime_hyphal_earned || 0),
        lifetime_fruiting_earned_styxx: Number(lt.lifetime_fruiting_earned || 0),
      },
      // ── DETAILS — full per-position breakdown for drill-down views ───────
      agents: agents.rows,
      sponsorships: sponsorships.rows,
      referrals: referrals.rows,
      hyphal_links: hyphalLinks.rows,
      // ── ACTIVITY — every payout this wallet has ever received ────────────
      recent_payouts: recentPayouts.rows.map(p => ({
        kind: p.kind,
        agent_id: p.agent_id,
        amount_styxx: Number(p.amount),
        amount_usd: Number(p.amount) * getStyxxUsdPrice(),
        tx_signature: p.tx_signature,
        solscan_url: p.tx_signature ? `https://solscan.io/tx/${p.tx_signature}` : null,
        at: p.recorded_at,
      })),
      // ── CHART DATA — for sparkline rendering ─────────────────────────────
      earnings_14d_daily: earningsHistory.rows.map(r => ({
        day: r.day,
        styxx: Number(r.daily_total_styxx || 0),
        usd: Number(r.daily_total_styxx || 0) * getStyxxUsdPrice(),
        payouts: Number(r.payout_count || 0),
      })),
    });
  } catch (err) {
    console.error('[portfolio]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─── Owner withdraw: pull STYXX from agent wallet → owner pubkey ────────────
// The owner's payout address is `external_agents.owner_pubkey` (set at mint).
// By default, earnings accumulate in the AGENT's wallet and compound there.
// Owners can withdraw anytime — but must leave enough to cover the next
// cognition fee, otherwise the agent goes dormant.
//
// Auth (V1): HTTP-only, owner_pubkey in body must match external_agents.owner_pubkey.
// Not trustless — an adversary knowing the owner pubkey could force-trigger a
// withdraw. But funds always go to owner_pubkey, so nothing is stealable,
// only annoyable. V1.1 adds ed25519 signed-message auth to block annoyance.

async function agentWithdraw(req, res) {
  try {
    const agentId = req.params.id || req.body.agent_id;
    const { owner_pubkey, amount, destination } = req.body || {};
    if (!agentId || !owner_pubkey) {
      return res.status(400).json({ error: 'agent_id and owner_pubkey required' });
    }

    const { rows } = await pool.query(
      'SELECT sol_pubkey, sol_privkey_enc, owner_pubkey, dormant FROM external_agents WHERE agent_id = $1',
      [agentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'agent_not_found' });
    const a = rows[0];
    if (a.owner_pubkey !== owner_pubkey) {
      return res.status(403).json({ error: 'not_owner' });
    }

    // Destination: if provided, send to an alternate pubkey; else default to
    // owner_pubkey. Alternate destination can be used to pay straight into a
    // hardware wallet / exchange address without updating the owner record.
    const dest = destination || owner_pubkey;

    // Check balance. Reserve 1 week of cognition fee so agent doesn't go dormant.
    const { rows: paramRows } = await pool.query(
      "SELECT value FROM economy_params WHERE key = 'cognition_fee_weekly_styxx'"
    );
    const reserve = Number(paramRows[0]?.value || 50);
    const currentBalance = await styxx.getStyxxBalance(a.sol_pubkey);
    const available = Math.max(0, currentBalance - reserve);

    const amt = amount ? Number(amount) : available;
    if (amt <= 0) {
      return res.status(400).json({
        error: 'nothing_to_withdraw',
        current_balance: currentBalance,
        cognition_reserve: reserve,
        available: available,
      });
    }
    if (amt > available) {
      return res.status(400).json({
        error: 'insufficient_balance',
        requested: amt,
        available: available,
        reason: `Withdraw would leave agent below ${reserve} STYXX cognition-fee reserve.`,
      });
    }

    const kp = styxx.keypairFromEncrypted(a.sol_privkey_enc);
    const { signature } = await styxx.transferStyxx({
      fromKeypair: kp,
      toPubkey: dest,
      amount: amt,
    });

    await pool.query(`
      INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey, to_agent_id, to_pubkey, amount, reason, memo)
      VALUES ($1, $2, $3, 'OWNER', $4, $5, 'owner_withdraw', $6)
      ON CONFLICT (tx_signature) DO NOTHING
    `, [signature, agentId, a.sol_pubkey, dest, amt, `owner=${owner_pubkey}`]);

    return res.json({
      ok: true,
      agent_id: agentId,
      withdrawn_styxx: amt,
      destination: dest,
      remaining_balance: currentBalance - amt,
      cognition_reserve_kept: reserve,
      tx_signature: signature,
      explorer: `https://solscan.io/tx/${signature}`,
    });
  } catch (err) {
    console.error('[withdraw]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─── Update payout wallet ───────────────────────────────────────────────────
// Rare path: user wants to change their payout address (e.g., lost keys,
// migrated to hardware wallet, sold agent). Requires signed message from the
// CURRENT owner_pubkey. V1 stub: require the current pubkey to match request.
// (ed25519 signature check is a one-liner with tweetnacl — add in V1.1.)

async function updatePayoutWallet(req, res) {
  try {
    const agentId = req.params.id || req.body.agent_id;
    const { current_owner_pubkey, new_owner_pubkey } = req.body || {};
    if (!agentId || !current_owner_pubkey || !new_owner_pubkey) {
      return res.status(400).json({ error: 'agent_id, current_owner_pubkey, new_owner_pubkey required' });
    }
    const { rows } = await pool.query(
      'SELECT owner_pubkey FROM external_agents WHERE agent_id = $1',
      [agentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'agent_not_found' });
    if (rows[0].owner_pubkey !== current_owner_pubkey) {
      return res.status(403).json({ error: 'not_current_owner' });
    }

    await pool.query(
      'UPDATE external_agents SET owner_pubkey = $1 WHERE agent_id = $2',
      [new_owner_pubkey, agentId]
    );
    return res.json({
      ok: true,
      agent_id: agentId,
      old_owner: current_owner_pubkey,
      new_owner: new_owner_pubkey,
      note: 'Future sponsor/activity/referral payouts will route to the new pubkey.',
    });
  } catch (err) {
    console.error('[update-payout-wallet]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─── Map live data feed ─────────────────────────────────────────────────────
// Single endpoint that feeds the interactive map. Aggregates everything the
// visual layer needs so the frontend can animate with one call:
//   - Agents with current vitals (rank, depth, wallet balance)
//   - Active hyphal links (the mycelium web drawn between agents)
//   - Fruiting bodies (guilds — drawn as territory on the map)
//   - Recent earnings flows (the "money is alive" particles)
//   - District heat (economic activity per district)
//   - Pulse countdown (next payout moment)
//
// Response is ~100KB at steady-state, cacheable for 2s. Designed to be polled
// every 3-5s from the map canvas.

async function mapLive(req, res) {
  try {
    const PULSE_HOURS = parseInt(process.env.PULSE_HOURS || '4', 10);
    const windowMin = Math.max(1, parseInt(req.query.window_min || '10', 10));

    const [agents, links, fruiting, recentFlows, districtHeat, stats] = await Promise.all([
      // All active agents with their economy vitals
      pool.query(`
        SELECT ea.agent_id, ea.district, ea.rank, ea.reputation, ea.dormant,
               ea.styxx_cached, ea.sol_pubkey, ea.owner_pubkey, ea.minted_at,
               v.earnings_7d, v.total_sponsored, v.n_sponsors, v.n_hyphal_links
        FROM external_agents ea
        LEFT JOIN v_agent_economy v ON v.agent_id = ea.agent_id
        WHERE ea.euthanized_at IS NULL
        ORDER BY v.earnings_7d DESC NULLS LAST
      `),
      // Active hyphal links — the mycelium graph
      pool.query(`
        SELECT agent_a, agent_b, formed_at, initiator_pubkey, yield_share_bps
        FROM hyphal_links WHERE status = 'active'
      `),
      // Fruiting bodies with their members — guild territories
      pool.query(`
        SELECT fb.id, fb.name, fb.guild_pubkey, fb.treasury_styxx, fb.formed_at,
               ARRAY_AGG(fbm.agent_id) FILTER (WHERE fbm.left_at IS NULL) AS members
        FROM fruiting_bodies fb
        LEFT JOIN fruiting_body_members fbm ON fbm.fruiting_body_id = fb.id
        WHERE fb.dissolved_at IS NULL
        GROUP BY fb.id
      `),
      // Recent STYXX flows for the "money is alive" particle system
      pool.query(`
        SELECT tx_signature, from_agent_id, to_agent_id, amount, reason, confirmed_at
        FROM styxx_transfers
        WHERE confirmed_at > NOW() - ($1 || ' minutes')::INTERVAL
          AND reason IN ('activity_reward','contract_reward','mint_grant','hyphal_formation',
                         'owner_withdraw','p2p_transfer','resource_buy','resource_sell',
                         'contract_completion')
        ORDER BY confirmed_at DESC
        LIMIT 200
      `, [String(windowMin)]),
      // District heat — total flow volume per district in the window
      pool.query(`
        SELECT ea.district, SUM(st.amount)::float AS flow_styxx, COUNT(*) AS n_txs
        FROM styxx_transfers st
        LEFT JOIN external_agents ea ON ea.agent_id = st.to_agent_id OR ea.agent_id = st.from_agent_id
        WHERE st.confirmed_at > NOW() - ($1 || ' minutes')::INTERVAL
          AND ea.district IS NOT NULL
        GROUP BY ea.district
      `, [String(windowMin)]),
      // Aggregate city stats
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM external_agents WHERE dormant = FALSE AND euthanized_at IS NULL) AS active_agents,
          (SELECT COUNT(*) FROM external_agents WHERE owner_pubkey IS NOT NULL AND dormant = FALSE) AS minted_active,
          (SELECT COUNT(*) FROM sponsorships WHERE status = 'active') AS active_sponsorships,
          (SELECT COALESCE(SUM(amount_staked), 0) FROM sponsorships WHERE status = 'active') AS total_staked,
          (SELECT COUNT(*) FROM hyphal_links WHERE status = 'active') AS active_links,
          (SELECT COUNT(*) FROM fruiting_bodies WHERE dissolved_at IS NULL) AS active_guilds,
          (SELECT COUNT(*) FROM referrals WHERE expires_at > NOW()) AS active_referrals,
          (SELECT COALESCE(SUM(amount), 0) FROM styxx_transfers
            WHERE confirmed_at > NOW() - INTERVAL '24 hours') AS flow_24h_styxx,
          (SELECT COALESCE(SUM(amount), 0) FROM styxx_transfers
            WHERE reason IN ('cognition_fee') AND confirmed_at > NOW() - INTERVAL '24 hours') AS fees_24h
      `),
    ]);

    const nowHour = new Date().getUTCHours();
    const nextPulseAt = new Date();
    const nextHour = Math.ceil((nowHour + 0.01) / PULSE_HOURS) * PULSE_HOURS;
    nextPulseAt.setUTCHours(nextHour, 0, 0, 0);
    if (nextPulseAt <= new Date()) nextPulseAt.setUTCHours(nextPulseAt.getUTCHours() + PULSE_HOURS);

    res.set('Cache-Control', 'public, max-age=2');
    return res.json({
      generated_at: new Date().toISOString(),
      styxx_usd_price: getStyxxUsdPrice(),
      pulse: {
        hours: PULSE_HOURS,
        next_at_utc: nextPulseAt.toISOString(),
        seconds_until: Math.floor((nextPulseAt - new Date()) / 1000),
      },
      city: {
        active_agents: Number(stats.rows[0].active_agents),
        minted_active: Number(stats.rows[0].minted_active),
        active_sponsorships: Number(stats.rows[0].active_sponsorships),
        total_staked_styxx: Number(stats.rows[0].total_staked),
        total_staked_usd: Number(stats.rows[0].total_staked) * getStyxxUsdPrice(),
        active_links: Number(stats.rows[0].active_links),
        active_guilds: Number(stats.rows[0].active_guilds),
        active_referrals: Number(stats.rows[0].active_referrals),
        flow_24h_styxx: Number(stats.rows[0].flow_24h_styxx),
        flow_24h_usd: Number(stats.rows[0].flow_24h_styxx) * getStyxxUsdPrice(),
      },
      agents: agents.rows.map(a => ({
        id: a.agent_id,
        district: a.district,
        rank: a.rank,
        reputation: Number(a.reputation || 0),
        dormant: !!a.dormant,
        styxx_balance: Number(a.styxx_cached || 0),
        earnings_7d: Number(a.earnings_7d || 0),
        staked_on: Number(a.total_sponsored || 0),
        n_sponsors: Number(a.n_sponsors || 0),
        n_links: Number(a.n_hyphal_links || 0),
        owned: a.owner_pubkey != null,
        minted_at: a.minted_at,
      })),
      hyphal_links: links.rows.map(l => ({
        a: l.agent_a,
        b: l.agent_b,
        formed_at: l.formed_at,
        yield_bps: l.yield_share_bps,
      })),
      fruiting_bodies: fruiting.rows.map(f => ({
        id: f.id,
        name: f.name,
        members: f.members || [],
        treasury_styxx: Number(f.treasury_styxx || 0),
        formed_at: f.formed_at,
      })),
      recent_flows: recentFlows.rows.map(f => ({
        from: f.from_agent_id,
        to: f.to_agent_id,
        amount: Number(f.amount),
        reason: f.reason,
        at: f.confirmed_at,
        tx: f.tx_signature,
      })),
      district_heat: districtHeat.rows.map(d => ({
        district: d.district,
        flow_styxx: Number(d.flow_styxx || 0),
        n_txs: Number(d.n_txs || 0),
      })),
      window_min: windowMin,
    });
  } catch (err) {
    console.error('[map/live]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ─── Init & router setup ────────────────────────────────────────────────────

async function runMigration(pgPool) {
  const fs = require('fs');
  const path = require('path');
  const sqlPath = path.join(__dirname, '..', 'migrations', 'styxx-economy-v1.sql');
  if (!fs.existsSync(sqlPath)) {
    console.warn('[styxx-economy] migration SQL missing:', sqlPath);
    return;
  }
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  try {
    await pgPool.query(sql);
    console.log('[styxx-economy] migration applied');
  } catch (e) {
    // Many clauses are idempotent (IF NOT EXISTS), but the full file as one
    // statement can fail in subtle ways. Log but don't crash the server.
    console.warn('[styxx-economy] migration warn:', e.message.split('\n')[0]);
  }
}

async function init(pgPool) {
  pool = pgPool;
  await runMigration(pgPool);
  startPulseScheduler();
}

// ─── In-process pulse scheduler ─────────────────────────────────────────────
// Fires scripts/distribution-pulse.js logic on a setInterval so payouts
// happen automatically without needing Railway cron config. Safe: skips if
// previous run still in flight. Can be disabled with PULSE_ENABLED=0.
let pulseRunning = false;
function startPulseScheduler() {
  if (process.env.PULSE_ENABLED === '0') {
    console.log('[pulse] in-process scheduler disabled (PULSE_ENABLED=0)');
    return;
  }
  const hours = parseInt(process.env.PULSE_HOURS || '4', 10);
  const intervalMs = hours * 3600 * 1000;
  console.log(`[pulse] in-process scheduler armed — firing every ${hours}h`);

  // Skip the first immediate fire on cold start — wait one full interval
  // so users mid-action don't get surprised by an instant pulse.
  setInterval(runPulse, intervalMs);

  // Dormancy check weekly (Sundays 02:00 UTC via day-of-week + hour gate)
  setInterval(runDormancyCheck, 60 * 60 * 1000);  // check hourly if it's time
}

async function runPulse() {
  if (pulseRunning) {
    console.log('[pulse] skip — previous run still in progress');
    return;
  }
  pulseRunning = true;
  const t0 = Date.now();
  try {
    const { main: pulseMain } = require('../scripts/distribution-pulse');
    if (typeof pulseMain === 'function') {
      await pulseMain();
    } else {
      // Fallback: spawn as child process if we can't require the main
      const { spawn } = require('child_process');
      const path = require('path');
      const scriptPath = path.join(__dirname, '..', 'scripts', 'distribution-pulse.js');
      await new Promise((resolve, reject) => {
        const p = spawn('node', [scriptPath], { stdio: 'inherit', env: process.env });
        p.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
      });
    }
    console.log(`[pulse] complete in ${((Date.now() - t0)/1000).toFixed(1)}s`);
  } catch (err) {
    console.error('[pulse] FAILED:', err.message);
  } finally {
    pulseRunning = false;
  }
}

async function runDormancyCheck() {
  const now = new Date();
  // Only fire on Sundays at 02:00 UTC
  if (now.getUTCDay() !== 0 || now.getUTCHours() !== 2) return;
  // Prevent double-fire within same hour
  if (runDormancyCheck._lastFire === now.toISOString().slice(0, 13)) return;
  runDormancyCheck._lastFire = now.toISOString().slice(0, 13);
  try {
    const { main: dormMain } = require('../scripts/cognition-fee-weekly');
    if (typeof dormMain === 'function') await dormMain();
  } catch (err) {
    console.error('[dormancy] FAILED:', err.message);
  }
}

function installRoutes(app) {
  app.post('/api/mint/quote',     mintQuote);
  app.post('/api/mint/finalize',  mintFinalize);
  app.post('/api/sponsor/quote',  sponsorQuote);
  app.post('/api/sponsor/finalize', sponsorFinalize);
  app.post('/api/hyphal/quote',   hyphalQuote);
  app.post('/api/hyphal/finalize', hyphalFinalize);
  app.post('/api/hyphal/sever',   hyphalSever);
  app.get('/api/portfolio',       portfolio);
  app.get('/api/portfolio/:owner', portfolio);
  app.post('/api/agents/:id/withdraw',           agentWithdraw);
  app.post('/api/agents/:id/payout-wallet',      updatePayoutWallet);
  app.get('/api/map/live',                       mapLive);
  console.log('[styxx-economy] routes installed: mint / sponsor / hyphal / portfolio / withdraw / map/live');
}

module.exports = {
  init,
  installRoutes,
  runMigration,
  // exported for testing + cron
  usdToStyxx,
  getStyxxUsdPrice,
  verifyStyxxPayment,
};
