// ============================================================================
// hooks/darkcoin-faucet.js — onboarding faucet
//
// New wallets get a one-time airdrop of $DARKCOIN so zero-to-first-bet doesn't
// require going to pump.fun, buying SOL, swapping, bridging, etc. The biggest
// friction in any crypto product is the "go to a DEX and buy the token" wall.
// This removes it for the first try.
//
// Safety rails:
//   1. One claim per wallet, enforced by UNIQUE constraint
//   2. Message-signature proof of wallet control (prevents farming random pubkeys)
//   3. IP-level rate limit (blocks burst attempts from one box)
//   4. Treasury floor check — won't drain the house
//   5. Global daily cap on faucet outflow via economy_params
//   6. Feature flag: faucet_enabled (default false until treasury is funded)
//
// Route:
//   POST /api/faucet/claim  body: { wallet, signature_b58, nonce }
//   GET  /api/faucet/status query: ?wallet=... — tells client if claim is available
// ============================================================================

'use strict';

const nacl = require('tweetnacl');
const bs58 = require('bs58');
const { PublicKey } = require('@solana/web3.js');
const { TOKEN_LIVE } = require('../lib/token-config');

const FAUCET_MESSAGE = (wallet, nonce) =>
  `darkcity faucet claim\nwallet: ${wallet}\nnonce: ${nonce}`;

// Nonce must be within the last 10 minutes so a leaked sig can't be replayed
// months later. Format: unix seconds.
const NONCE_MAX_AGE_SEC = 10 * 60;

function isValidSignature(pubkeyStr, messageStr, sigB58) {
  try {
    const pub = new PublicKey(pubkeyStr).toBytes();
    const msg = new TextEncoder().encode(messageStr);
    const sig = bs58.decode(sigB58);
    return nacl.sign.detached.verify(msg, sig, pub);
  } catch {
    return false;
  }
}

async function ensureFaucetTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS faucet_claims (
      id          BIGSERIAL PRIMARY KEY,
      wallet      TEXT UNIQUE NOT NULL,
      ip          TEXT,
      amount      NUMERIC(20,6) NOT NULL,
      tx_sig      TEXT,
      claimed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_faucet_ip_recent ON faucet_claims (ip, claimed_at);
  `);
  // Seed defaults if missing — harmless if they already exist.
  await pool.query(`
    INSERT INTO economy_params (key, value) VALUES
      ('faucet_enabled',           'false'),
      ('faucet_amount_styxx',      '100000'),
      ('faucet_daily_cap_styxx',   '10000000'),
      ('faucet_treasury_floor',    '500000')
    ON CONFLICT (key) DO NOTHING
  `);
}

function installFaucetRoutes(app, pool) {
  const solanaDarkcoin = require('../lib/solana-darkcoin');

  ensureFaucetTable(pool).catch(e => console.warn('[faucet] table init:', e.message));

  app.get('/api/faucet/status', async (req, res) => {
    try {
      const wallet = req.query.wallet;
      const { rows: paramRows } = await pool.query(
        "SELECT key, value FROM economy_params WHERE key LIKE 'faucet_%'"
      );
      const p = Object.fromEntries(paramRows.map(r => [r.key, r.value]));
      // Faucet can never be on while there is no mint to airdrop from.
      const enabled = TOKEN_LIVE && String(p.faucet_enabled || 'false').toLowerCase() === 'true';
      const amount = Number(p.faucet_amount_styxx || 100000);

      let claimed = null;
      if (wallet) {
        try { new PublicKey(wallet); } catch { return res.status(400).json({ error: 'invalid_wallet' }); }
        const { rows } = await pool.query(
          `SELECT claimed_at, tx_sig FROM faucet_claims WHERE wallet = $1`,
          [wallet]
        );
        if (rows.length) {
          claimed = { at: rows[0].claimed_at, tx: rows[0].tx_sig };
        }
      }

      // Build a fresh nonce for the next claim attempt.
      const nonce = Math.floor(Date.now() / 1000).toString();
      const messageToSign = wallet ? FAUCET_MESSAGE(wallet, nonce) : null;

      res.json({
        enabled,
        mint_live: TOKEN_LIVE,
        amount_styxx: amount,
        already_claimed: !!claimed,
        claim: claimed,
        nonce,
        message_to_sign: messageToSign,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/faucet/claim', async (req, res) => {
    try {
      const { wallet, signature_b58, nonce } = req.body || {};
      if (!wallet || !signature_b58 || !nonce) {
        return res.status(400).json({ error: 'need {wallet, signature_b58, nonce}' });
      }
      try { new PublicKey(wallet); } catch { return res.status(400).json({ error: 'invalid_wallet' }); }

      // Nonce freshness
      const nonceSec = Number(nonce);
      const nowSec = Math.floor(Date.now() / 1000);
      if (!Number.isFinite(nonceSec) || Math.abs(nowSec - nonceSec) > NONCE_MAX_AGE_SEC) {
        return res.status(400).json({ error: 'nonce_expired' });
      }

      // Verify signature covers the canonical message — prevents a signature
      // captured for some other purpose from being replayed here.
      if (!isValidSignature(wallet, FAUCET_MESSAGE(wallet, nonce), signature_b58)) {
        return res.status(401).json({ error: 'bad_signature' });
      }

      // Load current faucet config.
      // No mint, no faucet — regardless of what economy_params says.
      if (!TOKEN_LIVE) return res.status(503).json({ error: 'token_not_live' });

      const { rows: paramRows } = await pool.query(
        "SELECT key, value FROM economy_params WHERE key LIKE 'faucet_%'"
      );
      const p = Object.fromEntries(paramRows.map(r => [r.key, r.value]));
      const enabled = String(p.faucet_enabled || 'false').toLowerCase() === 'true';
      if (!enabled) return res.status(503).json({ error: 'faucet_disabled' });

      const amount = Number(p.faucet_amount_styxx || 100000);
      const dailyCap = Number(p.faucet_daily_cap_styxx || 10_000_000);
      const treasuryFloor = Number(p.faucet_treasury_floor || 500_000);

      // Dedup — one per wallet, ever.
      const { rows: existing } = await pool.query(
        `SELECT id, tx_sig FROM faucet_claims WHERE wallet = $1`,
        [wallet]
      );
      if (existing.length) {
        return res.status(409).json({ error: 'already_claimed', tx_sig: existing[0].tx_sig });
      }

      // IP-level rate limit — max 3 unique wallets per IP per 24h. Blunt but
      // effective against casual farming; serious farmers will proxy anyway.
      const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
      const { rows: ipRows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM faucet_claims
          WHERE ip = $1 AND claimed_at > NOW() - INTERVAL '24 hours'`,
        [ip]
      );
      if ((ipRows[0]?.n || 0) >= 3) {
        return res.status(429).json({ error: 'ip_rate_limited' });
      }

      // Daily global cap — protects treasury from a successful farming burst.
      const { rows: capRows } = await pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM faucet_claims
          WHERE claimed_at > NOW() - INTERVAL '24 hours'`
      );
      if (Number(capRows[0]?.total || 0) + amount > dailyCap) {
        return res.status(503).json({ error: 'daily_cap_reached' });
      }

      // Treasury floor — don't dip the house below operating reserve.
      const treasuryBal = await solanaDarkcoin.getDarkcoinBalance(solanaDarkcoin.getTreasury().publicKey.toBase58());
      if (treasuryBal - amount < treasuryFloor) {
        return res.status(503).json({ error: 'treasury_below_floor' });
      }

      // Reserve a row BEFORE the airdrop so a concurrent call can't double-pay.
      const { rows: reserveRows } = await pool.query(
        `INSERT INTO faucet_claims (wallet, ip, amount) VALUES ($1, $2, $3)
         ON CONFLICT (wallet) DO NOTHING
         RETURNING id`,
        [wallet, ip, amount]
      );
      if (!reserveRows.length) {
        return res.status(409).json({ error: 'already_claimed' });
      }
      const claimId = reserveRows[0].id;

      // Execute airdrop.
      try {
        const out = await solanaDarkcoin.airdropFromTreasury(wallet, amount);
        await pool.query(
          `UPDATE faucet_claims SET tx_sig = $2 WHERE id = $1`,
          [claimId, out.signature]
        );
        console.log('[faucet] +', amount, '→', wallet.slice(0, 8), 'sig:', out.signature.slice(0, 10));
        res.json({ ok: true, amount, tx_sig: out.signature });
      } catch (e) {
        // Airdrop failed — roll back the reservation so the user can retry.
        await pool.query(`DELETE FROM faucet_claims WHERE id = $1`, [claimId]);
        console.error('[faucet] airdrop failed:', e.message);
        res.status(502).json({ error: 'airdrop_failed', detail: e.message });
      }
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('[faucet] routes registered: /api/faucet/{status,claim}');
}

module.exports = { installFaucetRoutes };
