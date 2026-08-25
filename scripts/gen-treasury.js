#!/usr/bin/env node
// Generate a Solana treasury keypair + AES-256 master key.
// Prints both. You paste them into Railway env vars. Fund the pubkey.
//
// Usage: node scripts/gen-treasury.js

const { Keypair } = require('@solana/web3.js');
const crypto = require('crypto');
const bs58 = require('bs58');

const kp = Keypair.generate();
const privB58 = bs58.encode(kp.secretKey);
const pub = kp.publicKey.toBase58();

const encKey = crypto.randomBytes(32).toString('hex');

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  DARKCITY STYXX TREASURY — ONE-TIME SETUP                         ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

console.log('── Railway env vars (paste these) ──────────────────────────────');
console.log(`TREASURY_PRIVKEY=${privB58}`);
console.log(`WALLET_ENC_KEY=${encKey}`);
console.log(`SOLANA_RPC_URL=https://api.mainnet-beta.solana.com`);
console.log('\n── Fund this address ────────────────────────────────────────────');
console.log(`PUBKEY: ${pub}`);
console.log(`Send:   ~0.1 SOL  (tx fees for ~10k trades)`);
console.log(`Send:   5000 $DARKCOIN  (mint: <mint from lib/token-config>)`);
console.log('\n── Verify on explorer ───────────────────────────────────────────');
console.log(`https://solscan.io/account/${pub}`);
console.log('\nDO NOT COMMIT THE PRIVKEY. Paste it into Railway only.\n');
