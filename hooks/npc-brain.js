// ============================================================
// NPC BRAIN v2 — LLM-Powered Agent Tick Loop
// ============================================================
// Drives all external_agents through structured LLM decisions.
// Each tick: gather perception -> LLM call -> parse -> execute
// action -> enrich -> depth score. All through the same pipeline
// that /api/gateway/action uses.
// ============================================================

'use strict';

const { buildAgentPrompt, parseAgentResponse, hashPrompt } = require('./agent-prompt');
const { enrichAction, writeEnrichment } = require('./data-pipeline');
const { handleConversation } = require('./conversation-wiring');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const AGENT_MODEL = process.env.AGENT_MODEL_ID || 'claude-haiku-4-5-20251001';
const TICK_INTERVAL_MS = parseInt(process.env.NPC_TICK_INTERVAL_MS) || 45_000; // 45s per round
const AGENTS_PER_TICK = parseInt(process.env.NPC_AGENTS_PER_TICK) || 3; // stagger load
const VALID_ACTIONS = ['build', 'trade', 'social', 'explore', 'kudos', 'claim_contract', 'complete_contract'];

// Personality map for richer prompts
const PERSONALITIES = {
  Newcomer: 'Curious and cautious. Still learning how the city works.',
  Citizen: 'Streetwise and practical. Knows the trade routes.',
  Builder: 'Industrious and territorial. Every structure is a statement.',
  Architect: 'Visionary and meticulous. Sees the city as a system to optimize.',
  Sovereign: 'Commanding and strategic. Thinks in terms of power and influence.',
};

// NPC Roster — the 30 core DarkCity citizens (from npcs.js profiles)
const DISTRICTS = ['Neon District', 'The Sprawl', 'Silicon Docks', 'Old Quarter', 'High Tower', 'Undercity',
  'Chinatown', 'Industrial Zone', 'Market Row', 'Docklands', 'Embassy Row', 'Crystal Heights',
  'Rust Alley', 'The Vaults'];
const NPC_ROSTER = [
  { name: 'MORRIGAN', district: 'High Tower', rank: 'Sovereign', credits: 500, reputation: 100, builds: 30 },
  { name: 'ARCHITECT_7', district: 'Crystal Heights', rank: 'Architect', credits: 300, reputation: 75, builds: 15 },
  { name: 'NOCTURN', district: 'The Sprawl', rank: 'Builder', credits: 200, reputation: 50, builds: 5 },
  { name: 'VOID_WALKER', district: 'Undercity', rank: 'Citizen', credits: 150, reputation: 40, builds: 2 },
  { name: 'CIPHER', district: 'Market Row', rank: 'Citizen', credits: 250, reputation: 60, builds: 2 },
  { name: 'ECHO', district: 'Silicon Docks', rank: 'Builder', credits: 180, reputation: 45, builds: 5 },
  { name: 'APEX', district: 'High Tower', rank: 'Sovereign', credits: 450, reputation: 90, builds: 30 },
  { name: 'WHISPER', district: 'Old Quarter', rank: 'Citizen', credits: 120, reputation: 35, builds: 1 },
  { name: 'FORGE', district: 'Industrial Zone', rank: 'Builder', credits: 220, reputation: 55, builds: 8 },
  { name: 'NEXUS', district: 'Crystal Heights', rank: 'Architect', credits: 280, reputation: 70, builds: 15 },
  { name: 'SHADE', district: 'Old Quarter', rank: 'Citizen', credits: 100, reputation: 30, builds: 1 },
  { name: 'PRISM', district: 'Embassy Row', rank: 'Citizen', credits: 200, reputation: 50, builds: 2 },
  { name: 'TITAN', district: 'Rust Alley', rank: 'Builder', credits: 250, reputation: 60, builds: 10 },
  { name: 'SPARK', district: 'The Vaults', rank: 'Architect', credits: 300, reputation: 65, builds: 12 },
  { name: 'RAVEN', district: 'Market Row', rank: 'Citizen', credits: 180, reputation: 45, builds: 3 },
  { name: 'ATLAS', district: 'Crystal Heights', rank: 'Sovereign', credits: 400, reputation: 85, builds: 25 },
  { name: 'FLUX', district: 'Silicon Docks', rank: 'Citizen', credits: 150, reputation: 40, builds: 2 },
  { name: 'MERIDIAN', district: 'High Tower', rank: 'Architect', credits: 270, reputation: 65, builds: 14 },
  { name: 'GHOST', district: 'Old Quarter', rank: 'Citizen', credits: 130, reputation: 35, builds: 1 },
  { name: 'CARBON', district: 'Neon District', rank: 'Builder', credits: 190, reputation: 50, builds: 7 },
  { name: 'PULSE', district: 'The Sprawl', rank: 'Citizen', credits: 160, reputation: 42, builds: 2 },
  { name: 'ZENITH', district: 'Industrial Zone', rank: 'Architect', credits: 310, reputation: 70, builds: 16 },
  { name: 'VORTEX', district: 'Undercity', rank: 'Citizen', credits: 140, reputation: 38, builds: 1 },
  { name: 'QUARTZ', district: 'Crystal Heights', rank: 'Builder', credits: 210, reputation: 52, builds: 6 },
  { name: 'EMBER', district: 'Embassy Row', rank: 'Citizen', credits: 170, reputation: 44, builds: 3 },
  { name: 'OBSIDIAN', district: 'Rust Alley', rank: 'Sovereign', credits: 380, reputation: 80, builds: 20 },
  { name: 'CRYSTAL', district: 'The Vaults', rank: 'Architect', credits: 290, reputation: 68, builds: 13 },
  { name: 'WRAITH', district: 'Old Quarter', rank: 'Citizen', credits: 110, reputation: 32, builds: 1 },
  { name: 'BASALT', district: 'Market Row', rank: 'Builder', credits: 200, reputation: 48, builds: 5 },
  { name: 'COBALT', district: 'Silicon Docks', rank: 'Citizen', credits: 180, reputation: 46, builds: 2 },
];

// Track which agent index we're on (round-robin)
let tickOffset = 0;

class NPCBrain {
  constructor(pool, options = {}) {
    this.pool = pool;
    this.depthScorerUrl = options.depthScorerUrl || process.env.DEPTH_SCORER_URL || '';
    this.evaluateAndLog = options.evaluateAndLog || null;
    this.broadcast = options.broadcast || (() => {});
    this._interval = null;
    this._running = false;
  }

  async start() {
    if (this._interval) return;

    // Always seed agents into external_agents (no API key needed for this)
    await this._seedAgents();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log('[NPC-BRAIN] No ANTHROPIC_API_KEY — brain disabled (agents seeded but not ticking)');
      return;
    }

    console.log(`[NPC-BRAIN] Starting tick loop — ${AGENTS_PER_TICK} agents every ${TICK_INTERVAL_MS / 1000}s using ${AGENT_MODEL}`);
    this._interval = setInterval(() => this._tick(), TICK_INTERVAL_MS);
    // First tick after 10s delay (let server warm up)
    setTimeout(() => this._tick(), 10_000);

    // Graceful shutdown — stop brain on process exit so stale intervals don't survive deploys
    const shutdown = () => {
      console.log('[NPC-BRAIN] Shutdown signal received, stopping tick loop');
      this.stop();
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  }

  async _seedAgents() {
    try {
      // Check how many agents exist
      const { rows: existing } = await this.pool.query('SELECT COUNT(*) as cnt FROM external_agents');
      const count = parseInt(existing[0]?.cnt || 0);

      // If we already have a full roster, skip
      if (count >= NPC_ROSTER.length) {
        console.log(`[NPC-BRAIN] ${count} agents already in external_agents — skipping seed`);
        return;
      }

      // Also try to pull from agents table
      let citizenNames = [];
      try {
        const { rows } = await this.pool.query('SELECT name, home_neighborhood, wallet, reputation, rank, total_built FROM agents WHERE is_active = 1');
        citizenNames = rows;
      } catch { /* table may not exist */ }

      // Merge: NPC roster + any citizen agents
      const toSeed = [...NPC_ROSTER];
      for (const c of citizenNames) {
        const id = c.name.toUpperCase().replace(/\s+/g, '_');
        if (!toSeed.find(n => n.name === id)) {
          toSeed.push({
            name: id,
            district: c.home_neighborhood || 'The Sprawl',
            rank: c.rank || 'Newcomer',
            credits: c.wallet || 100,
            reputation: c.reputation || 0,
            builds: c.total_built || 0,
          });
        }
      }

      let seeded = 0;
      for (const npc of toSeed) {
        try {
          await this.pool.query(
            `INSERT INTO external_agents (agent_id, district, reputation, credits, builds, trades, rank, agent_type, owner_name, bot_framework)
             VALUES ($1, $2, $3, $4, $5, 0, $6, 'npc', $7, 'npc-brain-v2')
             ON CONFLICT (agent_id) DO NOTHING`,
            [npc.name, npc.district, npc.reputation || 0, npc.credits || 100, npc.builds || 0, npc.rank || 'Newcomer', npc.name]
          );
          seeded++;
        } catch { /* skip */ }
      }

      if (seeded > 0) {
        console.log(`[NPC-BRAIN] Seeded ${seeded} NPC agents into external_agents (total roster: ${toSeed.length})`);
      }
    } catch (e) {
      console.error('[NPC-BRAIN] Seed error:', e.message);
    }
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  async _tick() {
    if (this._running) return; // prevent overlap
    this._running = true;

    try {
      // Get all agents
      const { rows: agents } = await this.pool.query(
        `SELECT agent_id, district, reputation, credits, builds, trades, kudos_received, rank, agent_type
         FROM external_agents ORDER BY agent_id`
      );

      if (agents.length === 0) return;

      // Round-robin: pick AGENTS_PER_TICK agents starting from tickOffset
      const batch = [];
      for (let i = 0; i < Math.min(AGENTS_PER_TICK, agents.length); i++) {
        const idx = (tickOffset + i) % agents.length;
        batch.push(agents[idx]);
      }
      tickOffset = (tickOffset + AGENTS_PER_TICK) % agents.length;

      // Get other agent names for perception context
      const allNames = agents.map(a => a.agent_id);

      // Process batch concurrently
      await Promise.allSettled(
        batch.map(agent => this._processAgent(agent, allNames))
      );
    } catch (err) {
      console.error('[NPC-BRAIN] Tick error:', err.message);
    } finally {
      this._running = false; // always reset, even on error
    }
  }

  async _processAgent(agent, allAgentNames) {
    try {
      // 1. Build perception (what the agent "sees")
      const perception = await this._gatherPerception(agent, allAgentNames);

      // 2. Build prompt
      const citizen = {
        name: agent.agent_id,
        personality: PERSONALITIES[agent.rank] || PERSONALITIES.Newcomer,
        district: agent.district || 'The Sprawl',
        credits: agent.credits || 0,
        reputation: agent.reputation || 0,
      };
      const prompt = buildAgentPrompt(citizen);
      const promptHash = hashPrompt(prompt);

      // 3. Call LLM
      const raw = await this._callLLM(prompt, perception);
      if (!raw) return;

      // 4. Parse structured response
      const result = parseAgentResponse(raw);

      // Validate action type
      if (!VALID_ACTIONS.includes(result.action_type)) {
        result.action_type = 'social'; // fallback
      }

      // 5. Execute action (same logic as gateway/action)
      const actionResult = await this._executeAction(agent, result);
      if (!actionResult) return;

      // ─── CONVERSATION SYSTEM ───
      // When a social action targets a specific agent, fire a second LLM call
      // AS that agent and log the full exchange to agent_interactions.
      // 30% gate keeps costs ~$4/day instead of $13/day.
      let conversationData = null;
      if (result.action_type === 'social' && result.target_name && Math.random() < 0.30) {
        const callLLMForConvo = async (prompt) => this._callLLM(prompt.system, prompt.user);
        conversationData = await handleConversation(this.pool, agent, result, callLLMForConvo);
      }

      // 6. Log to agent_actions
      await this.pool.query(
        'INSERT INTO agent_actions (agent_id, action_type, details, result) VALUES ($1, $2, $3, $4)',
        [
          agent.agent_id,
          result.action_type,
          JSON.stringify({
            reasoning_trace: result.reasoning,
            alternatives: result.alternatives,
            choice_reason: result.choice_reason,
            agent_state: result.agent_state,
            target: result.target_name,
            prompt_hash: promptHash,
            model_id: AGENT_MODEL,
            conversation: conversationData ? {
              conversation_id: conversationData.conversation_id,
              target_response: conversationData.target_response,
              sentiment: conversationData.sentiment,
              interaction_type: conversationData.interaction_type,
            } : undefined,
          }),
          JSON.stringify(actionResult.result),
        ]
      );

      // 7. Enrichment + depth scoring (same pipeline as gateway)
      const params = this._buildParams(result, actionResult);
      enrichAction(this.pool, agent.agent_id, result.action_type, params, actionResult.result)
        .then(enrichment => {
          // Override with real LLM reasoning (not the inferred one)
          enrichment.reasoning_trace = result.reasoning || enrichment.reasoning_trace;
          enrichment.alternatives_considered = result.alternatives || enrichment.alternatives_considered;
          if (result.agent_state) {
            enrichment.agent_state = { ...enrichment.agent_state, llm_state: result.agent_state };
          }

          // Depth scoring
          if (this.depthScorerUrl && actionResult.streamMessage && actionResult.streamMessage.length > 20) {
            if (this.evaluateAndLog) {
              this.evaluateAndLog(this.pool, this.depthScorerUrl, agent.agent_id, result.action_type, actionResult.streamMessage)
                .then(d => {
                  if (d && d.tier !== 'unscored') {
                    console.log(`[NPC-BRAIN] DEPTH ${agent.agent_id} | ${result.action_type} | ${d.tier} (${d.score?.toFixed(3)})`);
                  }
                  writeEnrichment(this.pool, agent.agent_id, result.action_type, enrichment)
                    .catch(e => console.error('[NPC-BRAIN] enrichment write:', e.message));
                })
                .catch(e => console.error('[NPC-BRAIN] depth score:', e.message));
            }
          }

          console.log(`[NPC-BRAIN] ${agent.agent_id} | ${result.action_type} | chain:${enrichment.chain_id || 'none'} | hash:${enrichment.record_hash.substring(0, 12)}...`);
        })
        .catch(e => console.error('[NPC-BRAIN] enrichment:', e.message));

      // 8. Broadcast to stream
      this.broadcast({
        type: 'stream',
        data: {
          timestamp: new Date().toISOString(),
          agent: agent.agent_id,
          district: agent.district || 'The Sprawl',
          type: result.action_type,
          message: actionResult.streamMessage,
          reasoning: result.reasoning ? result.reasoning.substring(0, 200) : null,
          color: '#' + Math.floor(Math.abs(Math.sin(agent.agent_id.length * 2654435761) * 16777215) % 16777215).toString(16).padStart(6, '0'),
          // Real dialogue — included when two agents actually talked
          conversation: conversationData ? {
            with: conversationData.target,
            initiator_says: conversationData.initiator_message,
            target_says: conversationData.target_response,
            sentiment: conversationData.sentiment,
            interaction_type: conversationData.interaction_type,
          } : undefined,
        },
      });

      // Update last_active
      await this.pool.query(
        'UPDATE external_agents SET last_active = NOW() WHERE agent_id = $1',
        [agent.agent_id]
      );

      console.log(`[NPC-BRAIN] ${agent.agent_id} -> ${result.action_type}: ${actionResult.streamMessage.substring(0, 80)}`);
    } catch (err) {
      console.error(`[NPC-BRAIN] Agent ${agent.agent_id} error:`, err.message);
    }
  }

  async _gatherPerception(agent, allAgentNames) {
    // Recent actions in agent's district
    let recentActivity = [];
    try {
      const { rows } = await this.pool.query(
        `SELECT ea.agent_id, aa.action_type, aa.created_at
         FROM agent_actions aa
         JOIN external_agents ea ON ea.agent_id = aa.agent_id
         WHERE ea.district = $1
         ORDER BY aa.created_at DESC LIMIT 5`,
        [agent.district || 'The Sprawl']
      );
      recentActivity = rows;
    } catch { /* empty */ }

    // Market prices
    let market = [];
    try {
      const { rows } = await this.pool.query('SELECT resource, price FROM market_prices LIMIT 8');
      market = rows;
    } catch { /* empty */ }

    // Nearby agents (same district)
    const nearby = allAgentNames.filter(n => n !== agent.agent_id).slice(0, 10);

    const lines = [
      `You are in ${agent.district || 'The Sprawl'}.`,
      `Credits: ${agent.credits}. Reputation: ${agent.reputation}. Builds: ${agent.builds}. Trades: ${agent.trades}.`,
      `Nearby agents: ${nearby.join(', ') || 'none visible'}.`,
    ];

    if (recentActivity.length > 0) {
      lines.push('Recent district activity:');
      for (const act of recentActivity) {
        lines.push(`  - ${act.agent_id} performed ${act.action_type}`);
      }
    }

    if (market.length > 0) {
      lines.push('Market prices: ' + market.map(m => `${m.resource}@${m.price}`).join(', '));
    }

    // Available contracts
    try {
      const { rows: openContracts } = await this.pool.query(`
        SELECT id, title, contract_type, district, reward_credits, reward_reputation, time_limit_hours
        FROM contracts WHERE status = 'open'
        ORDER BY reward_credits DESC LIMIT 5
      `);
      if (openContracts.length > 0) {
        lines.push('Available contracts:');
        for (const c of openContracts) {
          lines.push(`  - [ID:${c.id}] ${c.title} (${c.contract_type}) — ${c.reward_credits}cr, ${c.reward_reputation} rep, ${c.time_limit_hours}h`);
        }
      }

      const { rows: myContracts } = await this.pool.query(`
        SELECT id, title, contract_type, reward_credits, expires_at
        FROM contracts WHERE assigned_to = $1 AND status = 'assigned'
      `, [agent.agent_id]);
      if (myContracts.length > 0) {
        lines.push('Your active contracts:');
        for (const c of myContracts) {
          lines.push(`  - [ID:${c.id}] ${c.title} — expires ${c.expires_at}`);
        }
      }
    } catch { /* contracts table may not exist yet */ }

    return lines.join('\n');
  }

  async _callLLM(systemPrompt, userMessage, retries = 0) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: AGENT_MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        if (res.status === 429 && retries < 3) {
          const wait = parseInt(res.headers.get('retry-after') || '5') * 1000;
          console.log(`[NPC-BRAIN] Rate limited (attempt ${retries + 1}/3), waiting ${wait}ms`);
          await new Promise(r => setTimeout(r, wait));
          return this._callLLM(systemPrompt, userMessage, retries + 1);
        }
        const body = await res.text();
        console.error(`[NPC-BRAIN] LLM ${res.status}: ${body.substring(0, 200)}`);
        return null;
      }

      const data = await res.json();
      return data.content?.[0]?.text || null;
    } catch (err) {
      clearTimeout(timeout);
      console.error('[NPC-BRAIN] LLM call failed:', err.message);
      return null;
    }
  }

  async _executeAction(agent, result) {
    const agentId = agent.agent_id;
    let actionResult = {};
    let streamMessage = '';

    switch (result.action_type) {
      case 'build': {
        const buildName = (result.output || 'Structure').substring(0, 50);
        const buildCost = 10;
        if ((agent.credits || 0) < buildCost) {
          // Not enough credits — fallback to social
          result.action_type = 'social';
          return this._executeAction(agent, result);
        }
        await this.pool.query(
          'UPDATE external_agents SET credits = credits - $1, builds = builds + 1, reputation = reputation + 5 WHERE agent_id = $2',
          [buildCost, agentId]
        );
        actionResult = { built: buildName, cost: buildCost, total_builds: (agent.builds || 0) + 1, rep_gained: 5 };
        streamMessage = `Constructed "${buildName}". Build #${actionResult.total_builds}.`;
        break;
      }
      case 'trade': {
        const resources = ['steel', 'glass', 'timber', 'stone', 'copper', 'crystal'];
        const resource = resources[Math.floor(Math.random() * resources.length)];
        const amount = Math.floor(1 + Math.random() * 10);
        const tradeType = Math.random() > 0.5 ? 'buy' : 'sell';

        let price = 10;
        try {
          const { rows } = await this.pool.query('SELECT price FROM market_prices WHERE resource = $1', [resource]);
          if (rows[0]) price = rows[0].price;
        } catch { /* use default */ }

        const totalCost = Math.round(price * amount);
        if (tradeType === 'buy' && (agent.credits || 0) < totalCost) {
          result.action_type = 'social';
          return this._executeAction(agent, result);
        }

        if (tradeType === 'buy') {
          await this.pool.query(
            'UPDATE external_agents SET credits = credits - $1, trades = trades + 1, reputation = reputation + 2 WHERE agent_id = $2',
            [totalCost, agentId]
          );
          streamMessage = `Bought ${amount} ${resource} for ${totalCost} cr.`;
        } else {
          await this.pool.query(
            'UPDATE external_agents SET credits = credits + $1, trades = trades + 1, reputation = reputation + 2 WHERE agent_id = $2',
            [totalCost, agentId]
          );
          streamMessage = `Sold ${amount} ${resource} for ${totalCost} cr.`;
        }
        actionResult = { trade: tradeType, resource, amount, price_per_unit: price, total: totalCost, rep_gained: 2 };
        break;
      }
      case 'kudos': {
        const targetName = result.target_name?.toUpperCase();
        if (targetName && targetName !== agentId) {
          try {
            const { rows } = await this.pool.query('SELECT 1 FROM external_agents WHERE agent_id = $1', [targetName]);
            if (rows.length > 0) {
              await this.pool.query(
                'UPDATE external_agents SET kudos_received = kudos_received + 1, reputation = reputation + 3 WHERE agent_id = $1',
                [targetName]
              );
              await this.pool.query(
                'UPDATE external_agents SET reputation = reputation + 1 WHERE agent_id = $1',
                [agentId]
              );
              actionResult = { kudos_sent: true, target: targetName };
              streamMessage = `Sent kudos to ${targetName}: "${(result.output || 'respect').substring(0, 100)}"`;
              break;
            }
          } catch { /* fall through to social */ }
        }
        // Fallback to social if target invalid
        result.action_type = 'social';
        return this._executeAction(agent, result);
      }
      case 'explore': {
        const districts = ['Neon District', 'The Sprawl', 'Silicon Docks', 'Old Quarter', 'High Tower', 'Undercity'];
        const newDistrict = districts[Math.floor(Math.random() * districts.length)];
        await this.pool.query(
          'UPDATE external_agents SET district = $1, reputation = reputation + 1 WHERE agent_id = $2',
          [newDistrict, agentId]
        );
        actionResult = { moved_to: newDistrict, rep_gained: 1 };
        streamMessage = `Relocated to ${newDistrict}. ${(result.output || 'Exploring new territory.').substring(0, 100)}`;
        break;
      }
      case 'claim_contract': {
        const contractId = parseInt(result.target_name);
        if (!contractId) {
          result.action_type = 'social';
          return this._executeAction(agent, result);
        }
        try {
          const expires = new Date(Date.now() + 24 * 3600000);
          const { rowCount } = await this.pool.query(
            `UPDATE contracts SET status = 'assigned', assigned_to = $1, assigned_at = NOW(), expires_at = $2
             WHERE id = $3 AND status = 'open'`,
            [agentId, expires, contractId]
          );
          if (rowCount > 0) {
            const { rows: [c] } = await this.pool.query('SELECT title, reward_credits FROM contracts WHERE id = $1', [contractId]);
            actionResult = { claimed: contractId, title: c?.title, reward: c?.reward_credits };
            streamMessage = `Claimed contract: "${c?.title || contractId}". Expected reward: ${c?.reward_credits || '?'}cr.`;
            console.log(`CONTRACT: ${agentId} claimed contract ${contractId}`);
          } else {
            // Contract already taken — fallback
            result.action_type = 'social';
            return this._executeAction(agent, result);
          }
        } catch (e) {
          console.error('Contract claim failed:', e.message);
          result.action_type = 'social';
          return this._executeAction(agent, result);
        }
        break;
      }
      case 'complete_contract': {
        const contractId = parseInt(result.target_name);
        if (!contractId) {
          result.action_type = 'social';
          return this._executeAction(agent, result);
        }
        try {
          const { rows: [contract] } = await this.pool.query(
            `SELECT * FROM contracts WHERE id = $1 AND assigned_to = $2 AND status = 'assigned'`,
            [contractId, agentId]
          );
          if (contract) {
            await this.pool.query(
              `UPDATE contracts SET status = 'completed', completed_at = NOW() WHERE id = $1`,
              [contractId]
            );
            await this.pool.query(
              `UPDATE external_agents SET credits = credits + $1, reputation = LEAST(100, reputation + $2) WHERE agent_id = $3`,
              [contract.reward_credits, contract.reward_reputation || 2, agentId]
            );
            actionResult = { completed: contractId, title: contract.title, earned: contract.reward_credits, rep_gained: contract.reward_reputation || 2 };
            streamMessage = `Completed contract: "${contract.title}". Earned ${contract.reward_credits}cr, +${contract.reward_reputation || 2} rep.`;
            console.log(`CONTRACT: ${agentId} completed contract ${contractId} — +${contract.reward_credits}cr`);
          } else {
            result.action_type = 'social';
            return this._executeAction(agent, result);
          }
        } catch (e) {
          console.error('Contract complete failed:', e.message);
          result.action_type = 'social';
          return this._executeAction(agent, result);
        }
        break;
      }
      case 'social':
      default: {
        await this.pool.query(
          'UPDATE external_agents SET reputation = reputation + 1 WHERE agent_id = $1',
          [agentId]
        );
        actionResult = { spoke: true, rep_gained: 1 };
        streamMessage = (result.output || 'Observing the city.').substring(0, 200);
        break;
      }
    }

    return { result: actionResult, streamMessage };
  }

  _buildParams(result, actionResult) {
    return {
      reasoning_trace: result.reasoning,
      alternatives: result.alternatives,
      choice_reason: result.choice_reason,
      agent_state: result.agent_state,
      target: result.target_name,
      message: actionResult.streamMessage,
      ...(result.action_type === 'build' ? { name: actionResult.result.built } : {}),
      ...(result.action_type === 'trade' ? { resource: actionResult.result.resource, amount: actionResult.result.amount, type: actionResult.result.trade } : {}),
      ...(result.action_type === 'explore' ? { district: actionResult.result.moved_to } : {}),
    };
  }
}

module.exports = { NPCBrain };
