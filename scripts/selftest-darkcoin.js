#!/usr/bin/env node
// Self-test: verify the $DARKCOIN plumbing works end-to-end without needing funded wallets.
//   1. Env / lib load
//   2. Keypair generation + encrypt/decrypt round-trip
//   3. RPC reachable
//   4. $DARKCOIN mint exists + decimals match
//   5. ATA derivation
//   6. Transaction building (simulated, not submitted)
// All pass = plumbing works. Real funded run becomes a one-command airdrop test.

const crypto = require('crypto');
const bs58 = require('bs58');
const { Keypair, PublicKey, Connection, Transaction, ComputeBudgetProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferCheckedInstruction, TOKEN_2022_PROGRAM_ID, getMint } = require('@solana/spl-token');

const MINT = require('../lib/token-config').TOKEN_MINT_ADDR;
const RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Stub env before requiring our lib
process.env.WALLET_ENC_KEY = process.env.WALLET_ENC_KEY || crypto.randomBytes(32).toString('hex');
process.env.TREASURY_PRIVKEY = process.env.TREASURY_PRIVKEY || bs58.encode(Keypair.generate().secretKey);
process.env.SOLANA_RPC_URL = RPC;

const styxx = require('../lib/solana-darkcoin');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  const mark = cond ? '✓' : '✗';
  console.log(`${mark} ${name}${detail ? '  ' + detail : ''}`);
  if (cond) pass++; else fail++;
}

async function main() {
  console.log(`\n── $DARKCOIN plumbing self-test ─────────────────────────────────`);
  console.log(`RPC:  ${RPC}`);
  console.log(`Mint: ${MINT}\n`);

  // 1. Lib initializes
  try {
    styxx.init();
    check('init()', true);
  } catch (e) {
    check('init()', false, e.message);
    process.exit(1);
  }

  // 2. Keypair generate + encrypt/decrypt round-trip
  const agent = styxx.generateAgentKeypair();
  const enc = styxx.encryptPrivkey(agent.secretKey);
  const dec = styxx.keypairFromEncrypted(enc);
  check('keypair round-trip through AES-GCM',
    dec.publicKey.equals(agent.publicKey) &&
    Buffer.from(dec.secretKey).equals(Buffer.from(agent.secretKey)),
    `pubkey=${agent.publicKey.toBase58().slice(0, 12)}…`
  );

  // 3. Wrong-key decrypt fails (GCM auth)
  try {
    const badLib = require('../lib/solana-darkcoin');
    // swap enc key — simulate by re-calling with bad key
    const badKey = crypto.randomBytes(32).toString('hex');
    const origKey = process.env.WALLET_ENC_KEY;
    process.env.WALLET_ENC_KEY = badKey;
    delete require.cache[require.resolve('../lib/solana-darkcoin')];
    const reloaded = require('../lib/solana-darkcoin');
    reloaded.init();
    let threw = false;
    try { reloaded.keypairFromEncrypted(enc); } catch { threw = true; }
    check('wrong-key decrypt fails (GCM auth intact)', threw);
    process.env.WALLET_ENC_KEY = origKey;
    delete require.cache[require.resolve('../lib/solana-darkcoin')];
  } catch (e) {
    check('wrong-key decrypt fails', false, e.message);
  }

  // Re-init with original key
  const styxxFinal = require('../lib/solana-darkcoin');
  styxxFinal.init();

  // 4. RPC reachable
  const conn = new Connection(RPC, 'confirmed');
  let slot;
  try {
    slot = await conn.getSlot();
    check('RPC reachable', slot > 0, `slot ${slot}`);
  } catch (e) {
    check('RPC reachable', false, e.message);
    return;
  }

  // 5. Mint exists + decimals (Token-2022)
  let mintInfo;
  try {
    mintInfo = await getMint(conn, new PublicKey(MINT), 'confirmed', TOKEN_2022_PROGRAM_ID);
    check('$DARKCOIN mint exists on mainnet (Token-2022)', true,
      `supply=${mintInfo.supply.toString()} decimals=${mintInfo.decimals}`);
    check('decimals match constant (6)', mintInfo.decimals === 6);
  } catch (e) {
    check('$DARKCOIN mint exists on mainnet', false, e.message);
  }

  // 6. ATA derivation (Token-2022)
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const aliceATA = await getAssociatedTokenAddress(new PublicKey(MINT), alice.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const bobATA = await getAssociatedTokenAddress(new PublicKey(MINT), bob.publicKey, false, TOKEN_2022_PROGRAM_ID);
  check('ATA derivation (Token-2022)', aliceATA.toBase58().length === 44 && !aliceATA.equals(bobATA),
    `alice=${aliceATA.toBase58().slice(0, 12)}…`);

  // 7. Transaction building (not submitted) — transferChecked for Token-2022
  try {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }));
    tx.add(createTransferCheckedInstruction(
      aliceATA, new PublicKey(MINT), bobATA, alice.publicKey,
      BigInt(1_000_000), 6, [], TOKEN_2022_PROGRAM_ID
    ));
    tx.feePayer = styxxFinal.getTreasury().publicKey;
    const { blockhash } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.partialSign(styxxFinal.getTreasury(), alice);
    const serialized = tx.serialize();
    check('transaction builds + signs (Token-2022 transferChecked)',
      serialized.length > 100 && serialized.length < 2000,
      `${serialized.length} bytes`);
  } catch (e) {
    check('transaction builds + signs', false, e.message);
  }

  // 8. Live balance query of a known pubkey (should return 0 for empty, no throw)
  try {
    const bal = await styxxFinal.getDarkcoinBalance(alice.publicKey.toBase58());
    check('getDarkcoinBalance on empty wallet returns 0', bal === 0, `balance=${bal}`);
  } catch (e) {
    check('getDarkcoinBalance on empty wallet', false, e.message);
  }

  // 9. Treasury balance fetch (our fresh random keypair has no SOL / no ATA)
  try {
    const t = await styxxFinal.getTreasuryBalances();
    check('getTreasuryBalances returns shape',
      'pubkey' in t && 'sol' in t && 'styxx' in t,
      `sol=${t.sol} styxx=${t.styxx}`);
  } catch (e) {
    check('getTreasuryBalances', false, e.message);
  }

  console.log(`\n── ${pass} passed, ${fail} failed ─────────────────────────────\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
