// ============================================================================
// treasury-send.js — OPERATOR-RUN treasury transfer
//
// This script is meant to be run BY YOU, on your machine, with your
// treasury key in your own env. Not invoked by the server, not scheduled,
// not automated. Manual button-press only.
//
// It prompts you twice before anything moves. There's no --force flag.
//
// Usage:
//   # 1. export the key (one line, from Railway):
//   export STYXX_TREASURY_PRIVKEY='...'
//   export STYXX_WALLET_ENC_KEY='...'   # needed by lib/solana-styxx
//
//   # 2. run it:
//   node scripts/treasury-send.js <destination_pubkey> <amount_or_max>
//
//   # Examples:
//   node scripts/treasury-send.js H2XKdQGZETi19mzMD21SApEPXDZNMcxW5VCqQ3cEj5e6 500000
//   node scripts/treasury-send.js H2XKdQGZETi19mzMD21SApEPXDZNMcxW5VCqQ3cEj5e6 max
// ============================================================================

'use strict';

require('dotenv').config();
const readline = require('readline');
const { PublicKey } = require('@solana/web3.js');
const styxx = require('../lib/solana-styxx');

const [, , DEST_PUBKEY, AMOUNT_ARG] = process.argv;
if (!DEST_PUBKEY || !AMOUNT_ARG) {
  console.error('Usage: node scripts/treasury-send.js <destination_pubkey> <amount_or_max>');
  process.exit(1);
}

let DEST;
try { DEST = new PublicKey(DEST_PUBKEY); }
catch { console.error('Invalid destination pubkey:', DEST_PUBKEY); process.exit(1); }

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, a => { rl.close(); res(a.trim()); }));
}

async function main() {
  styxx.init();
  const treasury = styxx.getTreasury();
  const treasuryPubkey = treasury.publicKey.toBase58();

  const bal = Number(await styxx.getBalance(treasuryPubkey));
  const amount = AMOUNT_ARG === 'max' ? bal : Number(AMOUNT_ARG);

  if (isNaN(amount) || amount <= 0) { console.error('Invalid amount:', AMOUNT_ARG); process.exit(1); }
  if (amount > bal) { console.error(`Amount ${amount.toLocaleString()} exceeds treasury balance ${bal.toLocaleString()}`); process.exit(1); }

  console.log('\n──────────────────────────────────────────────────────');
  console.log(' TREASURY TRANSFER · MANUAL CONFIRMATION REQUIRED');
  console.log('──────────────────────────────────────────────────────');
  console.log(' From        :', treasuryPubkey);
  console.log(' To          :', DEST.toBase58());
  console.log(' Amount      :', amount.toLocaleString(), '$STYXX');
  console.log(' Balance now :', bal.toLocaleString(), '$STYXX');
  console.log(' After send  :', (bal - amount).toLocaleString(), '$STYXX');
  if (AMOUNT_ARG === 'max' || amount / bal > 0.5) {
    console.log('');
    console.log(' ⚠  WARNING: this moves ≥50% of the treasury.');
    console.log(' ⚠  Arena payouts, holder payouts, founder cuts, and');
    console.log(' ⚠  distribution pulses draw from this balance.');
  }
  console.log('──────────────────────────────────────────────────────\n');

  const a1 = await ask(' Type the destination pubkey again to confirm: ');
  if (a1 !== DEST.toBase58()) { console.error('\n Destination mismatch. Aborted.'); process.exit(1); }

  const a2 = await ask(' Type the exact amount (' + amount + ') to confirm: ');
  if (Number(a2) !== amount) { console.error('\n Amount mismatch. Aborted.'); process.exit(1); }

  const a3 = await ask(' Type "SEND" to execute: ');
  if (a3 !== 'SEND') { console.error('\n Did not type SEND. Aborted.'); process.exit(1); }

  console.log('\n signing and submitting...');
  const { signature } = await styxx.airdropFromTreasury(DEST.toBase58(), amount);

  console.log('\n ✓ sent');
  console.log('   amount    :', amount.toLocaleString(), '$STYXX');
  console.log('   to        :', DEST.toBase58());
  console.log('   signature :', signature);
  console.log('   solscan   : https://solscan.io/tx/' + signature);

  // Log to distribution_events if we have a pool
  try {
    const { Pool } = require('pg');
    const p = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await p.query(
      `INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey, to_agent_id, to_pubkey, amount, reason, memo)
       VALUES ($1, 'TREASURY', $2, null, $3, $4, 'operator_transfer', $5)
       ON CONFLICT (tx_signature) DO NOTHING`,
      [signature, treasuryPubkey, DEST.toBase58(), amount, 'manual treasury-send.js']
    );
    await p.end();
    console.log('   audit log : recorded in styxx_transfers');
  } catch (e) {
    console.log('   audit log : SKIPPED (' + e.message + ')');
  }
}

main().catch(e => { console.error('\n failed:', e.message); process.exit(1); });
