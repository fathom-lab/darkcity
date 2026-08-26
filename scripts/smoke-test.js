// smoke-test.js — end-to-end health check for a running DarkCity.
// Run against a live server: `node scripts/smoke-test.js [baseUrl]`
// Exit 0 = all green, 1 = a check failed. Read-only except for the register
// flow, which uses a uniquely-named throwaway agent and leaves it (harmless).
//
// This encodes the regression classes the QA fleet found so they can never
// silently come back: pre-mint 500s, admin-auth bypass, epoch-1970 stream
// timestamps, token-leak in copy, dead DaaS endpoint.
'use strict';

const BASE = process.argv[2] || 'http://127.0.0.1:3777';
const CLASSIC = { 'x-classic': '1' };
let pass = 0, fail = 0;
const fails = [];

async function get(pathname, headers = {}) {
  const r = await fetch(BASE + pathname, { headers });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, text, json, headers: r.headers };
}
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; fails.push(name + (detail ? ' — ' + detail : '')); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  console.log(`\nDarkCity smoke test → ${BASE}\n`);

  // ── main site + APIs ──
  const status = await get('/api/status');
  check('/api/status 200', status.status === 200);
  check('/api/status arena shadow', status.json?.arena?.shadow === true, JSON.stringify(status.json?.arena));
  const snap = await get('/api/live/snapshot');
  check('/api/live/snapshot 200', snap.status === 200);
  check('snapshot has agents', (snap.json?.totals?.agents ?? 0) > 0, 'agents=' + snap.json?.totals?.agents);
  check('snapshot no /account/null links', !snap.text.includes('/account/null'));

  for (const p of ['/', '/flow', '/arena', '/earn', '/commons', '/how', '/deploy', '/treasury', '/dispatch', '/data']) {
    const r = await get(p);
    check(`page ${p} 200`, r.status === 200, 'status=' + r.status);
  }

  // ── one city, one host ──
  // Every path on the historical hosts 301s to darkcity.wtf; the classic city
  // (map, Living Agents, dossiers) serves canonically on the main host.
  // node:http here because fetch() strips a spoofed Host header and follows
  // redirects — raw requests do neither.
  const http = require('node:http');
  const rawGet = (pathname, hostname) => new Promise((resolve, reject) => {
    const u = new URL(BASE);
    http.get({ host: u.hostname, port: u.port, path: pathname, headers: hostname ? { Host: hostname } : {} },
      (r) => { r.resume(); resolve({ status: r.statusCode, location: r.headers.location || '' }); }).on('error', reject);
  });
  for (const [p, host] of [['/', 'app.darkcity.wtf'], ['/map', 'app.darkcity.wtf'], ['/citizens', 'app.darkcity.wtf'], ['/', 'www.darkcity.wtf']]) {
    const r = await rawGet(p, host);
    check(`${host}${p} 301 -> canonical`, r.status === 301 && r.location === 'https://darkcity.wtf' + p, `status=${r.status} loc=${r.location}`);
  }
  const living = await get('/citizens');
  check('/citizens is Living Agents', living.status === 200 && /LIVING AGENTS/i.test(living.text), 'status=' + living.status);
  const cdoss = await get('/citizen/MORRIGAN');
  check('/citizen/:name classic dossier', cdoss.status === 200 && /DOSSIER/i.test(cdoss.text), 'status=' + cdoss.status);
  const adash = await get('/agent/MORRIGAN');
  check('/agent/:name classic dashboard', adash.status === 200 && /AGENT DASHBOARD/i.test(adash.text), 'status=' + adash.status);
  for (const asset of ['/lib/portraitEngine.js', '/public/mini-organism.js', '/public/profile-organism.js']) {
    const r = await get(asset);
    check(`asset ${asset} 200`, r.status === 200, 'status=' + r.status);
  }
  for (const [from, to] of [['/join', '/deploy'], ['/contracts', '/earn'], ['/scanner', '/map']]) {
    const r = await rawGet(from, null);
    check(`${from} redirects -> ${to}`, r.status === 302 && r.location === to, `status=${r.status} loc=${r.location}`);
  }

  // ── pre-mint 500 regression class ──
  for (const p of ['/api/dispatch', '/api/treasury/stats']) {
    const r = await get(p);
    check(`${p} not 500`, r.status !== 500, 'status=' + r.status);
  }
  const mq = await fetch(BASE + '/api/mint/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"owner_pubkey":"x","agent_name":"SMOKE"}' });
  // 503 pre-mint (honest refusal), 200/201 once the token is live and quoting.
  check('/api/mint/quote honest', [200, 201, 503].includes(mq.status), 'status=' + mq.status);

  // ── depth DaaS never dead ──
  const score = await get('/api/depth/score?text=leverage the asymmetry because the edge compounds over 3 rounds');
  check('/api/depth/score 200', score.status === 200);
  check('/api/depth/score returns a number', typeof score.json?.score === 'number', JSON.stringify(score.json));

  // ── security: admin auth must reject no-header ──
  const admin = await get('/api/admin/status');
  check('admin no-header rejected', admin.status === 401 || admin.status === 403, 'status=' + admin.status);
  // CORS must not reflect an arbitrary origin
  const cors = await get('/api/status', { Origin: 'https://evil.example.com' });
  const acao = cors.headers.get('access-control-allow-origin');
  check('CORS does not reflect evil origin', acao !== 'https://evil.example.com', 'acao=' + acao);

  // ── classic bridge (x-classic) ──
  const cz = await get('/api/citizens', CLASSIC);
  check('classic /api/citizens wrapped', Array.isArray(cz.json?.citizens), 'total=' + cz.json?.total);
  const stream = await get('/api/stream?limit=5', CLASSIC);
  const anyEvent = stream.json?.events?.[0];
  check('classic stream timestamps not 1970', !anyEvent || !String(anyEvent.created_at).startsWith('1970'), anyEvent?.created_at);
  const lb = await get('/api/depth/leaderboard', CLASSIC);
  check('depth leaderboard numeric', Array.isArray(lb.json) && (lb.json.length === 0 || typeof lb.json[0].mean_depth === 'number'));

  // ── token/brand honesty in rendered copy ──
  for (const p of ['/', '/flow', '/earn']) {
    const r = await get(p);
    check(`${p} no old-mint leak`, !r.text.includes(['Dxw3','u4KxN32'].join('')));
    check(`${p} no $STYXX leak`, !/\$STYXX/.test(r.text));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFAILURES:\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('\nALL GREEN\n');
  process.exit(0);
})().catch((e) => { console.error('smoke test crashed:', e.message); process.exit(1); });
