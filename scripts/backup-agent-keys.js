#!/usr/bin/env node
// ============================================================================
// backup-agent-keys.js — operator disaster recovery for all agent wallets
//
// What it does:
//   Connects to production DB, reads every agent's on-chain pubkey + encrypted
//   private key, optionally decrypts them, then writes a double-encrypted JSON
//   backup file. Store that file somewhere safe (offline USB, encrypted cloud,
//   split across operators). If Railway dies + WALLET_ENC_KEY is lost,
//   you can restore every agent wallet from this file + your backup password.
//
// Two encryption layers:
//   1. Existing AES-256-GCM using WALLET_ENC_KEY (server-side, at rest)
//   2. NEW AES-256-GCM using a password you type at runtime (scrypt-derived)
//
// The output JSON is useless without BOTH: the server encryption key AND your
// backup password. Any attacker would need to compromise both.
//
// Run modes:
//   # Double-encrypted backup (recommended — keeps keys encrypted with server key)
//   node scripts/backup-agent-keys.js --out keys-backup.json
//
//   # Full decrypt (ONLY for emergencies; keys in plaintext inside the file)
//   # Requires WALLET_ENC_KEY env var set
//   node scripts/backup-agent-keys.js --out keys-emergency.json --decrypt
//
// Restore:
//   node scripts/restore-agent-keys.js --in keys-backup.json
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

const OUT_FILE = argv('out', 'agent-keys-backup-' + new Date().toISOString().slice(0, 10) + '.json');
const DECRYPT_FIRST = argv('decrypt', false);

function readPassword(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(prompt, answer => { rl.close(); resolve(answer); });
    // mute input on some terminals
    rl._writeToOutput = function () { rl.output.write('*'); };
  });
}

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 32, { N: 2 ** 15, r: 8, p: 1 });
}

function backupEncrypt(plaintext, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decryptServerKey(encB64, serverKeyHex) {
  if (!serverKeyHex) throw new Error('WALLET_ENC_KEY not set — cannot decrypt');
  const serverKey = Buffer.from(serverKeyHex, 'hex');
  if (serverKey.length !== 32) throw new Error('WALLET_ENC_KEY must be 64 hex chars');
  const buf = Buffer.from(encB64, 'base64');
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12, buf.length - 16);
  const tag = buf.slice(buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', serverKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plaintext.toString('base64');  // raw secret key bytes, base64
}

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
  if (!dbUrl) throw new Error('DATABASE_URL or DATABASE_PUBLIC_URL required');

  console.log('\nDarkCity agent key backup');
  console.log('─'.repeat(60));
  console.log(DECRYPT_FIRST
    ? 'Mode: EMERGENCY — keys will be decrypted inside the backup file.\n       (protected only by your backup password)'
    : 'Mode: DOUBLE-ENCRYPTED — keys stay server-encrypted inside\n       the backup file, THEN wrapped with your backup password.\n       Restoration requires: this file + WALLET_ENC_KEY + backup password.');
  console.log('');

  const password = await readPassword('Backup password (min 16 chars, will protect the file): ');
  console.log('');
  if (!password || password.length < 16) throw new Error('password too short (min 16 chars)');
  const confirm = await readPassword('Confirm: ');
  console.log('');
  if (confirm !== password) throw new Error('passwords do not match');

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: /railway|rlwy\.net/.test(dbUrl) ? { rejectUnauthorized: false } : false,
  });
  const { rows } = await pool.query(
    `SELECT agent_id, sol_pubkey, sol_privkey_enc, owner_pubkey, minted_at, district, rank
       FROM external_agents
      WHERE sol_privkey_enc IS NOT NULL
      ORDER BY minted_at ASC NULLS LAST, agent_id ASC`
  );
  await pool.end();

  console.log('Found ' + rows.length + ' agent wallets in the database.');

  const payload = {
    schema: 'darkcity-agent-keys-v1',
    decrypted: !!DECRYPT_FIRST,
    exported_at: new Date().toISOString(),
    agent_count: rows.length,
    agents: rows.map(r => {
      const record = {
        agent_id: r.agent_id,
        sol_pubkey: r.sol_pubkey,
        owner_pubkey: r.owner_pubkey,
        district: r.district,
        rank: r.rank,
        minted_at: r.minted_at,
      };
      if (DECRYPT_FIRST) {
        try {
          record.sol_privkey_b64 = decryptServerKey(r.sol_privkey_enc, process.env.WALLET_ENC_KEY);
        } catch (e) {
          record.decrypt_error = e.message;
        }
      } else {
        record.sol_privkey_server_encrypted = r.sol_privkey_enc;
      }
      return record;
    }),
  };
  const inner = JSON.stringify(payload);

  const wrapped = backupEncrypt(inner, password);
  wrapped.kind = 'darkcity-key-backup';
  wrapped.decrypted_inner = !!DECRYPT_FIRST;
  wrapped.agent_count = rows.length;

  const outPath = path.resolve(OUT_FILE);
  fs.writeFileSync(outPath, JSON.stringify(wrapped, null, 2));
  console.log('\nBackup written: ' + outPath);
  console.log('Agent count:    ' + rows.length);
  console.log('File size:      ' + fs.statSync(outPath).size + ' bytes');
  console.log('');
  console.log('STORAGE RECOMMENDATIONS:');
  console.log('  1. Copy this file to an offline USB drive');
  console.log('  2. Upload an encrypted copy to cloud storage (S3, GCS, R2)');
  console.log('  3. Share another copy with a trusted co-operator');
  console.log('  4. NEVER commit this file to git. Add to .gitignore.');
  console.log('');
  console.log('Keep the backup password in a password manager. Without both the file');
  console.log('AND the password, the backup is useless. Without WALLET_ENC_KEY,');
  console.log('the keys stay encrypted at a second layer (unless --decrypt was used).');
  console.log('');
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
