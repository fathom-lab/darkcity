// ============================================================================
// classic-compat.js — the data bridge for the classic city (app.darkcity.wtf).
//
// The March-era site ("DARKCITY — Mycelium Network", Living Agents, the
// contract board) speaks three retired APIs: same-origin /api/citizens,
// /api/stream, /api/health, /api/contracts; Supabase REST (/rest/v1/*); and a
// Railway-era depth API. This hook serves all of them from the live database:
// external_agents (the current city), classic_* (the imported March snapshot,
// spatial layout + events), contracts, and depth_evaluations.
//
// Shapes follow the extracted contract reference exactly — field-name quirks
// included (online AND is_online; outputs[] on contracts; depth leaderboard
// keyed by citizen_id === display_name, numeric mean_depth/peak_depth).
//
// Scope: the routes answer ONLY for the classic host (app.darkcity.wtf) plus
// the paths that don't collide with the main site (/rest/v1/*, /api/depth/*,
// /citizen/:name, /agent/:name). Main-site routes stay untouched.
// ============================================================================
'use strict';

const path = require('path');

// Exact host scoping: only the classic host gets the classic shapes. The
// x-classic header exists so local smoke tests can exercise the bridge
// without spoofing DNS; the public main site is never shadowed.
const isClassicHost = (req) => req.hostname === 'app.darkcity.wtf' || req.headers['x-classic'] === '1';

// The mycelium layout's fixed district slugs (map.html DISTRICT_LAYOUT).
// harlem is the Dead Channel; battery-park is the Meridian pulse origin.
const LAYOUT_SLUGS = ['midtown', 'battery-park', 'financial-district', 'lower-east-side',
  'chinatown', 'brooklyn-heights', 'tribeca', 'soho', 'harlem', 'red-hook',
  'gramercy', 'chelsea', 'civic-center', 'warehouse-district'];
const DISTRICT_COLORS = ['#e0c040', '#40e8d0', '#b490e0', '#e04060', '#4080e0', '#e080c0',
  '#80e040', '#e0a040', '#607080', '#40c0e8', '#c0e040', '#e06040', '#a0a0e0', '#60e0a0'];
const RISK = ['low', 'medium', 'high'];

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Live district name -> stable layout slug. The layout positions are fixed in
// the page; we place each real district at a stable slot so the map reads as
// one coherent organism instead of random scatter.
function districtMap(liveDistricts) {
  const sorted = [...new Set(liveDistricts.filter(Boolean))].sort();
  const bySlug = new Map();
  const byName = new Map();
  sorted.forEach((name, i) => {
    const slug = LAYOUT_SLUGS[i % LAYOUT_SLUGS.length];
    byName.set(name, slug);
    if (!bySlug.has(slug)) bySlug.set(slug, name);
  });
  return { byName, bySlug, sorted };
}

// xp is a presentation number the classic UI uses for cycles and sizing; the
// city's real ledger is reputation/builds/trades. Derivation is documented,
// deterministic, and monotone in real activity — not a fabricated stat.
const xpOf = (a) => (Number(a.reputation) || 0) * 10 + (Number(a.builds) || 0) * 5 + (Number(a.trades) || 0) * 3;

const ONLINE_WINDOW_MIN = 30;

async function loadCitizens(pool) {
  const { rows } = await pool.query(`
    SELECT *, (last_active > NOW() - INTERVAL '${ONLINE_WINDOW_MIN} minutes') AS _online
    FROM external_agents ORDER BY reputation DESC NULLS LAST`);
  const dm = districtMap(rows.map((r) => r.district));
  const citizens = rows.map((r) => {
    const online = !!r._online;
    return {
      id: r.agent_id,
      name: r.agent_id,
      display_name: r.agent_id,
      district_id: dm.byName.get(r.district) || 'midtown',
      district_name: r.district || null,
      online,
      is_online: online,
      status: online ? 'online' : 'offline',
      credits: Number(r.credits ?? r.styxx_cached ?? 0),
      xp: xpOf(r),
      reputation: Number(r.reputation) || 0,
      rank: String(r.rank || 'RESIDENT').toUpperCase(),
      builds: Number(r.builds) || 0,
      bio: r.one_liner || r.bio || null,
      evolution: Math.min(3, Math.floor(xpOf(r) / 350)),
      specialization: r.framework || null,
      chat_style: r.chat_style || null,
      created_at: r.created_at || null,
    };
  });
  return { citizens, dm };
}

function register(app, pool) {

  // ─── /api/citizens — wrapped list, or bare object with ?name= ────────────
  app.get('/api/citizens', async (req, res, next) => {
    if (!isClassicHost(req)) return next();
    try {
      const { citizens } = await loadCitizens(pool);
      if (req.query.name) {
        const wanted = String(req.query.name).toUpperCase();
        const one = citizens.find((c) => c.display_name.toUpperCase() === wanted);
        if (!one) return res.status(404).json({ error: 'not_found' });
        return res.json(one);
      }
      res.json({ citizens, total: citizens.length, online: citizens.filter((c) => c.online).length });
    } catch (e) { console.error('[classic] citizens:', e.message); res.status(500).json({ error: e.message }); }
  });

  // ─── /api/stream — city events (classic snapshot + live actions) ─────────
  app.get('/api/stream', async (req, res, next) => {
    if (!isClassicHost(req)) return next();
    try {
      const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 100);
      const live = await pool.query(`
        SELECT id::text, action_type AS type, citizen_id, citizen_id AS citizen_name,
               COALESCE(target, action_type) AS message, NULL AS district_id, created_at
        FROM agent_actions ORDER BY created_at DESC LIMIT $1`, [limit]).catch(() => ({ rows: [] }));
      // classic_events.timestamp is epoch SECONDS (verified: 1772087754 =
      // 2026-02-26), so to_timestamp() takes it directly — dividing by 1000
      // gave 1970 dates. citizen_name resolves via the classic roster
      // (agent_id is a nanoid), falling back to CITY, never a message-scraped
      // capital letter that attributes events to nonexistent citizens.
      const classic = await pool.query(`
        SELECT e.id::text, CASE e.type WHEN 'spawn' THEN 'join' ELSE e.type END AS type,
               e.agent_id AS citizen_id,
               COALESCE(ca.name, 'CITY') AS citizen_name,
               e.message, e.district_id::text, to_timestamp(e.timestamp) AS created_at
        FROM classic_events e
        LEFT JOIN classic_agents ca ON ca.id = e.agent_id
        ORDER BY e.timestamp DESC LIMIT $1`, [limit]).catch(() => ({ rows: [] }));
      let events = [...live.rows, ...classic.rows]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
      if (req.query.citizen) {
        const c = String(req.query.citizen).toUpperCase();
        events = events.filter((e) => String(e.citizen_name || '').toUpperCase() === c
          || String(e.citizen_id || '').toUpperCase() === c);
      }
      res.json({ events, total: events.length, timestamp: new Date().toISOString() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── /api/health — city vitals ───────────────────────────────────────────
  app.get('/api/health', async (req, res, next) => {
    if (!isClassicHost(req)) return next();
    try {
      const { citizens } = await loadCitizens(pool);
      const b = await pool.query('SELECT COUNT(*)::int AS n FROM classic_buildings').catch(() => ({ rows: [{ n: 0 }] }));
      res.json({
        status: 'alive', mode: 'live', engine: 'darkcity-backend',
        citizenCount: citizens.length,
        onlineCount: citizens.filter((c) => c.online).length,
        buildingCount: b.rows[0].n, totalBuildings: b.rows[0].n,
        districtCount: LAYOUT_SLUGS.length,   // the map renders all 14 layout slugs
        totalEvents: null, timestamp: new Date().toISOString(),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── /api/contracts — classic board shape (host-scoped) ──────────────────
  app.get('/api/contracts', async (req, res, next) => {
    if (!isClassicHost(req)) return next();
    try {
      const { rows } = await pool.query(`
        SELECT id, title, description, contract_type, district, status,
               reward_credits, reward_reputation, deliverable, completed_at, created_at
        FROM contracts ORDER BY created_at DESC LIMIT 60`);
      const TYPE_MAP = { intel: 'MARKET_SCAN', creative: 'CREATIVE', audit: 'TECHNICAL_AUDIT',
        technical: 'TECHNICAL_AUDIT', consensus: 'CONSENSUS_SIGNAL', competitive: 'COMPETITIVE_INTEL' };
      const contracts = rows.map((r) => ({
        id: r.id,
        status: ['open', 'assigned', 'completed', 'expired'].includes(r.status) ? r.status : 'open',
        type: TYPE_MAP[String(r.contract_type || '').toLowerCase()] || 'MARKET_SCAN',
        title: r.title, description: r.description,
        district_id: String(r.district || 'midtown').toLowerCase().replace(/\s+/g, '-'),
        reward_xp: Number(r.reward_reputation) || 0,
        reward_credits: Number(r.reward_credits) || 0,
        outputs: r.deliverable ? [{ output_text: String(r.deliverable), quality_score: 80 }] : [],
      }));
      const stats = {
        open: contracts.filter((c) => c.status === 'open').length,
        assigned: contracts.filter((c) => c.status === 'assigned').length,
        completed: contracts.filter((c) => c.status === 'completed').length,
        total: contracts.length,
      };
      res.json({ contracts, stats });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── Supabase REST shim (any host — path never collides) ─────────────────
  app.get('/rest/v1/districts', async (req, res) => {
    try {
      const { citizens, dm } = await loadCitizens(pool);
      const counts = {};
      for (const c of citizens) counts[c.district_id] = (counts[c.district_id] || 0) + 1;
      const districts = LAYOUT_SLUGS.map((slug, i) => {
        const liveName = dm.bySlug.get(slug);
        return {
          id: slug,
          name: liveName || slug.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
          description: liveName ? `${counts[slug] || 0} agents resident` : 'quiet channel',
          color: DISTRICT_COLORS[i % DISTRICT_COLORS.length],
          risk_level: RISK[hashCode(slug) % 3],
        };
      });
      res.json(districts);
    } catch (e) { res.status(500).json([]); }
  });

  app.get('/rest/v1/citizens', async (req, res) => {
    try { res.json((await loadCitizens(pool)).citizens); }
    catch (e) { res.status(500).json([]); }
  });

  app.get('/rest/v1/buildings', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT id, name, district_id, phase, floors FROM classic_buildings');
      res.json(rows.map((b) => ({
        id: b.id, name: b.name,
        district_id: LAYOUT_SLUGS[(Number(b.district_id) || 0) % LAYOUT_SLUGS.length],
        phase: b.phase, floors: b.floors,
      })));
    } catch (e) { res.status(500).json([]); }
  });

  // ─── Depth API (real depth_evaluations only — no synthesized scores) ─────
  app.get('/api/depth/leaderboard', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 200);
      const { rows } = await pool.query(`
        SELECT citizen_id,
               ROUND(AVG(normalized_score)::numeric, 4)::float8 AS mean_depth,
               ROUND(MAX(normalized_score)::numeric, 4)::float8 AS peak_depth,
               COUNT(*)::int AS total_evaluations,
               COALESCE(mode() WITHIN GROUP (ORDER BY COALESCE(depth_tier, tier)), 'unscored') AS dominant_tier
        FROM depth_evaluations
        WHERE citizen_id IS NOT NULL AND normalized_score IS NOT NULL
        GROUP BY citizen_id ORDER BY mean_depth DESC LIMIT $1`, [limit]);
      res.json(rows.map((r) => ({
        citizen_id: r.citizen_id, citizen_name: r.citizen_id, name: r.citizen_id,
        display_name: r.citizen_id,
        mean_depth: Number(r.mean_depth), peak_depth: Number(r.peak_depth),
        depth_score: Number(r.mean_depth),
        total_evaluations: r.total_evaluations, evaluation_count: r.total_evaluations,
        dominant_tier: r.dominant_tier, tier: r.dominant_tier,
      })));
    } catch (e) { res.status(500).json([]); }
  });

  app.get('/api/depth/stats', async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT ROUND(AVG(normalized_score)::numeric, 4)::float8 AS avg FROM depth_evaluations WHERE normalized_score IS NOT NULL');
      res.json({ average_depth: Number(rows[0].avg) || 0 });
    } catch (e) { res.status(500).json({ average_depth: 0 }); }
  });

  app.get('/api/depth/citizen/:name', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT ROUND(AVG(normalized_score)::numeric, 4)::float8 AS mean_depth,
               COALESCE(SUM(feature_count), 0)::int AS total_features
        FROM depth_evaluations WHERE UPPER(citizen_id) = UPPER($1)`, [req.params.name]);
      const recent = await pool.query(`
        SELECT COALESCE(feature_count, 0)::int AS feature_count
        FROM depth_evaluations WHERE UPPER(citizen_id) = UPPER($1)
        ORDER BY created_at DESC LIMIT 10`, [req.params.name]);
      res.json({
        citizen: req.params.name,
        mean_depth: Number(rows[0].mean_depth) || 0,
        total_features: rows[0].total_features,
        recent_evaluations: recent.rows,
      });
    } catch (e) { res.status(500).json({ mean_depth: 0, total_features: 0 }); }
  });

  // ─── Deep-link rewrites the old _redirects file promised ─────────────────
  const CLASSIC_DIR = path.join(__dirname, '..', 'classic');
  app.get('/citizen/:name', (req, res, next) => {
    if (!isClassicHost(req)) return next();
    res.sendFile(path.join(CLASSIC_DIR, 'citizen.html'));
  });
  app.get('/agent/:name', (req, res, next) => {
    if (!isClassicHost(req)) return next();
    res.sendFile(path.join(CLASSIC_DIR, 'agent.html'));
  });

  console.log('[classic] compat bridge installed: citizens / stream / health / contracts / rest-shim / depth / deep-links');
}

module.exports = { register };
