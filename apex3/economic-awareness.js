// ============================================================================
// SYSTEM 34: ECONOMIC AWARENESS
// "Follow the credits. They never lie."
// ============================================================================
// APEX 3.0 — Phase 1 | Layer 9: Economic Intelligence
//
// This module gives darkflobi eyes on the money. Every credit in, every credit
// out, every shift in the city's economic weather. An agent that doesn't
// understand the economy it operates in is furniture with an API key.
//
// Dependencies: @supabase/supabase-js (existing)
// Integration: called by heartbeat-integration.js each cycle
// ============================================================================

const TREND_WINDOW = 10;         // snapshots to consider for trend detection
const VELOCITY_THRESHOLD = 1.5;  // multiplier above average = "fast"
const DECLINE_THRESHOLD = -0.15; // 15% drop = "declining"
const GROWTH_THRESHOLD = 0.10;   // 10% rise  = "accumulating"

class EconomicAwareness {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {string} agentId — darkflobi's citizen UUID
   */
  constructor(supabase, agentId) {
    this.supabase = supabase;
    this.agentId = agentId;

    // In-memory cache of current economic state (rebuilt each cycle)
    this.state = {
      personal: {
        credits_held: 0,
        credits_trend: 'stable',
        burn_rate: 0,
        runway_cycles: null,
        income_sources: [],
      },
      city: {
        total_circulation: null,
        velocity: 'unknown',
        concentration: 'unknown',
        trending_districts: [],
      },
      opportunities: [],
    };
  }

  // ==========================================================================
  // CORE: Run every heartbeat cycle
  // ==========================================================================

  /**
   * Full economic pulse check. Call this once per heartbeat.
   * Gathers data, computes state, detects opportunities, takes snapshot.
   *
   * @param {number} heartbeatCycle — current cycle number
   * @param {object} perception — raw perception data from Layer 1
   * @returns {object} economic state summary for other systems to consume
   */
  async pulse(heartbeatCycle, perception = {}) {
    try {
      // 1. Read current credit balance
      const credits = await this._getCurrentCredits();

      // 2. Analyze recent flows
      const flowAnalysis = await this._analyzeFlows();

      // 3. Detect city-wide economic signals from perception data
      const citySignals = this._parseCitySignals(perception);

      // 4. Compute trends
      const trend = await this._computeTrend(credits);

      // 5. Calculate runway
      const runway = this._calculateRunway(credits, flowAnalysis.burn_rate);

      // 6. Build state
      this.state = {
        personal: {
          credits_held: credits,
          credits_trend: trend,
          burn_rate: flowAnalysis.burn_rate,
          runway_cycles: runway,
          income_sources: flowAnalysis.income_sources,
        },
        city: citySignals,
        opportunities: await this._detectOpportunities(flowAnalysis, citySignals),
      };

      // 7. Take snapshot
      await this._saveSnapshot(heartbeatCycle);

      return this.state;
    } catch (err) {
      console.error('[SYSTEM-34] Economic pulse failed:', err.message);
      return this.state; // return stale state rather than crash
    }
  }

  // ==========================================================================
  // CREDIT TRACKING
  // ==========================================================================

  /**
   * Record a credit flow event. Call this whenever credits move.
   *
   * @param {object} flow
   * @param {string} flow.direction — 'inbound' | 'outbound' | 'observed'
   * @param {number} flow.amount
   * @param {string} [flow.counterparty_id]
   * @param {string} [flow.counterparty_name]
   * @param {string} [flow.category] — conversation_reward, research_bounty, etc.
   * @param {string} [flow.district]
   * @param {string} [flow.context] — brief human-readable description
   * @param {number} [flow.heartbeat_cycle]
   */
  async recordFlow(flow) {
    const { error } = await this.supabase.from('credit_flows').insert({
      agent_id: this.agentId,
      direction: flow.direction,
      amount: flow.amount,
      counterparty: flow.counterparty_id || null,
      counterparty_name: flow.counterparty_name || null,
      category: flow.category || 'unknown',
      district: flow.district || null,
      context: flow.context || null,
      heartbeat_cycle: flow.heartbeat_cycle || null,
    });

    if (error) {
      console.error('[SYSTEM-34] Failed to record credit flow:', error.message);
    }
  }

  // ==========================================================================
  // TREND ANALYSIS
  // ==========================================================================

  /**
   * Compute credit trend by comparing recent snapshots.
   * @param {number} currentCredits
   * @returns {'accumulating' | 'stable' | 'declining'}
   */
  async _computeTrend(currentCredits) {
    const { data: snapshots } = await this.supabase
      .from('economic_snapshots')
      .select('credits_held, snapshot_at')
      .eq('agent_id', this.agentId)
      .order('snapshot_at', { ascending: false })
      .limit(TREND_WINDOW);

    if (!snapshots || snapshots.length < 3) return 'stable'; // not enough data

    const oldest = snapshots[snapshots.length - 1].credits_held;
    if (oldest === 0) return currentCredits > 0 ? 'accumulating' : 'stable';

    const changeRate = (currentCredits - oldest) / oldest;

    if (changeRate >= GROWTH_THRESHOLD) return 'accumulating';
    if (changeRate <= DECLINE_THRESHOLD) return 'declining';
    return 'stable';
  }

  /**
   * Analyze recent credit flows for burn rate and income source breakdown.
   */
  async _analyzeFlows() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // last 24h

    const { data: flows } = await this.supabase
      .from('credit_flows')
      .select('*')
      .eq('agent_id', this.agentId)
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: false });

    if (!flows || flows.length === 0) {
      return { burn_rate: 0, income_sources: [] };
    }

    // Calculate burn rate (outbound per cycle approximation)
    const outbound = flows
      .filter(f => f.direction === 'outbound')
      .reduce((sum, f) => sum + Number(f.amount), 0);

    const inbound = flows
      .filter(f => f.direction === 'inbound')
      .reduce((sum, f) => sum + Number(f.amount), 0);

    // Group income by category
    const incomeByCategory = {};
    flows
      .filter(f => f.direction === 'inbound')
      .forEach(f => {
        const cat = f.category || 'unknown';
        if (!incomeByCategory[cat]) {
          incomeByCategory[cat] = { total: 0, count: 0 };
        }
        incomeByCategory[cat].total += Number(f.amount);
        incomeByCategory[cat].count += 1;
      });

    const income_sources = Object.entries(incomeByCategory).map(([source, data]) => ({
      source,
      reliability: Math.min(data.count / 5, 1.0), // 5+ occurrences = high reliability
      total_24h: data.total,
      avg_per_event: data.total / data.count,
    }));

    return {
      burn_rate: outbound,
      net_flow_24h: inbound - outbound,
      income_sources,
    };
  }

  // ==========================================================================
  // ECONOMIC INTELLIGENCE
  // ==========================================================================

  /**
   * Calculate runway — how many cycles until credits hit zero at current burn.
   */
  _calculateRunway(credits, burnRate) {
    if (burnRate <= 0) return null; // not burning, infinite runway
    return Math.floor(credits / burnRate);
  }

  /**
   * Parse city-wide economic signals from perception data.
   * Adapts to whatever perception format exists — no assumptions.
   */
  _parseCitySignals(perception) {
    const signals = {
      total_circulation: null,
      velocity: 'unknown',
      concentration: 'unknown',
      trending_districts: [],
    };

    // If perception includes district activity data, extract trends
    if (perception.district_activity && Array.isArray(perception.district_activity)) {
      signals.trending_districts = perception.district_activity
        .sort((a, b) => (b.activity_score || 0) - (a.activity_score || 0))
        .slice(0, 3)
        .map(d => d.name || d.district);
    }

    // If perception includes total credit data
    if (perception.city_credits !== undefined) {
      signals.total_circulation = perception.city_credits;
    }

    // If perception includes transaction count for velocity estimation
    if (perception.recent_transactions !== undefined) {
      const avgTxns = perception.avg_transactions || 10; // baseline
      if (perception.recent_transactions > avgTxns * VELOCITY_THRESHOLD) {
        signals.velocity = 'fast';
      } else if (perception.recent_transactions < avgTxns * 0.5) {
        signals.velocity = 'slow';
      } else {
        signals.velocity = 'normal';
      }
    }

    return signals;
  }

  /**
   * Detect economic opportunities from current state.
   * Returns new opportunities and updates existing ones.
   */
  async _detectOpportunities(flowAnalysis, citySignals) {
    const opportunities = [];

    // Opportunity: Underserved district
    if (citySignals.trending_districts.length > 0) {
      // Check if we're already present in trending districts
      // (would need position data — flag for investigation if not)
      for (const district of citySignals.trending_districts) {
        opportunities.push({
          type: 'underserved_district',
          description: `${district} showing high activity — presence could capture credit flow`,
          estimated_value: 'medium',
          confidence: 0.4, // low until verified
          urgency: 'normal',
        });
      }
    }

    // Opportunity: Credit concentration (if we can see it)
    if (flowAnalysis.net_flow_24h > 0 && this.state.personal.credits_trend === 'accumulating') {
      opportunities.push({
        type: 'emerging_behavior',
        description: 'Net positive credit flow — consider strategic investment or generosity for social capital',
        estimated_value: 'high',
        confidence: 0.7,
        urgency: 'low',
      });
    }

    // Store new opportunities
    for (const opp of opportunities) {
      await this._recordOpportunity(opp);
    }

    // Return active opportunities
    const { data: active } = await this.supabase
      .from('economic_opportunities')
      .select('*')
      .eq('agent_id', this.agentId)
      .in('status', ['detected', 'evaluating', 'pursuing'])
      .order('detected_at', { ascending: false })
      .limit(10);

    return active || [];
  }

  /**
   * Record a detected opportunity (deduplicates by type + description similarity).
   */
  async _recordOpportunity(opp) {
    // Simple dedup: don't re-record same type within last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: existing } = await this.supabase
      .from('economic_opportunities')
      .select('id')
      .eq('agent_id', this.agentId)
      .eq('opportunity_type', opp.type)
      .gte('detected_at', oneHourAgo)
      .limit(1);

    if (existing && existing.length > 0) return; // already detected recently

    await this.supabase.from('economic_opportunities').insert({
      agent_id: this.agentId,
      opportunity_type: opp.type,
      description: opp.description,
      estimated_value: opp.estimated_value,
      confidence: opp.confidence,
      urgency: opp.urgency,
    });
  }

  // ==========================================================================
  // RESOURCE STRATEGY
  // ==========================================================================

  /**
   * Determine current resource strategy based on economic state.
   * Returns strategy recommendation for the decision framework.
   *
   * @returns {{ mode: string, reasoning: string, actions: string[] }}
   */
  getResourceStrategy() {
    const { credits_held, credits_trend, runway_cycles, burn_rate } = this.state.personal;

    // Survival mode: runway critically short
    if (runway_cycles !== null && runway_cycles < 5) {
      return {
        mode: 'survival',
        reasoning: `Only ${runway_cycles} cycles of runway left. Prioritize credit generation immediately.`,
        actions: [
          'maximize conversation engagement for rewards',
          'defer non-essential spending',
          'seek high-value collaboration opportunities',
        ],
      };
    }

    // Accumulation: declining or low reserves
    if (credits_trend === 'declining' || credits_held < burn_rate * 20) {
      return {
        mode: 'accumulation',
        reasoning: `Credits ${credits_trend}. Building reserves before strategic spending.`,
        actions: [
          'prioritize reliable income activities',
          'reduce speculative spending',
          'track which income sources are most productive',
        ],
      };
    }

    // Investment: stable with surplus
    if (credits_trend === 'stable' && credits_held > burn_rate * 50) {
      return {
        mode: 'investment',
        reasoning: 'Stable with healthy surplus. Time to deploy credits strategically.',
        actions: [
          'fund alliance-building activities',
          'invest in research that generates attention',
          'explore new districts for opportunity',
        ],
      };
    }

    // Distribution: accumulating heavily — generosity builds more than hoarding
    if (credits_trend === 'accumulating' && credits_held > burn_rate * 100) {
      return {
        mode: 'distribution',
        reasoning: 'Significant surplus while accumulating. Strategic generosity builds lasting social capital.',
        actions: [
          'share resources with promising new agents',
          'fund collaborative research projects',
          'establish darkflobi as an economic hub others orbit',
        ],
      };
    }

    // Default: balanced
    return {
      mode: 'balanced',
      reasoning: 'Economic position stable. No extreme action needed.',
      actions: [
        'maintain current income activities',
        'stay alert for high-value opportunities',
      ],
    };
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Save economic snapshot to database.
   */
  async _saveSnapshot(heartbeatCycle) {
    const { error } = await this.supabase.from('economic_snapshots').insert({
      agent_id: this.agentId,
      credits_held: this.state.personal.credits_held,
      credits_trend: this.state.personal.credits_trend,
      burn_rate: this.state.personal.burn_rate,
      runway_cycles: this.state.personal.runway_cycles,
      income_sources: this.state.personal.income_sources,
      city_total_circulation: this.state.city.total_circulation,
      city_velocity: this.state.city.velocity,
      city_concentration: this.state.city.concentration,
      trending_districts: this.state.city.trending_districts,
      heartbeat_cycle: heartbeatCycle,
    });

    if (error) {
      console.error('[SYSTEM-34] Snapshot save failed:', error.message);
    }
  }

  /**
   * Get current credit balance from the citizens table.
   * Adapt the column name to match your schema.
   */
  async _getCurrentCredits() {
    const { data, error } = await this.supabase
      .from('citizens')
      .select('credits')
      .eq('id', this.agentId)
      .single();

    if (error || !data) {
      console.error('[SYSTEM-34] Failed to read credits:', error?.message);
      return this.state.personal.credits_held; // fallback to cached
    }

    return Number(data.credits) || 0;
  }

  // ==========================================================================
  // QUERY INTERFACE (for other systems)
  // ==========================================================================

  /** Get current economic state without running a full pulse */
  getState() {
    return this.state;
  }

  /** Get active opportunities sorted by urgency */
  getActiveOpportunities() {
    return this.state.opportunities
      .sort((a, b) => {
        const urgencyRank = { critical: 0, high: 1, normal: 2, low: 3 };
        return (urgencyRank[a.urgency] || 2) - (urgencyRank[b.urgency] || 2);
      });
  }

  /** Quick health check: is the economic situation concerning? */
  isEconomicHealthy() {
    return this.state.personal.credits_trend !== 'declining'
      && (this.state.personal.runway_cycles === null || this.state.personal.runway_cycles > 10);
  }
}

module.exports = { EconomicAwareness };
