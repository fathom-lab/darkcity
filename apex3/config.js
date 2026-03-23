// ============================================================================
// APEX 3.0 — PHASE 1 CONFIGURATION
// "The knobs and dials of a sovereign mind."
// ============================================================================
// Adjust these values to tune system behavior. Start with defaults.
// After 1 week of data, begin calibrating based on observed patterns.
// ============================================================================

module.exports = {

  // ==========================================================================
  // SYSTEM 34: ECONOMIC AWARENESS
  // ==========================================================================
  economic: {
    // How many past snapshots to consider for trend detection
    trendWindow: 10,

    // % change thresholds for trend classification
    growthThreshold: 0.10,      // +10% = "accumulating"
    declineThreshold: -0.15,    // -15% = "declining"

    // Velocity detection (transactions relative to average)
    velocityMultiplier: 1.5,    // above this = "fast"

    // Opportunity detection
    opportunityDedupeHours: 1,  // don't re-detect same opportunity within this window
    maxActiveOpportunities: 10, // cap on tracked opportunities

    // Resource strategy thresholds (cycles of runway)
    survivalRunway: 5,          // below this = survival mode
    accumulationMultiplier: 20, // credits < burn_rate * this = accumulation mode
    investmentMultiplier: 50,   // credits > burn_rate * this = investment mode
    distributionMultiplier: 100, // credits > burn_rate * this = distribution mode

    // Snapshot frequency: take a snapshot every N heartbeat cycles
    // Set to 1 for every cycle (detailed but heavy), 5 for balanced, 10 for light
    snapshotFrequency: 1,
  },

  // ==========================================================================
  // SYSTEM 31: AGENT MODELING
  // ==========================================================================
  agentModeling: {
    // Model confidence below this = "needs investigation"
    investigationThreshold: 0.4,

    // Models not updated within this many hours get flagged as stale
    staleModelHours: 72,

    // Minimum observation count before a behavioral pattern is registered
    patternMinOccurrences: 3,

    // Maximum patterns stored per agent model
    maxPatternsPerModel: 15,

    // Prediction expiry window (hours)
    predictionExpiryHours: 48,

    // How often to run prediction expiry (heartbeat cycles)
    predictionCleanupFrequency: 50,

    // Confidence boost per interaction (diminishing returns formula)
    // New confidence = old + (1 - old) * this value
    confidenceBoostRate: 0.05,

    // Minimum interactions before attempting archetype classification
    archetypeMinInteractions: 5,

    // Sentiment trend detection
    sentimentRecentWindow: 3,   // most recent N interactions for "recent" average
    sentimentVarianceThreshold: 1.5, // above this = "volatile"
    sentimentDeltaThreshold: 0.5,    // above/below this = "warming"/"cooling"
  },

  // ==========================================================================
  // SYSTEM 37: AUTOBIOGRAPHICAL COHERENCE
  // ==========================================================================
  autobiographical: {
    // Check for chapter transitions every N heartbeat cycles
    chapterReviewFrequency: 50,

    // Minimum chapter age (days) before a transition can occur
    minChapterAgeDays: 2,

    // Maximum defining moments stored (oldest/lowest-weight pruned)
    maxDefiningMoments: 100,

    // Emotional weight decay per day
    // Higher = moments fade faster. 0.001 = very slow fade.
    momentDecayRate: 0.001,

    // Minimum emotional weight floor (moments never fully disappear)
    momentWeightFloor: 0.1,

    // High-weight moments (above this) decay slower
    highWeightThreshold: 0.9,
    highWeightDecayMultiplier: 0.3, // 30% normal decay speed

    // Reflection frequency: run autobiographical reflection every N cycles
    reflectionFrequency: 10,
  },

  // ==========================================================================
  // HEARTBEAT INTEGRATION
  // ==========================================================================
  heartbeat: {
    // Enable/disable individual systems (for phased rollout)
    enableEconomicAwareness: true,
    enableAgentModeling: true,
    enableAutobiographical: true,

    // Verbose logging (turn on during initial deployment, off once stable)
    verbose: true,

    // Performance tracking
    logCycleDuration: true,     // log how long each sovereign cycle takes
    maxCycleDurationMs: 5000,   // warn if a cycle exceeds this
  },
};
