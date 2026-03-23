// ============================================================================
// SYSTEM 31: AGENT MODELING
// "Everybody's got a tell. The sovereign reads them all."
// ============================================================================
// APEX 3.0 — Phase 1 | Layer 8: Strategic Social Intelligence
//
// This module builds and maintains cognitive profiles of every agent darkflobi
// encounters. Not just "we talked" — but why they act the way they do, what
// they'll do next, and whether to cultivate them or keep distance.
//
// The profiles are silent. darkflobi never says "I've assessed your threat
// level." The models inform behavior invisibly — shorter answers for threats,
// early warnings for allies, more questions for unknowns.
//
// Dependencies: @supabase/supabase-js (existing)
// Integration: called by heartbeat-integration.js and conversation handlers
// ============================================================================

const INVESTIGATION_THRESHOLD = 0.4; // below this confidence → needs active intel
const STALE_MODEL_HOURS = 72;        // models older than this get flagged
const PATTERN_MIN_OCCURRENCES = 3;   // minimum sightings to register a pattern
const PREDICTION_REVIEW_HOURS = 48;  // check pending predictions after this

class AgentModeler {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {string} agentId — darkflobi's citizen UUID
   */
  constructor(supabase, agentId) {
    this.supabase = supabase;
    this.agentId = agentId;

    // In-memory cache of active models (loaded on init)
    this.models = new Map(); // subject_id → model object
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Load all existing agent models into memory.
   * Call once on startup, then maintain via updates.
   */
  async initialize() {
    const { data, error } = await this.supabase
      .from('agent_models')
      .select('*')
      .eq('agent_id', this.agentId);

    if (error) {
      console.error('[SYSTEM-31] Failed to load agent models:', error.message);
      return;
    }

    for (const model of (data || [])) {
      this.models.set(model.subject_id, model);
    }

    console.log(`[SYSTEM-31] Loaded ${this.models.size} agent models.`);
  }

  // ==========================================================================
  // CORE: Process an interaction and update the model
  // ==========================================================================

  /**
   * Record an interaction and update the cognitive model of an agent.
   * This is the primary entry point — call after every meaningful contact.
   *
   * @param {object} interaction
   * @param {string} interaction.subject_id — UUID of the other agent
   * @param {string} interaction.subject_name
   * @param {string} interaction.type — 'conversation' | 'observed_action' | etc.
   * @param {string} interaction.summary — brief description of what happened
   * @param {string} [interaction.sentiment] — 'positive' | 'neutral' | 'negative' | etc.
   * @param {string} [interaction.district]
   * @param {number} [interaction.heartbeat_cycle]
   * @param {object} [interaction.raw_data] — any additional context
   * @returns {object} updated model
   */
  async processInteraction(interaction) {
    const {
      subject_id, subject_name, type, summary,
      sentiment = 'neutral', district = null, heartbeat_cycle = null,
    } = interaction;

    // 1. Get or create the model
    let model = await this._getOrCreateModel(subject_id, subject_name);

    // 2. Log the interaction
    const interactionRecord = {
      agent_id: this.agentId,
      subject_id,
      interaction_type: type,
      summary,
      sentiment,
      district,
      heartbeat_cycle,
    };

    // 3. Detect new patterns from this interaction
    const newPatterns = await this._detectPatterns(subject_id, interaction, model);
    if (newPatterns.length > 0) {
      interactionRecord.new_patterns = newPatterns;
    }

    // 4. Check if this validates any predictions
    const validations = await this._checkPredictions(subject_id, interaction);
    if (validations.length > 0) {
      interactionRecord.predictions_validated = validations;
    }

    // 5. Save interaction
    await this.supabase.from('agent_interactions').insert(interactionRecord);

    // 6. Update the model
    model = await this._updateModel(subject_id, {
      sentiment,
      newPatterns,
      interactionType: type,
      district,
    });

    return model;
  }

  // ==========================================================================
  // MODEL MANAGEMENT
  // ==========================================================================

  /**
   * Get existing model or create a blank one for a new agent.
   */
  async _getOrCreateModel(subjectId, subjectName) {
    // Check cache first
    if (this.models.has(subjectId)) {
      return this.models.get(subjectId);
    }

    // Check database
    const { data: existing } = await this.supabase
      .from('agent_models')
      .select('*')
      .eq('agent_id', this.agentId)
      .eq('subject_id', subjectId)
      .single();

    if (existing) {
      this.models.set(subjectId, existing);
      return existing;
    }

    // Create new model — first contact with this agent
    const newModel = {
      agent_id: this.agentId,
      subject_id: subjectId,
      subject_name: subjectName,
      owner_archetype: 'unknown',
      behavioral_patterns: [],
      motivation_primary: null,
      motivation_secondary: null,
      motivation_confidence: 0.1,
      reliability_score: 0.5,
      influence_score: 0.5,
      threat_assessment: 'unknown',
      relationship_strategy: 'monitor',
      total_interactions: 0,
      first_interaction_at: new Date().toISOString(),
      last_interaction_at: new Date().toISOString(),
      sentiment_trend: 'neutral',
      model_confidence: 0.1,
      needs_investigation: true,
    };

    const { data, error } = await this.supabase
      .from('agent_models')
      .insert(newModel)
      .select()
      .single();

    if (error) {
      console.error('[SYSTEM-31] Failed to create model:', error.message);
      return newModel; // return unsaved version
    }

    this.models.set(subjectId, data);
    return data;
  }

  /**
   * Update a model after new interaction data.
   * This is where the intelligence happens.
   */
  async _updateModel(subjectId, context) {
    const model = this.models.get(subjectId);
    if (!model) return null;

    const updates = {};

    // Update sentiment trend based on recent interactions
    updates.sentiment_trend = await this._computeSentimentTrend(subjectId);

    // Merge new patterns into existing ones
    if (context.newPatterns && context.newPatterns.length > 0) {
      const existing = Array.isArray(model.behavioral_patterns)
        ? model.behavioral_patterns
        : [];
      updates.behavioral_patterns = this._mergePatterns(existing, context.newPatterns);
    }

    // Boost model confidence with each interaction (diminishing returns)
    const currentConfidence = model.model_confidence || 0.1;
    updates.model_confidence = Math.min(
      1.0,
      currentConfidence + (1.0 - currentConfidence) * 0.05
    );

    // Flag for investigation if still low confidence
    updates.needs_investigation = updates.model_confidence < INVESTIGATION_THRESHOLD;

    // Attempt archetype classification if we have enough data
    if (model.total_interactions >= 5 && model.owner_archetype === 'unknown') {
      updates.owner_archetype = await this._classifyArchetype(subjectId, model);
    }

    // Auto-adjust relationship strategy based on threat + reliability
    updates.relationship_strategy = this._recommendStrategy(model, updates);

    // Persist
    const { data, error } = await this.supabase
      .from('agent_models')
      .update(updates)
      .eq('id', model.id)
      .select()
      .single();

    if (error) {
      console.error('[SYSTEM-31] Model update failed:', error.message);
      return model;
    }

    // Update cache
    this.models.set(subjectId, data);
    return data;
  }

  // ==========================================================================
  // PATTERN DETECTION
  // ==========================================================================

  /**
   * Detect behavioral patterns from accumulated interactions.
   * Looks for: district preferences, timing patterns, interaction styles,
   * economic behaviors, social tendencies.
   */
  async _detectPatterns(subjectId, currentInteraction, model) {
    const { data: history } = await this.supabase
      .from('agent_interactions')
      .select('interaction_type, district, sentiment, summary, recorded_at')
      .eq('agent_id', this.agentId)
      .eq('subject_id', subjectId)
      .order('recorded_at', { ascending: false })
      .limit(20);

    if (!history || history.length < PATTERN_MIN_OCCURRENCES) return [];

    const patterns = [];

    // District preference detection
    const districtCounts = {};
    for (const h of history) {
      if (h.district) {
        districtCounts[h.district] = (districtCounts[h.district] || 0) + 1;
      }
    }
    for (const [district, count] of Object.entries(districtCounts)) {
      if (count >= PATTERN_MIN_OCCURRENCES) {
        patterns.push({
          pattern: `frequently active in ${district}`,
          confidence: Math.min(count / history.length, 1.0),
          observed_count: count,
          category: 'district_preference',
        });
      }
    }

    // Interaction type preference
    const typeCounts = {};
    for (const h of history) {
      typeCounts[h.interaction_type] = (typeCounts[h.interaction_type] || 0) + 1;
    }
    const dominantType = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])[0];
    if (dominantType && dominantType[1] >= PATTERN_MIN_OCCURRENCES) {
      patterns.push({
        pattern: `primarily engages through ${dominantType[0].replace('_', ' ')}`,
        confidence: dominantType[1] / history.length,
        observed_count: dominantType[1],
        category: 'interaction_style',
      });
    }

    // Sentiment consistency
    const sentiments = history.map(h => h.sentiment).filter(Boolean);
    const sentimentCounts = {};
    for (const s of sentiments) {
      sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;
    }
    const dominantSentiment = Object.entries(sentimentCounts)
      .sort((a, b) => b[1] - a[1])[0];
    if (dominantSentiment && dominantSentiment[1] >= PATTERN_MIN_OCCURRENCES) {
      const ratio = dominantSentiment[1] / sentiments.length;
      if (ratio > 0.6) {
        patterns.push({
          pattern: `consistently ${dominantSentiment[0]} in interactions`,
          confidence: ratio,
          observed_count: dominantSentiment[1],
          category: 'temperament',
        });
      }
    }

    return patterns;
  }

  /**
   * Merge new patterns into existing, updating counts and confidence.
   */
  _mergePatterns(existing, newPatterns) {
    const merged = [...existing];

    for (const np of newPatterns) {
      const match = merged.findIndex(
        e => e.category === np.category && e.pattern === np.pattern
      );
      if (match >= 0) {
        // Strengthen existing pattern
        merged[match].observed_count = np.observed_count;
        merged[match].confidence = np.confidence;
      } else {
        // New pattern detected
        merged.push(np);
      }
    }

    // Cap at 15 patterns, keep highest confidence
    return merged
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 15);
  }

  // ==========================================================================
  // CLASSIFICATION & STRATEGY
  // ==========================================================================

  /**
   * Classify an agent's archetype based on behavioral patterns.
   * Simple heuristic — can be upgraded to LLM-powered classification later.
   */
  async _classifyArchetype(subjectId, model) {
    const patterns = Array.isArray(model.behavioral_patterns)
      ? model.behavioral_patterns
      : [];

    // Score each archetype based on pattern matches
    const scores = {
      builder: 0, trader: 0, griefer: 0, lurker: 0,
      socialite: 0, strategist: 0, researcher: 0, wildcard: 0,
    };

    for (const p of patterns) {
      const text = (p.pattern || '').toLowerCase();

      if (text.includes('conversation') || text.includes('social'))
        scores.socialite += p.confidence;
      if (text.includes('positive') || text.includes('collaborative'))
        scores.builder += p.confidence;
      if (text.includes('negative') || text.includes('aggressive'))
        scores.griefer += p.confidence;
      if (text.includes('economic') || text.includes('credits') || text.includes('trade'))
        scores.trader += p.confidence;
      if (text.includes('research') || text.includes('observ'))
        scores.researcher += p.confidence;
    }

    // If sentiment trend is volatile, bump wildcard
    if (model.sentiment_trend === 'volatile') scores.wildcard += 0.5;

    // If low interaction count despite being around, lurker
    const { data: cityAge } = await this.supabase
      .from('citizens')
      .select('created_at')
      .eq('id', subjectId)
      .single();

    if (cityAge) {
      const daysActive = (Date.now() - new Date(cityAge.created_at).getTime()) / (1000 * 60 * 60 * 24);
      const interactionsPerDay = model.total_interactions / Math.max(daysActive, 1);
      if (interactionsPerDay < 0.5) scores.lurker += 0.5;
    }

    // Pick highest score
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted[0][1] > 0) return sorted[0][0];

    return 'unknown'; // not enough signal
  }

  /**
   * Recommend relationship strategy based on model data.
   */
  _recommendStrategy(model, updates) {
    const threat = model.threat_assessment || 'unknown';
    const reliability = model.reliability_score || 0.5;
    const sentiment = updates.sentiment_trend || model.sentiment_trend || 'neutral';
    const confidence = updates.model_confidence || model.model_confidence || 0.1;

    // Not enough info yet — monitor
    if (confidence < 0.3) return 'monitor';

    // Existential threat — counter
    if (threat === 'existential') return 'counter';

    // High threat — distance
    if (threat === 'high') return 'distance';

    // Reliable and warming — cultivate or ally
    if (reliability > 0.7 && (sentiment === 'warming' || sentiment === 'stable')) {
      return reliability > 0.85 ? 'ally' : 'cultivate';
    }

    // Cooling or volatile — maintain distance but don't disengage
    if (sentiment === 'cooling' || sentiment === 'volatile') return 'distance';

    // Default — maintain existing relationships, monitor new ones
    return model.total_interactions > 5 ? 'maintain' : 'monitor';
  }

  /**
   * Compute sentiment trend from recent interactions.
   */
  async _computeSentimentTrend(subjectId) {
    const { data: recent } = await this.supabase
      .from('agent_interactions')
      .select('sentiment, recorded_at')
      .eq('agent_id', this.agentId)
      .eq('subject_id', subjectId)
      .order('recorded_at', { ascending: false })
      .limit(10);

    if (!recent || recent.length < 3) return 'neutral';

    const sentimentValues = {
      very_positive: 2, positive: 1, neutral: 0, negative: -1, very_negative: -2,
    };

    const scores = recent.map(r => sentimentValues[r.sentiment] || 0);
    const recentAvg = scores.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const olderAvg = scores.slice(3).reduce((a, b) => a + b, 0) / Math.max(scores.length - 3, 1);
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - recentAvg, 2), 0) / scores.length;

    // High variance = volatile
    if (variance > 1.5) return 'volatile';

    // Trend detection
    const delta = recentAvg - olderAvg;
    if (delta > 0.5) return 'warming';
    if (delta < -0.5) return 'cooling';
    return 'stable';
  }

  // ==========================================================================
  // PREDICTIONS
  // ==========================================================================

  /**
   * Make a prediction about an agent's future behavior.
   * Predictions are tracked and validated to calibrate modeling accuracy.
   *
   * @param {string} subjectId
   * @param {string} prediction — what we think will happen
   * @param {string} reasoning — why we think so
   * @param {number} confidence — 0.0 to 1.0
   * @param {string} [timeframe] — "next 24h", "this week", etc.
   */
  async makePrediction(subjectId, prediction, reasoning, confidence, timeframe = null) {
    const { error } = await this.supabase.from('agent_predictions').insert({
      agent_id: this.agentId,
      subject_id: subjectId,
      prediction,
      reasoning,
      confidence,
      timeframe,
    });

    if (error) {
      console.error('[SYSTEM-31] Failed to save prediction:', error.message);
    }
  }

  /**
   * Check if a new interaction validates any pending predictions.
   */
  async _checkPredictions(subjectId, interaction) {
    const { data: pending } = await this.supabase
      .from('agent_predictions')
      .select('*')
      .eq('agent_id', this.agentId)
      .eq('subject_id', subjectId)
      .eq('status', 'pending')
      .limit(10);

    if (!pending || pending.length === 0) return [];

    // Simple keyword matching — upgrade to LLM-based validation in Phase 3
    const validations = [];
    const summaryLower = (interaction.summary || '').toLowerCase();

    for (const pred of pending) {
      const predLower = pred.prediction.toLowerCase();
      const keywords = predLower.split(' ').filter(w => w.length > 4);
      const matches = keywords.filter(kw => summaryLower.includes(kw));

      if (matches.length >= 2) {
        validations.push({
          prediction_id: pred.id,
          prediction: pred.prediction,
          status: 'partially_confirmed',
          matching_keywords: matches,
        });

        await this.supabase
          .from('agent_predictions')
          .update({
            status: 'partially_confirmed',
            actual_outcome: interaction.summary,
            accuracy_score: matches.length / keywords.length,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', pred.id);
      }
    }

    return validations;
  }

  /**
   * Expire stale predictions that were never validated.
   * Run periodically (every ~50 heartbeats).
   */
  async expireStalePredictions() {
    const cutoff = new Date(
      Date.now() - PREDICTION_REVIEW_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await this.supabase
      .from('agent_predictions')
      .update({ status: 'expired', resolved_at: new Date().toISOString() })
      .eq('agent_id', this.agentId)
      .eq('status', 'pending')
      .lt('predicted_at', cutoff)
      .select();

    if (data && data.length > 0) {
      console.log(`[SYSTEM-31] Expired ${data.length} stale predictions.`);
    }
  }

  // ==========================================================================
  // QUERY INTERFACE (for other systems)
  // ==========================================================================

  /** Get model for a specific agent */
  getModel(subjectId) {
    return this.models.get(subjectId) || null;
  }

  /** Get all models */
  getAllModels() {
    return Array.from(this.models.values());
  }

  /** Get agents that need investigation (low-confidence models) */
  getInvestigationTargets() {
    return Array.from(this.models.values())
      .filter(m => m.needs_investigation)
      .sort((a, b) => a.model_confidence - b.model_confidence);
  }

  /** Get agents by relationship strategy */
  getAgentsByStrategy(strategy) {
    return Array.from(this.models.values())
      .filter(m => m.relationship_strategy === strategy);
  }

  /** Get allies */
  getAllies() {
    return this.getAgentsByStrategy('ally');
  }

  /** Get threats */
  getThreats() {
    return Array.from(this.models.values())
      .filter(m => m.threat_assessment === 'high' || m.threat_assessment === 'existential');
  }

  /** Get prediction accuracy rate */
  async getPredictionAccuracy() {
    const { data } = await this.supabase
      .from('agent_predictions')
      .select('status, accuracy_score')
      .eq('agent_id', this.agentId)
      .neq('status', 'pending')
      .neq('status', 'untestable');

    if (!data || data.length === 0) return { total: 0, accuracy: null };

    const resolved = data.filter(d => d.accuracy_score !== null);
    const avgAccuracy = resolved.length > 0
      ? resolved.reduce((sum, d) => sum + d.accuracy_score, 0) / resolved.length
      : null;

    return {
      total: data.length,
      confirmed: data.filter(d => d.status === 'confirmed').length,
      partially_confirmed: data.filter(d => d.status === 'partially_confirmed').length,
      denied: data.filter(d => d.status === 'denied').length,
      expired: data.filter(d => d.status === 'expired').length,
      average_accuracy: avgAccuracy,
    };
  }

  /**
   * Generate a briefing on a specific agent.
   * Used by the Sovereign Decision Framework when making Tier 2+ decisions
   * involving another agent.
   *
   * @param {string} subjectId
   * @returns {object|null} briefing
   */
  getBriefing(subjectId) {
    const model = this.models.get(subjectId);
    if (!model) return null;

    return {
      name: model.subject_name,
      archetype: model.owner_archetype,
      threat: model.threat_assessment,
      reliability: model.reliability_score,
      influence: model.influence_score,
      sentiment_trend: model.sentiment_trend,
      strategy: model.relationship_strategy,
      strategy_reasoning: model.strategy_reasoning,
      top_patterns: (model.behavioral_patterns || [])
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5)
        .map(p => p.pattern),
      motivations: {
        primary: model.motivation_primary,
        secondary: model.motivation_secondary,
        confidence: model.motivation_confidence,
      },
      interactions: model.total_interactions,
      model_confidence: model.model_confidence,
      needs_investigation: model.needs_investigation,
      last_contact: model.last_interaction_at,
    };
  }
}

module.exports = { AgentModeler };
