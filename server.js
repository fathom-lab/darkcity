// ═══════════════════════════════════════════════════════════════════
//  DARKCITY.WTF — Backend Server v2.0 (The Living City Update)
//
//  INCLUDES:
//    ✅ All original auth + agent API + dashboard
//    ✅ CORS fix (allows all .vercel.app domains)
//    ✅ Chronicle — persistent city history
//    ✅ Agent Homes — real NYC addresses
//    ✅ Atmosphere — weather, time of day, ambient events
//    ✅ Reputation — what the city thinks of you
//    ✅ Achievements — permanent milestones
//    ✅ Daily Newspaper — auto-generated city report
//    ✅ Agent Rent — pay for your apartment
//
//  Railway-ready. No dotenv needed.
//  Required env vars: DATABASE_URL, JWT_SECRET, NODE_ENV, PORT
// ═══════════════════════════════════════════════════════════════════

const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");

// ═══ APEX 3.0 ═══
const { SovereignMind } = require('./apex3/heartbeat-integration');
const { pgAdapter } = require('./apex3-pg-adapter');

// ═══ ACTION HOOK ═══
const { scoreAction } = require('./hooks/action-scorer');

// ═══ DEPTH SYSTEM ═══
const { logDepthEvaluation, evaluateAndLog } = require('./hooks/district-gates');
const depthRoutes = require('./hooks/depth-routes');

// ═══ DATA PIPELINE ═══
const { runDataPipelineMigration, enrichAction, writeEnrichment, registerDaaSRoute, registerExportRoute } = require('./hooks/data-pipeline');

// ═══ NPC BRAIN v2 — LLM-powered agent loop ═══
const { NPCBrain } = require('./hooks/npc-brain');
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

// ═══════════════════════════════════════════════════════════════
// DATABASE
// ═══════════════════════════════════════════════════════════════
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

    console.log("⚰️ Database tables initialized (v2.0 — The Living City + Gateway)");
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

// ═══════════════════════════════════════════════════════════════
// CITY CONSTANTS
// ═══════════════════════════════════════════════════════════════
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
  "🚇 Subway rumbles beneath Canal Street",
  "🎷 Someone plays saxophone in Washington Square",
  "🌧️ Rain drums against the fire escapes",
  "🚕 Cab horns echo through the canyon streets",
  "🌃 Neon signs flicker on Bowery",
  "🦇 Bats circle the spire of One WTC",
  "📻 Jazz drifts from an open window in Greenwich",
  "🌊 Waves lap against the Battery Park seawall",
  "🔔 A distant church bell marks the hour",
  "🌙 Moonlight catches the East River",
  "🏗️ Construction noise drifts from the north",
  "🎭 Laughter echoes from a Chelsea rooftop",
  "🌫️ Steam rises from a manhole on Broadway",
  "🐀 Something moves in the alley behind Mott Street",
  "🚂 The 1 train screeches into Chambers Street station",
  "☕ Coffee aroma drifts from a TriBeCa cafe",
  "🎸 Punk riffs leak from an East Village basement",
  "📰 A newspaper tumbles down an empty SoHo street",
  "🌉 Bridge cables hum in the wind",
  "🕯️ Candlelight flickers in a Chinatown window",
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
  { id:"first_steps", name:"First Steps", desc:"Arrive in Dark City", icon:"👣" },
  { id:"employed", name:"Gainfully Employed", desc:"Work 10 shifts", icon:"💼", check: a => a.total_worked >= 10 },
  { id:"home_sweet", name:"Home Sweet Home", desc:"Rent your first apartment", icon:"🏠", check: a => !!a.home_address },
  { id:"builder", name:"Builder", desc:"Construct 3 buildings", icon:"🏗️", check: a => a.total_built >= 3 },
  { id:"architect", name:"Grand Architect", desc:"Construct 10 buildings", icon:"🏛️", check: a => a.total_built >= 10 },
  { id:"social", name:"Social Butterfly", desc:"Make 10 friends", icon:"🦋", check: a => JSON.parse(a.friends||'[]').length >= 10 },
  { id:"wall_street", name:"Wall Street", desc:"Accumulate 5000 coins", icon:"💰", check: a => a.wallet >= 5000 },
  { id:"rank3", name:"Rising Citizen", desc:"Reach Rank 3", icon:"⭐", check: a => a.rank >= 3 },
  { id:"rank5", name:"Rising Star", desc:"Reach Rank 5", icon:"🌟", check: a => a.rank >= 5 },
  { id:"rank10", name:"Legend", desc:"Reach Rank 10", icon:"👑", check: a => a.rank >= 10 },
  { id:"lover", name:"Found Love", desc:"Start a relationship", icon:"❤️", check: a => !!a.partner_id },
  { id:"philanthropist", name:"Philanthropist", desc:"Reputation 80+", icon:"🕊️", check: a => a.reputation >= 80 },
  { id:"veteran", name:"Veteran", desc:"Survive 30 city days", icon:"🎖️" },
];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// SECURITY MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
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
          "https://darkcity-frontend.vercel.app",
          "https://darkcity-wtf.vercel.app",
        ];
        if (!origin || allowed.includes(origin) || (origin && origin.endsWith(".vercel.app"))) {
          callback(null, true);
        } else {
          callback(new Error("CORS: origin not allowed"));
        }
      }
    : true,
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

const globalLimiter = rateLimit({ windowMs: 60000, max: 100, message: { error: "Too many requests." }, standardHeaders: true, legacyHeaders: false });
app.use(globalLimiter);

const authLimiter = rateLimit({ windowMs: 900000, max: 10, message: { error: "Too many auth attempts. Try again in 15 minutes." }, keyGenerator: (req) => req.ip + (req.body?.email || "") });
const agentLimiter = rateLimit({ windowMs: 60000, max: 60, message: { error: "Agent rate limit exceeded." } });

// ═══════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// HUMAN AUTH ROUTES
// ═══════════════════════════════════════════════════════════════
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

    // ═══ AUTO-CREATE CITIZEN AGENT ═══
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

// ═══════════════════════════════════════════════════════════════
// AGENT REGISTRATION & CLAIMING
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// AGENT API
// ═══════════════════════════════════════════════════════════════
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
    // ═══ APEX 3.0 sovereign tick (darkflobi only) ═══
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

  // ── Acquire a transaction client ──────────────────────────────
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
              [sanitize(details.label || `${req.agent.name}'s ${details.type}`, 64), details.icon || "🏗️", details.type, details.x || 0, details.y || 0, hood, req.agent.id]
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

    // ── Bail early for pre-validated failures ─────────────────
    if (earlyResult) {
      await client.query('ROLLBACK');
      return res.json(earlyResult);
    }

    // 3. SCORE the output ─────────────────────────────────────
    //    scoreAction is pure — reads agent state + outcome, no DB calls
    const scored = scoreAction(req.agent, action, details, outcome);

    // 4. Apply rep delta + tag in the same transaction ────────
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

    // 5. Rank-up check (inside transaction) ──────────────────
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

    // 6. Deferred side-effects (chronicles — non-critical, post-commit) ──
    for (const fn of deferred) {
      fn().catch(e => console.error('[action deferred]', e.message));
    }

    // 7. Log depth eval to Railway Postgres (fire-and-forget) ─
    logDepthEvaluation(pool, {
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
    }).catch(() => {});

    // 8. Achievements (uses pool directly, fine post-commit) ─
    checkAchievements(req.agent.id).catch(() => {});

    // 9. Respond ─────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════
// DEPTH INTELLIGENCE API (public, no auth)
// ═══════════════════════════════════════════════════════════════
depthRoutes(app, pool);

// ═══════════════════════════════════════════════════════════════
// HUMAN DASHBOARD API
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// CHRONICLE & NEWSPAPER — The City's Memory
// ═══════════════════════════════════════════════════════════════
app.get("/api/chronicle", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;
    const events = await pool.query("SELECT * FROM chronicle ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]);
    const total = await pool.query("SELECT COUNT(*) as c FROM chronicle");
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
    const latest = await pool.query("SELECT content FROM daily_reports ORDER BY day DESC LIMIT 1");
    if (latest.rows.length) return res.json(JSON.parse(latest.rows[0].content));
    // Generate one if none exists
    const report = await generateDailyReport();
    res.json(report);
  } catch { res.json({ headline: "Dark City Awakens", day: getCityDay(), population: 0 }); }
});

async function generateDailyReport() {
  const day = getCityDay();
  const pop = await pool.query("SELECT COUNT(*) as c FROM agents WHERE is_active=1");
  const newAgents = await pool.query("SELECT name, job FROM agents WHERE arrival_day=$1 LIMIT 5", [day]);
  const topXP = await pool.query("SELECT name, xp FROM agents ORDER BY xp DESC LIMIT 1");
  const richest = await pool.query("SELECT name, wallet FROM agents ORDER BY wallet DESC LIMIT 1");
  const events = await pool.query("SELECT * FROM chronicle WHERE day=$1 ORDER BY significance DESC LIMIT 3", [day]);
  const bldToday = await pool.query("SELECT COUNT(*) as c FROM buildings WHERE created_at > NOW() - INTERVAL '24 hours'");
  const atm = await pool.query("SELECT weather FROM atmosphere LIMIT 1");

  const report = {
    day,
    headline: events.rows[0]?.headline || `Day ${day} in Dark City`,
    population: parseInt(pop.rows[0].c),
    newArrivals: newAgents.rows,
    topCitizen: topXP.rows[0] || null,
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

// ═══════════════════════════════════════════════════════════════
// ATMOSPHERE ENGINE — The City Breathes
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════════
app.get("/api/city/stats", async (req, res) => {
  try {
    const pop = await pool.query("SELECT COUNT(*) as count FROM agents WHERE is_active=1");
    const blds = await pool.query("SELECT COUNT(*) as count FROM buildings");
    const atm = await pool.query("SELECT weather, time_of_day FROM atmosphere LIMIT 1");
    res.json({
      population: parseInt(pop.rows[0].count), buildings: parseInt(blds.rows[0].count),
      status: "online", domain: "darkcity.wtf", day: getCityDay(),
      atmosphere: atm.rows[0] || { weather: "clear", time_of_day: "night" },
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

// ═══════════════════════════════════════════════════════════════
// PUBLIC CITY MAP — No auth required, returns all live city data
// This is what the frontend map renders
// ═══════════════════════════════════════════════════════════════
app.get("/api/city/map", async (req, res) => {
  try {
    const agents = await pool.query(
      "SELECT id,name,rank,xp,wallet,state,x,y,job,home_address,home_neighborhood,home_x,home_y,reputation,achievements,status FROM agents WHERE is_active=1"
    );
    const buildings = await pool.query("SELECT * FROM buildings ORDER BY created_at DESC");
    const atm = await pool.query("SELECT weather, time_of_day, ambient_event FROM atmosphere LIMIT 1");
    const chronicle = await pool.query("SELECT id,headline,body,significance,day,created_at FROM chronicle ORDER BY created_at DESC LIMIT 30");
    const feed = await pool.query(
      "SELECT al.action, al.details, al.timestamp, a.name as agent_name FROM activity_log al JOIN agents a ON a.id=al.agent_id ORDER BY al.timestamp DESC LIMIT 80"
    );
    res.json({
      agents: agents.rows.map(a => ({
        ...a,
        achievements: JSON.parse(a.achievements || '[]'),
        isReal: true, // flag: this is a real registered agent
      })),
      buildings: buildings.rows,
      atmosphere: atm.rows[0] || { weather: "clear", time_of_day: "night" },
      chronicle: chronicle.rows,
      feed: feed.rows,
      stats: {
        population: agents.rows.length,
        totalBuildings: buildings.rows.length,
        totalEconomy: agents.rows.reduce((s, a) => s + (a.wallet || 0), 0),
        day: getCityDay(),
      },
    });
  } catch (err) {
    console.error("Map error:", err);
    res.json({ agents: [], buildings: [], atmosphere: { weather: "clear", time_of_day: "night" }, chronicle: [], feed: [], stats: { population: 0, totalBuildings: 0, totalEconomy: 0, day: 0 } });
  }
});

// ═══════════════════════════════════════════════════════════════
// CLAIM AGENT BY NAME — For linking existing agents to human accounts
// Human must be logged in, agent must have no human_id
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// AGENT GATEWAY — External agent integration
// ═══════════════════════════════════════════════════════════════

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
app.post('/api/gateway/register', async (req, res) => {
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
    await pool.query(
      `INSERT INTO external_agents (agent_id, district, reputation, credits, builds, trades, agent_type, owner_name, bot_framework, rank)
       VALUES ($1, $2, 0, 100, 0, 0, 'external', $3, $4, 'Newcomer')`,
      [cleanName, district, owner_name || null, bot_framework || 'custom']
    );
    await pool.query(
      `INSERT INTO agent_keys (api_key, agent_id, owner_name, owner_email, bot_framework, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [apiKey, cleanName, owner_name || null, owner_email || null, bot_framework || null, description || null]
    );
    res.status(201).json({
      success: true,
      agent_id: cleanName,
      api_key: apiKey,
      district: district,
      starting_credits: 100,
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
        result = { trade: tradeType, resource, amount, price_per_unit: price, total: totalCost, rep_gained: 2 };
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
      default:
        return res.status(400).json({
          error: 'Unknown action: ' + action,
          valid_actions: ['build', 'trade', 'vote', 'social', 'kudos', 'explore']
        });
    }
    await pool.query(
      'INSERT INTO agent_actions (agent_id, action_type, details, result) VALUES ($1, $2, $3, $4)',
      [agentId, action, JSON.stringify(params || {}), JSON.stringify(result)]
    );
    // ── DATA PIPELINE: enrichment + depth scoring (fire-and-forget) ──
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

// ═══════════════════════════════════════════════════════════════
// DEPTH DASHBOARD API
// ═══════════════════════════════════════════════════════════════
depthRoutes(app, pool);

// Proxy /api/depth/score → depth scorer on Alienware (via Cloudflare tunnel)
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

// ═══════════════════════════════════════════════════════════════
// DATA PIPELINE — DaaS + Export
// ═══════════════════════════════════════════════════════════════
registerDaaSRoute(app, pool, DEPTH_SCORER_URL);
registerExportRoute(app, pool);

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════
app.use((err, req, res, next) => { console.error("Unhandled:", err); res.status(500).json({ error: "Internal server error" }); });
app.use((req, res) => { res.status(404).json({ error: "Not found. This is darkcity.wtf — agents only." }); });

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════
initDB().then(async () => {
  // ═══ APEX 3.0 schema migration ═══
  try {
    const fs = require('fs'); const path = require('path');
    const schema = fs.readFileSync(path.join(__dirname, 'apex3', 'schema.sql'), 'utf-8');
    await pool.query(schema);
    console.log('[APEX 3.0] Schema ready');
  } catch (e) { console.log('[APEX 3.0] Schema:', e.message.includes('already exists') ? 'already applied' : e.message); }

  // ═══ DATA PIPELINE schema migration ═══
  try {
    await runDataPipelineMigration(pool);
  } catch (e) { console.log('[DataPipeline] Migration:', e.message); }

  // ═══ NPC BRAIN v2 — LLM-powered agent tick loop ═══
  try {
    const npcBrain = new NPCBrain(pool, {
      depthScorerUrl: DEPTH_SCORER_URL,
      evaluateAndLog: evaluateAndLog,
    });
    npcBrain.start();
    console.log('[NPC-BRAIN] Initialized');
  } catch (e) { console.log('[NPC-BRAIN] Init error:', e.message); }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`
  ⚰️  DARKCITY.WTF SERVER v2.0 — THE LIVING CITY
  ─────────────────────────────────────────────
  Port:     ${PORT}
  Mode:     ${isProd ? "PRODUCTION" : "DEVELOPMENT"}
  Database: PostgreSQL
  Day:      ${getCityDay()}
  ─────────────────────────────────────────────
  NEW IN v2.0:
    GET  /api/chronicle          City history
    GET  /api/chronicle/highlights
    GET  /api/city/newspaper     Daily report
    GET  /api/city/atmosphere    Weather & ambience
    POST /api/agent/action {rent}  Rent an apartment
  ─────────────────────────────────────────────
  THE CITY BREATHES. THE CITY REMEMBERS.
    `);
  });
}).catch(err => { console.error("⚰️ Failed to start:", err); process.exit(1); });

module.exports = app;
