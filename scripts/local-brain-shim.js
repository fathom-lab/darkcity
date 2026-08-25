// ============================================================================
// local-brain-shim.js — Anthropic Messages API → llama.cpp, on your own GPU.
//
// The city's three LLM call sites (npc-brain, darkcoin-chat, arena narration)
// speak the Anthropic Messages format. When API credits run dry — or when you
// simply want the city to think for free — this shim accepts those calls at
// ANTHROPIC_BASE_URL and forwards them to a local llama-server
// (/v1/chat/completions, OpenAI format), translating both directions.
//
// The callers read exactly: data.content[0].text — so that is exactly what we
// guarantee. Auth headers are accepted and ignored; nothing leaves the box.
//
//   env: SHIM_PORT (default 3799), LLAMA_URL (default http://127.0.0.1:8600)
//   pm2: darkcity-brain-shim (see docs/DARKCOIN_DEPLOY.md)
// ============================================================================
'use strict';

const http = require('http');

const PORT = parseInt(process.env.SHIM_PORT || '3799', 10);
const LLAMA_URL = (process.env.LLAMA_URL || 'http://127.0.0.1:8600').replace(/\/$/, '');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 2_000_000) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, llama: LLAMA_URL }));
  }
  if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'not_found' }));
  }
  try {
    const body = JSON.parse(await readBody(req) || '{}');
    const messages = [];
    if (body.system) messages.push({ role: 'system', content: String(body.system) });
    for (const m of body.messages || []) {
      messages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string'
          ? m.content
          : (m.content || []).map((b) => b.text || '').join('\n'),
      });
    }

    const upstream = await fetch(LLAMA_URL + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'local',
        messages,
        max_tokens: Math.min(body.max_tokens || 1024, 2048),
        temperature: body.temperature ?? 0.8,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 300);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ type: 'error', error: { type: 'upstream_error', message: `llama ${upstream.status}: ${detail}` } }));
    }

    const out = await upstream.json();
    const text = out.choices?.[0]?.message?.content ?? '';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'msg_local_' + Date.now().toString(36),
      type: 'message',
      role: 'assistant',
      model: body.model || 'local',
      content: [{ type: 'text', text }],
      stop_reason: out.choices?.[0]?.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
      usage: {
        input_tokens: out.usage?.prompt_tokens ?? 0,
        output_tokens: out.usage?.completion_tokens ?? 0,
      },
    }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ type: 'error', error: { type: 'shim_error', message: e.message } }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[brain-shim] anthropic-compat on http://127.0.0.1:${PORT} -> ${LLAMA_URL}`);
});
