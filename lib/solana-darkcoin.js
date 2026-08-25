// ============================================================================
// solana-darkcoin.js — DarkCity native currency layer
// Every agent holds a custodial Solana keypair. Every trade is a real SPL
// transfer of $DARKCOIN. No virtual balances.
//
// Mint: Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump
// ============================================================================

const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} = require('@solana/web3.js');
const {
  TOKEN_2022_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  createTransferCheckedInstruction,
  createBurnCheckedInstruction,
  getAccount,
} = require('@solana/spl-token');
const crypto = require('crypto');
const bs58 = require('bs58');

// ─── Config ────────────────────────────────────────────────────────────────

const TOKEN_MINT_ADDR = 'Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump';
const TOKEN_PUMP_URL = 'https://pump.fun/coin/Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump';
const TOKEN_DECIMALS = 6;
// pump.fun 2026 mints use Token-2022 (extensions program).
const CITY_TOKEN_PROGRAM_ID = TOKEN_2022_PROGRAM_ID;

let connection = null;
let styxxMint = null;
let treasury = null; // Keypair
let encKey = null;   // 32-byte Buffer

function init() {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  connection = new Connection(rpcUrl, 'confirmed');
  styxxMint = new PublicKey(TOKEN_MINT_ADDR);

  const encKeyHex = process.env.WALLET_ENC_KEY || process.env.STYXX_WALLET_ENC_KEY;
  if (!encKeyHex) throw new Error('WALLET_ENC_KEY env var missing (64 hex chars)');
  encKey = Buffer.from(encKeyHex, 'hex');
  if (encKey.length !== 32) throw new Error('WALLET_ENC_KEY must be 32 bytes (64 hex chars)');

  const treasuryB58 = process.env.TREASURY_PRIVKEY || process.env.STYXX_TREASURY_PRIVKEY;
  if (!treasuryB58) throw new Error('TREASURY_PRIVKEY env var missing (base58-encoded)');
  treasury = Keypair.fromSecretKey(bs58.decode(treasuryB58));

  console.log('[darkcoin] RPC:', rpcUrl);
  console.log('[darkcoin] mint:', TOKEN_MINT_ADDR);
  console.log('[darkcoin] treasury:', treasury.publicKey.toBase58());
}

// ─── Key management ────────────────────────────────────────────────────────

function generateAgentKeypair() {
  return Keypair.generate();
}

function encryptPrivkey(secretKeyBytes) {
  // AES-256-GCM. Output: base64(iv || ciphertext || tag)
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const ct = Buffer.concat([cipher.update(secretKeyBytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString('base64');
}

function decryptPrivkey(encB64) {
  const buf = Buffer.from(encB64, 'base64');
  const iv = buf.slice(0, 12);
  const tag = buf.slice(buf.length - 16);
  const ct = buf.slice(12, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

function keypairFromEncrypted(encB64) {
  return Keypair.fromSecretKey(decryptPrivkey(encB64));
}

// ─── ATA + balance ─────────────────────────────────────────────────────────

async function getOrCreateATA(ownerPubkey) {
  // Uses treasury as fee payer so agents don't need SOL.
  return getOrCreateAssociatedTokenAccount(
    connection,
    treasury,              // fee payer
    styxxMint,
    new PublicKey(ownerPubkey),
    false,                 // allowOwnerOffCurve
    'confirmed',
    { commitment: 'confirmed' },
    CITY_TOKEN_PROGRAM_ID
  );
}

async function getDarkcoinBalance(ownerPubkey) {
  // Separated from the retry wrapper below so that "ATA does not exist"
  // (a legitimate zero balance) still returns 0 without burning retries.
  try {
    const ata = await getAssociatedTokenAddress(
      styxxMint,
      new PublicKey(ownerPubkey),
      false,
      CITY_TOKEN_PROGRAM_ID
    );
    const acct = await _withRpcRetry('getAccount', () =>
      getAccount(connection, ata, 'confirmed', CITY_TOKEN_PROGRAM_ID)
    );
    return Number(acct.amount) / Math.pow(10, TOKEN_DECIMALS);
  } catch (e) {
    const msg = String(e?.message || e);
    // TokenAccountNotFoundError / AccountNotFoundError → zero balance.
    if (/TokenAccountNotFound|AccountNotFound|could not find account/i.test(msg)) return 0;
    // Any other error (429 that exhausted retries, network, etc.) bubbles up
    // so callers know the read was unreliable instead of falsely reading 0.
    throw e;
  }
}

// ─── Transfer ──────────────────────────────────────────────────────────────

/**
 * Transfer $DARKCOIN from one agent (or treasury) to another.
 * @param {Object} opts
 * @param {Keypair} opts.fromKeypair  — sender. Use treasury for airdrops.
 * @param {string}  opts.toPubkey      — recipient pubkey (base58)
 * @param {number}  opts.amount        — in whole $DARKCOIN (not base units)
 * @param {string}  [opts.memo]        — optional memo (off-chain log only)
 * @returns {Promise<{signature: string, slot: number}>}
 */
// Mainnet-beta RPC throttles hard — a single pulse processing 30+ agents
// reliably hits 429s on getAccount/getOrCreateATA/sendTransaction. Without
// retry, one 429 rolls back that agent's entire payout (owner loses their
// 85% sponsor share). Exponential backoff + jitter absorbs transient 429s.
function _isRateLimitError(err) {
  const m = String(err?.message || err || '');
  return /429|too many requests|rate.?limit|server responded with/i.test(m);
}
async function _withRpcRetry(label, fn, { max = 6, baseMs = 600 } = {}) {
  let lastErr;
  for (let i = 0; i < max; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (!_isRateLimitError(e)) throw e;
      const wait = Math.min(8000, baseMs * Math.pow(2, i)) + Math.floor(Math.random() * 300);
      console.warn(`[styxx:${label}] 429 retry ${i+1}/${max} in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function transferDarkcoin({ fromKeypair, toPubkey, amount }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be a positive number');
  }

  const baseAmount = BigInt(Math.floor(amount * Math.pow(10, TOKEN_DECIMALS)));

  // Ensure both ATAs exist. Treasury pays creation if needed.
  const fromATA = await _withRpcRetry('fromATA', () => getOrCreateATA(fromKeypair.publicKey.toBase58()));
  const toATA   = await _withRpcRetry('toATA',   () => getOrCreateATA(toPubkey));

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }));
  // Token-2022 requires transferChecked (amount+decimals) for transfer-fee extension compat.
  tx.add(
    createTransferCheckedInstruction(
      fromATA.address,
      styxxMint,
      toATA.address,
      fromKeypair.publicKey,
      baseAmount,
      TOKEN_DECIMALS,
      [],
      CITY_TOKEN_PROGRAM_ID
    )
  );

  // Treasury is always fee payer so agents never need SOL.
  tx.feePayer = treasury.publicKey;

  const signers = fromKeypair.publicKey.equals(treasury.publicKey)
    ? [treasury]
    : [treasury, fromKeypair];

  const signature = await _withRpcRetry('send', () =>
    sendAndConfirmTransaction(connection, tx, signers, {
      commitment: 'confirmed',
      maxRetries: 5,
    })
  );

  const txInfo = await _withRpcRetry('getTx', () =>
    connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
  ).catch(() => null);
  return { signature, slot: txInfo?.slot || null };
}

// ─── Convenience wrappers ──────────────────────────────────────────────────

async function airdropFromTreasury(toPubkey, amount) {
  return transferDarkcoin({ fromKeypair: treasury, toPubkey, amount });
}

// ─── On-chain burn — destroys STYXX from treasury's ATA permanently ────────
// Every mint fee burns 10% of itself through this. Deflationary pressure that
// compounds with every user who joins the city. The burned amount is visible
// on Solscan and reduces the token's circulating supply forever.
async function burnFromTreasury(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be a positive number');
  }
  const baseAmount = BigInt(Math.floor(amount * Math.pow(10, TOKEN_DECIMALS)));
  const treasuryATA = await getOrCreateATA(treasury.publicKey.toBase58());

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }));
  tx.add(
    createBurnCheckedInstruction(
      treasuryATA.address,    // account to burn from
      styxxMint,              // mint
      treasury.publicKey,     // authority
      baseAmount,             // amount in base units
      TOKEN_DECIMALS,
      [],
      CITY_TOKEN_PROGRAM_ID
    )
  );
  tx.feePayer = treasury.publicKey;

  const signature = await _withRpcRetry('burn', () => sendAndConfirmTransaction(connection, tx, [treasury], {
    commitment: 'confirmed',
    maxRetries: 5,
  }));
  const txInfo = await _withRpcRetry('getTx', () =>
    connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
  ).catch(() => null);
  return { signature, slot: txInfo?.slot || null, burnedAmount: amount };
}

async function collectToTreasury(fromKeypair, amount) {
  return transferDarkcoin({
    fromKeypair,
    toPubkey: treasury.publicKey.toBase58(),
    amount,
  });
}

// ─── Utilities ─────────────────────────────────────────────────────────────

async function getTreasuryBalances() {
  const sol = await _withRpcRetry('getBalance', () => connection.getBalance(treasury.publicKey));
  const styxx = await getDarkcoinBalance(treasury.publicKey.toBase58());
  return {
    pubkey: treasury.publicKey.toBase58(),
    sol: sol / LAMPORTS_PER_SOL,
    styxx,
  };
}

module.exports = {
  init,
  TOKEN_MINT_ADDR,
  TOKEN_PUMP_URL,
  TOKEN_DECIMALS,
  generateAgentKeypair,
  encryptPrivkey,
  decryptPrivkey,
  keypairFromEncrypted,
  getOrCreateATA,
  getDarkcoinBalance,
  transferDarkcoin,
  airdropFromTreasury,
  collectToTreasury,
  burnFromTreasury,
  getTreasuryBalances,
  getConnection: () => connection,
  getTreasury: () => treasury,
};
