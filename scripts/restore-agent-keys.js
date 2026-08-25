#!/usr/bin/env node
// ============================================================================
// restore-agent-keys.js — disaster recovery for a lost Railway deploy
//
// Takes a backup file created by backup-agent-keys.js and restores the
// encrypted private keys into a fresh database. Prints reconciliation summary.
//
// Usage:
//   node scripts/restore-agent-keys.js --in keys-backup.json
//   node scripts/restore-agent-keys.js --in keys-backup.json --dry-run
// ============================================================================

'use strict';

const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
function argv(name, def) {
  const i = args.indexOf('--' + name);
  if (i < 0) return def;
  if (i === args.length - 1 || args[i + 1].startsWith('--')) return true;
  return args[i + 1];
}

const IN_FILE = argv('in');
const DRY_RUN = argv('dry-run', false);

if (!IN_FILE) {
  console.error('Usage: node restore-agent-keys.js --in <backup.json> [--dry-run]');
  process.exit(1);
}

function readPassword(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(prompt, a => { rl.close(); resolve(a); });
    rl._writeToOutput = function () { rl.output.write('*'); };
  });
}

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 32, { N: 2 ** 15, r: 8, p: 1 });
}

function backupDecrypt(wrapped, password) {
  const salt = Buffer.from(wrapped.salt, 'base64');
  const iv = Buffer.from(wrapped.iv, 'base64');
  const ct = Buffer.from(wrapped.ct, 'base64');
  const tag = Buffer.from(wrapped.tag, 'base64');
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
  if (!dbUrl) throw new Error('DATABASE_URL or DATABASE_PUBLIC_URL required');

  const wrapped = JSON.parse(fs.readFileSync(path.resolve(IN_FILE), 'utf8'));
  if (wrapped.kind !== 'darkcity-key-backup') {
    throw new Error('file does not look like a DarkCity key backup');
  }
  console.log('\nDarkCity agent key RESTORE');
  console.log('─'.repeat(60));
  console.log('File:          ' + path.resolve(IN_FILE));
  console.log('Agent count:   ' + (wrapped.agent_count || '?'));
  console.log('Decrypted inner: ' + (wrapped.decrypted_inner ? 'YES (plaintext keys inside)' : 'NO (server-encrypted inside)'));
  console.log('Mode:          ' + (DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (will UPSERT into external_agents)'));
  console.log('');

  const password = await readPassword('Backup password: ');
  console.log('');

  let inner;
  try { inner = JSON.parse(backupDecrypt(wrapped, password)); }
  catch (e) { throw new Error('decrypt failed — wrong password or corrupted file: ' + e.message); }

  if (inner.schema !== 'darkcity-agent-keys-v1') throw new Error('unknown inner schema: ' + inner.schema);
  console.log('Decrypted. Agent records inside: ' + inner.agents.length);

  if (DRY_RUN) {
    console.log('\nDRY RUN — would restore these agents:');
    console.table(inner.agents.map(a => ({
      agent_id: a.agent_id,
      sol_pubkey: (a.sol_pubkey || '').slice(0, 12) + '…',
      has_encrypted: !!a.sol_privkey_server_encrypted,
      has_plaintext: !!a.sol_privkey_b64,
      owner: (a.owner_pubkey || '').slice(0, 10) + '…',
    })));
    return;
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: /railway|rlwy\.net/.test(dbUrl) ? { rejectUnauthorized: false } : false,
  });

  let restored = 0, errors = 0;
  for (const a of inner.agents) {
    try {
      if (inner.decrypted) {
        console.warn('SKIPPING ' + a.agent_id + ' — inner was decrypted; plaintext-key restore not yet wired (would need re-encryption with new WALLET_ENC_KEY)');
        continue;
      }
      if (!a.sol_privkey_server_encrypted) {
        console.warn('SKIPPING ' + a.agent_id + ' — no encrypted privkey in backup');
        errors++;
        continue;
      }
      const r = await pool.query(
        `UPDATE external_agents
            SET sol_privkey_enc = COALESCE(sol_privkey_enc, $2),
                sol_pubkey = COALESCE(sol_pubkey, $3)
          WHERE agent_id = $1 RETURNING agent_id`,
        [a.agent_id, a.sol_privkey_server_encrypted, a.sol_pubkey]
      );
      if (r.rows.length) restored++;
      else console.warn('  no agent row for ' + a.agent_id + ' (skipped)');
    } catch (e) {
      errors++;
      console.error('  ' + a.agent_id + ': ' + e.message);
    }
  }
  await pool.end();

  console.log('\nRestore complete.');
  console.log('  restored: ' + restored);
  console.log('  errors:   ' + errors);
  console.log('');
  console.log('VERIFY: run selftest-darkcoin.js to confirm signing works with the restored keys.');
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
