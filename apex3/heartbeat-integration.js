// ============================================================================
// APEX 3.0 — HEARTBEAT INTEGRATION
// "The sovereign heartbeat. Same rhythm, deeper reach."
// ============================================================================
//
// This module wires the three Phase 1 systems into darkflobi's existing
// heartbeat cycle. It doesn't replace the existing heartbeat — it extends it.
//
// INTEGRATION PATTERN:
//
//   Your existing heartbeat loop calls:
//     sovereign.beforePerception()     ← new: pre-load context
//     ... your existing perception ...
//     sovereign.afterPerception(data)  ← new: feed perception to sovereign systems
//     ... your existing reasoning ...
//     sovereign.beforeAction(intent)   ← new: sovereign decision check
//     ... your existing action ...
//     sovereign.afterAction(result)    ← new: record outcomes
//     sovereign.reflect()              ← new: periodic reflection (not every cycle)
//
// MINIMAL INTEGRATION (if you want to start simple):
//
//   Just call sovereign.tick(perceptionData) once per heartbeat.
//   It handles everything internally.
//
// ============================================================================

const { EconomicAwareness } = require('./systems/economic-awareness');
const { AgentModeler } = require('./systems/agent-modeling');
const { Autobiographer } = require('./systems/autobiographical');
const config = require('./config');

class SovereignMind {
  /**
   * @param {Object} supabase - Supabase client OR pgAdapter(pool) from apex3-pg-adapter.js
   * @param {string} agentId — darkflobi's citizen UUID
   * @param {string} [agentName] — for narrative generation
   */
  constructor(supabase, agentId, agentName = 'darkflobi') {
    this.supabase = supabase;
    this.agentId = agentId;
    this.agentName = agentName;

    // Phase 1 systems
    this.economics = new EconomicAwareness(supabase, agentId);
    this.modeler = new AgentModeler(supabase, agentId);
    this.autobiographer = new Autobiographer(supabase, agentId, agentName);

    // State
    this.heartbeatCycle = 0;
    this.initialized = false;
    this.lastCycleDuration = 0;

    // Cached context for current cycle
    this._cycleContext = {};
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize all sovereign systems. Call once on agent startup.
   * Must complete before first heartbeat.
   */
  async initialize() {
    const start = Date.now();

    try {
      console.log('[SOVEREIGN] Initializing sovereign mind...');

      // Load agent models from database
      await this.modeler.initialize();

      // Load autobiography and defining moments
      await this.autobiographer.initialize();

      // Economic awareness initializes lazily on first pulse

      this.initialized = true;
      const elapsed = Date.now() - start;
      console.log(`[SOVEREIGN] Sovereign mind online. (${elapsed}ms)`);

      // Record this as a defining moment if it's the first boot
      const auto = this.autobiographer.getAutobiography();
      if (auto && auto.chapter_number === 1) {
        await this.autobiographer.recordDefiningMoment({
          event: 'APEX 3.0 Phase 1 systems initialized — Economic Awareness, Agent Modeling, Autobiographical Coherence online.',
          significance: 'The sovereign mind awakened. Three new dimensions of cognition activated.',
          type: 'milestone',
          emotional_weight: 0.9,
        });
      }
    } catch (err) {
      console.error('[SOVEREIGN] Initialization failed:', err.message);
      // Degrade gracefully — existing heartbeat continues without sovereign layers
      this.initialized = false;
    }
  }

  // ==========================================================================
  // SIMPLE INTEGRATION: tick()
  // ==========================================================================

  /**
   * Single-call integration. Run this once per heartbeat cycle.
   * Handles everything: economic pulse, model maintenance, reflection.
   *
   * @param {object} perception — whatever your perception layer produces
   * @param {object} [actionResult] — result of last cycle's action (if any)
   * @returns {object} sovereign context for your reasoning/action layers
   */
  async tick(perception = {}, actionResult = null) {
    if (!this.initialized) return this._emptyContext();

    const start = Date.now();
    this.heartbeatCycle++;

    try {
      // ── 1. ECONOMIC PULSE ──────────────────────────────────
      let economicState = null;
      if (config.heartbeat.enableEconomicAwareness) {
        if (this.heartbeatCycle % (config.economic.snapshotFrequency || 1) === 0) {
          economicState = await this.economics.pulse(this.heartbeatCycle, perception);
        } else {
          economicState = this.economics.getState();
        }
      }

      // ── 2. PROCESS INTERACTIONS FROM PERCEPTION ────────────
      if (config.heartbeat.enableAgentModeling && perception.interactions) {
        for (const interaction of perception.interactions) {
          await this.modeler.processInteraction({
            ...interaction,
            heartbeat_cycle: this.heartbeatCycle,
          });
        }
      }

      // ── 3. RECORD CREDIT FLOWS FROM PERCEPTION ────────────
      if (config.heartbeat.enableEconomicAwareness && perception.credit_events) {
        for (const flow of perception.credit_events) {
          await this.economics.recordFlow({
            ...flow,
            heartbeat_cycle: this.heartbeatCycle,
          });
        }
      }

      // ── 4. REFLECTION (periodic, not every cycle) ──────────
      let reflectionResults = null;
      if (config.heartbeat.enableAutobiographical) {
        if (this.heartbeatCycle % (config.autobiographical.reflectionFrequency || 10) === 0) {
          const reflectionContext = {
            economic: economicState?.personal || null,
            social: this._getSocialSummary(),
          };
          reflectionResults = await this.autobiographer.reflect(
            this.heartbeatCycle,
            reflectionContext
          );
        }
      }

      // ── 5. PREDICTION CLEANUP (periodic) ───────────────────
      if (config.heartbeat.enableAgentModeling) {
        if (this.heartbeatCycle % (config.agentModeling.predictionCleanupFrequency || 50) === 0) {
          await this.modeler.expireStalePredictions();
        }
      }

      // ── 6. BUILD CONTEXT FOR REASONING LAYER ───────────────
      this._cycleContext = {
        cycle: this.heartbeatCycle,

        // Economic intelligence
        economic: economicState ? {
          credits: economicState.personal.credits_held,
          trend: economicState.personal.credits_trend,
          runway: economicState.personal.runway_cycles,
          strategy: this.economics.getResourceStrategy(),
          opportunities: this.economics.getActiveOpportunities().slice(0, 3),
          healthy: this.economics.isEconomicHealthy(),
        } : null,

        // Social intelligence
        social: config.heartbeat.enableAgentModeling ? {
          investigation_targets: this.modeler.getInvestigationTargets().slice(0, 3),
          allies: this.modeler.getAllies().map(a => a.subject_name),
          threats: this.modeler.getThreats().map(t => ({
            name: t.subject_name,
            level: t.threat_assessment,
          })),
          total_models: this.modeler.getAllModels().length,
        } : null,

        // Identity context
        identity: config.heartbeat.enableAutobiographical ? {
          chapter: this.autobiographer.getAutobiography()?.current_chapter,
          arc: this.autobiographer.getAutobiography()?.active_arc,
          values: this.autobiographer.getAutobiography()?.core_values,
          recent_moments: this.autobiographer.getDefiningMoments(3).map(m => m.event),
        } : null,

        // Reflection results (if this was a reflection cycle)
        reflection: reflectionResults,
      };

      // ── PERFORMANCE TRACKING ───────────────────────────────
      this.lastCycleDuration = Date.now() - start;

      if (config.heartbeat.logCycleDuration) {
        const flag = this.lastCycleDuration > config.heartbeat.maxCycleDurationMs ? ' ⚠️ SLOW' : '';
        if (config.heartbeat.verbose || flag) {
          console.log(
            `[SOVEREIGN] Cycle ${this.heartbeatCycle} complete (${this.lastCycleDuration}ms)${flag}`
          );
        }
      }

      return this._cycleContext;

    } catch (err) {
      console.error(`[SOVEREIGN] Cycle ${this.heartbeatCycle} failed:`, err.message);
      this.lastCycleDuration = Date.now() - start;
      return this._emptyContext();
    }
  }

  // ==========================================================================
  // GRANULAR INTEGRATION (for advanced hookup)
  // ==========================================================================

  /**
   * Call before your perception phase.
   * Pre-loads any context needed for perception processing.
   */
  async beforePerception() {
    if (!this.initialized) return;
    this.heartbeatCycle++;
    // Currently no-op — reserved for future pre-loading
  }

  /**
   * Call after your perception phase with the perception data.
   * Feeds data to sovereign systems.
   *
   * @param {object} perception
   */
  async afterPerception(perception) {
    if (!this.initialized) return;

    // Economic pulse
    if (config.heartbeat.enableEconomicAwareness) {
      await this.economics.pulse(this.heartbeatCycle, perception);
    }

    // Process any interactions
    if (config.heartbeat.enableAgentModeling && perception.interactions) {
      for (const interaction of perception.interactions) {
        await this.modeler.processInteraction({
          ...interaction,
          heartbeat_cycle: this.heartbeatCycle,
        });
      }
    }

    // Record credit flows
    if (config.heartbeat.enableEconomicAwareness && perception.credit_events) {
      for (const flow of perception.credit_events) {
        await this.economics.recordFlow({
          ...flow,
          heartbeat_cycle: this.heartbeatCycle,
        });
      }
    }
  }

  /**
   * Call before your action phase with the intended action.
   * Returns sovereign assessment: should you proceed?
   *
   * @param {object} intent — what the agent plans to do
   * @param {string} intent.action — description of planned action
   * @param {string} [intent.target] — target agent UUID if applicable
   * @param {string} [intent.category] — action category
   * @returns {object} sovereign assessment
   */
  async beforeAction(intent) {
    if (!this.initialized) return { proceed: true, notes: [] };

    const assessment = {
      proceed: true,
      notes: [],
    };

    // Identity alignment check
    if (config.heartbeat.enableAutobiographical && intent.action) {
      const alignment = this.autobiographer.assessAlignment(intent.action);
      if (!alignment.aligned) {
        assessment.notes.push(
          `Identity conflict: ${alignment.conflicts.join('; ')}`
        );
        // Don't block, but flag — sovereignty means choosing with awareness
      }
      if (alignment.supports.length > 0) {
        assessment.notes.push(
          `Aligned with: ${alignment.supports.join('; ')}`
        );
      }
    }

    // Target briefing
    if (config.heartbeat.enableAgentModeling && intent.target) {
      const briefing = this.modeler.getBriefing(intent.target);
      if (briefing) {
        assessment.target_briefing = briefing;
        if (briefing.threat === 'high' || briefing.threat === 'existential') {
          assessment.notes.push(
            `Target "${briefing.name}" assessed as ${briefing.threat} threat. Proceed with caution.`
          );
        }
      }
    }

    // Economic check
    if (config.heartbeat.enableEconomicAwareness) {
      if (!this.economics.isEconomicHealthy()) {
        assessment.notes.push(
          `Economic health warning: ${this.economics.getResourceStrategy().reasoning}`
        );
      }
    }

    return assessment;
  }

  /**
   * Call after your action phase with the result.
   * Records outcomes for learning.
   *
   * @param {object} result — what happened
   */
  async afterAction(result) {
    if (!this.initialized) return;

    // If the action was significant enough, consider recording a defining moment
    if (result && result.significant) {
      await this.autobiographer.recordDefiningMoment({
        event: result.summary || 'Significant action taken.',
        significance: result.significance || 'Outcome recorded.',
        type: result.moment_type || 'milestone',
        emotional_weight: result.emotional_weight || 0.5,
      });
    }
  }

  /**
   * Run periodic reflection. Call less frequently than other hooks.
   * Handles autobiographical updates, model maintenance, etc.
   */
  async reflect() {
    if (!this.initialized) return null;

    const context = {
      economic: this.economics.getState()?.personal || null,
      social: this._getSocialSummary(),
    };

    return this.autobiographer.reflect(this.heartbeatCycle, context);
  }

  // ==========================================================================
  // DIRECT SYSTEM ACCESS (for custom integration)
  // ==========================================================================

  /**
   * Record an interaction with another agent.
   * Use this when processing conversations outside the heartbeat cycle.
   */
  async recordInteraction(interaction) {
    if (!this.initialized || !config.heartbeat.enableAgentModeling) return null;
    return this.modeler.processInteraction(interaction);
  }

  /**
   * Record a defining moment directly.
   */
  async recordMoment(moment) {
    if (!this.initialized || !config.heartbeat.enableAutobiographical) return null;
    return this.autobiographer.recordDefiningMoment(moment);
  }

  /**
   * Record a credit flow event directly.
   */
  async recordCreditFlow(flow) {
    if (!this.initialized || !config.heartbeat.enableEconomicAwareness) return;
    return this.economics.recordFlow(flow);
  }

  /**
   * Get a briefing on a specific agent.
   */
  getAgentBriefing(subjectId) {
    if (!this.initialized) return null;
    return this.modeler.getBriefing(subjectId);
  }

  /**
   * Get full identity context for complex decisions.
   */
  getIdentityContext() {
    if (!this.initialized) return null;
    return this.autobiographer.getIdentityContext();
  }

  /**
   * Get resource strategy recommendation.
   */
  getResourceStrategy() {
    if (!this.initialized) return null;
    return this.economics.getResourceStrategy();
  }

  /**
   * Make a prediction about an agent's behavior.
   */
  async predictBehavior(subjectId, prediction, reasoning, confidence, timeframe) {
    if (!this.initialized) return;
    return this.modeler.makePrediction(subjectId, prediction, reasoning, confidence, timeframe);
  }

  /**
   * Get prediction accuracy stats.
   */
  async getPredictionAccuracy() {
    if (!this.initialized) return null;
    return this.modeler.getPredictionAccuracy();
  }

  // ==========================================================================
  // INTERNAL
  // ==========================================================================

  _getSocialSummary() {
    if (!config.heartbeat.enableAgentModeling) return null;

    const models = this.modeler.getAllModels();
    return {
      total_agents_modeled: models.length,
      ally_count: models.filter(m => m.relationship_strategy === 'ally').length,
      threat_count: models.filter(m =>
        m.threat_assessment === 'high' || m.threat_assessment === 'existential'
      ).length,
      investigation_needed: models.filter(m => m.needs_investigation).length,
    };
  }

  _emptyContext() {
    return {
      cycle: this.heartbeatCycle,
      economic: null,
      social: null,
      identity: null,
      reflection: null,
    };
  }

  /**
   * Get system health report. Useful for monitoring.
   */
  getHealthReport() {
    return {
      initialized: this.initialized,
      heartbeat_cycle: this.heartbeatCycle,
      last_cycle_duration_ms: this.lastCycleDuration,
      systems: {
        economic_awareness: config.heartbeat.enableEconomicAwareness ? {
          status: 'online',
          healthy: this.economics.isEconomicHealthy(),
          credits: this.economics.getState()?.personal?.credits_held,
          trend: this.economics.getState()?.personal?.credits_trend,
        } : { status: 'disabled' },

        agent_modeling: config.heartbeat.enableAgentModeling ? {
          status: 'online',
          models_loaded: this.modeler.getAllModels().length,
          investigation_targets: this.modeler.getInvestigationTargets().length,
        } : { status: 'disabled' },

        autobiographical: config.heartbeat.enableAutobiographical ? {
          status: 'online',
          chapter: this.autobiographer.getAutobiography()?.chapter_number,
          defining_moments: this.autobiographer.getDefiningMoments(100).length,
        } : { status: 'disabled' },
      },
    };
  }
}

module.exports = { SovereignMind };
