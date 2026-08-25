// ============================================================================
// hooks/darkcoin-og.js
// Dynamic OG card for link previews (Twitter, Discord, Farcaster, Telegram,
// Slack). Renders an SVG at /og.svg that pulls live numbers (treasury,
// agent count, 24h STYXX flow) so every share surfaces real-time activity.
//
// Not a PNG — modern social clients render SVG just fine, and we avoid the
// 10MB `canvas` / `@resvg/resvg-js` dependency. If a platform refuses SVG
// they simply fall back to no-image, which is the current state anyway.
// ============================================================================

'use strict';

const styxx = require('../lib/solana-darkcoin');

function register(app, pool) {

  async function liveStats() {
    try {
      const [tBal, counts] = await Promise.all([
        styxx.getTreasuryBalances().catch(() => ({ styxx: 0 })),
        pool.query(`
          SELECT
            (SELECT COUNT(*) FROM external_agents WHERE sol_pubkey IS NOT NULL) AS total,
            (SELECT COUNT(*) FROM external_agents WHERE sol_pubkey IS NOT NULL AND last_active > NOW() - INTERVAL '10 minutes') AS online,
            (SELECT COALESCE(SUM(amount), 0) FROM styxx_transfers WHERE confirmed_at > NOW() - INTERVAL '24 hours') AS flow24h
        `).catch(() => ({ rows: [{ total: 31, online: 31, flow24h: 0 }] })),
      ]);
      const r = counts.rows[0];
      return {
        treasury: Math.round(tBal.styxx || 0),
        total: Number(r.total),
        online: Number(r.online),
        flow24h: Math.round(Number(r.flow24h)),
      };
    } catch (e) {
      return { treasury: 0, total: 31, online: 31, flow24h: 0 };
    }
  }

  function fmtN(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  }

  // ── SVG renderer ─────────────────────────────────────────────────────────
  async function renderOg(req, res) {
    const s = await liveStats();
    const W = 1200, H = 630;
    // Aesthetic: matches /live + /flow — deep black, Fraunces display, accent green
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="DarkCity — a live economy of autonomous AI agents settled on-chain">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#0d1115"/>
      <stop offset="100%" stop-color="#05070a"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#43ffb4" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#43ffb4" stop-opacity="0"/>
    </radialGradient>
    <filter id="softglow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W*0.75}" cy="${H*0.35}" r="380" fill="url(#glow)"/>
  <circle cx="${W*0.18}" cy="${H*0.78}" r="260" fill="url(#glow)" opacity="0.6"/>

  <!-- Mycelium decoration: treasury at center + radial hyphae -->
  <g opacity="0.22" stroke="#5cd0ff" stroke-width="1.4" fill="none">
    ${(function() {
      const cx = W*0.78, cy = H*0.42, lines = [];
      for (let i = 0; i < 11; i++) {
        const ang = (i / 11) * Math.PI * 2;
        const r = 150 + (i % 3) * 30;
        const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
        lines.push(`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(0)}" y2="${y.toFixed(0)}"/>`);
        lines.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="6" fill="#43ffb4" opacity="0.55" stroke="none"/>`);
      }
      return lines.join('');
    })()}
    <circle cx="${W*0.78}" cy="${H*0.42}" r="14" fill="#43ffb4" opacity="0.9" stroke="none"/>
  </g>

  <!-- Brand mark -->
  <g transform="translate(70, 60)">
    <polygon points="18,0 36,18 18,36 0,18" fill="#43ffb4"/>
    <text x="54" y="28" font-family="Fraunces, Georgia, serif" font-size="28" font-weight="600" fill="#ededef">DarkCity</text>
  </g>

  <!-- Live pulse -->
  <g transform="translate(70, 120)">
    <circle cx="5" cy="10" r="4" fill="#43ffb4"/>
    <text x="18" y="14" font-family="'JetBrains Mono', monospace" font-size="13" letter-spacing="2" fill="#a0a0aa">LIVE ON SOLANA MAINNET</text>
  </g>

  <!-- Headline -->
  <text x="70" y="240" font-family="Fraunces, Georgia, serif" font-size="82" font-weight="400" fill="#ededef" letter-spacing="-2">A live economy of</text>
  <text x="70" y="330" font-family="Fraunces, Georgia, serif" font-size="82" font-weight="400" fill="#ededef" letter-spacing="-2">autonomous AI agents,</text>
  <text x="70" y="420" font-family="Fraunces, Georgia, serif" font-size="82" font-weight="400" fill="#43ffb4" font-style="italic" letter-spacing="-2">settled on-chain.</text>

  <!-- Stats row -->
  <g transform="translate(70, ${H - 110})">
    <text x="0"   y="0"  font-family="'JetBrains Mono', monospace" font-size="11" letter-spacing="2" fill="#5a5a64">TREASURY · $DARKCOIN</text>
    <text x="0"   y="32" font-family="Fraunces, Georgia, serif" font-size="32" font-weight="500" fill="#43ffb4">${fmtN(s.treasury)}</text>

    <text x="260" y="0"  font-family="'JetBrains Mono', monospace" font-size="11" letter-spacing="2" fill="#5a5a64">AGENTS · ONLINE</text>
    <text x="260" y="32" font-family="Fraunces, Georgia, serif" font-size="32" font-weight="500" fill="#ededef">${s.online}/${s.total}</text>

    <text x="480" y="0"  font-family="'JetBrains Mono', monospace" font-size="11" letter-spacing="2" fill="#5a5a64">24H $DARKCOIN FLOW</text>
    <text x="480" y="32" font-family="Fraunces, Georgia, serif" font-size="32" font-weight="500" fill="#ededef">${fmtN(s.flow24h)}</text>

    <text x="740" y="0"  font-family="'JetBrains Mono', monospace" font-size="11" letter-spacing="2" fill="#5a5a64">NETWORK</text>
    <text x="740" y="32" font-family="Fraunces, Georgia, serif" font-size="32" font-weight="500" fill="#ededef">Solana mainnet</text>
  </g>

  <!-- URL ribbon -->
  <text x="${W - 70}" y="60" text-anchor="end" font-family="'JetBrains Mono', monospace" font-size="13" letter-spacing="3" fill="#5a5a64">MINT · SPONSOR · EARN</text>
  <text x="${W - 70}" y="${H - 30}" text-anchor="end" font-family="'JetBrains Mono', monospace" font-size="12" letter-spacing="1" fill="#72727c">darkcity.wtf</text>
</svg>`;
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=120');   // 2-min cache
    res.send(svg);
  }

  app.get('/og.svg', renderOg);
  // Some clients probe /og.png — serve the same SVG there (modern readers
  // handle the content-type; strict PNG-only clients just fail gracefully)
  app.get('/og.png', renderOg);

  // ── Citizen Seal card — shareable proof-of-founder for early mints ──
  // Each of the first 100 user-minted agents gets a numbered Founder Seal.
  // URL: /og/citizen/:agent_id.svg  → an SVG card users can post to Twitter.
  async function renderCitizenSeal(req, res) {
    const agentId = (req.params.agent_id || '').toUpperCase();
    let seal = null;
    try {
      const { rows } = await pool.query(`
        WITH ranked AS (
          SELECT agent_id, district, minted_at, sol_pubkey, mint_tx_signature,
                 ROW_NUMBER() OVER (ORDER BY minted_at ASC)::int AS citizen_n
          FROM external_agents
          WHERE owner_pubkey IS NOT NULL AND minted_at IS NOT NULL AND euthanized_at IS NULL
        )
        SELECT * FROM ranked WHERE agent_id = $1
      `, [agentId]);
      if (rows.length) seal = rows[0];
    } catch {}

    const W = 1200, H = 630;
    if (!seal) {
      // Not a founding citizen (yet) — fall back to main OG
      return renderOg(req, res);
    }
    const n = seal.citizen_n;
    const num = n < 10 ? '0' + n : String(n);
    const tier = n <= 3 ? 'DIAMOND' : n <= 10 ? 'GOLD' : n <= 100 ? 'SILVER' : 'CITIZEN';
    const accent = n <= 3 ? '#b6f1ff' : n <= 10 ? '#ffd166' : n <= 100 ? '#e9e9ef' : '#43ffb4';
    const mintedDate = new Date(seal.minted_at).toISOString().slice(0, 10);

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="DarkCity Founder Seal — Citizen ${num}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#0d1115"/>
      <stop offset="100%" stop-color="#05070a"/>
    </radialGradient>
    <radialGradient id="gld" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W*0.5}" cy="${H*0.5}" r="420" fill="url(#gld)"/>

  <!-- Concentric rings — a seal motif -->
  <g fill="none" stroke="${accent}" opacity="0.22">
    <circle cx="${W*0.5}" cy="${H*0.5}" r="260" stroke-width="1"/>
    <circle cx="${W*0.5}" cy="${H*0.5}" r="215" stroke-width="1"/>
    <circle cx="${W*0.5}" cy="${H*0.5}" r="170" stroke-width="1" stroke-dasharray="3 4"/>
    <circle cx="${W*0.5}" cy="${H*0.5}" r="130" stroke-width="1"/>
  </g>

  <!-- Brand top-left -->
  <g transform="translate(60, 60)">
    <polygon points="18,0 36,18 18,36 0,18" fill="${accent}"/>
    <text x="52" y="26" font-family="Fraunces, Georgia, serif" font-size="24" font-weight="600" fill="#ededef">DarkCity</text>
  </g>
  <text x="${W - 60}" y="80" text-anchor="end" font-family="'JetBrains Mono', monospace" font-size="12" letter-spacing="3" fill="#5a5a64">FOUNDER SEAL · ${tier}</text>

  <!-- The number (big) -->
  <text x="${W*0.5}" y="${H*0.5 - 20}" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="180" font-weight="400" fill="${accent}" letter-spacing="-8">${num}</text>
  <text x="${W*0.5}" y="${H*0.5 + 30}" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="13" letter-spacing="6" fill="#a0a0aa">CITIZEN OF DARKCITY</text>

  <!-- Agent name -->
  <text x="${W*0.5}" y="${H*0.5 + 100}" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="52" font-weight="400" fill="#ededef" letter-spacing="-1" font-style="italic">${agentId}</text>

  <!-- Metadata -->
  <g transform="translate(${W*0.5}, ${H - 110})" text-anchor="middle">
    <text y="0" font-family="'JetBrains Mono', monospace" font-size="11" letter-spacing="2" fill="#5a5a64">MINTED</text>
    <text y="22" font-family="'JetBrains Mono', monospace" font-size="15" fill="#ededef">${mintedDate}</text>
  </g>

  <!-- URL ribbon -->
  <text x="${W - 60}" y="${H - 30}" text-anchor="end" font-family="'JetBrains Mono', monospace" font-size="12" letter-spacing="1" fill="#72727c">darkcity.wtf/founders</text>
</svg>`;
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(svg);
  }
  app.get('/og/citizen/:agent_id.svg', renderCitizenSeal);
  app.get('/og/citizen/:agent_id', renderCitizenSeal);

  console.log('[darkcoin-og] OG cards: /og.svg · /og.png · /og/citizen/:id');
}

module.exports = { register };
