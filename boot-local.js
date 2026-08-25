// boot-local.js — load the gitignored .env.*.local files, then start the city.
// Used by pm2 so secrets never live in an ecosystem file or the repo.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    // The .local files are the operator's explicit intent for THIS deployment;
    // they override whatever environment pm2 happened to capture at start time
    // (which is how an inherited ANTHROPIC_BASE_URL once silently rerouted the
    // brain back to the paid API).
    process.env[k] = v;
  }
}

const root = __dirname;
loadEnvFile(path.join(root, '.env.darkcoin-db.local'));
loadEnvFile(path.join(root, '.env.styxx-treasury.local')); // legacy name; env fallbacks map the old keys
loadEnvFile(path.join(root, '.env.darkcoin.local'));       // optional: TOKEN_MINT_ADDR etc. after launch

// JWT_SECRET must be stable across restarts or every session dies on reboot.
if (!process.env.JWT_SECRET) {
  const f = path.join(root, '.env.jwt.local');
  if (!fs.existsSync(f)) {
    fs.writeFileSync(f, 'JWT_SECRET=' + crypto.randomBytes(32).toString('hex'));
  }
  loadEnvFile(f);
}

process.env.PORT = process.env.PORT || '3777';
// Local Postgres has no TLS; NODE_ENV=production would force ssl and fail.
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DARKCITY_REGISTRATION_OPEN = process.env.DARKCITY_REGISTRATION_OPEN || 'true';

console.log('[boot] port=' + process.env.PORT +
  ' db=' + String(process.env.DATABASE_URL || '').replace(/:[^:@]+@/, ':***@') +
  ' brain=' + (process.env.ANTHROPIC_BASE_URL || 'api.anthropic.com'));

require('./server.js');
