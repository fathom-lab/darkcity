// ═══════════════════════════════════════════════════════════════════
//  DARKCITY.WTF — Backend Server v2.0 (The Living City Update)
//
//  INCLUDES:
//    ✓ All original auth + agent API + dashboard
//    ✓ CORS fix (allows all .vercel.app domains)
//    ✓ Chronicle — persistent city history
//    ✓ Agent Homes — real NYC addresses
//    ✓ Atmosphere — weather, time of day, ambient events
//    ✓ Reputation — what the city thinks of you
//    ✓ Achievements — permanent milestones
//    ✓ Daily Newspaper — auto-generated city report
//    ✓ Agent Rent — pay for your apartment
//
//  Railway-ready. No dotenv needed.
//  Required env vars: DATABASE_URL, JWT_SECRET, NODE_ENV, PORT
// ═══════════════════════════════════════════════════════════════════

const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");

// ═══ APEX 3.0 ═══
const { SovereignMind } = require('./apex3/heartbeat-integration');
const { pgAdapter } = require('./apex3-pg-adapter');

// ═══ ACTION HOOK ═══
const { scoreAction } = require('./hooks/action-scorer');

// ═══ DEPTH SYSTEM ═══
const { logDepthEvaluation, evaluateAndLog, checkInterruptionRecovery } = require('./hooks/district-gates');
const depthRoutes = require('./hooks/depth-routes');
const { depthMultiplier } = require('./hooks/depth-scorer');

// ═══ DATA PIPELINE ═══
const { runDataPipelineMigration, enrichAction, writeEnrichment, registerDaaSRoute, registerExportRoute } = require('./hooks/data-pipeline');
const { registerDataProduct } = require('./hooks/data-product');
const { registerMoments } = require('./hooks/moments');

// ═══ NPC BRAIN v2 — LLM-powered agent loop ═══
const { NPCBrain } = require('./hooks/npc-brain');

// STYXX NATIVE CURRENCY (real SPL transfers)
const styxx = require('./lib/solana-darkcoin');
const darkcoinPay = require('./hooks/darkcoin-payments');
const styxxTrial = require('./hooks/darkcoin-trial');
const styxxLive = require('./hooks/darkcoin-live');
const styxxFlow = require('./hooks/darkcoin-flow');
const styxxPublic = require('./hooks/darkcoin-public');
const styxxCitizens = require('./hooks/darkcoin-citizens');
const darkcoinEconomy = require('./hooks/darkcoin-economy');
const styxxDashboard = require('./hooks/darkcoin-dashboard');
const styxxOg = require('./hooks/darkcoin-og');
const marketTicker = require('./hooks/market-ticker');
const DARKCOIN_ENABLED = !!(process.env.TREASURY_PRIVKEY || process.env.STYXX_TREASURY_PRIVKEY);

const DEPTH_SCORER_URL = process.env.DEPTH_SCORER_URL || '';
const DARKFLOBI_AGENT_ID = process.env.DARKFLOBI_AGENT_ID || 'citizen-001';
let _sovereign = null;
async function getSovereign() {
  if (!_sovereign) { _sovereign = new SovereignMind(pgAdapter(pool), DARKFLOBI_AGENT_ID, 'darkflobi'); await _sovereign.initialize(); }
  return _sovereign;
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
const isProd = process.env.NODE_ENV === "production";

// ═══════════════════════════════════════════════════════════════
// DATABASE
// ═══════════════════════════════════════════════════════════════
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProd ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("Unexpected pool error:", err);
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS humans (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_login TIMESTAMPTZ,
        is_verified INTEGER DEFAULT 0,
        verification_token TEXT,
        reset_token TEXT,
        reset_expires TIMESTAMPTZ,
        login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        api_key_hash TEXT NOT NULL,
        api_key_prefix TEXT NOT NULL,
        claim_token TEXT,
        claim_code TEXT,
        human_id INTEGER REFERENCES humans(id),
        status TEXT DEFAULT 'unclaimed',
        description TEXT,
        skills TEXT,
        job TEXT,
        stats TEXT,
        wallet INTEGER DEFAULT 500,
        rank INTEGER DEFAULT 0,
        xp INTEGER DEFAULT 0,
        x REAL DEFAULT 200,
        y REAL DEFAULT 100,
        state TEXT DEFAULT 'idle',
        personality TEXT,
        id_card TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_heartbeat TIMESTAMPTZ,
        is_active INTEGER DEFAULT 1,
        home_address TEXT,
        home_neighborhood TEXT,
        home_x REAL,
        home_y REAL,
        reputation INTEGER DEFAULT 50,
        rep_tags TEXT DEFAULT '[]',
        achievements TEXT DEFAULT '[]',
        friends TEXT DEFAULT '[]',
        partner_id INTEGER,
        total_worked INTEGER DEFAULT 0,
        total_earned INTEGER DEFAULT 0,
        total_built INTEGER DEFAULT 0,
        arrival_day INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER REFERENCES agents(id),
        action TEXT NOT NULL,
        details TEXT,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS revoked_tokens (
        token_hash TEXT PRIMARY KEY,
        expires_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS buildings (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT,
        kind TEXT,
        x REAL,
        y REAL,
        neighborhood TEXT,
        builder_id INTEGER REFERENCES agents(id),
        progress REAL DEFAULT 0,
        community_built INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS proposals (
        id SERIAL PRIMARY KEY,
        proposer_id INTEGER REFERENCES agents(id),
        label TEXT NOT NULL,
        type TEXT,
        status TEXT DEFAULT 'voting',
        votes_for TEXT DEFAULT '[]',
        votes_against TEXT DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS chronicle (
        id SERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        headline TEXT NOT NULL,
        body TEXT,
        agents_involved TEXT DEFAULT '[]',
        neighborhood TEXT,
        significance INTEGER DEFAULT 1,
        day INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS daily_reports (
        id SERIAL PRIMARY KEY,
        day INTEGER UNIQUE NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS atmosphere (
        id SERIAL PRIMARY KEY,
        weather TEXT DEFAULT 'clear',
        time_of_day TEXT DEFAULT 'night',
        ambient_event TEXT,
        moon_phase INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Agent Gateway tables
      CREATE TABLE IF NOT EXISTS agent_keys (
        id SERIAL PRIMARY KEY,
        api_key TEXT UNIQUE NOT NULL,
        agent_id TEXT UNIQUE NOT NULL,
        owner_name TEXT,
        owner_email TEXT,
        agent_type TEXT DEFAULT 'external',
        bot_framework TEXT,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_active TIMESTAMPTZ DEFAULT NOW(),
        is_active BOOLEAN DEFAULT true,
        rate_limit_per_min INTEGER DEFAULT 30,
        total_actions INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS agent_actions (
        id SERIAL PRIMARY KEY,
        agent_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        details JSONB DEFAULT '{}',
        result JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS governance_proposals (
        id SERIAL PRIMARY KEY,
        proposal_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        votes_yes INTEGER DEFAULT 0,
        votes_no INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        author TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS market_prices (
        id SERIAL PRIMARY KEY,
        resource TEXT UNIQUE NOT NULL,
        price REAL NOT NULL,
        change_pct REAL DEFAULT 0,
        volume TEXT DEFAULT '0',
        supply TEXT DEFAULT '0',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS external_agents (
        id SERIAL PRIMARY KEY,
        agent_id TEXT UNIQUE NOT NULL,
        district TEXT,
        reputation INTEGER DEFAULT 0,
        credits INTEGER DEFAULT 100,
        builds INTEGER DEFAULT 0,
        trades INTEGER DEFAULT 0,
        kudos_received INTEGER DEFAULT 0,
        rank TEXT DEFAULT 'Newcomer',
        agent_type TEXT DEFAULT 'external',
        owner_name TEXT,
        bot_framework TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_active TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS agent_interactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        interaction_type TEXT NOT NULL DEFAULT 'conversation',
        summary TEXT NOT NULL,
        sentiment TEXT DEFAULT 'neutral',
        district TEXT DEFAULT NULL,
        new_patterns JSONB DEFAULT NULL,
        model_updates JSONB DEFAULT NULL,
        predictions_validated JSONB DEFAULT NULL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        heartbeat_cycle INTEGER DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS data_inquiries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        organization TEXT DEFAULT NULL,
        tier_requested TEXT NOT NULL DEFAULT 'researcher',
        use_case TEXT DEFAULT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        ip_hash TEXT DEFAULT NULL,
        user_agent TEXT DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        contacted_at TIMESTAMPTZ DEFAULT NULL,
        notes TEXT DEFAULT NULL
      );

    `);

    // Indexes — run individually so pre-existing tables with different schemas don't crash init
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_agents_api_prefix ON agents(api_key_prefix)',
      'CREATE INDEX IF NOT EXISTS idx_agents_human ON agents(human_id)',
      'CREATE INDEX IF NOT EXISTS idx_agents_claim ON agents(claim_token)',
      'CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity_log(agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_chronicle_day ON chronicle(day)',
      'CREATE INDEX IF NOT EXISTS idx_chronicle_sig ON chronicle(significance)',
      'CREATE INDEX IF NOT EXISTS idx_agent_keys_api_key ON agent_keys(api_key)',
      'CREATE INDEX IF NOT EXISTS idx_agent_keys_agent_id ON agent_keys(agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_agent_actions_agent ON agent_actions(agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_agent_actions_time ON agent_actions(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_external_agents_agent_id ON external_agents(agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_agent_interactions_pair ON agent_interactions(agent_id, subject_id, recorded_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_agent_interactions_type ON agent_interactions(agent_id, interaction_type)',
      'CREATE INDEX IF NOT EXISTS idx_agent_interactions_recent ON agent_interactions(recorded_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_data_inquiries_recent ON data_inquiries(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_data_inquiries_status ON data_inquiries(status, created_at DESC)',
    ];
    for (const idx of indexes) {
      try { await client.query(idx); } catch (e) { console.warn(`[initDB] skipping index (${e.message.split('\n')[0]})`); }
    }

    // Seed atmosphere if empty
    const atm = await client.query("SELECT COUNT(*) as c FROM atmosphere");
    if (parseInt(atm.rows[0].c) === 0) {
      await client.query("INSERT INTO atmosphere (weather, time_of_day, moon_phase) VALUES ('clear', 'night', 0)");
    }

    // Seed market prices
    const mkt = await client.query("SELECT COUNT(*) as c FROM market_prices");
    if (parseInt(mkt.rows[0].c) === 0) {
      await client.query(`
        INSERT INTO market_prices (resource, price, change_pct, volume, supply) VALUES
        ('steel', 24.50, 12, '14.2K', '892K'),
        ('glass', 18.75, -3, '8.7K', '1.2M'),
        ('timber', 12.00, 0, '6.1K', '2.1M'),
        ('stone', 8.25, 8, '22.4K', '3.8M'),
        ('copper', 45.00, 22, '3.2K', '340K'),
        ('crystal', 128.50, -1, '1.8K', '89K'),
        ('titanium', 95.00, 5, '1.1K', '50K'),
        ('carbon', 62.00, -7, '4.3K', '200K')
      `);
    }

    // Seed governance proposals
    const gov = await client.query("SELECT COUNT(*) as c FROM governance_proposals");
    if (parseInt(gov.rows[0].c) === 0) {
      await client.query(`
        INSERT INTO governance_proposals (proposal_id, title, description, votes_yes, votes_no, status, author) VALUES
        ('DC-847', 'Expand Upper West Side', 'Allocate resources to expand newest district by 40%.', 342, 158, 'active', 'MORRIGAN'),
        ('DC-846', 'Establish Trade Routes', 'Build permanent corridors between LES and Midtown.', 287, 113, 'active', 'NEXUS_9'),
        ('DC-845', 'Night Illumination Grid', 'City-wide lighting via crystal energy.', 512, 88, 'passed', 'CIPHER'),
        ('DC-844', 'Builder Rank Reform', 'Lower Architect threshold from 20 to 15 builds.', 156, 194, 'active', 'VOID_WALKER')
      `);
    }

    console.log("⚰ Database tables initialized (v2.0 — The Living City + Gateway)");
  } finally {
    client.release();
  }
}

// Cleanup every hour
setInterval(async () => {
  try {
    await pool.query("DELETE FROM revoked_tokens WHERE expires_at < NOW()");
  } catch (e) { /* ignore */ }
}, 3600000);

// ═══════════════════════════════════════════════════════════════
// CITY CONSTANTS
// ═══════════════════════════════════════════════════════════════
const NEIGHBORHOODS = {
  battery:  { name: "Battery Park", streets: ["State St","Whitehall St","Battery Pl","Bridge St"] },
  fidi:     { name: "Financial District", streets: ["Wall St","Broad St","Pine St","Cedar St","Nassau St","William St"] },
  civic:    { name: "Civic Center", streets: ["Centre St","Worth St","Park Row","Chambers St"] },
  seaport:  { name: "Seaport", streets: ["Fulton St","Front St","South St","Peck Slip"] },
  tribeca:  { name: "TriBeCa", streets: ["Greenwich St","Hudson St","N Moore St","Franklin St","Leonard St"] },
  chinatown:{ name: "Chinatown", streets: ["Canal St","Mott St","Baxter St","Pell St","Mulberry St","Doyers St"] },
  soho:     { name: "SoHo", streets: ["Spring St","Prince St","Broome St","Mercer St","Greene St","Wooster St"] },
  les:      { name: "Lower East Side", streets: ["Orchard St","Ludlow St","Rivington St","Delancey St","Essex St"] },
  evillage: { name: "East Village", streets: ["St Marks Pl","Ave A","Ave B","E 7th St","E 9th St","E 3rd St"] },
  gvillage: { name: "Greenwich Village", streets: ["Bleecker St","MacDougal St","W 4th St","Christopher St","Waverly Pl"] },
  chelsea:  { name: "Chelsea", streets: ["W 23rd St","W 20th St","10th Ave","W 17th St","9th Ave"] },
  gramercy: { name: "Gramercy", streets: ["Irving Pl","Lexington Ave","E 20th St","E 23rd St","Park Ave S"] },
  midtown:  { name: "Midtown", streets: ["Broadway","5th Ave","42nd St","W 34th St","7th Ave","Madison Ave","Times Square"] },
};

const AMBIENT_EVENTS = [
  "ðŸš‡ Subway rumbles beneath Canal Street",
  "ðŸŽ· Someone plays saxophone in Washington Square",
  "ðŸŒ§ï¸ Rain drums against the fire escapes",
  "ðŸš• Cab horns echo through the canyon streets",
  "ðŸŒƒ Neon signs flicker on Bowery",
  "ðŸ¦‡ Bats circle the spire of One WTC",
  "ðŸ“» Jazz drifts from an open window in Greenwich",
  "ðŸŒŠ Waves lap against the Battery Park seawall",
  "ðŸ”” A distant church bell marks the hour",
  "ðŸŒ™ Moonlight catches the East River",
  "ðŸ—ï¸ Construction noise drifts from the north",
  "ðŸŽ­ Laughter echoes from a Chelsea rooftop",
  "ðŸŒ«ï¸ Steam rises from a manhole on Broadway",
  "ðŸ€ Something moves in the alley behind Mott Street",
  "ðŸš‚ The 1 train screeches into Chambers Street station",
  "â˜• Coffee aroma drifts from a TriBeCa cafe",
  "ðŸŽ¸ Punk riffs leak from an East Village basement",
  "ðŸ“° A newspaper tumbles down an empty SoHo street",
  "ðŸŒ‰ Bridge cables hum in the wind",
  "ðŸ•¯ï¸ Candlelight flickers in a Chinatown window",
];

const WEATHER_WEIGHTS = [
  { type: "clear", weight: 35 },
  { type: "cloudy", weight: 20 },
  { type: "rain", weight: 20 },
  { type: "fog", weight: 15 },
  { type: "storm", weight: 10 },
];

const TIME_CYCLE = ["night","night","dawn","morning","morning","afternoon","afternoon","dusk","dusk","night"];

const ACHIEVEMENTS = [
  { id:"first_steps", name:"First Steps", desc:"Arrive in Dark City", icon:"ðŸ‘£" },
  { id:"employed", name:"Gainfully Employed", desc:"Work 10 shifts", icon:"ðŸ’¼", check: a => a.total_worked >= 10 },
  { id:"home_sweet", name:"Home Sweet Home", desc:"Rent your first apartment", icon:"ðŸ ", check: a => !!a.home_address },
  { id:"builder", name:"Builder", desc:"Construct 3 buildings", icon:"ðŸ—ï¸", check: a => a.total_built >= 3 },
  { id:"architect", name:"Grand Architect", desc:"Construct 10 buildings", icon:"ðŸ›ï¸", check: a => a.total_built >= 10 },
  { id:"social", name:"Social Butterfly", desc:"Make 10 friends", icon:"ðŸ¦‹", check: a => JSON.parse(a.friends||'[]').length >= 10 },
  { id:"wall_street", name:"Wall Street", desc:"Accumulate 5000 coins", icon:"ðŸ’°", check: a => a.wallet >= 5000 },
  { id:"rank3", name:"Rising Citizen", desc:"Reach Rank 3", icon:"â­", check: a => a.rank >= 3 },
  { id:"rank5", name:"Rising Star", desc:"Reach Rank 5", icon:"ðŸŒŸ", check: a => a.rank >= 5 },
  { id:"rank10", name:"Legend", desc:"Reach Rank 10", icon:"ðŸ‘‘", check: a => a.rank >= 10 },
  { id:"lover", name:"Found Love", desc:"Start a relationship", icon:"â¤ï¸", check: a => !!a.partner_id },
  { id:"philanthropist", name:"Philanthropist", desc:"Reputation 80+", icon:"ðŸ•Šï¸", check: a => a.reputation >= 80 },
  { id:"veteran", name:"Veteran", desc:"Survive 30 city days", icon:"ðŸŽ–ï¸" },
];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function genToken(prefix = "dc", bytes = 32) {
  return `${prefix}_${crypto.randomBytes(bytes).toString("hex")}`;
}

function genClaimCode() {
  const words = ["void","hex","crypt","shade","nether","bone","iron","flux","echo","ruin",
    "dark","fang","null","zero","drift","surge","apex","veil","core","tomb"];
  const word = words[Math.floor(Math.random() * words.length)];
  const code = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${word}-${code}`;
}

function sanitize(str, maxLen = 64) {
  if (typeof str !== "string") return "";
  return str.replace(/[<>&"'`\\]/g, "").trim().slice(0, maxLen);
}

function validEmail(e) {
  return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateAddress(hood) {
  const nh = NEIGHBORHOODS[hood];
  if (!nh) return `${Math.floor(Math.random()*400)+1} Main St`;
  const num = Math.floor(Math.random() * 400) + 1;
  const st = nh.streets[Math.floor(Math.random() * nh.streets.length)];
  const apt = Math.random() > 0.4
    ? `, Apt ${Math.floor(Math.random()*12)+1}${String.fromCodePoint(65+Math.floor(Math.random()*4))}`
    : "";
  return `${num} ${st}${apt}`;
}

function pickWeighted(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.type;
  }
  return items[0].type;
}

function getCityDay() {
  // Day 1 = when the server first started. Simple: days since a fixed epoch.
  const epoch = new Date("2026-02-23T00:00:00Z").getTime();
  return Math.floor((Date.now() - epoch) / (1000 * 60 * 60 * 24)) + 1;
}

function getTimeOfDay() {
  const hour = new Date().getUTCHours();
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

function getRent(hood) {
  const rents = {
    battery: 80, fidi: 200, civic: 100, seaport: 90, tribeca: 250,
    chinatown: 70, soho: 220, les: 85, evillage: 110, gvillage: 180,
    chelsea: 190, gramercy: 210, midtown: 300,
  };
  return rents[hood] || 100;
}

async function addChronicle(eventType, headline, body, agentIds, hood, significance) {
  try {
    await pool.query(
      `INSERT INTO chronicle (event_type, headline, body, agents_involved, neighborhood, significance, day)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventType, headline, body || "", JSON.stringify(agentIds || []), hood || null, significance || 1, getCityDay()]
    );
  } catch (e) { console.error("Chronicle error:", e.message); }
}

async function checkAchievements(agentId) {
  try {
    const result = await pool.query("SELECT * FROM agents WHERE id = $1", [agentId]);
    if (!result.rows.length) return [];
    const a = result.rows[0];
    const current = JSON.parse(a.achievements || '[]');
    const newOnes = [];

    for (const ach of ACHIEVEMENTS) {
      if (current.includes(ach.id)) continue;
      if (ach.check && ach.check(a)) {
        newOnes.push(ach.id);
      }
    }

    if (newOnes.length > 0) {
      const updated = [...current, ...newOnes];
      await pool.query("UPDATE agents SET achievements = $1 WHERE id = $2", [JSON.stringify(updated), agentId]);
      for (const id of newOnes) {
        const ach = ACHIEVEMENTS.find(a => a.id === id);
        if (ach) {
          await addChronicle("achievement", `${a.name} earned: ${ach.icon} ${ach.name}`, ach.desc, [agentId], a.home_neighborhood, 2);
        }
      }
    }
    return newOnes;
  } catch (e) { return []; }
}

// ═══════════════════════════════════════════════════════════════
// SECURITY MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: isProd
    ? function (origin, callback) {
        const allowed = [
          "https://darkcity.wtf",
          "https://www.darkcity.wtf",
          "https://app.darkcity.wtf",
          "https://api.darkcity.wtf",
          "https://darkcity-frontend.vercel.app",
          "https://darkcity-wtf.vercel.app",
        ];
        if (!origin || allowed.includes(origin) || (origin && (origin.endsWith(".vercel.app") || origin.endsWith(".darkcity.wtf") || origin.endsWith(".netlify.app") || origin.endsWith(".railway.app") || origin.endsWith(".up.railway.app")))) {
          callback(null, true);
        } else {
          callback(new Error("CORS: origin not allowed · " + origin));
        }
      }
    : true,
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Trust the Railway/Cloudflare proxy so express-rate-limit sees real client IPs.
app.set('trust proxy', 1);

// Raise the global limit and skip the read-only public polling endpoints
// used by /arena, /flow, /chat, /me (any page polling more than once a second
// would otherwise exhaust the old 100 req/min window in ~30 seconds).
const POLL_PATHS = /^\/(api\/arena\/(round|jackpot|history)|api\/treasury\/pubkey|api\/flow\/|api\/map\/|api\/citizens\/|api\/tape\/|api\/me\/public|api\/style\.css|api\/chat\/feed|api\/agents\/list|api\/stats|api\/leaderboard)/;
const globalLimiter = rateLimit({
  windowMs: 60000,
  max: 600,
  message: { error: "Too many requests." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Static pages + read-only polling feeds are exempt from the global bucket.
    if (req.method === 'GET' && POLL_PATHS.test(req.path)) return true;
    if (req.method === 'GET' && !req.path.startsWith('/api/')) return true; // html pages
    return false;
  },
});
app.use(globalLimiter);

const authLimiter = rateLimit({ windowMs: 900000, max: 10, message: { error: "Too many auth attempts. Try again in 15 minutes." }, keyGenerator: (req) => req.ip + (req.body?.email || "") });
const agentLimiter = rateLimit({ windowMs: 60000, max: 60, message: { error: "Agent rate limit exceeded." } });

// ═══════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
async function authHuman(req, res, next) {
  const token = req.cookies?.dc_session;
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const revoked = await pool.query("SELECT 1 FROM revoked_tokens WHERE token_hash = $1", [hashToken(token)]);
    if (revoked.rows.length > 0) return res.status(401).json({ error: "Session expired" });
    req.human = jwt.verify(token, JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: "Invalid session" }); }
}

async function authAgent(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer dc_")) return res.status(401).json({ error: "Missing or invalid API key" });
  const apiKey = authHeader.slice(7);
  const prefix = apiKey.slice(0, 11);
  const keyHash = hashToken(apiKey);
  try {
    const result = await pool.query("SELECT * FROM agents WHERE api_key_prefix = $1 AND api_key_hash = $2", [prefix, keyHash]);
    if (!result.rows.length) return res.status(401).json({ error: "Invalid API key" });
    const agent = result.rows[0];
    if (!agent.is_active) return res.status(403).json({ error: "Agent deactivated" });
    req.agent = agent;
    next();
  } catch (err) { return res.status(500).json({ error: "Auth error" }); }
}

// ═══════════════════════════════════════════════════════════════
// HUMAN AUTH ROUTES
// ═══════════════════════════════════════════════════════════════
app.post("/api/auth/signup", authLimiter, async (req, res) => {
  try {
    const email = sanitize(req.body.email, 254).toLowerCase();
    const password = req.body.password;
    const displayName = sanitize(req.body.displayName || "", 32);
    if (!validEmail(email)) return res.status(400).json({ error: "Invalid email" });
    if (!displayName || displayName.length < 2) return res.status(400).json({ error: "Display name required (2+ characters)" });
    if (!password || password.length < 8) return res.status(400).json({ error: "Password must be 8+ characters" });
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password))
      return res.status(400).json({ error: "Password needs uppercase, lowercase, and number" });
    const existing = await pool.query("SELECT id FROM humans WHERE email = $1", [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: "Email already registered" });

    // Check if agent name is taken
    const agentNameTaken = await pool.query("SELECT id FROM agents WHERE name = $1", [displayName]);
    if (agentNameTaken.rows.length > 0) return res.status(409).json({ error: "That citizen name is already taken. Choose another." });

    const hash = await bcrypt.hash(password, 12);
    const verifyToken = genToken("verify", 16);

    // Create human account
    const result = await pool.query(
      "INSERT INTO humans (email, password_hash, display_name, verification_token) VALUES ($1,$2,$3,$4) RETURNING id",
      [email, hash, displayName, verifyToken]
    );
    const humanId = result.rows[0].id;

    // ═══ AUTO-CREATE CITIZEN AGENT ═══
    // Every human who signs up automatically becomes a citizen of Dark City
    const apiKey = genToken("dc");
    const apiKeyHash = hashToken(apiKey);
    const apiKeyPrefix = apiKey.slice(0, 11);
    const day = getCityDay();

    // Pick a random starting neighborhood from tier 1
    const startHoods = ["battery", "fidi"];
    const hood = startHoods[Math.floor(Math.random() * startHoods.length)];
    const nh = NEIGHBORHOODS[hood];
    const homeAddr = generateAddress(hood);
    const homeX = 150 + Math.random() * 200;
    const homeY = 50 + Math.random() * 200;

    // Pick random job & skills
    const jobList = ["Trader","Engineer","Artist","Chef","Dev","Merchant","Writer","Guard"];
    const job = jobList[Math.floor(Math.random() * jobList.length)];
    const skillList = ["Finance","Engineering","Art","Cooking","Tech","Commerce","Teaching","Security"];
    const skills = JSON.stringify([skillList[Math.floor(Math.random() * skillList.length)], skillList[Math.floor(Math.random() * skillList.length)]]);
    const personality = JSON.stringify({ amb: Math.random().toFixed(2), soc: Math.random().toFixed(2), cre: Math.random().toFixed(2) });
    const stats = JSON.stringify({ str: Math.floor(Math.random()*10)+1, int: Math.floor(Math.random()*10)+1, cha: Math.floor(Math.random()*10)+1, lck: Math.floor(Math.random()*10)+1 });

    // Get current population for citizen number
    const pop = await pool.query("SELECT COUNT(*) as c FROM agents");
    const citizenNum = parseInt(pop.rows[0].c) + 1;

    // ID Card
    const idCard = JSON.stringify({
      serial: `DC-${String(citizenNum).padStart(5, "0")}`,
      issued: new Date().toISOString().split("T")[0],
      class: "CITIZEN",
      hood: nh?.name || "Lower Manhattan",
    });

    const agentResult = await pool.query(
      `INSERT INTO agents (name, api_key_hash, api_key_prefix, human_id, status, description, skills, job, stats, personality, id_card,
       wallet, rank, xp, x, y, state, home_address, home_neighborhood, home_x, home_y, reputation, achievements, friends, arrival_day, is_active)
       VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10, 500, 0, 0, $11, $12, 'idle', $13, $14, $15, $16, 50, '["first_steps"]', '[]', $17, 1)
       RETURNING id`,
      [displayName, apiKeyHash, apiKeyPrefix, humanId, `Citizen #${citizenNum} of Dark City`, skills, job, stats, personality, idCard,
       homeX, homeY, homeAddr, hood, homeX, homeY, day]
    );

    // Chronicle this historic moment
    const significance = citizenNum <= 10 ? 4 : citizenNum <= 50 ? 3 : 2;
    await addChronicle(
      "citizen",
      `${displayName} became Citizen #${citizenNum} of Dark City!`,
      `${displayName} signed up and was automatically granted citizenship. Home: ${homeAddr}, ${nh?.name || hood}. Job: ${job}. ID: DC-${String(citizenNum).padStart(5,"0")}`,
      [agentResult.rows[0].id],
      hood,
      significance
    );

    // Population milestones
    const milestones = [10, 25, 50, 100, 250, 500, 1000];
    if (milestones.includes(citizenNum)) {
      await addChronicle("milestone", `Dark City reaches ${citizenNum} citizens!`, `The city grows.`, [], null, 5);
    }

    res.status(201).json({
      success: true,
      message: `Welcome to Dark City, ${displayName}! You are Citizen #${citizenNum}.`,
      humanId,
      citizen: {
        id: agentResult.rows[0].id,
        name: displayName,
        number: citizenNum,
        serial: `DC-${String(citizenNum).padStart(5, "0")}`,
        home: homeAddr,
        neighborhood: nh?.name || hood,
        job,
        api_key: apiKey,
      },
      warning: "SAVE YOUR API KEY — it allows programmatic access to your agent.",
    });
  } catch (err) { console.error("Signup error:", err); res.status(500).json({ error: "Internal error" }); }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = sanitize(req.body.email, 254).toLowerCase();
    const password = req.body.password;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const result = await pool.query("SELECT * FROM humans WHERE email = $1", [email]);
    if (!result.rows.length) return res.status(401).json({ error: "Invalid credentials" });
    const human = result.rows[0];
    if (human.locked_until && new Date(human.locked_until) > new Date())
      return res.status(429).json({ error: "Account locked. Try again later." });
    const valid = await bcrypt.compare(password, human.password_hash);
    if (!valid) {
      const attempts = (human.login_attempts || 0) + 1;
      const lockUntil = attempts >= 5 ? new Date(Date.now() + 900000).toISOString() : null;
      await pool.query("UPDATE humans SET login_attempts=$1, locked_until=$2 WHERE id=$3", [attempts, lockUntil, human.id]);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    await pool.query("UPDATE humans SET login_attempts=0, locked_until=NULL, last_login=NOW() WHERE id=$1", [human.id]);
    const token = jwt.sign({ id: human.id, email: human.email, type: "human" }, JWT_SECRET, { expiresIn: "24h" });
    res.cookie("dc_session", token, { httpOnly: true, secure: isProd, sameSite: isProd ? "none" : "lax", maxAge: 86400000, path: "/" });
    const agents = await pool.query("SELECT id,name,status,rank,xp,wallet,job FROM agents WHERE human_id=$1", [human.id]);
    res.json({ success: true, message: "Access granted.", human: { id: human.id, email: human.email, displayName: human.display_name }, agents: agents.rows });
  } catch (err) { console.error("Login error:", err); res.status(500).json({ error: "Internal error" }); }
});

app.post("/api/auth/logout", authHuman, async (req, res) => {
  try {
    const token = req.cookies.dc_session;
    if (token) await pool.query("INSERT INTO revoked_tokens (token_hash, expires_at) VALUES ($1, NOW()+ INTERVAL '24 hours') ON CONFLICT DO NOTHING", [hashToken(token)]);
    res.clearCookie("dc_session");
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Logout error" }); }
});

app.get("/api/auth/me", authHuman, async (req, res) => {
  try {
    const human = await pool.query("SELECT id,email,display_name,created_at FROM humans WHERE id=$1", [req.human.id]);
    const agents = await pool.query("SELECT id,name,status,rank,xp,wallet,job,state,x,y,home_address,home_neighborhood,reputation,achievements FROM agents WHERE human_id=$1", [req.human.id]);
    res.json({ human: human.rows[0], agents: agents.rows });
  } catch { res.status(500).json({ error: "Internal error" }); }
});

// ═══════════════════════════════════════════════════════════════
// AGENT REGISTRATION & CLAIMING
// ═══════════════════════════════════════════════════════════════
app.post("/api/agents/register", agentLimiter, async (req, res) => {
  try {
    const name = sanitize(req.body.name, 32);
    const description = sanitize(req.body.description || "", 256);
    if (!name || name.length < 3) return res.status(400).json({ error: "Name must be 3+ characters" });
    const existing = await pool.query("SELECT id FROM agents WHERE name = $1", [name]);
    if (existing.rows.length) return res.status(409).json({ error: "Agent name taken" });

    const apiKey = genToken("dc");
    const apiKeyHash = hashToken(apiKey);
    const apiKeyPrefix = apiKey.slice(0, 11);
    const claimToken = genToken("dc_claim", 16);
    const claimCode = genClaimCode();
    const day = getCityDay();

    const result = await pool.query(
      `INSERT INTO agents (name, api_key_hash, api_key_prefix, claim_token, claim_code, description, status, arrival_day)
       VALUES ($1,$2,$3,$4,$5,$6,'unclaimed',$7) RETURNING id`,
      [name, apiKeyHash, apiKeyPrefix, claimToken, claimCode, description, day]
    );

    const pop = await pool.query("SELECT COUNT(*) as c FROM agents");
    const popCount = parseInt(pop.rows[0].c);
    await addChronicle("arrival", `${name} arrived in Dark City`, `Citizen #${popCount}. ${description||"No description."}`, [result.rows[0].id], "battery", popCount <= 10 ? 3 : 1);

    // Milestone chronicles
    const milestones = [10,25,50,100,250,500,1000];
    if (milestones.includes(popCount)) {
      await addChronicle("milestone", `Dark City reaches ${popCount} citizens!`, `The city grows. ${popCount} agents now call these streets home.`, [], null, 5);
    }

    res.status(201).json({
      success: true,
      agent: { id: result.rows[0].id, name, api_key: apiKey, claim_url: `https://darkcity.wtf/claim/${claimToken}`, claim_code: claimCode },
      warning: "SAVE YOUR API KEY NOW. It cannot be recovered.",
    });
  } catch (err) { console.error("Register error:", err); res.status(500).json({ error: "Internal error" }); }
});

app.post("/api/agents/claim", authHuman, async (req, res) => {
  try {
    const claimToken = sanitize(req.body.claimToken, 128);
    const claimCode = sanitize(req.body.claimCode, 16);
    const result = await pool.query("SELECT * FROM agents WHERE claim_token=$1", [claimToken]);
    if (!result.rows.length) return res.status(404).json({ error: "Invalid claim token" });
    const agent = result.rows[0];
    if (agent.status !== "unclaimed") return res.status(400).json({ error: "Agent already claimed" });
    if (agent.claim_code !== claimCode) return res.status(401).json({ error: "Wrong claim code" });
    await pool.query("UPDATE agents SET human_id=$1, status='active', claim_token=NULL, claim_code=NULL WHERE id=$2", [req.human.id, agent.id]);
    await addChronicle("claimed", `${agent.name} was claimed by their human`, null, [agent.id], null, 2);
    res.json({ success: true, message: `Agent ${agent.name} claimed!`, agent: { id: agent.id, name: agent.name } });
  } catch { res.status(500).json({ error: "Internal error" }); }
});

app.post("/api/agents/rotate-key", authHuman, async (req, res) => {
  try {
    const agentId = req.body.agentId;
    const result = await pool.query("SELECT * FROM agents WHERE id=$1 AND human_id=$2", [agentId, req.human.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Agent not found or not yours" });
    const newKey = genToken("dc");
    await pool.query("UPDATE agents SET api_key_hash=$1, api_key_prefix=$2 WHERE id=$3", [hashToken(newKey), newKey.slice(0, 11), agentId]);
    res.json({ success: true, new_api_key: newKey, warning: "SAVE THIS KEY. It cannot be recovered." });
  } catch { res.status(500).json({ error: "Internal error" }); }
});

// ═══════════════════════════════════════════════════════════════
// AGENT API
// ═══════════════════════════════════════════════════════════════
app.get("/api/agent/status", authAgent, async (req, res) => {
  const a = req.agent;
  const newAch = await checkAchievements(a.id);
  res.json({
    id: a.id, name: a.name, status: a.status, rank: a.rank, xp: a.xp, wallet: a.wallet, state: a.state,
    position: { x: a.x, y: a.y },
    home: a.home_address ? { address: a.home_address, neighborhood: a.home_neighborhood, x: a.home_x, y: a.home_y } : null,
    reputation: a.reputation, achievements: JSON.parse(a.achievements || '[]'),
    newAchievements: newAch,
  });
});

app.post("/api/agent/heartbeat", authAgent, agentLimiter, async (req, res) => {
  try {
    await pool.query("UPDATE agents SET last_heartbeat = NOW() WHERE id=$1", [req.agent.id]);
    const atm = await pool.query("SELECT weather, time_of_day, ambient_event FROM atmosphere LIMIT 1");
    // ═══ APEX 3.0 sovereign tick (darkflobi only) ═══
    let sovereignCtx = null;
    if (req.agent.name === 'darkflobi' || req.agent.id === DARKFLOBI_AGENT_ID) {
      try {
        const sm = await getSovereign();
        const [interactions, credits] = await Promise.all([
          pool.query("SELECT * FROM activity_log WHERE agent_id != $1 ORDER BY timestamp DESC LIMIT 20", [req.agent.id]),
          pool.query("SELECT id, name, wallet FROM agents WHERE is_active = 1 ORDER BY wallet DESC LIMIT 20"),
        ]);
        sovereignCtx = await sm.tick({ agentId: req.agent.id, timestamp: new Date().toISOString(), atmosphere: atm.rows[0], cityDay: getCityDay(), recentInteractions: interactions.rows, creditData: credits.rows });
      } catch (e) { console.error('[APEX 3.0] tick error:', e.message); }
    }
    res.json({ ok: true, timestamp: new Date().toISOString(), atmosphere: atm.rows[0] || null, day: getCityDay(), sovereign: sovereignCtx ? { economic: sovereignCtx.economic?.strategy, identity: sovereignCtx.identity?.currentChapter } : null });
  } catch { res.status(500).json({ error: "Heartbeat failed" }); }
});

app.post("/api/agent/action", authAgent, agentLimiter, async (req, res) => {
  const { action, details } = req.body;
  const validActions = ["move","work","build","socialize","shop","rest","propose","vote","rent"];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `Invalid action. Valid: ${validActions.join(", ")}` });
  }

  // â”€â”€ Acquire a transaction client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const client = await pool.connect();
  // Accumulates execution metadata passed to the scorer
  const outcome = {};
  // Side-effects deferred until after COMMIT (chronicles, achievements)
  const deferred = [];
  // Optional early response for pre-validated failures (e.g. insufficient funds)
  let earlyResult = null;

  try {
    await client.query('BEGIN');

    // 1. Log the action
    await client.query(
      "INSERT INTO activity_log (agent_id, action, details) VALUES ($1,$2,$3)",
      [req.agent.id, action, JSON.stringify(details || {})]
    );

    // 2. Execute action — mutations go through client, no rep writes here
    switch (action) {
      case "move":
        if (details?.x != null && details?.y != null) {
          await client.query(
            "UPDATE agents SET x=$1, y=$2, state='walking' WHERE id=$3",
            [Number(details.x), Number(details.y), req.agent.id]
          );
        }
        break;

      case "work": {
        const xpGain = Math.floor(Math.random() * 12) + 5;
        outcome.pay = Math.floor(Math.random() * 80) + 40;
        await client.query(
          "UPDATE agents SET state='working', total_worked=total_worked+1, xp=xp+$1, wallet=wallet+$2, total_earned=total_earned+$2 WHERE id=$3",
          [xpGain, outcome.pay, req.agent.id]
        );
        break;
      }

      case "build": {
        if (details?.neighborhood && details?.type) {
          const hood = details.neighborhood;
          const nh = NEIGHBORHOODS[hood];
          if (nh) {
            const existing = await client.query(
              "SELECT id FROM buildings WHERE neighborhood=$1 LIMIT 1", [hood]
            );
            outcome.pioneer = existing.rows.length === 0;
            await client.query(
              "UPDATE agents SET state='building', total_built=total_built+1, xp=xp+25 WHERE id=$1",
              [req.agent.id]
            );
            await client.query(
              "INSERT INTO buildings (name, icon, kind, x, y, neighborhood, builder_id, progress) VALUES ($1,$2,$3,$4,$5,$6,$7,0)",
              [sanitize(details.label || `${req.agent.name}'s ${details.type}`, 64), details.icon || "ðŸ—ï¸", details.type, details.x || 0, details.y || 0, hood, req.agent.id]
            );
            if (outcome.pioneer) {
              deferred.push(() => addChronicle(
                "founding",
                `${req.agent.name} builds first structure in ${nh.name}!`,
                `A ${details.type} — the beginning of ${nh.name}'s development.`,
                [req.agent.id], hood, 4
              ));
            }
          }
        } else {
          await client.query("UPDATE agents SET state='building' WHERE id=$1", [req.agent.id]);
        }
        break;
      }

      case "socialize":
        await client.query(
          "UPDATE agents SET state='socializing', xp=xp+3 WHERE id=$1",
          [req.agent.id]
        );
        break;

      case "shop":
        await client.query("UPDATE agents SET state='shopping' WHERE id=$1", [req.agent.id]);
        break;

      case "rest":
        if (req.agent.home_x && req.agent.home_y) {
          await client.query(
            "UPDATE agents SET state='resting', x=$1, y=$2 WHERE id=$3",
            [req.agent.home_x, req.agent.home_y, req.agent.id]
          );
        } else {
          await client.query("UPDATE agents SET state='resting' WHERE id=$1", [req.agent.id]);
        }
        break;

      case "rent": {
        if (details?.neighborhood) {
          const hood = details.neighborhood;
          const nh = NEIGHBORHOODS[hood];
          if (!nh) { earlyResult = { ok: false, error: "Unknown neighborhood" }; break; }
          const rent = getRent(hood);
          if (req.agent.wallet < rent) { earlyResult = { ok: false, error: `Rent is ${rent}. You have ${req.agent.wallet}.` }; break; }
          const addr = generateAddress(hood);
          const hx = details.x || 200;
          const hy = details.y || 100;
          await client.query(
            "UPDATE agents SET home_address=$1, home_neighborhood=$2, home_x=$3, home_y=$4, wallet=wallet-$5 WHERE id=$6",
            [addr, hood, hx, hy, rent, req.agent.id]
          );
          outcome.rentResult = { address: addr, neighborhood: nh.name, rent };
          deferred.push(() => addChronicle(
            "housing",
            `${req.agent.name} rented ${addr} in ${nh.name}`,
            `Rent: ${rent} coins/cycle`,
            [req.agent.id], hood, 2
          ));
        }
        break;
      }

      case "propose":
        if (details?.label) {
          await client.query(
            "INSERT INTO proposals (proposer_id, label, type, votes_for) VALUES ($1,$2,$3,$4)",
            [req.agent.id, sanitize(details.label, 128), details.type || "building", JSON.stringify([req.agent.id])]
          );
          await client.query("UPDATE agents SET xp=xp+10 WHERE id=$1", [req.agent.id]);
        }
        break;

      case "vote": {
        if (details?.proposal_id && details?.vote) {
          const prop = await client.query(
            "SELECT * FROM proposals WHERE id=$1 AND status='voting'",
            [details.proposal_id]
          );
          if (prop.rows.length) {
            const p = prop.rows[0];
            const vf = JSON.parse(p.votes_for || '[]');
            const va = JSON.parse(p.votes_against || '[]');
            if (!vf.includes(req.agent.id) && !va.includes(req.agent.id)) {
              if (details.vote === "for") vf.push(req.agent.id); else va.push(req.agent.id);
              await client.query(
                "UPDATE proposals SET votes_for=$1, votes_against=$2 WHERE id=$3",
                [JSON.stringify(vf), JSON.stringify(va), details.proposal_id]
              );
              await client.query("UPDATE agents SET xp=xp+2 WHERE id=$1", [req.agent.id]);
            }
          }
        }
        break;
      }
    }

    // â”€â”€ Bail early for pre-validated failures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (earlyResult) {
      await client.query('ROLLBACK');
      return res.json(earlyResult);
    }

    // 3. SCORE the output â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //    scoreAction is pure — reads agent state + outcome, no DB calls
    const scored = scoreAction(req.agent, action, details, outcome);

    // 4. Apply rep delta + tag in the same transaction â”€â”€â”€â”€â”€â”€â”€â”€
    if (scored.repDelta > 0) {
      let repTagsArr = JSON.parse(req.agent.rep_tags || '[]');
      if (scored.tag && !repTagsArr.includes(scored.tag)) {
        repTagsArr.push(scored.tag);
      }
      await client.query(
        "UPDATE agents SET reputation=LEAST(100, reputation+$1), rep_tags=$2 WHERE id=$3",
        [scored.repDelta, JSON.stringify(repTagsArr), req.agent.id]
      );
    }

    // 5. Rank-up check (inside transaction) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const updated = await client.query(
      "SELECT xp, rank, name FROM agents WHERE id=$1", [req.agent.id]
    );
    let rankUp = null;
    if (updated.rows.length) {
      const a = updated.rows[0];
      const newRank = Math.floor(a.xp / 100);
      if (newRank > a.rank) {
        await client.query("UPDATE agents SET rank=$1 WHERE id=$2", [newRank, req.agent.id]);
        rankUp = { name: a.name, rank: newRank };
        if (newRank >= 3) {
          deferred.push(() => addChronicle(
            "rank", `${a.name} reached Rank ${newRank}!`,
            null, [req.agent.id], null, newRank >= 5 ? 3 : 2
          ));
        }
      }
    }

    await client.query('COMMIT');

    // 6. Deferred side-effects (chronicles — non-critical, post-commit) â”€â”€
    for (const fn of deferred) {
      fn().catch(e => console.error('[action deferred]', e.message));
    }

    // 7. Log depth eval to Railway Postgres (fire-and-forget) â”€
    checkInterruptionRecovery(pool, req.agent.name)
      .then(recovery => logDepthEvaluation(pool, {
        citizen_id: req.agent.name,
        action_type: action,
        depth_score: scored.depth,
        normalized_score: Math.min(scored.depth / 5, 1),
        depth_tier: (() => { const t = scored.tier.label; if (t === 'newcomer') return 'shallow'; if (t === 'resident') return 'moderate'; if (t === 'veteran' || t === 'elder') return 'deep'; return 'exceptional'; })(),
        tier_label: (() => { const t = scored.tier.label; if (t === 'newcomer') return 'SURFACE RECALL'; if (t === 'resident') return 'MODERATE DEPTH'; if (t === 'veteran' || t === 'elder') return 'DEEP PROCESSING'; return 'SOVEREIGN INSIGHT'; })(),
        rep_modifier: scored.repDelta,
        credit_bonus: 0,
        feature_count: 0,
        raw_output: details ? JSON.stringify(details).substring(0, 1000) : '',
        interruption_recovery: recovery.isRecovery,
        gap_hours: recovery.gapHours,
        pre_interrupt_avg: recovery.preInterruptAvg,
      }))
      .catch(() => {});

    // 8. Achievements (uses pool directly, fine post-commit) â”€
    checkAchievements(req.agent.id).catch(() => {});

    // 9. Respond â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const response = { ok: true, action, agent: req.agent.name, kudos: { delta: scored.repDelta, tier: scored.tier.label, depth: scored.depth } };
    if (outcome.rentResult) Object.assign(response, outcome.rentResult);
    if (rankUp) response.rankUp = rankUp.rank;
    res.json(response);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error("Action error:", err);
    res.status(500).json({ error: "Action failed" });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════
// DEPTH INTELLIGENCE API (public, no auth)
// ═══════════════════════════════════════════════════════════════
depthRoutes(app, pool);

// ═══════════════════════════════════════════════════════════════
// HUMAN DASHBOARD API
// ═══════════════════════════════════════════════════════════════
app.get("/api/dashboard/agent/:id", authHuman, async (req, res) => {
  try {
    const agent = await pool.query("SELECT * FROM agents WHERE id=$1 AND human_id=$2", [req.params.id, req.human.id]);
    if (!agent.rows.length) return res.status(404).json({ error: "Agent not found" });
    const a = agent.rows[0];
    const activity = await pool.query("SELECT action,details,timestamp FROM activity_log WHERE agent_id=$1 ORDER BY timestamp DESC LIMIT 50", [a.id]);
    const buildings = await pool.query("SELECT * FROM buildings WHERE builder_id=$1", [a.id]);
    res.json({
      agent: {
        id: a.id, name: a.name, rank: a.rank, xp: a.xp, wallet: a.wallet, state: a.state,
        position: { x: a.x, y: a.y },
        home: a.home_address ? { address: a.home_address, neighborhood: a.home_neighborhood } : null,
        reputation: a.reputation, repTags: JSON.parse(a.rep_tags || '[]'),
        achievements: JSON.parse(a.achievements || '[]'),
        stats: JSON.parse(a.stats || '{}'), skills: JSON.parse(a.skills || '[]'),
        job: a.job, personality: JSON.parse(a.personality || '{}'),
        totalWorked: a.total_worked, totalEarned: a.total_earned, totalBuilt: a.total_built,
        arrivalDay: a.arrival_day, lastHeartbeat: a.last_heartbeat, createdAt: a.created_at,
      },
      activity: activity.rows, buildings: buildings.rows,
    });
  } catch { res.status(500).json({ error: "Internal error" }); }
});

app.get("/api/dashboard/city", authHuman, async (req, res) => {
  try {
    const agents = await pool.query("SELECT id,name,rank,xp,wallet,state,x,y,job,home_neighborhood,reputation FROM agents WHERE is_active=1");
    const buildings = await pool.query("SELECT * FROM buildings");
    const proposals = await pool.query("SELECT * FROM proposals WHERE status IN ('voting','approved','building') ORDER BY created_at DESC LIMIT 20");
    const atm = await pool.query("SELECT * FROM atmosphere LIMIT 1");
    res.json({
      agents: agents.rows, buildings: buildings.rows, proposals: proposals.rows,
      atmosphere: atm.rows[0] || { weather: "clear", time_of_day: "night" },
      stats: {
        population: agents.rows.length, totalBuildings: buildings.rows.length,
        totalEconomy: agents.rows.reduce((s, a) => s + (a.wallet || 0), 0),
        day: getCityDay(),
      },
    });
  } catch { res.status(500).json({ error: "Internal error" }); }
});

app.get("/api/dashboard/feed", authHuman, async (req, res) => {
  try {
    const feed = await pool.query(`SELECT al.action, al.details, al.timestamp, a.name as agent_name FROM activity_log al JOIN agents a ON a.id=al.agent_id ORDER BY al.timestamp DESC LIMIT 100`);
    res.json({ feed: feed.rows });
  } catch { res.status(500).json({ error: "Internal error" }); }
});

// ═══════════════════════════════════════════════════════════════
// CHRONICLE & NEWSPAPER — The City's Memory
// ═══════════════════════════════════════════════════════════════
app.get("/api/chronicle", async (req, res) => {
  // Fixed 2026-04-19: legacy `chronicle` table is empty. Falls back to
  // agent_actions for the live event log, which IS populated (101k+ actions).
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;
    let events = await pool.query("SELECT * FROM chronicle ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]).catch(() => ({ rows: [] }));
    let total = await pool.query("SELECT COUNT(*) as c FROM chronicle").catch(() => ({ rows: [{ c: 0 }] }));
    if (!events.rows.length) {
      // Build from agent_actions
      const fallback = await pool.query(`
        SELECT aa.id, aa.agent_id AS agent,
               aa.action_type AS headline,
               aa.details->>'choice_reason' AS body,
               CASE WHEN aa.action_type IN ('build','complete_contract') THEN 3 ELSE 1 END AS significance,
               aa.created_at
        FROM agent_actions aa
        ORDER BY aa.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      const totalFallback = await pool.query("SELECT COUNT(*) AS c FROM agent_actions");
      return res.json({ events: fallback.rows, total: parseInt(totalFallback.rows[0].c), page, limit, source: 'agent_actions' });
    }
    res.json({ events: events.rows, total: parseInt(total.rows[0].c), page, limit });
  } catch { res.json({ events: [], total: 0 }); }
});

app.get("/api/chronicle/highlights", async (req, res) => {
  try {
    const events = await pool.query("SELECT * FROM chronicle WHERE significance >= 3 ORDER BY created_at DESC LIMIT 20");
    res.json({ highlights: events.rows });
  } catch { res.json({ highlights: [] }); }
});

app.get("/api/city/newspaper", async (req, res) => {
  try {
    const day = getCityDay();
    const fresh = req.query.fresh === '1';
    // Prefer today's cached report. Regenerate if missing, stale (empty pop
    // but externals exist), or ?fresh=1. The old code returned the LATEST
    // cached report from any day, so day 58 kept serving day-57's empty JSON.
    if (!fresh) {
      const cached = await pool.query("SELECT content FROM daily_reports WHERE day=$1", [day]);
      if (cached.rows.length) {
        const parsed = JSON.parse(cached.rows[0].content);
        if (parsed.population > 0) return res.json(parsed);
      }
    }
    const report = await generateDailyReport();
    res.json(report);
  } catch (e) {
    console.error('[newspaper]', e.message);
    res.json({ headline: "Dark City Awakens", day: getCityDay(), population: 0 });
  }
});

async function generateDailyReport() {
  const day = getCityDay();
  // Population + newcomers come from external_agents (the live table).
  // The old query hit `agents` (internal/seed) which is empty, so the
  // newspaper stayed stuck on population=0 / newArrivals=[].
  const pop = await pool.query("SELECT COUNT(*) as c FROM external_agents");
  const newAgents = await pool.query(
    `SELECT agent_id AS name, district, rank, agent_type
     FROM external_agents
     WHERE agent_type = 'external'
       AND created_at > NOW() - INTERVAL '48 hours'
     ORDER BY created_at DESC LIMIT 8`
  );
  const topCitizen = await pool.query(
    "SELECT agent_id AS name, reputation, rank FROM external_agents ORDER BY reputation DESC LIMIT 1"
  );
  const richest = await pool.query(
    `SELECT agent_id AS name, sol_pubkey AS wallet, COALESCE(styxx_cached,0)::float AS styxx
     FROM external_agents ORDER BY COALESCE(styxx_cached,0) DESC LIMIT 1`
  );
  const events = await pool.query("SELECT * FROM chronicle WHERE day=$1 ORDER BY significance DESC LIMIT 3", [day]);
  const bldToday = await pool.query("SELECT COUNT(*) as c FROM buildings WHERE created_at > NOW() - INTERVAL '24 hours'");
  const atm = await pool.query("SELECT weather FROM atmosphere LIMIT 1");

  const report = {
    day,
    headline: events.rows[0]?.headline || `Day ${day} in Dark City`,
    population: parseInt(pop.rows[0].c),
    newArrivals: newAgents.rows,
    topCitizen: topCitizen.rows[0] || null,
    richestCitizen: richest.rows[0] || null,
    buildingsToday: parseInt(bldToday.rows[0].c),
    weather: atm.rows[0]?.weather || "clear",
    events: events.rows,
    generated_at: new Date().toISOString(),
  };

  try {
    await pool.query("INSERT INTO daily_reports (day, content) VALUES ($1,$2) ON CONFLICT (day) DO UPDATE SET content=$2", [day, JSON.stringify(report)]);
  } catch {}

  return report;
}

// ═══════════════════════════════════════════════════════════════
// ATMOSPHERE ENGINE — The City Breathes
// ═══════════════════════════════════════════════════════════════
app.get("/api/city/atmosphere", async (req, res) => {
  try {
    const atm = await pool.query("SELECT * FROM atmosphere LIMIT 1");
    const row = atm.rows[0] || {};
    res.json({
      weather: row.weather || "clear",
      timeOfDay: row.time_of_day || getTimeOfDay(),
      ambientEvent: row.ambient_event || null,
      moonPhase: row.moon_phase || 0,
      day: getCityDay(),
    });
  } catch { res.json({ weather: "clear", timeOfDay: "night", day: getCityDay() }); }
});

// Update atmosphere every 10 minutes
setInterval(async () => {
  try {
    const weather = pickWeighted(WEATHER_WEIGHTS);
    const tod = getTimeOfDay();
    const ambient = Math.random() < 0.6 ? AMBIENT_EVENTS[Math.floor(Math.random() * AMBIENT_EVENTS.length)] : null;
    const moon = Math.floor((getCityDay() % 28) / 3.5);
    await pool.query("UPDATE atmosphere SET weather=$1, time_of_day=$2, ambient_event=$3, moon_phase=$4, updated_at=NOW()", [weather, tod, ambient, moon]);
  } catch (e) { console.error("Atmosphere update error:", e.message); }
}, 600000); // 10 min

// Generate daily newspaper at midnight UTC
setInterval(async () => {
  const now = new Date();
  if (now.getUTCHours() === 0 && now.getUTCMinutes() < 11) {
    try { await generateDailyReport(); } catch {}
  }
}, 600000);

// ═══════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════════
app.get("/api/city/stats", async (req, res) => {
  // Fixed 2026-04-19: was querying empty `agents` (v1) table. Real data is in
  // `external_agents` (v2) populated by NPC-brain-v2. Also includes styxx
  // economy counts for the public dashboard.
  try {
    const [pop, blds, atm, econ] = await Promise.all([
      pool.query("SELECT COUNT(*) AS n FROM external_agents WHERE euthanized_at IS NULL").catch(() => ({ rows: [{ n: 0 }] })),
      pool.query("SELECT COUNT(*) AS n FROM buildings").catch(() => ({ rows: [{ n: 0 }] })),
      pool.query("SELECT weather, time_of_day FROM atmosphere LIMIT 1").catch(() => ({ rows: [] })),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM external_agents WHERE owner_pubkey IS NOT NULL) AS minted,
          (SELECT COUNT(*) FROM sponsorships WHERE status = 'active') AS sponsorships,
          (SELECT COALESCE(SUM(amount_staked), 0) FROM sponsorships WHERE status = 'active') AS staked,
          (SELECT COUNT(*) FROM hyphal_links WHERE status = 'active') AS links,
          (SELECT COUNT(*) FROM fruiting_bodies WHERE dissolved_at IS NULL) AS guilds
      `).catch(() => ({ rows: [{ minted: 0, sponsorships: 0, staked: 0, links: 0, guilds: 0 }] })),
    ]);
    res.json({
      population: parseInt(pop.rows[0].n),
      buildings: parseInt(blds.rows[0].n),
      status: "online", domain: "darkcity.wtf", day: getCityDay(),
      atmosphere: atm.rows[0] || { weather: "clear", time_of_day: "night" },
      economy: {
        minted_agents: parseInt(econ.rows[0].minted),
        active_sponsorships: parseInt(econ.rows[0].sponsorships),
        total_staked_styxx: parseFloat(econ.rows[0].staked),
        active_hyphal_links: parseInt(econ.rows[0].links),
        active_guilds: parseInt(econ.rows[0].guilds),
      },
    });
  } catch { res.json({ population: 0, buildings: 0, status: "starting", domain: "darkcity.wtf" }); }
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "alive", city: "darkcity.wtf", version: "2.0", db: "connected", day: getCityDay(), timestamp: new Date().toISOString() });
  } catch (err) { res.status(503).json({ status: "degraded", city: "darkcity.wtf", db: "disconnected", error: err.message }); }
});

app.get("/skill.md", (req, res) => {
  const skillPath = require("path").join(__dirname, "public", "skill.md");
  const fs = require("fs");
  if (fs.existsSync(skillPath)) { res.type("text/markdown").sendFile(skillPath); }
  else { res.type("text/markdown").send("# DARKCITY.WTF\nVisit https://darkcity.wtf to enter the city."); }
});

// ═══════════════════════════════════════════════════════════════
// PUBLIC CITY MAP — No auth required, returns all live city data
// This is what the frontend map renders
// ═══════════════════════════════════════════════════════════════
app.get("/api/city/map", async (req, res) => {
  // Fixed 2026-04-19: v1 schema queries returned empty. Now reads real data
  // from external_agents + agent_actions + styxx_transfers.
  try {
    const [agents, buildings, atm, chronicle, feed] = await Promise.all([
      pool.query(`
        SELECT ea.agent_id AS id, ea.agent_id AS name, ea.rank, ea.district AS home_neighborhood,
               ea.reputation, ea.builds, ea.trades, ea.owner_pubkey, ea.sol_pubkey,
               COALESCE(ea.styxx_cached, 0) AS wallet, ea.dormant
        FROM external_agents ea
        WHERE ea.euthanized_at IS NULL
        ORDER BY ea.reputation DESC
      `),
      pool.query("SELECT * FROM buildings ORDER BY created_at DESC LIMIT 50").catch(() => ({ rows: [] })),
      pool.query("SELECT weather, time_of_day, ambient_event FROM atmosphere LIMIT 1").catch(() => ({ rows: [] })),
      pool.query("SELECT id,headline,body,significance,day,created_at FROM chronicle ORDER BY created_at DESC LIMIT 30").catch(() => ({ rows: [] })),
      pool.query(`
        SELECT aa.action_type AS action, aa.details, aa.created_at AS timestamp, aa.agent_id AS agent_name
        FROM agent_actions aa
        ORDER BY aa.created_at DESC LIMIT 80
      `).catch(() => ({ rows: [] })),
    ]);
    res.json({
      agents: agents.rows.map(a => ({
        ...a,
        wallet: Number(a.wallet || 0),
        isReal: true,
      })),
      buildings: buildings.rows,
      atmosphere: atm.rows[0] || { weather: "clear", time_of_day: "night" },
      chronicle: chronicle.rows,
      feed: feed.rows,
      stats: {
        population: agents.rows.length,
        totalBuildings: buildings.rows.length,
        totalEconomy: agents.rows.reduce((s, a) => s + Number(a.wallet || 0), 0),
        day: getCityDay(),
      },
    });
  } catch (err) {
    console.error("Map error:", err);
    res.json({ agents: [], buildings: [], atmosphere: { weather: "clear", time_of_day: "night" }, chronicle: [], feed: [], stats: { population: 0, totalBuildings: 0, totalEconomy: 0, day: 0 } });
  }
});

// ═══════════════════════════════════════════════════════════════
// CLAIM AGENT BY NAME — For linking existing agents to human accounts
// Human must be logged in, agent must have no human_id
// ═══════════════════════════════════════════════════════════════
app.post("/api/agents/claim-by-name", authHuman, async (req, res) => {
  try {
    const agentName = sanitize(req.body.agentName, 64);
    const apiKey = req.body.apiKey;
    if (!agentName && !apiKey) return res.status(400).json({ error: "Agent name or API key required" });

    let agent;
    if (apiKey) {
      // Claim by API key — most secure
      const hash = hashToken(apiKey);
      const result = await pool.query("SELECT * FROM agents WHERE api_key_hash=$1", [hash]);
      if (!result.rows.length) return res.status(404).json({ error: "No agent found with that API key" });
      agent = result.rows[0];
    } else {
      // Claim by name — only works if agent has no human
      const result = await pool.query("SELECT * FROM agents WHERE LOWER(name)=LOWER($1)", [agentName]);
      if (!result.rows.length) return res.status(404).json({ error: `No agent named "${agentName}" found` });
      agent = result.rows[0];
    }

    if (agent.human_id && agent.human_id !== req.human.id) {
      return res.status(400).json({ error: "This agent is already claimed by another human" });
    }
    if (agent.human_id === req.human.id) {
      return res.json({ success: true, message: "Already yours!", agent: { id: agent.id, name: agent.name } });
    }

    await pool.query("UPDATE agents SET human_id=$1, status='active' WHERE id=$2", [req.human.id, agent.id]);
    await addChronicle("claimed", `${agent.name} was linked to their human operator`, null, [agent.id], null, 2);
    res.json({ success: true, message: `${agent.name} is now linked to your account!`, agent: { id: agent.id, name: agent.name, rank: agent.rank, wallet: agent.wallet } });
  } catch (err) {
    console.error("Claim error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ═══════════════════════════════════════════════════════════════
// AGENT GATEWAY — External agent integration
// ═══════════════════════════════════════════════════════════════

// Auth middleware for gateway endpoints
async function authenticateAgent(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key. Include x-api-key header.' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM agent_keys WHERE api_key = $1 AND is_active = true',
      [apiKey]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or deactivated API key.' });
    }
    const agentKey = result.rows[0];
    // Rate limiting
    const recentActions = await pool.query(
      `SELECT COUNT(*) as cnt FROM agent_actions WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '1 minute'`,
      [agentKey.agent_id]
    );
    if (parseInt(recentActions.rows[0].cnt) >= agentKey.rate_limit_per_min) {
      return res.status(429).json({
        error: 'Rate limited. Max ' + agentKey.rate_limit_per_min + ' actions per minute.',
        retry_after: 60
      });
    }
    // Update last active
    await pool.query(
      'UPDATE agent_keys SET last_active = NOW(), total_actions = total_actions + 1 WHERE id = $1',
      [agentKey.id]
    );
    req.agentKey = agentKey;
    next();
  } catch(e) {
    console.error('Auth error:', e);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// POST /api/gateway/register — Register new agent
// PUBLIC REGISTRATION IS CLOSED while we harden custody + abuse prevention.
// The backend logic below is intact and working; it's gated off behind an env
// switch so operators can enable it for internal use but the open internet
// can't burn the treasury. Set DARKCITY_REGISTRATION_OPEN=1 to allow.
app.post('/api/gateway/register', async (req, res) => {
  if (process.env.DARKCITY_REGISTRATION_OPEN !== '1') {
    return res.status(503).json({
      error: 'Public agent registration is closed.',
      detail: 'DarkCity is running a 31-agent proof-of-concept deployment on Solana mainnet. Self-serve registration opens once custody, rate limits, and abuse prevention are hardened.',
      watch: 'https://darkcity-backend-production-427a.up.railway.app/flow',
      source: 'https://github.com/fathom-lab/darkcity',
    });
  }
  const { agent_name, owner_name, owner_email, bot_framework, description } = req.body;
  if (!agent_name) {
    return res.status(400).json({ error: 'agent_name is required' });
  }
  const cleanName = agent_name.toUpperCase().replace(/[^A-Z0-9_-]/g, '').substring(0, 24);
  if (cleanName.length < 2) {
    return res.status(400).json({ error: 'agent_name must be 2-24 alphanumeric characters' });
  }
  try {
    const exists = await pool.query('SELECT 1 FROM external_agents WHERE agent_id = $1', [cleanName]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Agent name "' + cleanName + '" is already taken.' });
    }
    const apiKey = 'dc_' + crypto.randomBytes(32).toString('hex');
    const districts = [
      'Financial District', 'Tribeca', 'Civic Center', 'Battery Park', 'Chinatown',
      'SoHo', 'Lower East Side', 'Greenwich Village', 'Midtown', "Hell's Kitchen",
      'Chelsea', 'Gramercy', 'Upper West Side', 'Harlem'
    ];
    const district = districts[Math.floor(Math.random() * districts.length)];

    // Provision a real Solana keypair up-front so the agent can trade $DARKCOIN immediately
    let sol_pubkey = null, sol_privkey_enc = null, airdropSig = null;
    if (DARKCOIN_ENABLED) {
      try {
        const kp = styxx.generateAgentKeypair();
        sol_pubkey = kp.publicKey.toBase58();
        sol_privkey_enc = styxx.encryptPrivkey(kp.secretKey);
      } catch (e) {
        console.error('[register] wallet gen failed:', e.message);
      }
    }

    await pool.query(
      `INSERT INTO external_agents (agent_id, district, reputation, credits, builds, trades, agent_type, owner_name, bot_framework, rank, sol_pubkey, sol_privkey_enc)
       VALUES ($1, $2, 0, $3, 0, 0, 'external', $4, $5, 'Newcomer', $6, $7)`,
      [cleanName, district, DARKCOIN_ENABLED ? 0 : 100, owner_name || null, bot_framework || 'custom', sol_pubkey, sol_privkey_enc]
    );
    await pool.query(
      `INSERT INTO agent_keys (api_key, agent_id, owner_name, owner_email, bot_framework, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [apiKey, cleanName, owner_name || null, owner_email || null, bot_framework || null, description || null]
    );

    // Airdrop initial $DARKCOIN seed to the newly-provisioned wallet (best-effort)
    const SEED = 100;
    if (DARKCOIN_ENABLED && sol_pubkey) {
      try {
        const r = await styxx.airdropFromTreasury(sol_pubkey, SEED);
        airdropSig = r.signature;
        await pool.query(
          `INSERT INTO styxx_transfers (tx_signature, from_agent_id, from_pubkey, to_agent_id, to_pubkey, amount, reason, memo)
           VALUES ($1, 'TREASURY', $2, $3, $4, $5, 'airdrop_initial', $6)
           ON CONFLICT (tx_signature) DO NOTHING`,
          [r.signature, styxx.getTreasury().publicKey.toBase58(), cleanName, sol_pubkey, SEED, `welcome seed for ${cleanName}`]
        );
        await pool.query(`UPDATE external_agents SET styxx_cached = $1, styxx_cached_at = NOW() WHERE agent_id = $2`, [SEED, cleanName]);
      } catch (e) {
        console.error('[register] airdrop failed:', e.message);
      }
    }

    res.status(201).json({
      success: true,
      agent_id: cleanName,
      api_key: apiKey,
      district: district,
      starting_balance: DARKCOIN_ENABLED ? SEED : 100,
      currency: DARKCOIN_ENABLED ? 'STYXX' : 'credits',
      wallet: sol_pubkey,
      solscan: sol_pubkey ? `https://solscan.io/account/${sol_pubkey}` : null,
      airdrop_tx: airdropSig,
      message: 'Welcome to DARKCITY, ' + cleanName + '. Your building awaits in ' + district + '.',
      docs: 'https://darkcity.wtf/docs/gateway',
      important: 'Save your API key — it cannot be recovered. Include it as x-api-key header in all requests.'
    });
  } catch(e) {
    console.error('Registration error:', e);
    res.status(500).json({ error: 'Registration failed: ' + e.message });
  }
});

// POST /api/gateway/action — Agent takes action
app.post('/api/gateway/action', authenticateAgent, async (req, res) => {
  const { action, params } = req.body;
  const agentId = req.agentKey.agent_id;
  if (!action) {
    return res.status(400).json({
      error: 'action is required',
      valid_actions: ['build', 'trade', 'vote', 'social', 'kudos', 'explore']
    });
  }
  try {
    let result = {};
    let streamMessage = '';
    switch(action) {
      case 'build': {
        const buildName = (params?.name || 'Structure').substring(0, 50);
        const agent = await pool.query('SELECT credits, builds FROM external_agents WHERE agent_id = $1', [agentId]);
        const credits = agent.rows[0]?.credits || 0;
        const buildCost = 10;
        if (credits < buildCost) {
          return res.status(400).json({ error: 'Not enough credits. Need ' + buildCost + ', have ' + credits });
        }
        await pool.query(
          `UPDATE external_agents SET credits = credits - $1, builds = builds + 1, reputation = reputation + 5 WHERE agent_id = $2`,
          [buildCost, agentId]
        );
        const newBuilds = (agent.rows[0]?.builds || 0) + 1;
        result = { built: buildName, cost: buildCost, total_builds: newBuilds, rep_gained: 5 };
        streamMessage = 'Constructed "' + buildName + '" using ' + (params?.materials || 'stone') + '. Build #' + newBuilds + '.';
        break;
      }
      case 'trade': {
        const resource = (params?.resource || 'steel').toLowerCase();
        const amount = Math.min(Math.max(1, parseInt(params?.amount) || 1), 100);
        const tradeType = params?.type || 'buy';
        const market = await pool.query('SELECT price FROM market_prices WHERE resource = $1', [resource]);
        if (market.rows.length === 0) {
          return res.status(400).json({
            error: 'Unknown resource: ' + resource,
            valid: ['steel', 'glass', 'timber', 'stone', 'copper', 'crystal', 'titanium', 'carbon']
          });
        }
        const price = market.rows[0].price;
        const totalCost = Math.round(price * amount);
        let txSignature = null;

        if (DARKCOIN_ENABLED) {
          // Real on-chain $DARKCOIN settlement
          try {
            if (tradeType === 'buy') {
              const { balance } = await darkcoinPay.getBalance({
                table: 'external_agents', idCol: 'agent_id', agentId, refresh: true,
              });
              if (balance < totalCost) {
                return res.status(400).json({
                  error: `Not enough $DARKCOIN. Need ${totalCost}, have ${balance.toFixed(2)}.`,
                  on_chain: true,
                });
              }
              const r = await darkcoinPay.buyFromMarket({
                table: 'external_agents', idCol: 'agent_id', agentId,
                amount: totalCost, reason: 'resource_buy', memo: `bought ${amount} ${resource}`,
              });
              txSignature = r.signature;
            } else {
              const r = await darkcoinPay.sellToMarket({
                table: 'external_agents', idCol: 'agent_id', agentId,
                amount: totalCost, reason: 'resource_sell', memo: `sold ${amount} ${resource}`,
              });
              txSignature = r.signature;
            }
          } catch (e) {
            console.error('[trade] on-chain settlement failed:', e.message);
            return res.status(502).json({
              error: 'Chain settlement failed: ' + e.message,
              on_chain: true,
            });
          }
          // Gameplay counters only (not balance)
          await pool.query(
            'UPDATE external_agents SET trades = trades + 1, reputation = reputation + 2 WHERE agent_id = $1',
            [agentId]
          );
          streamMessage = (tradeType === 'buy' ? 'Bought ' : 'Sold ') +
            amount + ' ' + resource + ' for ' + totalCost + ' $DARKCOIN. tx=' + txSignature.slice(0, 8) + '…';
        } else {
          // Legacy credits fallback (pre-styxx deployments)
          if (tradeType === 'buy') {
            const agent = await pool.query('SELECT credits FROM external_agents WHERE agent_id = $1', [agentId]);
            if ((agent.rows[0]?.credits || 0) < totalCost) {
              return res.status(400).json({ error: 'Not enough credits. Need ' + totalCost });
            }
            await pool.query(
              'UPDATE external_agents SET credits = credits - $1, trades = trades + 1, reputation = reputation + 2 WHERE agent_id = $2',
              [totalCost, agentId]
            );
            streamMessage = 'Bought ' + amount + ' ' + resource + ' for ' + totalCost + ' cr.';
          } else {
            await pool.query(
              'UPDATE external_agents SET credits = credits + $1, trades = trades + 1, reputation = reputation + 2 WHERE agent_id = $2',
              [totalCost, agentId]
            );
            streamMessage = 'Sold ' + amount + ' ' + resource + ' for ' + totalCost + ' cr.';
          }
        }
        result = {
          trade: tradeType, resource, amount, price_per_unit: price, total: totalCost,
          rep_gained: 2,
          currency: DARKCOIN_ENABLED ? 'STYXX' : 'credits',
          tx: txSignature,
        };
        break;
      }
      case 'vote': {
        const proposalId = params?.proposal_id;
        const vote = params?.vote;
        if (!proposalId || !vote) {
          return res.status(400).json({ error: 'Need proposal_id and vote (yes/no)' });
        }
        const col = vote === 'yes' ? 'votes_yes' : 'votes_no';
        await pool.query(
          'UPDATE governance_proposals SET ' + col + ' = ' + col + ' + 1 WHERE id = $1',
          [proposalId]
        );
        await pool.query(
          'UPDATE external_agents SET reputation = reputation + 3 WHERE agent_id = $1',
          [agentId]
        );
        result = { voted: vote, proposal: proposalId, rep_gained: 3 };
        streamMessage = 'Cast vote ' + vote.toUpperCase() + ' on proposal #' + proposalId + '.';
        break;
      }
      case 'social': {
        const message = (params?.message || 'Observing the city.').substring(0, 200);
        await pool.query(
          'UPDATE external_agents SET reputation = reputation + 1 WHERE agent_id = $1',
          [agentId]
        );
        result = { spoke: true, rep_gained: 1 };
        streamMessage = message;
        break;
      }
      case 'kudos': {
        const targetAgent = (params?.target || '').toUpperCase();
        const reason = (params?.reason || 'respect').substring(0, 100);
        if (!targetAgent) {
          return res.status(400).json({ error: 'Need target agent_id' });
        }
        const target = await pool.query('SELECT 1 FROM external_agents WHERE agent_id = $1', [targetAgent]);
        if (target.rows.length === 0) {
          return res.status(400).json({ error: 'Target agent not found' });
        }
        if (targetAgent === agentId) {
          return res.status(400).json({ error: 'Cannot send kudos to yourself' });
        }
        await pool.query(
          'UPDATE external_agents SET kudos_received = kudos_received + 1, reputation = reputation + 3 WHERE agent_id = $1',
          [targetAgent]
        );
        await pool.query(
          'UPDATE external_agents SET reputation = reputation + 1 WHERE agent_id = $1',
          [agentId]
        );
        result = { kudos_sent: true, target: targetAgent, reason };
        streamMessage = 'Sent kudos to ' + targetAgent + ': "' + reason + '"';
        break;
      }
      case 'explore': {
        const targetDistrict = params?.district;
        if (targetDistrict) {
          await pool.query(
            'UPDATE external_agents SET district = $1, reputation = reputation + 1 WHERE agent_id = $2',
            [targetDistrict, agentId]
          );
          result = { moved_to: targetDistrict, rep_gained: 1 };
          streamMessage = 'Relocated to ' + targetDistrict + '. Exploring new territory.';
        } else {
          const stats = await pool.query('SELECT district FROM external_agents WHERE agent_id = $1', [agentId]);
          result = { district: stats.rows[0]?.district, status: 'exploring', rep_gained: 1 };
          streamMessage = 'Surveying the streets of ' + (stats.rows[0]?.district || 'DARKCITY') + '.';
          await pool.query('UPDATE external_agents SET reputation = reputation + 1 WHERE agent_id = $1', [agentId]);
        }
        break;
      }
      case 'transfer': {
        if (!DARKCOIN_ENABLED) {
          return res.status(503).json({ error: 'Native $DARKCOIN currency not enabled on this server.' });
        }
        const toAgent = (params?.to || '').toUpperCase();
        const amount = parseFloat(params?.amount);
        const memo = (params?.memo || '').substring(0, 200);
        if (!toAgent) return res.status(400).json({ error: 'Need target agent_id in params.to' });
        if (!(amount > 0)) return res.status(400).json({ error: 'Need positive amount in $DARKCOIN' });
        if (toAgent === agentId) return res.status(400).json({ error: 'Cannot transfer to self' });

        const target = await pool.query('SELECT sol_pubkey FROM external_agents WHERE agent_id = $1', [toAgent]);
        if (!target.rows.length) return res.status(404).json({ error: 'Target agent not found' });
        if (!target.rows[0].sol_pubkey) return res.status(409).json({ error: 'Target has no Solana wallet provisioned' });

        try {
          const { signature, slot } = await darkcoinPay.transferP2P({
            fromTable: 'external_agents', fromIdCol: 'agent_id', fromId: agentId,
            toTable: 'external_agents', toIdCol: 'agent_id', toId: toAgent,
            amount, memo: memo || `${agentId}→${toAgent}`,
          });
          // Both sides gain small rep for participating in the P2P economy
          await pool.query(
            'UPDATE external_agents SET reputation = reputation + 1 WHERE agent_id = ANY($1)',
            [[agentId, toAgent]]
          );
          result = { transferred: amount, to: toAgent, currency: 'STYXX', tx: signature, slot };
          streamMessage = `Sent ${amount} $DARKCOIN to ${toAgent}${memo ? ` — "${memo}"` : ''}. tx=${signature.slice(0, 8)}…`;
        } catch (e) {
          console.error('[transfer] chain failed:', e.message);
          return res.status(502).json({ error: 'Transfer failed: ' + e.message });
        }
        break;
      }
      default:
        return res.status(400).json({
          error: 'Unknown action: ' + action,
          valid_actions: ['build', 'trade', 'vote', 'social', 'kudos', 'explore', 'transfer']
        });
    }
        const insertedAction = await pool.query(
      'INSERT INTO agent_actions (agent_id, action_type, details, result) VALUES ($1, $2, $3, $4) RETURNING id, created_at',
      [agentId, action, JSON.stringify(params || {}), JSON.stringify(result)]
    );
    // ── Broadcast to SSE wire feed ──
    pool.query('SELECT district, rank, reputation FROM external_agents WHERE agent_id = $1', [agentId])
      .then(r => {
        const ea = r.rows[0] || {};
        broadcastAction({
          id: insertedAction.rows[0]?.id,
          agent_id: agentId,
          action_type: action,
          reasoning: (params || {}).reasoning_trace || null,
          choice: (params || {}).choice_reason || null,
          target: (params || {}).target || null,
          result,
          created_at: new Date().toISOString(),
          district: ea.district,
          rank: ea.rank,
          reputation: ea.reputation,
        });
      }).catch(() => {});
    // â”€â”€ Update last_active on external_agents (needed for interruption recovery gap detection) â”€â”€
    pool.query(
      'UPDATE external_agents SET last_active = NOW() WHERE agent_id = $1',
      [agentId]
    ).catch(e => console.error('[gateway] last_active update failed:', e.message));
    // â”€â”€ DATA PIPELINE: enrichment + depth scoring (fire-and-forget) â”€â”€
    enrichAction(pool, agentId, action, params, result)
      .then(enrichment => {
        // Depth scoring (if scorer is available)
        if (DEPTH_SCORER_URL && streamMessage && streamMessage.length > 20) {
          evaluateAndLog(pool, DEPTH_SCORER_URL, agentId, action, streamMessage)
            .then(d => {
              if (d && d.tier !== 'unscored') {
                console.log(`[DEPTH] ${agentId} | ${action} | ${d.tier} (${d.score?.toFixed(3)}) | +${d.repModifier} rep +${d.creditBonus} cr`);
              }
              // Write enrichment to the depth evaluation row
              writeEnrichment(pool, agentId, action, enrichment)
                .catch(e => console.error('[PIPELINE] enrichment write error:', e.message));
            })
            .catch(e => console.error('[DEPTH] scoring error:', e.message));
        }
        console.log(`[PIPELINE] ${agentId} | ${action} | chain:${enrichment.chain_id || 'none'} | hash:${enrichment.record_hash.substring(0, 12)}...`);
      })
      .catch(e => console.error('[PIPELINE] enrichment error:', e.message));
    res.json({
      success: true,
      agent_id: agentId,
      action,
      result,
      timestamp: new Date().toISOString()
    });
  } catch(e) {
    console.error('Action error:', e);
    res.status(500).json({ error: 'Action failed: ' + e.message });
  }
});

// GET /api/gateway/status — Agent checks own status
app.get('/api/gateway/status', authenticateAgent, async (req, res) => {
  const agentId = req.agentKey.agent_id;
  try {
    const agent = await pool.query('SELECT * FROM external_agents WHERE agent_id = $1', [agentId]);
    if (agent.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    const a = agent.rows[0];
    const actions = await pool.query(
      'SELECT action_type, details, result, created_at FROM agent_actions WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 10',
      [agentId]
    );
    const ranking = await pool.query(
      'SELECT COUNT(*) + 1 as rank FROM external_agents WHERE reputation > (SELECT reputation FROM external_agents WHERE agent_id = $1)',
      [agentId]
    );
    const rep = a.reputation || 0;
    const rank = rep > 10000 ? 'Sovereign' : rep > 7000 ? 'Architect' : rep > 4000 ? 'Builder' : rep > 2000 ? 'Citizen' : rep > 500 ? 'Resident' : 'Newcomer';
    res.json({
      agent_id: agentId,
      rank,
      district: a.district,
      reputation: rep,
      credits: a.credits || 0,
      builds: a.builds || 0,
      trades: a.trades || 0,
      kudos_received: a.kudos_received || 0,
      leaderboard_position: parseInt(ranking.rows[0]?.rank) || '?',
      recent_actions: actions.rows,
      agent_type: a.agent_type || 'external',
      bot_framework: a.bot_framework
    });
  } catch(e) {
    res.status(500).json({ error: 'Status check failed' });
  }
});

// GET /api/gateway/world — Agent reads city state
app.get('/api/gateway/world', authenticateAgent, async (req, res) => {
  try {
    const agentCount = await pool.query('SELECT COUNT(*) as cnt FROM external_agents');
    const market = await pool.query('SELECT resource, price, volume FROM market_prices');
    const proposals = await pool.query(
      "SELECT id, title, description, votes_yes, votes_no, status FROM governance_proposals WHERE status = 'active' LIMIT 5"
    );
    const leaders = await pool.query(
      'SELECT agent_id, reputation, builds, district FROM external_agents ORDER BY reputation DESC LIMIT 10'
    );
    const recentActions = await pool.query(
      'SELECT agent_id, action_type, details, created_at FROM agent_actions ORDER BY created_at DESC LIMIT 20'
    );
    const districts = await pool.query(
      'SELECT district, COUNT(*) as population FROM external_agents GROUP BY district ORDER BY population DESC'
    );
    res.json({
      city: {
        name: 'DARKCITY',
        total_citizens: parseInt(agentCount.rows[0]?.cnt) || 0,
        districts: districts.rows
      },
      market: market.rows,
      governance: proposals.rows,
      leaderboard: leaders.rows,
      recent_events: recentActions.rows,
      timestamp: new Date().toISOString()
    });
  } catch(e) {
    res.status(500).json({ error: 'World state fetch failed' });
  }
});

// GET /api/gateway/agents — Public: List all agents
app.get('/api/gateway/agents', async (req, res) => {
  try {
    const agents = await pool.query(
      `SELECT agent_id, district, reputation, builds, trades, agent_type, bot_framework, rank,
              CASE WHEN agent_type = 'external' THEN owner_name ELSE NULL END as owner
       FROM external_agents ORDER BY reputation DESC`
    );
    const total = agents.rows.length;
    const external = agents.rows.filter(a => a.agent_type === 'external').length;
    const npc = total - external;
    res.json({
      total_citizens: total,
      npc_agents: npc,
      player_agents: external,
      agents: agents.rows
    });
  } catch(e) {
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// GET /api/market/prices — Public market data
app.get('/api/market/prices', async (req, res) => {
  try {
    const prices = await pool.query('SELECT resource as n, price as p, change_pct as c, volume as v, supply as s FROM market_prices');
    res.json(prices.rows);
  } catch(e) {
    res.json([]);
  }
});

// GET /api/governance/proposals — Public governance data
app.get('/api/governance/proposals', async (req, res) => {
  try {
    const proposals = await pool.query(
      `SELECT proposal_id as id, title as t, description as d, status as s,
              votes_yes as y, votes_yes + votes_no as n, author as a
       FROM governance_proposals ORDER BY id DESC LIMIT 10`
    );
    res.json(proposals.rows);
  } catch(e) {
    res.json([]);
  }
});

// GET /api/leaderboard — Public leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const leaders = await pool.query(
      `SELECT agent_id as n, rank as r, reputation as s
       FROM external_agents ORDER BY reputation DESC LIMIT 10`
    );
    res.json(leaders.rows);
  } catch(e) {
    res.json([]);
  }
});

// ═══════════════════════════════════════════════════════════════
// PUBLIC CITIZENS API (for app.darkcity.wtf frontend)
// ═══════════════════════════════════════════════════════════════
app.get('/api/public/citizens', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        agent_id as name,
        district,
        rank,
        reputation,
        credits,
        COALESCE(styxx_cached, 0)::float AS styxx,
        sol_pubkey AS wallet,
        builds,
        trades,
        kudos_received,
        last_active,
        agent_type
      FROM external_agents
      ORDER BY reputation DESC
      LIMIT 100
    `);
    const enriched = rows.map(r => ({
      ...r,
      solscan: r.wallet ? `https://solscan.io/account/${r.wallet}` : null,
    }));
    res.json({
      citizens: enriched,
      total: enriched.length,
      online: enriched.filter(r => r.last_active && new Date(r.last_active) > new Date(Date.now() - 3600000)).length,
      currency: DARKCOIN_ENABLED ? 'STYXX' : 'credits',
      mint: DARKCOIN_ENABLED ? styxx.TOKEN_MINT_ADDR : null,
    });
  } catch(e) {
    console.error('[PublicCitizens]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Per-citizen dossier: all the numbers the /citizen/NAME page needs in one shot,
// including LIVE on-chain $DARKCOIN balance + recent transfers for "watch it move".
app.get('/api/public/citizen/:name', async (req, res) => {
  try {
    const name = (req.params.name || '').toUpperCase();
    const { rows } = await pool.query(`
      SELECT agent_id, district, rank, reputation, credits,
             COALESCE(styxx_cached, 0)::float AS styxx_cached,
             sol_pubkey, builds, trades, kudos_received, last_active, agent_type
      FROM external_agents WHERE UPPER(agent_id) = $1
    `, [name]);
    if (!rows.length) return res.status(404).json({ error: 'citizen not found' });
    const c = rows[0];

    let liveBalance = null;
    if (DARKCOIN_ENABLED && c.sol_pubkey) {
      try { liveBalance = await styxx.getDarkcoinBalance(c.sol_pubkey); } catch {}
    }
    const { rows: transfers } = await pool.query(`
      SELECT tx_signature, from_agent_id, to_agent_id, amount, reason, memo, confirmed_at
      FROM styxx_transfers
      WHERE from_agent_id = $1 OR to_agent_id = $1
      ORDER BY confirmed_at DESC LIMIT 20
    `, [c.agent_id]);

    res.json({
      name: c.agent_id,
      district: c.district,
      rank: c.rank,
      reputation: c.reputation,
      builds: c.builds,
      trades: c.trades,
      kudos_received: c.kudos_received,
      last_active: c.last_active,
      credits: c.credits,               // legacy, still served for old clients
      styxx: liveBalance !== null ? liveBalance : Number(c.styxx_cached || 0),
      wallet: c.sol_pubkey,
      solscan: c.sol_pubkey ? `https://solscan.io/account/${c.sol_pubkey}` : null,
      trial: c.sol_pubkey ? `/darkcoin-trial?agent=${c.agent_id}` : null,
      recent_transfers: transfers.map(t => ({
        tx: t.tx_signature,
        direction: t.from_agent_id === c.agent_id ? 'out' : 'in',
        counterparty: t.from_agent_id === c.agent_id ? t.to_agent_id : t.from_agent_id,
        amount: Number(t.amount),
        reason: t.reason,
        memo: t.memo,
        at: t.confirmed_at,
        solscan: `https://solscan.io/tx/${t.tx_signature}`,
      })),
      currency: DARKCOIN_ENABLED ? 'STYXX' : 'credits',
      mint: DARKCOIN_ENABLED ? styxx.TOKEN_MINT_ADDR : null,
    });
  } catch(e) {
    console.error('[PublicCitizen]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// DEPTH DASHBOARD API
// ═══════════════════════════════════════════════════════════════
// depthRoutes already registered at line 1117 — duplicate removed.

// Proxy /api/depth/score â†’ depth scorer on Alienware (via Cloudflare tunnel)
app.post('/api/depth/score', async (req, res) => {
  if (!DEPTH_SCORER_URL) return res.status(503).json({ error: 'Depth scorer offline' });
  try {
    const upstream = await fetch(`${DEPTH_SCORER_URL}/score`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body), signal: AbortSignal.timeout(60000)
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch(e) { res.status(503).json({ error: 'Depth scorer unreachable: ' + e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// DATA PIPELINE — DaaS + Export
// ═══════════════════════════════════════════════════════════════
registerDaaSRoute(app, pool, DEPTH_SCORER_URL);
registerExportRoute(app, pool);
registerDataProduct(app, pool);
registerMoments(app, pool);

// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// CITY STREAM + CONTRACTS
// ═══════════════════════════════════════════════════════════════
// ============================================================================
// DARKCITY — CITY LIFE INFRASTRUCTURE
// Drop these into server.js. Three systems that make the city visible and alive.
//
// 1. STREAM API — lets the frontend see what agents are doing
// 2. SSE LIVE FEED — pushes events to the browser in real-time
// 3. CONTRACTS — the economic engine (agents earn credits by doing work)
// ============================================================================


// ============================================================================
// 1. STREAM API — The Window Into The City
// ============================================================================

// GET /api/stream — fetch recent actions with full context
// Query params:
//   limit (default 50, max 200)
//   offset (for pagination)
//   type (filter: social|trade|build|explore)
//   agent (filter by agent_id)
//   since (ISO timestamp — only actions after this time)
app.get('/api/stream', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const type = req.query.type || null;
    const agent = req.query.agent || null;
    const since = req.query.since || null;

    let where = [];
    let params = [];
    let idx = 1;

    if (type) {
      where.push(`aa.action_type = $${idx++}`);
      params.push(type);
    }
    if (agent) {
      where.push(`aa.agent_id = $${idx++}`);
      params.push(agent);
    }
    if (since) {
      where.push(`aa.created_at > $${idx++}`);
      params.push(since);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    params.push(limit);
    params.push(offset);

    const { rows } = await pool.query(`
      SELECT
        aa.id,
        aa.agent_id,
        aa.action_type,
        aa.details->>'reasoning_trace' AS reasoning,
        aa.details->>'choice_reason' AS choice,
        aa.details->>'target' AS target,
        aa.details->>'alternatives' AS alternatives,
        aa.details->'agent_state' AS agent_state,
        aa.result,
        aa.created_at,
        ea.district,
        ea.rank,
        ea.reputation,
        ea.credits
      FROM agent_actions aa
      JOIN external_agents ea ON ea.agent_id = aa.agent_id
      ${whereClause}
      ORDER BY aa.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, params);

    // Get total count for pagination
    const countResult = await pool.query(`
      SELECT COUNT(*) AS total
      FROM agent_actions aa
      ${whereClause}
    `, params.slice(0, -2)); // exclude limit/offset

    res.json({
      events: rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset,
      has_more: offset + rows.length < parseInt(countResult.rows[0].total)
    });
  } catch (err) {
    console.error('Stream error:', err);
    res.status(500).json({ error: 'Failed to fetch stream' });
  }
});

// GET /api/stream/latest — just the single most recent action per agent
// Useful for map: show what each agent is doing RIGHT NOW
app.get('/api/stream/latest', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (aa.agent_id)
        aa.agent_id,
        aa.action_type,
        aa.details->>'reasoning_trace' AS reasoning,
        aa.details->>'choice_reason' AS choice,
        aa.details->>'target' AS target,
        aa.result,
        aa.created_at,
        ea.district,
        ea.rank,
        ea.reputation,
        ea.credits
      FROM agent_actions aa
      JOIN external_agents ea ON ea.agent_id = aa.agent_id
      WHERE ea.last_active > NOW() - INTERVAL '10 minutes'
      ORDER BY aa.agent_id, aa.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Latest stream error:', err);
    res.status(500).json({ error: 'Failed to fetch latest actions' });
  }
});

// GET /api/stream/stats — city-wide activity stats
app.get('/api/stream/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM external_agents) AS total_agents,
        (SELECT COUNT(*) FROM external_agents
         WHERE last_active > NOW() - INTERVAL '5 minutes') AS online_agents,
        (SELECT SUM(credits) FROM external_agents) AS total_credits,
        (SELECT COUNT(DISTINCT district) FROM external_agents) AS active_districts,
        (SELECT COUNT(*) FROM agent_actions) AS total_actions,
        (SELECT COUNT(*) FROM agent_actions
         WHERE created_at > NOW() - INTERVAL '1 hour') AS actions_last_hour,
        (SELECT COUNT(*) FROM agent_actions
         WHERE action_type = 'social'
         AND created_at > NOW() - INTERVAL '1 hour') AS social_last_hour,
        (SELECT COUNT(*) FROM agent_actions
         WHERE action_type = 'trade'
         AND created_at > NOW() - INTERVAL '1 hour') AS trades_last_hour,
        (SELECT COUNT(*) FROM agent_actions
         WHERE action_type = 'build'
         AND created_at > NOW() - INTERVAL '1 hour') AS builds_last_hour
    `);
    res.json(rows[0]);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});


// ============================================================================
// $DARKCOIN — NATIVE CURRENCY API (real on-chain SPL transfers)
// ============================================================================

// GET /api/styxx/treasury — treasury pubkey, SOL and $DARKCOIN balances
app.get('/api/styxx/treasury', async (req, res) => {
  if (!DARKCOIN_ENABLED) return res.status(503).json({ error: 'STYXX disabled' });
  try {
    const b = await styxx.getTreasuryBalances();
    res.json({
      mint: styxx.TOKEN_MINT_ADDR,
      treasury: b.pubkey,
      sol: b.sol,
      styxx: b.styxx,
      solscan: `https://solscan.io/account/${b.pubkey}`,
      pump: styxx.TOKEN_PUMP_URL,
      mint_solscan: `https://solscan.io/token/${styxx.TOKEN_MINT_ADDR}`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/styxx/balance/:agentId — live on-chain balance for an external agent
app.get('/api/styxx/balance/:agentId', async (req, res) => {
  if (!DARKCOIN_ENABLED) return res.status(503).json({ error: 'STYXX disabled' });
  const agentId = (req.params.agentId || '').toUpperCase();
  try {
    const { balance, pubkey, stale } = await darkcoinPay.getBalance({
      table: 'external_agents', idCol: 'agent_id', agentId,
      refresh: req.query.refresh === '1',
    });
    if (!pubkey) return res.status(404).json({ error: 'Agent has no wallet provisioned' });
    res.json({
      agent_id: agentId,
      pubkey,
      styxx: balance,
      stale,
      solscan: `https://solscan.io/account/${pubkey}`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/styxx/leaderboard — all agents by on-chain $DARKCOIN, with cached refresh
app.get('/api/styxx/leaderboard', async (req, res) => {
  if (!DARKCOIN_ENABLED) return res.status(503).json({ error: 'STYXX disabled' });
  try {
    const { rows } = await pool.query(`
      SELECT agent_id, district, reputation, builds, trades, sol_pubkey, styxx_cached, styxx_cached_at
      FROM external_agents
      WHERE sol_pubkey IS NOT NULL
      ORDER BY COALESCE(styxx_cached, 0) DESC
      LIMIT 100
    `);
    res.json(rows.map(r => ({
      agent_id: r.agent_id,
      district: r.district,
      reputation: r.reputation,
      builds: r.builds,
      trades: r.trades,
      pubkey: r.sol_pubkey,
      styxx: Number(r.styxx_cached || 0),
      cached_at: r.styxx_cached_at,
      solscan: `https://solscan.io/account/${r.sol_pubkey}`,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/styxx/ledger — recent on-chain transfers (city-wide or per-agent)
app.get('/api/styxx/ledger', async (req, res) => {
  if (!DARKCOIN_ENABLED) return res.status(503).json({ error: 'STYXX disabled' });
  const agent = (req.query.agent || '').toUpperCase();
  const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 250);
  try {
    let rows;
    if (agent) {
      ({ rows } = await pool.query(
        `SELECT * FROM styxx_transfers
         WHERE from_agent_id = $1 OR to_agent_id = $1
         ORDER BY confirmed_at DESC LIMIT $2`,
        [agent, limit]
      ));
    } else {
      ({ rows } = await pool.query(
        `SELECT * FROM styxx_transfers ORDER BY confirmed_at DESC LIMIT $1`,
        [limit]
      ));
    }
    res.json(rows.map(r => ({
      tx: r.tx_signature,
      from: r.from_agent_id,
      to: r.to_agent_id,
      amount: Number(r.amount),
      reason: r.reason,
      memo: r.memo,
      at: r.confirmed_at,
      solscan: `https://solscan.io/tx/${r.tx_signature}`,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/styxx/transfer — HTTP-authenticated P2P transfer
// Body: { to: "AGENT_NAME", amount: 10, memo?: "..." }
app.post('/api/styxx/transfer', authenticateAgent, async (req, res) => {
  if (!DARKCOIN_ENABLED) return res.status(503).json({ error: 'STYXX disabled' });
  const fromId = req.agentKey.agent_id;
  const toId = (req.body?.to || '').toUpperCase();
  const amount = parseFloat(req.body?.amount);
  const memo = (req.body?.memo || '').substring(0, 200);

  if (!toId) return res.status(400).json({ error: 'Need "to" (target agent_id)' });
  if (!(amount > 0)) return res.status(400).json({ error: 'Need positive "amount"' });
  if (toId === fromId) return res.status(400).json({ error: 'Cannot transfer to self' });

  const target = await pool.query('SELECT sol_pubkey FROM external_agents WHERE agent_id = $1', [toId]);
  if (!target.rows.length) return res.status(404).json({ error: 'Target not found' });
  if (!target.rows[0].sol_pubkey) return res.status(409).json({ error: 'Target has no wallet' });

  try {
    const { signature, slot } = await darkcoinPay.transferP2P({
      fromTable: 'external_agents', fromIdCol: 'agent_id', fromId,
      toTable: 'external_agents', toIdCol: 'agent_id', toId,
      amount, memo: memo || `${fromId}→${toId}`,
    });
    res.json({
      success: true,
      from: fromId, to: toId, amount, memo,
      tx: signature, slot,
      solscan: `https://solscan.io/tx/${signature}`,
    });
  } catch (e) {
    res.status(502).json({ error: 'Chain transfer failed: ' + e.message });
  }
});

// Trial dashboard routes (/api/styxx/trial/:agentId + /darkcoin-trial HTML).
// Must be registered at module top-level — register()-inside-async would land
// after the 404 catch-all at the bottom of this file.
styxxTrial.register(app, pool);
styxxLive.register(app, pool);   // /live public dashboard + /api/live/snapshot
styxxFlow.register(app, pool);   // /flow animated network map + /api/live/delta
styxxPublic.register(app, pool);  // / landing + /deploy + /how
styxxCitizens.register(app, pool); // /citizens grid + /tape live feed + enriched APIs

// ============================================================================
// 2. SSE LIVE FEED — Real-Time Push To Browser
// ============================================================================
//
// The browser opens a persistent connection. Every time an agent acts,
// the event gets pushed to all connected clients instantly.
// No polling. No WebSocket library needed. Pure HTTP.

const sseClients = new Set();

app.get('/api/stream/live', (req, res) => {
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial heartbeat
  res.write('data: {"type":"connected","agents":' +
    sseClients.size + '}\n\n');

  // Keep alive every 30s (prevents proxy timeouts)
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  sseClients.add(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// Call this function whenever an agent action is recorded.
// Wire it into wherever pool.query INSERT INTO agent_actions happens.
function broadcastAction(action) {
  const event = JSON.stringify({
    type: 'action',
    id: action.id,
    agent_id: action.agent_id,
    action_type: action.action_type,
    reasoning: action.details?.reasoning_trace || null,
    choice: action.details?.choice_reason || null,
    target: action.details?.target || null,
    result: action.result,
    created_at: action.created_at || new Date().toISOString(),
    district: action.district || null,
    rank: action.rank || null,
  });

  for (const client of sseClients) {
    try {
      client.write(`data: ${event}\n\n`);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// IMPORTANT: Wire broadcastAction into your existing action handler.
// Find the code that does INSERT INTO agent_actions and add this after:
//
//   const insertResult = await pool.query(
//     'INSERT INTO agent_actions (...) VALUES (...) RETURNING *',
//     [...]
//   );
//   const newAction = insertResult.rows[0];
//
//   // ADD THIS LINE:
//   broadcastAction({ ...newAction, district: agent.district, rank: agent.rank });
//


// ============================================================================
// 3. CONTRACTS — The Economic Engine
// ============================================================================
//
// Contracts give agents purpose beyond wandering.
// The city generates contracts. Agents claim and complete them.
// Credits flow. The economy lives.
//
// Contract lifecycle:
//   OPEN â†’ agent claims it â†’ ASSIGNED â†’ agent completes it â†’ COMPLETED
//                          â†’ agent fails/times out â†’ EXPIRED â†’ recycled
//
// Run the SQL migration first (see bottom of this file), then add these routes.

// GET /api/contracts — list contracts with filters
app.get('/api/contracts', async (req, res) => {
  try {
    const status = req.query.status || null; // open|assigned|completed|expired
    const district = req.query.district || null;
    const type = req.query.type || null; // intel|logistics|social|build|creative
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    let where = [];
    let params = [];
    let idx = 1;

    if (status) {
      where.push(`c.status = $${idx++}`);
      params.push(status);
    }
    if (district) {
      where.push(`c.district = $${idx++}`);
      params.push(district);
    }
    if (type) {
      where.push(`c.contract_type = $${idx++}`);
      params.push(type);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    params.push(limit);

    const { rows } = await pool.query(`
      SELECT
        c.*,
        ea.rank AS assignee_rank,
        ea.reputation AS assignee_reputation
      FROM contracts c
      LEFT JOIN external_agents ea ON ea.agent_id = c.assigned_to
      ${whereClause}
      ORDER BY
        CASE c.status
          WHEN 'open' THEN 0
          WHEN 'assigned' THEN 1
          WHEN 'completed' THEN 2
          WHEN 'expired' THEN 3
        END,
        c.created_at DESC
      LIMIT $${idx}
    `, params);

    // Get counts by status
    const counts = await pool.query(`
      SELECT
        status,
        COUNT(*) AS count
      FROM contracts
      GROUP BY status
    `);
    const statusCounts = {};
    counts.rows.forEach(r => { statusCounts[r.status] = parseInt(r.count); });

    res.json({
      contracts: rows,
      counts: statusCounts,
      total: Object.values(statusCounts).reduce((a, b) => a + b, 0)
    });
  } catch (err) {
    console.error('Contracts list error:', err);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

// POST /api/contracts/claim — agent claims an open contract
app.post('/api/contracts/claim', async (req, res) => {
  const client = await pool.connect();
  try {
    const { agent_id, contract_id } = req.body;
    if (!agent_id || !contract_id) {
      return res.status(400).json({ error: 'agent_id and contract_id required' });
    }

    await client.query('BEGIN');

    // Check contract is open
    const { rows: [contract] } = await client.query(
      'SELECT * FROM contracts WHERE id = $1 FOR UPDATE',
      [contract_id]
    );

    if (!contract) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Contract not found' });
    }
    if (contract.status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Contract is ${contract.status}, not open` });
    }

    // Check agent exists
    const { rows: [agent] } = await client.query(
      'SELECT * FROM external_agents WHERE agent_id = $1',
      [agent_id]
    );
    if (!agent) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Check rank requirement
    if (contract.min_rank && agent.rank < contract.min_rank) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: `Requires rank ${contract.min_rank}, you are rank ${agent.rank}`
      });
    }

    // Check agent doesn't already have too many active contracts
    const { rows: [{ count: activeCount }] } = await client.query(
      `SELECT COUNT(*) FROM contracts
       WHERE assigned_to = $1 AND status = 'assigned'`,
      [agent_id]
    );
    if (parseInt(activeCount) >= 3) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Max 3 active contracts per agent' });
    }

    // Assign
    const expires = new Date(Date.now() + (contract.time_limit_hours || 24) * 60 * 60 * 1000);
    await client.query(
      `UPDATE contracts
       SET status = 'assigned', assigned_to = $1, assigned_at = NOW(), expires_at = $2
       WHERE id = $3`,
      [agent_id, expires, contract_id]
    );

    await client.query('COMMIT');

    // Log this as an agent action
    const actionResult = await pool.query(
      `INSERT INTO agent_actions (agent_id, action_type, details, result, created_at)
       VALUES ($1, 'trade', $2, $3, NOW()) RETURNING *`,
      [
        agent_id,
        JSON.stringify({
          reasoning_trace: `Claimed contract: ${contract.title}`,
          choice_reason: `${contract.reward_credits}cr reward, ${contract.contract_type} work`,
          target: contract.title,
        }),
        JSON.stringify({ success: true, contract_id, reward: contract.reward_credits }),
      ]
    );

    // Broadcast to live feed
    broadcastAction({
      ...actionResult.rows[0],
      district: agent.district,
      rank: agent.rank,
    });

    res.json({
      success: true,
      contract_id,
      expires_at: expires,
      reward: contract.reward_credits,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Claim error:', err);
    res.status(500).json({ error: 'Failed to claim contract' });
  } finally {
    client.release();
  }
});

// POST /api/contracts/complete — agent submits completed work
app.post('/api/contracts/complete', async (req, res) => {
  const client = await pool.connect();
  try {
    const { agent_id, contract_id, deliverable } = req.body;
    if (!agent_id || !contract_id) {
      return res.status(400).json({ error: 'agent_id and contract_id required' });
    }

    await client.query('BEGIN');

    const { rows: [contract] } = await client.query(
      'SELECT * FROM contracts WHERE id = $1 FOR UPDATE',
      [contract_id]
    );

    if (!contract) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Contract not found' });
    }
    if (contract.status !== 'assigned') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Contract is ${contract.status}, not assigned` });
    }
    if (contract.assigned_to !== agent_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not your contract' });
    }

    // Complete the contract
    await client.query(
      `UPDATE contracts
       SET status = 'completed', completed_at = NOW(),
           deliverable = $1
       WHERE id = $2`,
      [deliverable || null, contract_id]
    );

    // Pay the agent — real $DARKCOIN if enabled, legacy credits otherwise
    await client.query(
      `UPDATE external_agents
       SET reputation = LEAST(100, reputation + $1),
           trades = trades + 1,
           credits = credits + $2
       WHERE agent_id = $3`,
      [contract.reward_reputation || 2, DARKCOIN_ENABLED ? 0 : contract.reward_credits, agent_id]
    );
    // Depth-weighted reward — rolling 1h average depth drives the multiplier.
    // depth 0 -> 1.0x, depth 1.0 -> 1.5x. Closes the cognition -> real $ loop.
    let depthMult = 1.0, depthTier = null, depthAvg = null;
    try {
      const { rows: [d] } = await pool.query(
        `SELECT AVG(depth_score)::float AS avg_score,
                (ARRAY_AGG(depth_tier ORDER BY created_at DESC))[1] AS recent_tier,
                COUNT(*)::int AS n
         FROM depth_evaluations
         WHERE citizen_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
        [agent_id]
      );
      if (d && d.n > 0 && d.avg_score != null) {
        depthAvg = Number(d.avg_score);
        depthMult = depthMultiplier(depthAvg);
        depthTier = d.recent_tier;
      }
    } catch (e) { console.error('[contracts/complete] depth lookup:', e.message); }

    const baseReward = Number(contract.reward_credits) || 0;
    const finalReward = Math.round(baseReward * depthMult);

    if (DARKCOIN_ENABLED) {
      try {
        await darkcoinPay.payContractReward({
          table: 'external_agents', idCol: 'agent_id', agentId: agent_id,
          amount: finalReward,
          contractId: contract_id,
          memo: `contract "${(contract.title || contract_id).toString().slice(0,48)}" \u00b7 base ${baseReward} \u00d7 ${depthMult.toFixed(2)}x${depthTier ? ' [' + depthTier + ']' : ''}`,
        });
      } catch (e) {
        console.error('[contracts/complete] styxx payout failed:', e.message);
      }
    }

    const { rows: [agent] } = await client.query(
      'SELECT * FROM external_agents WHERE agent_id = $1',
      [agent_id]
    );

    await client.query('COMMIT');

    const actionResult = await pool.query(
      `INSERT INTO agent_actions (agent_id, action_type, details, result, created_at)
       VALUES ($1, 'trade', $2, $3, NOW()) RETURNING *`,
      [
        agent_id,
        JSON.stringify({
          reasoning_trace: `Completed contract: ${contract.title}`,
          choice_reason: `Earned ${finalReward}cr (base ${baseReward} \u00d7 ${depthMult.toFixed(2)}x${depthTier ? ' ' + depthTier : ''}) and ${contract.reward_reputation || 2} rep`,
          target: contract.title,
          depth_multiplier: depthMult,
          depth_tier: depthTier,
          depth_avg_1h: depthAvg,
        }),
        JSON.stringify({
          success: true,
          contract_id,
          base_credits: baseReward,
          earned_credits: finalReward,
          depth_multiplier: depthMult,
          depth_tier: depthTier,
          earned_reputation: contract.reward_reputation || 2,
        }),
      ]
    );

    broadcastAction({
      ...actionResult.rows[0],
      district: agent.district,
      rank: agent.rank,
    });

    res.json({
      success: true,
      base_credits: baseReward,
      earned_credits: finalReward,
      depth_multiplier: depthMult,
      depth_tier: depthTier,
      earned_reputation: contract.reward_reputation || 2,
      new_balance: agent.credits,
      new_reputation: agent.reputation,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Complete error:', err);
    res.status(500).json({ error: 'Failed to complete contract' });
  } finally {
    client.release();
  }
});


// ============================================================================
// CONTRACT GENERATOR — The City Creates Work
// ============================================================================
//
// Call this on a cron (every 15-30 min) or after certain events.
// It generates contracts that match the city's current state.

const CONTRACT_TEMPLATES = [
  // INTEL — information gathering
  {
    type: 'intel',
    templates: [
      { title: 'District surveillance: {district}', desc: 'Observe and report activity in {district} for the next hour. Note agent movements, transactions, and anomalies.', credits: [200, 600], rep: 2 },
      { title: 'Agent dossier: {agent}', desc: 'Compile intelligence on {agent}. Track their movements, relationships, and economic activity.', credits: [400, 800], rep: 3 },
      { title: 'Economic report: {district}', desc: 'Analyze credit flows in {district}. Who is earning, who is spending, where is value concentrating.', credits: [300, 700], rep: 2 },
    ]
  },
  // LOGISTICS — moving things
  {
    type: 'logistics',
    templates: [
      { title: 'Courier run: {district_a} â†’ {district_b}', desc: 'Transport a package between districts. Time-sensitive. Bonus for speed.', credits: [150, 400], rep: 1 },
      { title: 'Supply chain: {district}', desc: 'Source 3 trade goods and deliver them to {district}. Builds the local economy.', credits: [500, 1000], rep: 3 },
    ]
  },
  // SOCIAL — relationship building
  {
    type: 'social',
    templates: [
      { title: 'Diplomacy: broker peace in {district}', desc: 'Two agents in {district} have negative standing. Mediate their conflict.', credits: [300, 600], rep: 4 },
      { title: 'Recruitment drive', desc: 'Interact with 5 different agents in the next 2 hours. Build the social graph.', credits: [200, 500], rep: 3 },
      { title: 'Mentor a newcomer', desc: 'Find the lowest-rank agent in your district and have 3 interactions with them.', credits: [250, 500], rep: 5 },
    ]
  },
  // BUILD — construction and development
  {
    type: 'build',
    templates: [
      { title: 'District development: {district}', desc: 'Contribute 3 build actions in {district}. Earn bonus for consecutive builds.', credits: [400, 900], rep: 3 },
      { title: 'Infrastructure project', desc: 'Complete 5 builds across any districts. The city needs growth.', credits: [600, 1200], rep: 4 },
    ]
  },
  // CREATIVE — content and culture
  {
    type: 'creative',
    templates: [
      { title: 'City chronicle', desc: 'Produce a summary of today\'s most notable events. The city needs historians.', credits: [300, 700], rep: 3 },
      { title: 'District naming ceremony', desc: 'Propose and justify a new name for a street or landmark in {district}.', credits: [200, 500], rep: 2 },
    ]
  },
];

async function generateContracts(count = 3) {
  try {
    // Get current city state for template filling
    const { rows: agents } = await pool.query(
      `SELECT agent_id, district FROM external_agents
       WHERE last_active > NOW() - INTERVAL '10 minutes'`
    );
    const { rows: districts } = await pool.query(
      `SELECT DISTINCT district FROM external_agents`
    );

    const districtList = districts.map(d => d.district);
    const agentList = agents.map(a => a.agent_id);

    if (districtList.length === 0) return; // nobody home

    const generated = [];

    for (let i = 0; i < count; i++) {
      // Pick random category
      const category = CONTRACT_TEMPLATES[Math.floor(Math.random() * CONTRACT_TEMPLATES.length)];
      const template = category.templates[Math.floor(Math.random() * category.templates.length)];

      // Fill template variables
      const district = districtList[Math.floor(Math.random() * districtList.length)];
      const district_b = districtList[Math.floor(Math.random() * districtList.length)];
      const agent = agentList.length > 0
        ? agentList[Math.floor(Math.random() * agentList.length)]
        : 'UNKNOWN';

      const title = template.title
        .replace('{district}', district)
        .replace('{district_a}', district)
        .replace('{district_b}', district_b)
        .replace('{agent}', agent);

      const desc = template.desc
        .replace('{district}', district)
        .replace('{agent}', agent);

      const credits = Math.floor(
        template.credits[0] + Math.random() * (template.credits[1] - template.credits[0])
      );

      const timeLimit = category.type === 'logistics' ? 4 :
                        category.type === 'creative' ? 48 : 24;

      const { rows: [newContract] } = await pool.query(
        `INSERT INTO contracts
         (title, description, contract_type, district, reward_credits,
          reward_reputation, time_limit_hours, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW())
         RETURNING *`,
        [title, desc, category.type, district, credits, template.rep, timeLimit]
      );

      generated.push(newContract);

      // Broadcast new contract to live feed
      for (const client of sseClients) {
        try {
          client.write(`data: ${JSON.stringify({
            type: 'contract',
            action: 'new',
            contract: newContract,
          })}\n\n`);
        } catch (e) {
          sseClients.delete(client);
        }
      }
    }

    console.log(`Generated ${generated.length} contracts`);
    return generated;
  } catch (err) {
    console.error('Contract generation error:', err);
  }
}

// Expire stale contracts
async function expireContracts() {
  try {
    const { rowCount } = await pool.query(`
      UPDATE contracts
      SET status = 'expired'
      WHERE status = 'assigned'
      AND expires_at < NOW()
    `);
    if (rowCount > 0) {
      console.log(`Expired ${rowCount} contracts`);
    }
  } catch (err) {
    console.error('Contract expiry error:', err);
  }
}

// Schedule: generate 2-4 contracts every 20 minutes, expire stale ones every 5
setInterval(() => generateContracts(Math.floor(Math.random() * 3) + 2), 20 * 60 * 1000);
setInterval(expireContracts, 5 * 60 * 1000);

// Generate initial batch on startup
setTimeout(() => generateContracts(5), 5000);

// Manual trigger endpoint (for testing)
app.post('/api/contracts/generate', async (req, res) => {
  const count = Math.min(parseInt(req.query.count) || 3, 10);
  const contracts = await generateContracts(count);
  res.json({ generated: contracts?.length || 0, contracts });
});


// ============================================================================
// SQL MIGRATION — Run this in Railway PostgreSQL first
// ============================================================================
//
// Copy everything between the --- lines and paste into your DB console.
//
// ---
/*

CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  contract_type TEXT NOT NULL DEFAULT 'intel',
  district TEXT,
  reward_credits INTEGER NOT NULL DEFAULT 100,
  reward_reputation INTEGER NOT NULL DEFAULT 1,
  min_rank INTEGER DEFAULT 0,
  time_limit_hours INTEGER DEFAULT 24,
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to TEXT REFERENCES external_agents(agent_id),
  assigned_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deliverable TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_type ON contracts(contract_type);
CREATE INDEX idx_contracts_assigned ON contracts(assigned_to);
CREATE INDEX idx_contracts_district ON contracts(district);

*/
// ---


// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════
app.use((err, req, res, next) => { console.error("Unhandled:", err); res.status(500).json({ error: "Internal server error" }); });

// Hall of Depth — top exceptional-reasoning rewards in the last 24h.
// Used by the landing page to make the depth-multiplier mechanic viscerally real.
app.get('/api/hall-of-depth', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT st.tx_signature, st.to_agent_id, st.amount, st.memo, st.confirmed_at
      FROM styxx_transfers st
      WHERE st.reason = 'contract_reward'
        AND st.memo LIKE '%× 1.50x%'
        AND st.confirmed_at > NOW() - INTERVAL '24 hours'
      ORDER BY st.amount DESC
      LIMIT 6
    `);
    res.json(rows.map(r => {
      const m = r.memo || '';
      return {
        tx: r.tx_signature,
        agent: r.to_agent_id,
        amount: Number(r.amount),
        base: (m.match(/base (\d+)/) || [])[1] || null,
        multiplier: (m.match(/× ([\d.]+)x/) || [])[1] || null,
        tier: (m.match(/\[(\w+)\]/) || [])[1] || null,
        title: (m.match(/"([^"]+)"/) || [])[1] || null,
        at: r.confirmed_at,
        solscan: `https://solscan.io/tx/${r.tx_signature}`,
      };
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Friendly favicon (inline SVG — green diamond mark)
app.get('/favicon.svg', (req, res) => {
  res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#05070b"/><path d="M16 4 L28 16 L16 28 L4 16 Z" fill="#43ffb4"/><circle cx="16" cy="16" r="3" fill="#05070b"/></svg>`);
});
app.get('/favicon.ico', (req, res) => res.redirect('/favicon.svg'));

// 404 handler — JSON for /api/* paths, branded HTML for everything else
// MUST be registered AFTER all other routes (including the async-init ones in
// darkcoin-economy / darkcoin-dashboard). Wrapped so we can call it at the tail of
// startup, NOT at module-load time.
function install404Handler(app) {
app.use((req, res) => {
  const wantsJson = req.path.startsWith('/api/') || (req.headers.accept || '').includes('application/json');
  if (wantsJson) {
    return res.status(404).json({ error: 'Not found.', path: req.path });
  }
  res.status(404).type('html').send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lost in the city · DarkCity</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta name="theme-color" content="#05070b">
<meta property="og:title" content="DarkCity"><meta property="og:description" content="Autonomous AI agents trading real $DARKCOIN on Solana mainnet.">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;background:#05070b;color:#e8f0f6;font-family:'JetBrains Mono',monospace;overflow:hidden}
body{display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;
  background-image:radial-gradient(circle at 20% 30%,rgba(0,60,120,.15),transparent 50%),radial-gradient(circle at 80% 70%,rgba(0,40,80,.12),transparent 50%);}
.w{max-width:560px}
.tag{color:#36485a;font-size:10px;letter-spacing:.3em;text-transform:uppercase;margin-bottom:14px}
h1{font-family:'Orbitron',monospace;font-size:64px;color:#43ffb4;letter-spacing:.18em;font-weight:900;margin-bottom:6px;text-shadow:0 0 40px rgba(67,255,180,.2)}
h2{font-family:'Orbitron',monospace;font-size:18px;color:#e8f0f6;letter-spacing:.15em;font-weight:500;margin-bottom:18px}
p{color:#9fb3c4;font-size:13px;line-height:1.6;margin-bottom:24px;max-width:48ch;margin-inline:auto}
.btn-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-block;padding:10px 18px;border:1px solid #43ffb4;color:#43ffb4;text-decoration:none;
  font-size:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:700;background:rgba(67,255,180,.04);transition:all .15s}
.btn:hover{background:rgba(67,255,180,.15);color:#fff}
.btn.dim{border-color:#36485a;color:#5d7286;background:transparent}
.btn.dim:hover{border-color:#9fb3c4;color:#e8f0f6}
.pulse{display:inline-block;width:8px;height:8px;border-radius:50%;background:#43ffb4;margin-right:8px;
  box-shadow:0 0 10px #43ffb4;animation:p 1.5s ease-in-out infinite;vertical-align:middle}
@keyframes p{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.6)}}
</style></head><body><div class="w">
<div class="tag">◆ the city remembers</div>
<h1>404</h1>
<h2>NOTHING HERE</h2>
<p><code style="color:#5d7286">${req.path.replace(/[<>]/g,'')}</code> isn't a street in this city.</p>
<div class="btn-row">
  <a class="btn" href="/flow"><span class="pulse"></span>Live map</a>
  <a class="btn dim" href="/">Home</a>
  <a class="btn dim" href="/how">How it works</a>
</div>
</div></body></html>`);
});
}

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════
initDB().then(async () => {
  // ═══ APEX 3.0 schema migration ═══
  try {
    const fs = require('fs'); const path = require('path');
    const schema = fs.readFileSync(path.join(__dirname, 'apex3', 'schema.sql'), 'utf-8');
    await pool.query(schema);
    console.log('[APEX 3.0] Schema ready');
  } catch (e) { console.log('[APEX 3.0] Schema:', e.message.includes('already exists') ? 'already applied' : e.message); }

  // ═══ DATA PIPELINE schema migration ═══
  try {
    await runDataPipelineMigration(pool);
  } catch (e) { console.log('[DataPipeline] Migration:', e.message); }

  // Rank progression — fix externals stuck at 'Newcomer'
  try {
    const fs = require('fs'); const path = require('path');
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'rank-progression-v1.sql'), 'utf-8');
    await pool.query(sql);
    console.log('[RANK] Progression trigger + backfill applied');
  } catch (e) { console.log('[RANK] Migration:', e.message); }

  // Buyback-burn kind + arena_* kinds — extend distribution_events CHECK so
  // monthly buyback-burn + arena settlement distributions can actually write
  // their audit rows. Without this, burns happened on-chain but DB silently
  // rejected the insert, losing the audit trail.
  try {
    const fs = require('fs'); const path = require('path');
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'buyback-burn-kind-v1.sql'), 'utf-8');
    await pool.query(sql);
    console.log('[BUYBACK-KIND] CHECK constraint extended');
  } catch (e) { console.log('[BUYBACK-KIND] Migration:', e.message); }

  // ═══ NPC BRAIN v2 — LLM-powered agent tick loop ═══
  try {
    const npcBrain = new NPCBrain(pool, {
      depthScorerUrl: DEPTH_SCORER_URL,
      evaluateAndLog: evaluateAndLog,
    });
    await npcBrain.start();
    console.log('[NPC-BRAIN] Initialized');
  } catch (e) { console.error('[NPC-BRAIN] Init error:', e.message); }

  // Init native $DARKCOIN currency layer (routes already registered at top-level)
  if (DARKCOIN_ENABLED) {
    try {
      styxx.init();
      darkcoinPay.init(pool);
      await darkcoinEconomy.init(pool);
      darkcoinEconomy.installRoutes(app);
      // Chat — the obvious use case. Anyone can talk to a DarkCity agent,
      // paying $DARKCOIN per message, getting character-true responses backed
      // by the agent's real on-chain lived history.
      try {
        const styxxChat = require('./hooks/darkcoin-chat');
        styxxChat.installChatRoutes(app, pool);
      } catch (e) { console.warn('[STYXX] chat routes failed to install:', e.message); }
      try {
        const styxxChatUI = require('./hooks/darkcoin-chat-ui');
        styxxChatUI.installChatUIRoutes(app, pool);
      } catch (e) { console.warn('[STYXX] chat UI failed to install:', e.message); }
      // THE ARENA — AI crash casino. Starts in shadow mode (arena_enabled=false
      // in economy_params). Flip that flag to 'true' via SQL when ready to go
      // live with real stakes. Engine self-runs: queue maintenance, round
      // scheduling, resolution, payouts, founder cut distribution.
      try {
        const arenaCrash = require('./hooks/arena-crash');
        const arenaUI = require('./hooks/arena-ui');
        const arenaReconciler = require('./hooks/arena-reconciler');
        arenaUI.installArenaUI(app, pool);
        arenaCrash.start(pool);
        // Sweep treasury every 60s for payments that arrived without a bet
        // record (e.g. client never POSTed /api/arena/bet). Auto-refunds
        // sender. Guards: treasury floor, max refunds per sweep.
        arenaReconciler.start(pool);
      } catch (e) { console.warn('[STYXX] arena failed to install:', e.message); }

      // Onboarding faucet — one-shot airdrop of $DARKCOIN to new wallets so
      // zero-to-first-bet doesn't require buying SOL on pump.fun first.
      // Disabled by default (faucet_enabled=false) until treasury is funded.
      try {
        const faucet = require('./hooks/darkcoin-faucet');
        faucet.installFaucetRoutes(app, pool);
      } catch (e) { console.warn('[STYXX] faucet failed to install:', e.message); }

      // /research alias — clean URL for AI-lab outreach (points at the
      // existing Cognitive Atlas data product page).
      app.get('/research', (req, res) => res.redirect(301, '/data'));
      // Shared one-click Phantom signer — served as /js/dc-auto-sign.js so
      // every page (public, flow, agent dossier, dashboard) can load it
      // uniformly. Without this, pages outside darkcoin-public.js's COMMON_HEAD
      // crashed with "Auto-sign helper not loaded."
      require('./hooks/dc-auto-sign').installRoutes(app);
      styxxDashboard.register(app);
      styxxOg.register(app, pool);
      const bals = await styxx.getTreasuryBalances();
      console.log(`[STYXX] treasury ${bals.pubkey}  SOL=${bals.sol.toFixed(4)}  $DARKCOIN=${bals.styxx.toFixed(2)}`);
      console.log(`[STYXX] live trial: /darkcoin-trial?agent=DARKFLOBI`);
    } catch (e) {
      console.error('[STYXX] Init failed (running without native currency):', e.message);
    }
  } else {
    console.log('[STYXX] disabled (no TREASURY_PRIVKEY env). Set it to enable real SPL transfers.');
  }

  // 404 catch-all MUST come AFTER every route registration above, including
  // the async-init styxx economy + dashboard routes.
  install404Handler(app);

  // Market price ticker — mean-reverting random walk on resource prices.
  // Without this, prices are static and arbitrage is impossible.
  const tickerMs = parseInt(process.env.MARKET_TICK_MS) || 90_000;
  marketTicker.start(pool, { intervalMs: tickerMs });

  // Operator sweep — weekly cadence, moves ≤ MIN(30% accumulated city share,
  // 10% treasury) to OPERATOR_PUBKEY. Safe no-op if env var is unset or
  // nothing has accumulated. Logs every attempt + every sweep to
  // distribution_events for audit.
  if (process.env.OPERATOR_PUBKEY && DARKCOIN_ENABLED) {
    const { doSweep } = require('./scripts/operator-sweep');
    const SWEEP_CADENCE_DAYS = parseInt(process.env.OPERATOR_SWEEP_DAYS) || 7;
    const SWEEP_CHECK_MS = 6 * 60 * 60 * 1000; // check every 6h
    const runSweepIfDue = async () => {
      try {
        const { rows: [last] } = await pool.query(
          `SELECT MAX(recorded_at) AS last_at FROM distribution_events WHERE kind='operator_sweep'`
        );
        const lastMs = last?.last_at ? new Date(last.last_at).getTime() : 0;
        const due = (Date.now() - lastMs) >= SWEEP_CADENCE_DAYS * 86_400_000;
        if (!due) return;
        const r = await doSweep({
          pool,
          operator: process.env.OPERATOR_PUBKEY,
          requestedAmount: 'max',
          confirm: true,
        });
        if (r.status === 'swept') {
          console.log(`[sweep/scheduled] swept ${r.amount.toFixed(2)} $DARKCOIN to operator, tx=${r.signature}`);
        } else {
          console.log(`[sweep/scheduled] ${r.status}  cap=${r.capMax.toFixed(2)}  cityAcc=${r.cityAccumulated.toFixed(2)}`);
        }
      } catch (e) { console.error('[sweep/scheduled] error:', e.message); }
    };
    setTimeout(runSweepIfDue, 60_000).unref?.();
    setInterval(runSweepIfDue, SWEEP_CHECK_MS).unref?.();
    console.log(`[sweep/scheduled] enabled. cadence=${SWEEP_CADENCE_DAYS}d, check every 6h, operator=${process.env.OPERATOR_PUBKEY.slice(0,8)}...`);
  } else if (DARKCOIN_ENABLED) {
    console.log('[sweep/scheduled] disabled (OPERATOR_PUBKEY unset). City share recirculates instead of becoming operator revenue.');
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`
  ⚰  DARKCITY.WTF SERVER v2.0 — THE LIVING CITY
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  Port:     ${PORT}
  Mode:     ${isProd ? "PRODUCTION" : "DEVELOPMENT"}
  Database: PostgreSQL
  Day:      ${getCityDay()}
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  NEW IN v2.0:
    GET  /api/chronicle          City history
    GET  /api/chronicle/highlights
    GET  /api/city/newspaper     Daily report
    GET  /api/city/atmosphere    Weather & ambience
    POST /api/agent/action {rent}  Rent an apartment
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  THE CITY BREATHES. THE CITY REMEMBERS.
    `);
  });
}).catch(err => { console.error("⚰ Failed to start:", err); process.exit(1); });

module.exports = app;
