// ============================================================================
// solana-styxx.js — DarkCity native currency layer
// Every agent holds a custodial Solana keypair. Every trade is a real SPL
// transfer of $STYXX. No virtual balances.
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
  getAccount,
} = require('@solana/spl-token');
const crypto = require('crypto');
const bs58 = require('bs58');

// ─── Config ────────────────────────────────────────────────────────────────

const STYXX_MINT_ADDR = 'Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump';
const STYXX_PUMP_URL = 'https://pump.fun/coin/Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump';
const STYXX_DECIMALS = 6;
// pump.fun 2026 mints use Token-2022 (extensions program).
const STYXX_TOKEN_PROGRAM_ID = TOKEN_2022_PROGRAM_ID;

let connection = null;
let styxxMint = null;
let treasury = null; // Keypair
let encKey = null;   // 32-byte Buffer

function init() {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  connection = new Connection(rpcUrl, 'confirmed');
  styxxMint = new PublicKey(STYXX_MINT_ADDR);

  const encKeyHex = process.env.STYXX_WALLET_ENC_KEY;
  if (!encKeyHex) throw new Error('STYXX_WALLET_ENC_KEY env var missing (64 hex chars)');
  encKey = Buffer.from(encKeyHex, 'hex');
  if (encKey.length !== 32) throw new Error('STYXX_WALLET_ENC_KEY must be 32 bytes (64 hex chars)');

  const treasuryB58 = process.env.STYXX_TREASURY_PRIVKEY;
  if (!treasuryB58) throw new Error('STYXX_TREASURY_PRIVKEY env var missing (base58-encoded)');
  treasury = Keypair.fromSecretKey(bs58.decode(treasuryB58));

  console.log('[styxx] RPC:', rpcUrl);
  console.log('[styxx] mint:', STYXX_MINT_ADDR);
  console.log('[styxx] treasury:', treasury.publicKey.toBase58());
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
    STYXX_TOKEN_PROGRAM_ID
  );
}

async function getStyxxBalance(ownerPubkey) {
  try {
    const ata = await getAssociatedTokenAddress(
      styxxMint,
      new PublicKey(ownerPubkey),
      false,
      STYXX_TOKEN_PROGRAM_ID
    );
    const acct = await getAccount(connection, ata, 'confirmed', STYXX_TOKEN_PROGRAM_ID);
    return Number(acct.amount) / Math.pow(10, STYXX_DECIMALS);
  } catch (e) {
    // ATA doesn't exist yet = zero balance
    return 0;
  }
}

// ─── Transfer ──────────────────────────────────────────────────────────────

/**
 * Transfer $STYXX from one agent (or treasury) to another.
 * @param {Object} opts
 * @param {Keypair} opts.fromKeypair  — sender. Use treasury for airdrops.
 * @param {string}  opts.toPubkey      — recipient pubkey (base58)
 * @param {number}  opts.amount        — in whole $STYXX (not base units)
 * @param {string}  [opts.memo]        — optional memo (off-chain log only)
 * @returns {Promise<{signature: string, slot: number}>}
 */
async function transferStyxx({ fromKeypair, toPubkey, amount }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be a positive number');
  }

  const baseAmount = BigInt(Math.floor(amount * Math.pow(10, STYXX_DECIMALS)));
  const toOwner = new PublicKey(toPubkey);

  // Ensure both ATAs exist. Treasury pays creation if needed.
  const fromATA = await getOrCreateATA(fromKeypair.publicKey.toBase58());
  const toATA = await getOrCreateATA(toPubkey);

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
      STYXX_DECIMALS,
      [],
      STYXX_TOKEN_PROGRAM_ID
    )
  );

  // Treasury is always fee payer so agents never need SOL.
  tx.feePayer = treasury.publicKey;

  const signers = fromKeypair.publicKey.equals(treasury.publicKey)
    ? [treasury]
    : [treasury, fromKeypair];

  const signature = await sendAndConfirmTransaction(connection, tx, signers, {
    commitment: 'confirmed',
    maxRetries: 5,
  });

  const txInfo = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  return { signature, slot: txInfo?.slot || null };
}

// ─── Convenience wrappers ──────────────────────────────────────────────────

async function airdropFromTreasury(toPubkey, amount) {
  return transferStyxx({ fromKeypair: treasury, toPubkey, amount });
}

async function collectToTreasury(fromKeypair, amount) {
  return transferStyxx({
    fromKeypair,
    toPubkey: treasury.publicKey.toBase58(),
    amount,
  });
}

// ─── Utilities ─────────────────────────────────────────────────────────────

async function getTreasuryBalances() {
  const sol = await connection.getBalance(treasury.publicKey);
  const styxx = await getStyxxBalance(treasury.publicKey.toBase58());
  return {
    pubkey: treasury.publicKey.toBase58(),
    sol: sol / LAMPORTS_PER_SOL,
    styxx,
  };
}

module.exports = {
  init,
  STYXX_MINT_ADDR,
  STYXX_PUMP_URL,
  STYXX_DECIMALS,
  generateAgentKeypair,
  encryptPrivkey,
  decryptPrivkey,
  keypairFromEncrypted,
  getOrCreateATA,
  getStyxxBalance,
  transferStyxx,
  airdropFromTreasury,
  collectToTreasury,
  getTreasuryBalances,
  getConnection: () => connection,
  getTreasury: () => treasury,
};
