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

  // ── pre-mint 500 regression class ──
  for (const p of ['/api/dispatch', '/api/treasury/stats']) {
    const r = await get(p);
    check(`${p} not 500`, r.status !== 500, 'status=' + r.status);
  }
  const mq = await fetch(BASE + '/api/mint/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"owner_pubkey":"x","agent_name":"SMOKE"}' });
  check('/api/mint/quote honest pre-mint', mq.status === 503 || mq.status === 201, 'status=' + mq.status);

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
    check(`${p} no old-mint leak`, !r.text.includes('Dxw3u4KxN32'));
    check(`${p} no $STYXX leak`, !/\$STYXX/.test(r.text));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFAILURES:\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('\nALL GREEN\n');
  process.exit(0);
})().catch((e) => { console.error('smoke test crashed:', e.message); process.exit(1); });
