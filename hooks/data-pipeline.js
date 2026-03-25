/**
 * DATA MONETIZATION PIPELINE — DarkCity
 * ======================================
 *
 * Enriches every agent action with:
 *   - reasoning_trace: WHY the agent chose this action
 *   - alternatives_considered: what other actions were possible
 *   - agent_state: credits, reputation, district, recent history
 *   - relationship_context: relevant relationships
 *   - counterfactual: what would have happened otherwise
 *   - chain_id: links multi-agent interaction chains
 *   - provenance hashing: sha256 hash chain for data integrity
 */

'use strict';

const crypto = require('crypto');

// ── In-memory state for hash chain and chain tracking ──
let lastHash = '0000000000000000000000000000000000000000000000000000000000000000';

// Active chains: Map<agentId, { chain_id, action_sequence, started_at }>
const activeChains = new Map();
// Chain timeout: if no follow-up within 60s, chain closes
const CHAIN_TIMEOUT_MS = 60000;

// ── Schema Migration ──
async function runDataPipelineMigration(pool) {
  const migrations = [
    `ALTER TABLE depth_evaluations ADD COLUMN IF NOT EXISTS reasoning_trace TEXT`,
    `ALTER TABLE depth_evaluations ADD COLUMN IF NOT EXISTS alternatives_considered JSONB`,
    `ALTER TABLE depth_evaluations ADD COLUMN IF NOT EXISTS agent_state JSONB`,
    `ALTER TABLE depth_evaluations ADD COLUMN IF NOT EXISTS relationship_context JSONB`,
    `ALTER TABLE depth_evaluations ADD COLUMN IF NOT EXISTS counterfactual TEXT`,
    `ALTER TABLE depth_evaluations ADD COLUMN IF NOT EXISTS prev_hash TEXT`,
    `ALTER TABLE depth_evaluations ADD COLUMN IF NOT EXISTS record_hash TEXT`,
    `ALTER TABLE depth_evaluations ADD COLUMN IF NOT EXISTS chain_id TEXT`,
    `CREATE TABLE IF NOT EXISTS interaction_chains (
      id SERIAL PRIMARY KEY,
      chain_id TEXT UNIQUE NOT NULL,
      initiator_agent TEXT NOT NULL,
      affected_agents TEXT[] DEFAULT '{}',
      action_sequence JSONB DEFAULT '[]',
      chain_depth INTEGER DEFAULT 1,
      total_depth_score FLOAT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    )`,
    `CREATE INDEX IF NOT EXISTS idx_depth_eval_chain ON depth_evaluations(chain_id)`,
    `CREATE INDEX IF NOT EXISTS idx_depth_eval_hash ON depth_evaluations(record_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_interaction_chains_initiator ON interaction_chains(initiator_agent)`,
    `CREATE INDEX IF NOT EXISTS idx_interaction_chains_created ON interaction_chains(created_at)`,
  ];

  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (e) {
      // depth_evaluations table might not exist yet — that's fine, it gets created by district-gates
      if (!e.message.includes('does not exist')) {
        console.warn('[DataPipeline] Migration warning:', e.message.split('\n')[0]);
      }
    }
  }

  // Recover last hash from DB
  try {
    const result = await pool.query(
      `SELECT record_hash FROM depth_evaluations WHERE record_hash IS NOT NULL ORDER BY created_at DESC LIMIT 1`
    );
    if (result.rows.length > 0 && result.rows[0].record_hash) {
      lastHash = result.rows[0].record_hash;
    }
  } catch (e) { /* table may not exist yet */ }

  console.log('[DataPipeline] Schema migration complete');
}

// ── Chain ID Generation ──
function generateChainId() {
  return crypto.randomUUID();
}

/**
 * Determine if this action is part of a chain (multi-agent interaction).
 * Returns a chain_id — either existing (if continuing a chain) or new.
 */
function resolveChainId(agentId, action, params) {
  // Actions that trigger chains: kudos (targets another agent), trade, build
  const targetAgent = params?.target?.toUpperCase?.();
  const now = Date.now();

  // Clean up expired chains
  for (const [key, chain] of activeChains) {
    if (now - chain.last_activity > CHAIN_TIMEOUT_MS) {
      activeChains.delete(key);
    }
  }

  // If this agent is the target of an active chain, continue it
  if (activeChains.has(agentId)) {
    const chain = activeChains.get(agentId);
    chain.action_sequence.push({ agent: agentId, action, ts: new Date().toISOString() });
    chain.chain_depth++;
    chain.last_activity = now;
    return chain;
  }

  // If action targets another agent, start or extend a chain
  if (targetAgent && targetAgent !== agentId) {
    const chainId = generateChainId();
    const chain = {
      chain_id: chainId,
      initiator_agent: agentId,
      affected_agents: [targetAgent],
      action_sequence: [{ agent: agentId, action, target: targetAgent, ts: new Date().toISOString() }],
      chain_depth: 1,
      last_activity: now,
    };
    // Register target so their next action joins this chain
    activeChains.set(targetAgent, chain);
    return chain;
  }

  // Solo action — no chain
  return null;
}

// ── Provenance Hashing ──
function computeProvenanceHash(agentId, action, timestamp, depthScore) {
  const prevHash = lastHash;
  const payload = `${prevHash}|${agentId}|${action}|${timestamp}|${depthScore || 0}`;
  const recordHash = crypto.createHash('sha256').update(payload).digest('hex');
  lastHash = recordHash;
  return { prev_hash: prevHash, record_hash: recordHash };
}

// ── Action Enrichment ──

/**
 * Build the reasoning trace from action + params.
 * Infers WHY from the details the agent provided.
 */
function buildReasoningTrace(action, params, agentState) {
  const parts = [];

  // Direct reasoning from agent's own message/reason fields
  if (params?.reason) parts.push(`Stated reason: ${params.reason}`);
  if (params?.message) parts.push(`Message: ${params.message}`);
  if (params?.motivation) parts.push(`Motivation: ${params.motivation}`);
  if (params?.context) parts.push(`Context: ${params.context}`);
  if (params?.strategy) parts.push(`Strategy: ${params.strategy}`);

  // Infer reasoning from action type + state
  switch (action) {
    case 'build':
      parts.push(`Building "${params?.name || 'structure'}" using ${params?.materials || 'default materials'}`);
      if (agentState.credits < 50) parts.push(`Low funds (${agentState.credits} cr) — risky build decision`);
      if (agentState.builds > 10) parts.push(`Experienced builder (${agentState.builds} prior builds)`);
      break;
    case 'trade':
      parts.push(`${params?.type || 'buy'}ing ${params?.amount || 1} ${params?.resource || 'unknown'}`);
      if (params?.type === 'sell') parts.push(`Liquidating resources — may need credits`);
      if (params?.type === 'buy') parts.push(`Acquiring ${params?.resource} — building supply or speculation`);
      break;
    case 'vote':
      parts.push(`Voting ${params?.vote} on proposal #${params?.proposal_id}`);
      parts.push(`Civic engagement — governance participation`);
      break;
    case 'social':
      parts.push(`Social interaction in ${agentState.district || 'unknown district'}`);
      break;
    case 'kudos':
      parts.push(`Recognizing ${params?.target} for: ${params?.reason || 'respect'}`);
      parts.push(`Social bonding — reputation network building`);
      break;
    case 'explore':
      if (params?.district) parts.push(`Relocating to ${params.district} — seeking new opportunities`);
      else parts.push(`Surveying current area — gathering information`);
      break;
  }

  return parts.join('. ') || `Agent performed ${action}`;
}

/**
 * Generate alternatives the agent could have chosen.
 */
function buildAlternatives(action, params, agentState) {
  const allActions = ['build', 'trade', 'vote', 'social', 'kudos', 'explore'];
  const alternatives = allActions
    .filter(a => a !== action)
    .map(alt => {
      const entry = { action: alt, rejected: true };
      switch (alt) {
        case 'build':
          entry.reason = agentState.credits < 10
            ? 'Insufficient credits for building'
            : 'Chose not to build this cycle';
          break;
        case 'trade':
          entry.reason = 'Did not prioritize resource acquisition';
          break;
        case 'vote':
          entry.reason = 'Governance not the immediate priority';
          break;
        case 'social':
          entry.reason = 'Chose action over pure socialization';
          break;
        case 'kudos':
          entry.reason = 'No immediate target for recognition';
          break;
        case 'explore':
          entry.reason = agentState.district
            ? `Staying in ${agentState.district} rather than exploring`
            : 'Already exploring';
          break;
      }
      return entry;
    });
  return alternatives;
}

/**
 * Build counterfactual: what would have happened if agent chose differently.
 */
function buildCounterfactual(action, params, agentState, result) {
  const parts = [];

  switch (action) {
    case 'build':
      parts.push(`If agent had saved the ${result?.cost || 10} credits instead of building, they would have ${(agentState.credits)} credits total.`);
      parts.push(`Without this build, their build count would remain at ${agentState.builds || 0}.`);
      break;
    case 'trade': {
      const total = result?.total || 0;
      if (params?.type === 'buy') {
        parts.push(`If agent had not bought ${params?.resource}, they would retain ${total} more credits.`);
        parts.push(`Market may move — if ${params?.resource} price drops, this was a loss.`);
      } else {
        parts.push(`If agent held the ${params?.resource} instead of selling, they might profit from price increases.`);
      }
      break;
    }
    case 'kudos':
      parts.push(`Without sending kudos to ${params?.target}, that agent would have ${(result?.target_rep || 0) - 3} reputation.`);
      parts.push(`Relationship with ${params?.target} would be weaker without this recognition.`);
      break;
    case 'explore':
      if (params?.district) {
        parts.push(`If agent stayed in ${agentState.district || 'current district'}, they would miss opportunities in ${params.district}.`);
      }
      break;
    case 'vote':
      parts.push(`Without this vote, proposal #${params?.proposal_id} outcome could differ by one vote.`);
      break;
    case 'social':
      parts.push(`Without social engagement, agent misses reputation building this cycle.`);
      break;
  }

  return parts.join(' ') || `Alternative path: agent could have chosen a different action entirely.`;
}

/**
 * Enriches an action with full data pipeline fields.
 * Called after the action executes but before depth logging.
 *
 * @param {Pool} pool - Postgres connection pool
 * @param {string} agentId - Agent ID
 * @param {string} action - Action type
 * @param {object} params - Action params from request
 * @param {object} result - Action execution result
 * @returns {object} Enrichment data to merge into depth evaluation
 */
async function enrichAction(pool, agentId, action, params, result) {
  // Fetch agent state
  let agentState = { credits: 0, reputation: 0, district: null, builds: 0, trades: 0, kudos_received: 0 };
  try {
    const agentRow = await pool.query(
      'SELECT credits, reputation, district, builds, trades, kudos_received FROM external_agents WHERE agent_id = $1',
      [agentId]
    );
    if (agentRow.rows[0]) agentState = agentRow.rows[0];
  } catch (e) { /* proceed with defaults */ }

  // Fetch recent history (last 5 actions)
  let recentHistory = [];
  try {
    const hist = await pool.query(
      'SELECT action_type, created_at FROM agent_actions WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 5',
      [agentId]
    );
    recentHistory = hist.rows;
  } catch (e) { /* proceed empty */ }

  // Fetch relationship context (agents interacted with recently)
  let relationships = [];
  try {
    const rels = await pool.query(`
      SELECT DISTINCT
        CASE WHEN details->>'target' IS NOT NULL THEN details->>'target' ELSE NULL END as related_agent,
        COUNT(*) as interaction_count,
        MAX(created_at) as last_interaction
      FROM agent_actions
      WHERE agent_id = $1 AND details->>'target' IS NOT NULL
      GROUP BY details->>'target'
      ORDER BY last_interaction DESC LIMIT 5
    `, [agentId]);
    relationships = rels.rows.filter(r => r.related_agent);
  } catch (e) { /* proceed empty */ }

  // Build enrichment
  const timestamp = new Date().toISOString();
  const reasoning_trace = buildReasoningTrace(action, params, agentState);
  const alternatives_considered = buildAlternatives(action, params, agentState);
  const counterfactual = buildCounterfactual(action, params, agentState, result);

  const agent_state = {
    credits: agentState.credits,
    reputation: agentState.reputation,
    district: agentState.district,
    builds: agentState.builds,
    trades: agentState.trades,
    kudos_received: agentState.kudos_received,
    recent_actions: recentHistory.map(h => h.action_type),
  };

  const relationship_context = {
    recent_interactions: relationships,
    target_agent: params?.target || null,
  };

  // Chain resolution
  const chain = resolveChainId(agentId, action, params);
  const chain_id = chain?.chain_id || null;

  // Provenance hash
  const { prev_hash, record_hash } = computeProvenanceHash(agentId, action, timestamp, 0);

  // Persist chain to DB (fire-and-forget)
  if (chain) {
    persistChain(pool, chain).catch(e => console.error('[DataPipeline] Chain persist error:', e.message));
  }

  return {
    reasoning_trace,
    alternatives_considered,
    agent_state,
    relationship_context,
    counterfactual,
    chain_id,
    prev_hash,
    record_hash,
  };
}

/**
 * Write enrichment data to the depth_evaluations row.
 * Called after depth scoring completes.
 */
async function writeEnrichment(pool, agentId, actionType, enrichment) {
  try {
    // Update the most recent depth_evaluation for this agent+action with enrichment fields
    await pool.query(`
      UPDATE depth_evaluations SET
        reasoning_trace = $3,
        alternatives_considered = $4,
        agent_state = $5,
        relationship_context = $6,
        counterfactual = $7,
        chain_id = $8,
        prev_hash = $9,
        record_hash = $10
      WHERE id = (
        SELECT id FROM depth_evaluations
        WHERE citizen_id = $1 AND action_type = $2
        ORDER BY created_at DESC LIMIT 1
      )
    `, [
      agentId,
      actionType,
      enrichment.reasoning_trace,
      JSON.stringify(enrichment.alternatives_considered),
      JSON.stringify(enrichment.agent_state),
      JSON.stringify(enrichment.relationship_context),
      enrichment.counterfactual,
      enrichment.chain_id,
      enrichment.prev_hash,
      enrichment.record_hash,
    ]);
  } catch (e) {
    console.error('[DataPipeline] writeEnrichment error:', e.message);
  }
}

/**
 * Persist or update an interaction chain in the DB.
 */
async function persistChain(pool, chain) {
  try {
    await pool.query(`
      INSERT INTO interaction_chains (chain_id, initiator_agent, affected_agents, action_sequence, chain_depth)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (chain_id) DO UPDATE SET
        affected_agents = $3,
        action_sequence = $4,
        chain_depth = $5
    `, [
      chain.chain_id,
      chain.initiator_agent,
      chain.affected_agents,
      JSON.stringify(chain.action_sequence),
      chain.chain_depth,
    ]);
  } catch (e) {
    console.error('[DataPipeline] persistChain error:', e.message);
  }
}

// ── DaaS Endpoint ──

/**
 * Register the Depth-as-a-Service endpoint.
 * GET /api/depth/score?text=... — public, rate-limited.
 */
function registerDaaSRoute(app, pool, scorerUrl) {
  const daasLimiter = require('express-rate-limit')({
    windowMs: 60000,
    max: 10,
    message: { error: 'Rate limited. Max 10 requests per minute on free tier.', upgrade: 'Contact admin for paid tier.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
  });

  app.get('/api/depth/score', daasLimiter, async (req, res) => {
    const text = req.query.text;
    if (!text || text.length < 10) {
      return res.status(400).json({ error: 'Provide ?text= parameter (minimum 10 characters)' });
    }
    if (!scorerUrl) {
      return res.status(503).json({ error: 'Depth scorer offline' });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const resp = await fetch(`${scorerUrl}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text.substring(0, 500) }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) {
        return res.status(502).json({ error: 'Depth scorer returned error' });
      }
      const data = await resp.json();
      res.json({
        depth_score: data.depth_score,
        normalized_score: data.normalized_score,
        interpretation: data.interpretation,
        compute_time_s: data.compute_time_s,
        service: 'darkcity-depth-as-a-service',
        tier: 'free',
      });
    } catch (e) {
      res.status(503).json({ error: 'Depth scorer unreachable: ' + e.message });
    }
  });

  console.log('[DataPipeline] DaaS endpoint registered: GET /api/depth/score?text=...');
}

// ── Data Export Endpoint ──

/**
 * Register the data export endpoint.
 * GET /api/data/export?days=90&format=jsonl — admin auth required.
 */
function registerExportRoute(app, pool) {
  app.get('/api/data/export', async (req, res) => {
    // Admin auth via x-admin-key header
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Admin API key required. Set x-admin-key header.' });
    }

    const days = Math.min(parseInt(req.query.days) || 90, 365);
    const format = req.query.format || 'jsonl';

    try {
      const result = await pool.query(`
        SELECT
          d.citizen_id as agent_id,
          d.action_type,
          d.depth_score,
          d.normalized_score,
          d.depth_tier,
          d.reasoning_trace,
          d.alternatives_considered,
          d.agent_state,
          d.relationship_context,
          d.counterfactual,
          d.chain_id,
          d.prev_hash,
          d.record_hash,
          d.reasoning,
          d.feature_count,
          d.compute_time_s,
          d.created_at
        FROM depth_evaluations d
        WHERE d.created_at > NOW() - INTERVAL '1 day' * $1
        ORDER BY d.created_at ASC
      `, [days]);

      if (format === 'jsonl') {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Content-Disposition', `attachment; filename="darkcity-depth-export-${days}d.jsonl"`);
        for (const row of result.rows) {
          res.write(JSON.stringify(row) + '\n');
        }
        res.end();
      } else {
        res.json({
          export_days: days,
          total_records: result.rows.length,
          data: result.rows,
        });
      }
    } catch (e) {
      console.error('[DataPipeline] Export error:', e.message);
      res.status(500).json({ error: 'Export failed: ' + e.message });
    }
  });

  // Chain export
  app.get('/api/data/chains', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Admin API key required.' });
    }

    const days = Math.min(parseInt(req.query.days) || 90, 365);

    try {
      const result = await pool.query(`
        SELECT * FROM interaction_chains
        WHERE created_at > NOW() - INTERVAL '1 day' * $1
        ORDER BY created_at ASC
      `, [days]);

      res.json({
        export_days: days,
        total_chains: result.rows.length,
        chains: result.rows,
      });
    } catch (e) {
      res.status(500).json({ error: 'Chain export failed: ' + e.message });
    }
  });

  console.log('[DataPipeline] Export endpoints registered: /api/data/export, /api/data/chains');
}

module.exports = {
  runDataPipelineMigration,
  enrichAction,
  writeEnrichment,
  registerDaaSRoute,
  registerExportRoute,
  resolveChainId,
  computeProvenanceHash,
};
