#!/usr/bin/env node
// Safe treasury generator — writes privkey + enc key to a local gitignored file.
// Only the pubkey is printed to stdout (safe to paste anywhere).
//
// Usage: node scripts/gen-treasury-safe.js

const { Keypair } = require('@solana/web3.js');
const crypto = require('crypto');
const bs58 = require('bs58');
const fs = require('fs');
const path = require('path');

const kp = Keypair.generate();
const privB58 = bs58.encode(kp.secretKey);
const pub = kp.publicKey.toBase58();
const encKey = crypto.randomBytes(32).toString('hex');

const outPath = path.join(__dirname, '..', '.env.styxx-treasury.local');
const fileContent = `# DARKCITY $DARKCOIN TREASURY — local-only secrets
# Generated ${new Date().toISOString()}
# This file is gitignored. Never commit. Never paste privkey into chat or logs.
# Copy these three lines into Railway → Variables.

TREASURY_PRIVKEY=${privB58}
WALLET_ENC_KEY=${encKey}
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Treasury pubkey (safe to share — this is where you send SOL + $DARKCOIN):
# ${pub}
`;

fs.writeFileSync(outPath, fileContent, { mode: 0o600 });

// eslint-disable-next-line no-console
console.log('');
console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  DARKCITY STYXX TREASURY — safe generator                         ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('Secrets written to (gitignored, mode 0600):');
console.log('  ' + outPath);
console.log('');
console.log('────────────────────────────────────────────────────────────────────');
console.log('  TREASURY PUBKEY (fund this):');
console.log('');
console.log('    ' + pub);
console.log('');
console.log('  Send:');
console.log('    • ~0.1 SOL     (tx fees for ~10k trades)');
console.log('    • 5000 $DARKCOIN  (mint: Dxw3u4KxN32KpSdHSq4TkwjfMPJTPeosa22JXN15pump)');
console.log('');
console.log('  Verify: https://solscan.io/account/' + pub);
console.log('────────────────────────────────────────────────────────────────────');
console.log('');
console.log('Next: after funding completes, copy the 3 env vars from');
console.log('  ' + outPath);
console.log('into Railway → Variables → darkcity-backend service.');
console.log('');
