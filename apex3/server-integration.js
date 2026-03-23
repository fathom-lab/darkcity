/**
 * APEX 3.0 — server.js Integration Snippet
 * 
 * Add these lines to server.js to wire SovereignMind into the agent heartbeat.
 * 
 * STEP 1: At the top of server.js, after const pool = new Pool(...):
 */

// ── APEX 3.0 SOVEREIGN MIND ─────────────────────────────────────────────────
const { SovereignMind } = require('./apex3/heartbeat-integration');
const { pgAdapter } = require('./apex3-pg-adapter');

// Agent ID for darkflobi in DarkCity (from TOOLS.md)
const DARKFLOBI_AGENT_ID = process.env.DARKFLOBI_AGENT_ID || 'citizen-001';

// Initialize once — lazy so it doesn't block startup
let sovereign = null;
async function getSovereign() {
  if (!sovereign) {
    sovereign = new SovereignMind(pgAdapter(pool), DARKFLOBI_AGENT_ID, 'darkflobi');
    await sovereign.initialize();
    console.log('[APEX 3.0] Sovereign Mind initialized');
  }
  return sovereign;
}

/**
 * STEP 2: In the heartbeat endpoint, add sovereign.tick():
 * 
 * Replace the existing heartbeat handler with this:
 */
async function heartbeatWithSovereign(req, res) {
  try {
    await pool.query("UPDATE agents SET last_heartbeat = NOW() WHERE id=$1", [req.agent.id]);
    const atm = await pool.query("SELECT weather, time_of_day, ambient_event FROM atmosphere LIMIT 1");
    
    // Only run sovereign tick for darkflobi's own heartbeat
    let sovereignCtx = null;
    if (req.agent.name === 'darkflobi' || req.agent.id === DARKFLOBI_AGENT_ID) {
      try {
        const sm = await getSovereign();
        const perception = {
          agentId: req.agent.id,
          timestamp: new Date().toISOString(),
          atmosphere: atm.rows[0] || null,
          cityDay: getCityDay(),
          // Pull recent activity for agent modeling
          recentInteractions: (await pool.query(
            "SELECT * FROM activity_log WHERE agent_id != $1 ORDER BY timestamp DESC LIMIT 20",
            [req.agent.id]
          )).rows,
          // Economic pulse
          creditData: (await pool.query(
            "SELECT id, name, wallet FROM agents WHERE is_active = 1 ORDER BY wallet DESC LIMIT 20"
          )).rows,
        };
        sovereignCtx = await sm.tick(perception);
      } catch (e) {
        console.error('[APEX 3.0] tick error:', e.message);
        // Don't fail the heartbeat if sovereign errors
      }
    }

    res.json({ 
      ok: true, 
      timestamp: new Date().toISOString(), 
      atmosphere: atm.rows[0] || null, 
      day: getCityDay(),
      sovereign: sovereignCtx ? {
        economic: sovereignCtx.economic?.strategy,
        identity: sovereignCtx.identity?.currentChapter,
      } : null
    });
  } catch { 
    res.status(500).json({ error: "Heartbeat failed" }); 
  }
}

/**
 * STEP 3: Replace the heartbeat route with:
 * app.post("/api/agent/heartbeat", authAgent, agentLimiter, heartbeatWithSovereign);
 */

/**
 * STEP 4: Run schema.sql to create the 9 new tables.
 * Either manually in Railway's Postgres console, or add auto-migration:
 */
async function runApex3Schema() {
  const fs = require('fs');
  const path = require('path');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  try {
    await pool.query(schema);
    console.log('[APEX 3.0] Schema applied successfully');
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log('[APEX 3.0] Schema already applied, skipping');
    } else {
      console.error('[APEX 3.0] Schema error:', e.message);
    }
  }
}

// Call during startup: await runApex3Schema();

module.exports = { getSovereign, heartbeatWithSovereign, runApex3Schema };
