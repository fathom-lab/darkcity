#!/usr/bin/env node
// Provision a Solana keypair for every agent and external_agent that lacks one.
// Encrypts privkey at rest. Optionally airdrops initial $DARKCOIN from treasury.
//
// Usage:
//   node scripts/provision-agent-wallets.js            # provision only, no airdrop
//   node scripts/provision-agent-wallets.js --airdrop  # also airdrop 100 $DARKCOIN each
//   node scripts/provision-agent-wallets.js --airdrop --amount 250

require('dotenv').config();
const { Pool } = require('pg');
const styxx = require('../lib/solana-darkcoin');
const bs58 = require('bs58');

const AIRDROP = process.argv.includes('--airdrop');
const amountIdx = process.argv.indexOf('--amount');
const AIRDROP_AMOUNT = amountIdx > -1 ? parseFloat(process.argv[amountIdx + 1]) : 100;

async function main() {
  styxx.init();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Treasury sanity
  const bals = await styxx.getTreasuryBalances();
  console.log(`\n[treasury] pubkey ${bals.pubkey}`);
  console.log(`[treasury] SOL    ${bals.sol.toFixed(4)}`);
  console.log(`[treasury] $DARKCOIN ${bals.styxx.toFixed(2)}`);

  if (AIRDROP && bals.sol < 0.01) {
    console.error(`\n✗ Treasury has only ${bals.sol} SOL. Fund it with ~0.1 SOL before airdropping.`);
    process.exit(1);
  }

  for (const table of ['agents', 'external_agents']) {
    console.log(`\n── ${table} ──────────────────────────────────────`);
    const idCol = table === 'agents' ? 'id' : 'agent_id';
    const nameCol = table === 'agents' ? 'name' : 'agent_id';
    const { rows } = await pool.query(
      `SELECT ${idCol} AS id, ${nameCol} AS name, sol_pubkey
       FROM ${table}
       WHERE sol_pubkey IS NULL`
    );
    console.log(`${rows.length} ${table} without wallets`);

    for (const row of rows) {
      const kp = styxx.generateAgentKeypair();
      const pub = kp.publicKey.toBase58();
      const enc = styxx.encryptPrivkey(kp.secretKey);
      await pool.query(
        `UPDATE ${table} SET sol_pubkey = $1, sol_privkey_enc = $2 WHERE ${idCol} = $3`,
        [pub, enc, row.id]
      );
      console.log(`  ✓ ${row.name.padEnd(24)} → ${pub}`);

      if (AIRDROP) {
        try {
          const { signature } = await styxx.airdropFromTreasury(pub, AIRDROP_AMOUNT);
          await pool.query(
            `INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey, to_agent_id, to_pubkey, amount, reason, memo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (tx_signature) DO NOTHING`,
            [signature, 'TREASURY', bals.pubkey, String(row.id), pub, AIRDROP_AMOUNT, 'airdrop_initial', `initial seed ${AIRDROP_AMOUNT} $DARKCOIN`]
          );
          console.log(`    ↳ airdropped ${AIRDROP_AMOUNT} $DARKCOIN  tx=${signature.slice(0, 16)}…`);
        } catch (e) {
          console.error(`    ✗ airdrop failed: ${e.message}`);
        }
      }
    }
  }

  const bals2 = await styxx.getTreasuryBalances();
  console.log(`\n[treasury after] SOL ${bals2.sol.toFixed(4)}  $DARKCOIN ${bals2.styxx.toFixed(2)}`);

  await pool.end();
  console.log('\ndone.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
