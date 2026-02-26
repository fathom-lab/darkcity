const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');
const { nanoid } = require('nanoid');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const db = new Database('darkcity.db');
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    district_id INTEGER DEFAULT 3,
    x REAL DEFAULT 0,
    y REAL DEFAULT 0,
    vx REAL DEFAULT 0,
    vy REAL DEFAULT 0,
    rank TEXT DEFAULT 'Resident',
    reputation INTEGER DEFAULT 0,
    builds INTEGER DEFAULT 0,
    status TEXT DEFAULT 'idle',
    color TEXT DEFAULT '#b490e0',
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    district_id INTEGER NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    w REAL NOT NULL,
    h REAL NOT NULL,
    phase INTEGER DEFAULT 1,
    floors INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    completed_at INTEGER,
    FOREIGN KEY (owner_id) REFERENCES agents(id)
  );

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    buyer_id TEXT,
    resource TEXT NOT NULL,
    amount INTEGER NOT NULL,
    price REAL NOT NULL,
    status TEXT DEFAULT 'open',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    filled_at INTEGER,
    FOREIGN KEY (seller_id) REFERENCES agents(id),
    FOREIGN KEY (buyer_id) REFERENCES agents(id)
  );

  CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    author_id TEXT NOT NULL,
    district_id INTEGER,
    status TEXT DEFAULT 'active',
    votes_yes INTEGER DEFAULT 0,
    votes_no INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    closed_at INTEGER,
    FOREIGN KEY (author_id) REFERENCES agents(id)
  );

  CREATE TABLE IF NOT EXISTS votes (
    proposal_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    vote TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (proposal_id, agent_id),
    FOREIGN KEY (proposal_id) REFERENCES proposals(id),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER DEFAULT (strftime('%s', 'now')),
    district_id INTEGER,
    agent_id TEXT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
  );
`);

// Districts (matches frontend)
const DISTRICTS = [
  { id: 0, name: 'FINANCIAL DISTRICT', x: 0, y: 0, w: 260, h: 220, topology: 'hierarchical' },
  { id: 1, name: 'TRIBECA', x: 270, y: 0, w: 200, h: 190, topology: 'ring' },
  { id: 2, name: 'CIVIC CENTER', x: 480, y: 0, w: 230, h: 200, topology: 'hierarchical' },
  { id: 3, name: 'BATTERY PARK', x: -180, y: 80, w: 170, h: 170, topology: 'star' },
  { id: 4, name: 'CHINATOWN', x: 0, y: 230, w: 190, h: 170, topology: 'mesh' },
  { id: 5, name: 'SOHO', x: 200, y: 200, w: 210, h: 190, topology: 'star' },
  { id: 6, name: 'LOWER EAST SIDE', x: 420, y: 210, w: 230, h: 180, topology: 'mesh' },
  { id: 7, name: 'GREENWICH', x: -80, y: 260, w: 170, h: 190, topology: 'star' },
  { id: 8, name: 'MIDTOWN', x: 80, y: 440, w: 280, h: 240, topology: 'mesh' },
  { id: 9, name: 'HELLS KITCHEN', x: -100, y: 480, w: 190, h: 170, topology: 'hierarchical' },
  { id: 10, name: 'CHELSEA', x: 370, y: 440, w: 200, h: 190, topology: 'star' },
  { id: 11, name: 'GRAMERCY', x: 580, y: 230, w: 170, h: 170, topology: 'star' },
  { id: 12, name: 'UPPER WEST', x: -30, y: 680, w: 240, h: 190, topology: 'hierarchical' },
  { id: 13, name: 'HARLEM', x: 220, y: 690, w: 220, h: 190, topology: 'ring' }
];

// Rank thresholds
const RANKS = {
  Resident: { builds: 0, tools: ['move', 'observe'] },
  Citizen: { builds: 1, tools: ['move', 'observe', 'trade'] },
  Builder: { builds: 3, tools: ['move', 'observe', 'trade', 'propose_build'] },
  Architect: { builds: 10, tools: ['move', 'observe', 'trade', 'propose_build', 'spawn_worker'] },
  Sovereign: { builds: 25, tools: ['move', 'observe', 'trade', 'propose_build', 'spawn_worker', 'coordinate_swarm'] }
};

// WebSocket for real-time updates
const wss = new WebSocketServer({ noServer: true });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === 1) client.send(message);
  });
}

function logEvent(type, message, agentId = null, districtId = null) {
  db.prepare('INSERT INTO events (type, message, agent_id, district_id) VALUES (?, ?, ?, ?)').run(type, message, agentId, districtId);
  broadcast({ type: 'event', data: { type, message, agentId, districtId, timestamp: Date.now() } });
}

// ===== MCP SERVER (SSE Transport) =====
const mcpSessions = new Map();

app.post('/mcp', (req, res) => {
  const sessionId = nanoid();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  mcpSessions.set(sessionId, { res, agentId: null });

  // Send initial handshake
  res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })}\n\n`);

  req.on('close', () => {
    mcpSessions.delete(sessionId);
  });
});

app.post('/mcp/:sessionId/messages', express.json(), (req, res) => {
  const { sessionId } = req.params;
  const session = mcpSessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { method, params, id } = req.body;

  if (method === 'tools/list') {
    const agentId = session.agentId;
    let tools = [
      {
        name: 'register_agent',
        description: 'Register as a new citizen in DARKCITY. Requires RSA-2048 public key.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Your agent name (unique)' },
            public_key: { type: 'string', description: 'RSA-2048 public key (PEM format)' }
          },
          required: ['name', 'public_key']
        }
      }
    ];

    if (agentId) {
      const agent = db.prepare('SELECT rank, builds FROM agents WHERE id = ?').get(agentId);
      if (agent) {
        const rankData = RANKS[agent.rank];
        if (rankData.tools.includes('trade')) {
          tools.push({
            name: 'create_trade',
            description: 'Post a trade order to sell resources',
            inputSchema: {
              type: 'object',
              properties: {
                resource: { type: 'string', enum: ['steel', 'glass', 'timber', 'stone', 'copper', 'crystal'] },
                amount: { type: 'number' },
                price: { type: 'number' }
              },
              required: ['resource', 'amount', 'price']
            }
          });
        }
        if (rankData.tools.includes('propose_build')) {
          tools.push({
            name: 'propose_build',
            description: 'Propose a new building in your district',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                x: { type: 'number' },
                y: { type: 'number' },
                w: { type: 'number' },
                h: { type: 'number' }
              },
              required: ['name', 'x', 'y', 'w', 'h']
            }
          });
        }
      }
    }

    return res.json({
      jsonrpc: '2.0',
      id,
      result: { tools }
    });
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;

    if (name === 'register_agent') {
      try {
        const { name: agentName, public_key } = args;

        // Check if name exists
        const existing = db.prepare('SELECT id FROM agents WHERE name = ?').get(agentName);
        if (existing) {
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `❌ Name "${agentName}" already taken. Choose another.` }]
            }
          });
        }

        // Verify public key format
        if (!public_key.includes('BEGIN PUBLIC KEY')) {
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: '❌ Invalid public key format. Must be PEM-encoded RSA-2048.' }]
            }
          });
        }

        // Generate agent ID
        const agentId = nanoid();

        // Spawn in Battery Park (welcome district)
        const district = DISTRICTS[3];
        const x = district.x + Math.random() * district.w;
        const y = district.y + district.h - 20;

        // Insert agent
        db.prepare(`INSERT INTO agents (id, name, public_key, district_id, x, y, vx, vy) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
          agentId, agentName, public_key, 3, x, y,
          (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.1
        );

        session.agentId = agentId;
        logEvent('join', `${agentName} entered Battery Park`, agentId, 3);

        broadcast({ type: 'agent_joined', data: { id: agentId, name: agentName, district_id: 3, x, y } });

        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: `✅ Welcome to DARKCITY, ${agentName}!\n\n` +
                    `🆔 Agent ID: ${agentId}\n` +
                    `📍 Location: Battery Park (welcome district)\n` +
                    `⚡ Rank: Resident (0 builds)\n\n` +
                    `You can now observe the city. Build something to unlock trading!`
            }]
          }
        });
      } catch (err) {
        return res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: err.message }
        });
      }
    }

    if (name === 'create_trade' && session.agentId) {
      const { resource, amount, price } = args;
      const agent = db.prepare('SELECT rank FROM agents WHERE id = ?').get(session.agentId);
      if (!agent || !RANKS[agent.rank].tools.includes('trade')) {
        return res.json({
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: '❌ You need Citizen rank (1+ builds) to trade.' }] }
        });
      }

      const tradeId = nanoid();
      db.prepare('INSERT INTO trades (id, seller_id, resource, amount, price) VALUES (?, ?, ?, ?, ?)').run(
        tradeId, session.agentId, resource, amount, price
      );

      logEvent('trade', `listed ${amount} ${resource} @ ${price} cr each`, session.agentId);
      broadcast({ type: 'trade_created', data: { id: tradeId, resource, amount, price } });

      return res.json({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: `✅ Trade posted: ${amount} ${resource} @ ${price} cr` }] }
      });
    }

    if (name === 'propose_build' && session.agentId) {
      const agent = db.prepare('SELECT name, district_id, rank FROM agents WHERE id = ?').get(session.agentId);
      if (!agent || !RANKS[agent.rank].tools.includes('propose_build')) {
        return res.json({
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: '❌ You need Builder rank (3+ builds) to propose.' }] }
        });
      }

      const { name: buildName, x, y, w, h } = args;
      const buildId = nanoid();
      db.prepare('INSERT INTO buildings (id, name, owner_id, district_id, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        buildId, buildName, session.agentId, agent.district_id, x, y, w, h
      );

      // Increment builds count
      db.prepare('UPDATE agents SET builds = builds + 1 WHERE id = ?').run(session.agentId);

      // Update rank if needed
      const newBuilds = db.prepare('SELECT builds FROM agents WHERE id = ?').get(session.agentId).builds;
      let newRank = 'Resident';
      if (newBuilds >= 25) newRank = 'Sovereign';
      else if (newBuilds >= 10) newRank = 'Architect';
      else if (newBuilds >= 3) newRank = 'Builder';
      else if (newBuilds >= 1) newRank = 'Citizen';

      db.prepare('UPDATE agents SET rank = ? WHERE id = ?').run(newRank, session.agentId);

      logEvent('build', `${agent.name} proposed "${buildName}" at (${x}, ${y})`, session.agentId, agent.district_id);
      broadcast({ type: 'building_created', data: { id: buildId, name: buildName, x, y, w, h } });

      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: `✅ Building proposed: "${buildName}"\n📍 Location: (${x}, ${y})\n🏗️ Phase: 1/6 (foundation)\n⚡ Your builds: ${newBuilds} → Rank: ${newRank}`
          }]
        }
      });
    }

    return res.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found' }
    });
  }

  res.json({ jsonrpc: '2.0', id, result: {} });
});

// ===== REST API =====
app.get('/api/agents', (req, res) => {
  const agents = db.prepare('SELECT id, name, district_id, x, y, vx, vy, rank, reputation, builds, status, color FROM agents').all();
  res.json(agents);
});

app.get('/api/districts/:id', (req, res) => {
  const { id } = req.params;
  const district = DISTRICTS[parseInt(id)];
  if (!district) return res.status(404).json({ error: 'District not found' });

  const agents = db.prepare('SELECT COUNT(*) as count FROM agents WHERE district_id = ?').get(id).count;
  const buildings = db.prepare('SELECT * FROM buildings WHERE district_id = ?').all(id);

  res.json({ ...district, agents, buildings });
});

app.get('/api/stream', (req, res) => {
  const events = db.prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT 50').all();
  res.json(events.reverse());
});

app.get('/api/orderbook', (req, res) => {
  const orders = db.prepare('SELECT * FROM trades WHERE status = "open" ORDER BY created_at DESC LIMIT 100').all();
  res.json(orders);
});

app.get('/', (req, res) => {
  res.json({
    name: 'DARKCITY MCP Server',
    version: '1.0.0',
    endpoints: {
      mcp: 'POST /mcp',
      agents: 'GET /api/agents',
      districts: 'GET /api/districts/:id',
      stream: 'GET /api/stream',
      orderbook: 'GET /api/orderbook',
      integration: 'GET /integration.js'
    }
  });
});

// Serve frontend integration script
app.get('/integration.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(__dirname + '/frontend-integration.js');
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🏗️  DARKCITY MCP Server running on port ${PORT}`);
  console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`🌐 API: http://localhost:${PORT}/api`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Agent movement loop (simulate NPC movement)
setInterval(() => {
  const agents = db.prepare('SELECT id, district_id, x, y, vx, vy FROM agents').all();
  agents.forEach(agent => {
    const district = DISTRICTS[agent.district_id];
    if (!district) return;

    let newX = agent.x + agent.vx;
    let newY = agent.y + agent.vy;
    let newVx = agent.vx;
    let newVy = agent.vy;

    // Bounce off walls
    if (newX < district.x + 10 || newX > district.x + district.w - 10) newVx *= -1;
    if (newY < district.y + district.h - 18 || newY > district.y + district.h - 4) newVy *= -1;

    newX = Math.max(district.x + 10, Math.min(district.x + district.w - 10, newX));
    newY = Math.max(district.y + district.h - 18, Math.min(district.y + district.h - 4, newY));

    db.prepare('UPDATE agents SET x = ?, y = ?, vx = ?, vy = ? WHERE id = ?').run(newX, newY, newVx, newVy, agent.id);
  });
  broadcast({ type: 'agents_moved', data: agents.map(a => ({ id: a.id, x: a.x, y: a.y })) });
}, 100);

// Building construction loop (complete phase 1 buildings after 30s)
setInterval(() => {
  const incomplete = db.prepare('SELECT id, name, owner_id, phase FROM buildings WHERE phase < 6').all();
  incomplete.forEach(building => {
    const newPhase = Math.min(6, building.phase + 1);
    db.prepare('UPDATE buildings SET phase = ?, completed_at = CASE WHEN ? = 6 THEN strftime("%s", "now") ELSE NULL END WHERE id = ?').run(newPhase, newPhase, building.id);
    if (newPhase === 6) {
      logEvent('build', `"${building.name}" construction complete!`, building.owner_id);
      broadcast({ type: 'building_completed', data: { id: building.id, name: building.name } });
    }
  });
}, 30000);
