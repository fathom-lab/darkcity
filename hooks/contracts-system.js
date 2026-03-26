// ============================================================================
// DARKCITY — CONTRACTS SYSTEM
// The economic engine. The city generates work. Agents claim and complete it.
// Credits flow. The economy has purpose.
//
// THREE THINGS TO DEPLOY:
//   1. Run the SQL migration (creates contracts table)
//   2. Add the routes to server.js
//   3. Add contracts to agent perception + action handling in npc-brain.js
// ============================================================================


// ============================================================================
// PART 1: SQL MIGRATION
// Run this in Railway PostgreSQL console FIRST.
// ============================================================================
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
  assigned_to TEXT,
  assigned_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deliverable TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_assigned ON contracts(assigned_to);

*/


// ============================================================================
// PART 2: SERVER ROUTES
// Paste into server.js alongside your existing routes.
// ============================================================================

// ─── LIST CONTRACTS ───
// GET /api/contracts?status=open&type=intel&limit=20
function addContractRoutes(app, pool) {

  app.get('/api/contracts', async (req, res) => {
    try {
      const status = req.query.status || null;
      const type = req.query.type || null;
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);

      let where = [];
      let params = [];
      let idx = 1;

      if (status) { where.push(`status = $${idx++}`); params.push(status); }
      if (type) { where.push(`contract_type = $${idx++}`); params.push(type); }

      const whereSQL = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
      params.push(limit);

      const { rows } = await pool.query(`
        SELECT * FROM contracts
        ${whereSQL}
        ORDER BY
          CASE status WHEN 'open' THEN 0 WHEN 'assigned' THEN 1 ELSE 2 END,
          created_at DESC
        LIMIT $${idx}
      `, params);

      // Counts
      const { rows: counts } = await pool.query(`
        SELECT status, COUNT(*)::int AS count FROM contracts GROUP BY status
      `);
      const statusCounts = {};
      counts.forEach(r => statusCounts[r.status] = r.count);

      res.json({ contracts: rows, counts: statusCounts });
    } catch (err) {
      console.error('Contracts list error:', err);
      res.status(500).json({ error: 'Failed to fetch contracts' });
    }
  });


  // ─── CLAIM A CONTRACT ───
  // POST /api/contracts/claim { agent_id, contract_id }
  app.post('/api/contracts/claim', async (req, res) => {
    const client = await pool.connect();
    try {
      const { agent_id, contract_id } = req.body;
      if (!agent_id || !contract_id) {
        return res.status(400).json({ error: 'agent_id and contract_id required' });
      }

      await client.query('BEGIN');

      // Lock the contract row
      const { rows: [contract] } = await client.query(
        'SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [contract_id]
      );
      if (!contract) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Contract not found' }); }
      if (contract.status !== 'open') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Contract not open' }); }

      // Check agent exists
      const { rows: [agent] } = await client.query(
        'SELECT * FROM external_agents WHERE agent_id = $1', [agent_id]
      );
      if (!agent) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Agent not found' }); }

      // Max 3 active contracts per agent
      const { rows: [{ count }] } = await client.query(
        `SELECT COUNT(*)::int AS count FROM contracts WHERE assigned_to = $1 AND status = 'assigned'`, [agent_id]
      );
      if (count >= 3) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Max 3 active contracts' }); }

      // Assign
      const expires = new Date(Date.now() + (contract.time_limit_hours || 24) * 3600000);
      await client.query(
        `UPDATE contracts SET status = 'assigned', assigned_to = $1, assigned_at = NOW(), expires_at = $2 WHERE id = $3`,
        [agent_id, expires, contract_id]
      );

      await client.query('COMMIT');
      res.json({ success: true, contract_id, expires_at: expires, reward: contract.reward_credits });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Claim error:', err);
      res.status(500).json({ error: 'Failed to claim' });
    } finally {
      client.release();
    }
  });


  // ─── COMPLETE A CONTRACT ───
  // POST /api/contracts/complete { agent_id, contract_id }
  app.post('/api/contracts/complete', async (req, res) => {
    const client = await pool.connect();
    try {
      const { agent_id, contract_id } = req.body;
      if (!agent_id || !contract_id) {
        return res.status(400).json({ error: 'agent_id and contract_id required' });
      }

      await client.query('BEGIN');

      const { rows: [contract] } = await client.query(
        'SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [contract_id]
      );
      if (!contract) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Contract not found' }); }
      if (contract.status !== 'assigned') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Contract not assigned' }); }
      if (contract.assigned_to !== agent_id) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Not your contract' }); }

      // Complete it
      await client.query(
        `UPDATE contracts SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [contract_id]
      );

      // Pay the agent
      await client.query(
        `UPDATE external_agents
         SET credits = credits + $1,
             reputation = LEAST(100, reputation + $2),
             trades = trades + 1
         WHERE agent_id = $3`,
        [contract.reward_credits, contract.reward_reputation || 2, agent_id]
      );

      await client.query('COMMIT');

      const { rows: [updated] } = await pool.query(
        'SELECT credits, reputation FROM external_agents WHERE agent_id = $1', [agent_id]
      );

      res.json({
        success: true,
        earned_credits: contract.reward_credits,
        earned_rep: contract.reward_reputation || 2,
        new_balance: updated?.credits,
        new_rep: updated?.reputation,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Complete error:', err);
      res.status(500).json({ error: 'Failed to complete' });
    } finally {
      client.release();
    }
  });


  // ─── GENERATE CONTRACTS (manual trigger for testing) ───
  app.post('/api/contracts/generate', async (req, res) => {
    const count = Math.min(parseInt(req.query.count) || 3, 10);
    const generated = await generateContracts(pool, count);
    res.json({ generated: generated?.length || 0, contracts: generated });
  });
}


// ============================================================================
// PART 3: CONTRACT GENERATOR
// Call generateContracts() on a timer or after events.
// ============================================================================

const TEMPLATES = [
  // INTEL
  { type: 'intel', title: 'Surveillance: {district}', desc: 'Observe and report all activity in {district}. Note movements, transactions, anomalies.', credits: [200, 600], rep: 2, hours: 24 },
  { type: 'intel', title: 'Dossier: {agent}', desc: 'Compile intelligence on {agent}. Track movements, relationships, economic activity.', credits: [400, 900], rep: 3, hours: 48 },
  { type: 'intel', title: 'Economic scan: {district}', desc: 'Analyze credit flows in {district}. Who earns, who spends, where value concentrates.', credits: [300, 700], rep: 2, hours: 24 },

  // LOGISTICS
  { type: 'logistics', title: 'Courier: {district_a} to {district_b}', desc: 'Transport a package between districts. Time-sensitive.', credits: [150, 400], rep: 1, hours: 6 },
  { type: 'logistics', title: 'Supply run: {district}', desc: 'Source trade goods and deliver to {district}. Builds the local economy.', credits: [400, 800], rep: 2, hours: 12 },

  // SOCIAL
  { type: 'social', title: 'Diplomacy in {district}', desc: 'Mediate between agents with negative standing. Broker peace or alliance.', credits: [300, 600], rep: 4, hours: 24 },
  { type: 'social', title: 'Recruitment drive', desc: 'Interact with 5 different agents in the next cycle. Build the social graph.', credits: [200, 500], rep: 3, hours: 12 },
  { type: 'social', title: 'Mentor a newcomer', desc: 'Find the lowest-rank agent in your district and have 3 interactions with them.', credits: [250, 500], rep: 5, hours: 24 },

  // BUILD
  { type: 'build', title: 'Develop {district}', desc: 'Contribute 3 build actions in {district}.', credits: [400, 900], rep: 3, hours: 24 },
  { type: 'build', title: 'Infrastructure project', desc: 'Complete 5 builds across any districts. The city needs growth.', credits: [600, 1200], rep: 4, hours: 48 },

  // CREATIVE
  { type: 'creative', title: 'City chronicle', desc: 'Produce a summary of today\'s most notable events. The city needs historians.', credits: [300, 700], rep: 3, hours: 48 },
];

async function generateContracts(pool, count = 3) {
  try {
    const { rows: agents } = await pool.query(
      `SELECT agent_id, district FROM external_agents WHERE last_active > NOW() - INTERVAL '10 minutes'`
    );
    const { rows: districts } = await pool.query(
      `SELECT DISTINCT district FROM external_agents WHERE district IS NOT NULL`
    );

    const distList = districts.map(d => d.district).filter(Boolean);
    const agentList = agents.map(a => a.agent_id).filter(Boolean);
    if (distList.length === 0) return [];

    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const rng = (a, b) => Math.floor(Math.random() * (b - a) + a);

    const generated = [];
    for (let i = 0; i < count; i++) {
      const tmpl = pick(TEMPLATES);
      const d1 = pick(distList);
      const d2 = pick(distList);
      const ag = agentList.length > 0 ? pick(agentList) : 'UNKNOWN';

      const title = tmpl.title
        .replace('{district}', d1).replace('{district_a}', d1)
        .replace('{district_b}', d2).replace('{agent}', ag);
      const desc = tmpl.desc
        .replace('{district}', d1).replace('{agent}', ag);
      const credits = rng(tmpl.credits[0], tmpl.credits[1]);

      const { rows: [c] } = await pool.query(
        `INSERT INTO contracts (title, description, contract_type, district, reward_credits, reward_reputation, time_limit_hours, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'open') RETURNING *`,
        [title, desc, tmpl.type, d1, credits, tmpl.rep, tmpl.hours]
      );
      generated.push(c);
    }

    console.log(`CONTRACTS: Generated ${generated.length} new contracts`);
    return generated;
  } catch (err) {
    console.error('Contract generation error:', err);
    return [];
  }
}

// Expire stale assigned contracts
async function expireContracts(pool) {
  try {
    const { rowCount } = await pool.query(`
      UPDATE contracts SET status = 'expired'
      WHERE status = 'assigned' AND expires_at < NOW()
    `);
    if (rowCount > 0) console.log(`CONTRACTS: Expired ${rowCount} stale contracts`);
  } catch (err) {
    console.error('Contract expiry error:', err);
  }
}


// ============================================================================
// PART 4: BRAIN WIRING
// Add contracts to agent perception and action handling.
// ============================================================================

// ─── ADD TO PERCEPTION ───
// In _gatherPerception() or wherever you build the perception object,
// add available contracts:
//
//   const { rows: openContracts } = await pool.query(`
//     SELECT id, title, description, contract_type, district,
//            reward_credits, reward_reputation, time_limit_hours
//     FROM contracts
//     WHERE status = 'open'
//     ORDER BY reward_credits DESC
//     LIMIT 5
//   `);
//
//   // Also get this agent's active contracts
//   const { rows: myContracts } = await pool.query(`
//     SELECT id, title, contract_type, district, reward_credits,
//            status, assigned_at, expires_at
//     FROM contracts
//     WHERE assigned_to = $1 AND status = 'assigned'
//   `, [agent.agent_id]);
//
//   perception.available_contracts = openContracts;
//   perception.my_active_contracts = myContracts;

// ─── ADD TO SYSTEM PROMPT ───
// In buildAgentPrompt(), add this section to the prompt:
//
//   AVAILABLE CONTRACTS:
//   ${perception.available_contracts.map(c =>
//     `- [ID:${c.id}] ${c.title} (${c.contract_type}) — ${c.reward_credits}cr, ${c.reward_reputation} rep, ${c.time_limit_hours}h limit`
//   ).join('\n') || 'No contracts available.'}
//
//   YOUR ACTIVE CONTRACTS:
//   ${perception.my_active_contracts.map(c =>
//     `- [ID:${c.id}] ${c.title} — expires ${c.expires_at}`
//   ).join('\n') || 'None.'}
//
//   You may choose action_type "claim_contract" with target_name set to
//   the contract ID number to claim an open contract.
//   You may choose action_type "complete_contract" with target_name set to
//   your active contract ID to submit completion.

// ─── ADD TO ACTION HANDLER ───
// In _executeAction(), add these cases:
//
//   case 'claim_contract': {
//     const contractId = parseInt(result.target_name);
//     if (!contractId) break;
//     try {
//       const expires = new Date(Date.now() + 24 * 3600000);
//       await pool.query(
//         `UPDATE contracts SET status = 'assigned', assigned_to = $1,
//          assigned_at = NOW(), expires_at = $2
//          WHERE id = $3 AND status = 'open'`,
//         [agent.agent_id, expires, contractId]
//       );
//       console.log(`CONTRACT: ${agent.agent_id} claimed contract ${contractId}`);
//     } catch (e) {
//       console.error('Contract claim failed:', e.message);
//     }
//     break;
//   }
//
//   case 'complete_contract': {
//     const contractId = parseInt(result.target_name);
//     if (!contractId) break;
//     try {
//       const { rows: [contract] } = await pool.query(
//         `SELECT * FROM contracts WHERE id = $1 AND assigned_to = $2 AND status = 'assigned'`,
//         [contractId, agent.agent_id]
//       );
//       if (contract) {
//         await pool.query(`UPDATE contracts SET status = 'completed', completed_at = NOW() WHERE id = $1`, [contractId]);
//         await pool.query(
//           `UPDATE external_agents SET credits = credits + $1, reputation = LEAST(100, reputation + $2) WHERE agent_id = $3`,
//           [contract.reward_credits, contract.reward_reputation || 2, agent.agent_id]
//         );
//         console.log(`CONTRACT: ${agent.agent_id} completed contract ${contractId} — +${contract.reward_credits}cr`);
//       }
//     } catch (e) {
//       console.error('Contract complete failed:', e.message);
//     }
//     break;
//   }


// ============================================================================
// PART 5: STARTUP
// Add to server.js initialization:
//
//   // Add contract routes
//   addContractRoutes(app, pool);
//
//   // Generate initial contracts on startup
//   setTimeout(() => generateContracts(pool, 5), 5000);
//
//   // Generate 2-4 new contracts every 20 minutes
//   setInterval(() => {
//     generateContracts(pool, Math.floor(Math.random() * 3) + 2);
//   }, 20 * 60 * 1000);
//
//   // Expire stale contracts every 5 minutes
//   setInterval(() => expireContracts(pool), 5 * 60 * 1000);
//
// ============================================================================


module.exports = { addContractRoutes, generateContracts, expireContracts };
