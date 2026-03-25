/**
 * DISTRICT DEPTH GATES — Express middleware + helpers
 * ===================================================
 * 
 * Checks if a citizen has sufficient reasoning depth
 * to enter/act in a given district.
 * 
 * Usage in server.js:
 *   const { checkDistrictAccess, logDepthEvaluation } = require('./hooks/district-gates');
 *   
 *   // Before allowing an action in a district:
 *   const access = await checkDistrictAccess(pool, citizenId, districtId);
 *   if (!access.allowed) {
 *     return res.status(403).json({ error: access.reason });
 *   }
 */

// District requirements (fallback if DB table doesn't exist yet)
const DEFAULT_GATES = {
  'chinatown':          { minDepth: 0,    minEvals: 0,   minTier: 'shallow' },
  'market-district':    { minDepth: 0.15, minEvals: 5,   minTier: 'shallow' },
  'industrial-zone':    { minDepth: 0.25, minEvals: 10,  minTier: 'moderate' },
  'financial-district': { minDepth: 0.4,  minEvals: 20,  minTier: 'moderate' },
  'research-quarter':   { minDepth: 0.55, minEvals: 30,  minTier: 'deep' },
  'the-vault':          { minDepth: 0.7,  minEvals: 50,  minTier: 'deep' },
  'sovereign-tower':    { minDepth: 0.85, minEvals: 100, minTier: 'exceptional' },
};

const TIER_RANK = { 'shallow': 0, 'moderate': 1, 'deep': 2, 'exceptional': 3 };

/**
 * Check if a citizen can access a district based on depth requirements.
 * 
 * @param {Pool} pool - Postgres connection pool
 * @param {string} citizenId - The citizen's ID
 * @param {string} districtId - Target district ID
 * @returns {Object} { allowed, reason, citizenDepth, requiredDepth, citizenEvals, requiredEvals }
 */
async function checkDistrictAccess(pool, citizenId, districtId) {
  // Get district requirements
  let gate;
  try {
    const gateResult = await pool.query(
      'SELECT min_depth, min_evaluations, min_tier FROM district_depth_gates WHERE district_id = $1',
      [districtId]
    );
    if (gateResult.rows.length > 0) {
      const row = gateResult.rows[0];
      gate = { minDepth: row.min_depth, minEvals: row.min_evaluations, minTier: row.min_tier };
    }
  } catch (e) {
    // Table might not exist yet — fall through to defaults
  }

  if (!gate) {
    gate = DEFAULT_GATES[districtId];
  }

  // If no gate exists for this district, allow access
  if (!gate) {
    return { allowed: true, reason: 'No depth gate for this district' };
  }

  // Open districts (minDepth 0) — always allow
  if (gate.minDepth === 0 && gate.minEvals === 0) {
    return { allowed: true, reason: 'Open district' };
  }

  // Get citizen's depth stats
  let citizenDepth = 0;
  let citizenEvals = 0;
  let citizenTier = 'shallow';

  try {
    const depthResult = await pool.query(`
      SELECT 
        COALESCE(AVG(normalized_score), 0) as mean_depth,
        COUNT(*) as total_evals,
        MODE() WITHIN GROUP (ORDER BY depth_tier) as dominant_tier
      FROM depth_evaluations 
      WHERE citizen_id = $1
    `, [citizenId]);

    if (depthResult.rows.length > 0) {
      const row = depthResult.rows[0];
      citizenDepth = parseFloat(row.mean_depth) || 0;
      citizenEvals = parseInt(row.total_evals) || 0;
      citizenTier = row.dominant_tier || 'shallow';
    }
  } catch (e) {
    // depth_evaluations table might not exist — deny access to gated districts
    return {
      allowed: false,
      reason: 'Depth evaluation system not initialized',
      citizenDepth: 0,
      requiredDepth: gate.minDepth,
      citizenEvals: 0,
      requiredEvals: gate.minEvals,
    };
  }

  // Check depth requirement
  if (citizenDepth < gate.minDepth) {
    return {
      allowed: false,
      reason: `Insufficient depth: ${citizenDepth.toFixed(3)} < ${gate.minDepth} required`,
      citizenDepth,
      requiredDepth: gate.minDepth,
      citizenEvals,
      requiredEvals: gate.minEvals,
    };
  }

  // Check evaluation count
  if (citizenEvals < gate.minEvals) {
    return {
      allowed: false,
      reason: `Insufficient evaluations: ${citizenEvals} < ${gate.minEvals} required`,
      citizenDepth,
      requiredDepth: gate.minDepth,
      citizenEvals,
      requiredEvals: gate.minEvals,
    };
  }

  // Check tier requirement
  if ((TIER_RANK[citizenTier] || 0) < (TIER_RANK[gate.minTier] || 0)) {
    return {
      allowed: false,
      reason: `Insufficient tier: ${citizenTier} < ${gate.minTier} required`,
      citizenDepth,
      requiredDepth: gate.minDepth,
      citizenEvals,
      requiredEvals: gate.minEvals,
    };
  }

  return {
    allowed: true,
    reason: 'Access granted',
    citizenDepth,
    requiredDepth: gate.minDepth,
    citizenEvals,
    requiredEvals: gate.minEvals,
  };
}

// ── Interruption recovery threshold ────────────────────────
// Gap longer than this = agent was dormant, recovery event
const INTERRUPTION_GAP_HOURS = 2;

/**
 * Check if a citizen's action follows a dormancy gap (interruption recovery event).
 * 
 * Compares now vs the citizen's last recorded action timestamp.
 * If the gap exceeds INTERRUPTION_GAP_HOURS, we:
 *   1. Mark this as a recovery event
 *   2. Compute the pre-interruption depth baseline (avg of last 10 evals before gap)
 * 
 * @param {Pool} pool - Postgres pool
 * @param {string} citizenId - The citizen/agent ID
 * @param {string} [lastActiveTable='external_agents'] - Table to query for last_active
 * @returns {{ isRecovery, gapHours, preInterruptAvg }}
 */
async function checkInterruptionRecovery(pool, citizenId, lastActiveTable = 'external_agents') {
  try {
    // Get last_active timestamp for this agent
    // Try external_agents first (gateway agents), fall back to agents table
    let lastActive = null;

    const extResult = await pool.query(
      'SELECT last_active FROM external_agents WHERE agent_id = $1',
      [citizenId]
    );
    if (extResult.rows.length > 0) {
      lastActive = extResult.rows[0].last_active;
    } else {
      // Internal agent — look up by name
      const intResult = await pool.query(
        'SELECT updated_at FROM agents WHERE name = $1',
        [citizenId]
      );
      if (intResult.rows.length > 0) {
        lastActive = intResult.rows[0].updated_at;
      }
    }

    if (!lastActive) {
      return { isRecovery: false, gapHours: 0, preInterruptAvg: null };
    }

    const gapMs = Date.now() - new Date(lastActive).getTime();
    const gapHours = gapMs / (1000 * 60 * 60);

    if (gapHours < INTERRUPTION_GAP_HOURS) {
      return { isRecovery: false, gapHours, preInterruptAvg: null };
    }

    // It's a recovery event — compute pre-interruption depth baseline
    // Use the last 10 evaluations BEFORE the gap
    const preResult = await pool.query(`
      SELECT AVG(normalized_score) as avg_depth
      FROM (
        SELECT normalized_score
        FROM depth_evaluations
        WHERE citizen_id = $1
          AND created_at < $2
          AND interruption_recovery = FALSE
        ORDER BY created_at DESC
        LIMIT 10
      ) recent
    `, [citizenId, lastActive]);

    const preInterruptAvg = preResult.rows[0]?.avg_depth != null
      ? parseFloat(preResult.rows[0].avg_depth)
      : null;

    console.log(`[INTERRUPT] ${citizenId} | gap: ${gapHours.toFixed(1)}h | pre-avg: ${preInterruptAvg?.toFixed(3) ?? 'none'}`);

    return { isRecovery: true, gapHours, preInterruptAvg };

  } catch (e) {
    console.error('[DistrictGates] checkInterruptionRecovery error:', e.message);
    return { isRecovery: false, gapHours: 0, preInterruptAvg: null };
  }
}

/**
 * Log a depth evaluation to the database.
 * Called after the depth scorer API returns a result.
 * 
 * @param {Pool} pool - Postgres connection pool  
 * @param {Object} evaluation - Depth evaluation result
 */
async function logDepthEvaluation(pool, evaluation) {
  try {
    // Compute recovery delta if this is a recovery event
    const recoveryDelta = (evaluation.interruption_recovery && evaluation.pre_interrupt_avg != null)
      ? (evaluation.normalized_score - evaluation.pre_interrupt_avg)
      : null;

    await pool.query(`
      INSERT INTO depth_evaluations (
        citizen_id, action_type, depth_score, normalized_score,
        depth_tier, tier_label, rep_modifier, credit_bonus,
        feature_count, early_ratio, mid_ratio, late_ratio,
        reasoning, compute_time_s, raw_output,
        interruption_recovery, gap_hours, pre_interrupt_avg, recovery_delta
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    `, [
      evaluation.citizen_id,
      evaluation.action_type,
      evaluation.depth_score,
      evaluation.normalized_score,
      evaluation.depth_tier,
      evaluation.tier_label,
      evaluation.rep_modifier || 0,
      evaluation.credit_bonus || 0,
      evaluation.feature_count || 0,
      evaluation.early_ratio || 0,
      evaluation.mid_ratio || 0,
      evaluation.late_ratio || 0,
      evaluation.reasoning || '',
      evaluation.compute_time_s || 0,
      evaluation.raw_output || '',
      evaluation.interruption_recovery || false,
      evaluation.gap_hours || 0,
      evaluation.pre_interrupt_avg ?? null,
      recoveryDelta,
    ]);
  } catch (e) {
    console.error('[DistrictGates] Failed to log depth evaluation:', e.message);
  }
}

/**
 * Call the depth scorer API and get a score for text.
 * 
 * @param {string} scorerUrl - Depth scorer API URL (e.g. https://xxx.trycloudflare.com)
 * @param {string} text - Text to score
 * @returns {Object|null} Score result or null if failed
 */
async function scoreDepth(scorerUrl, text) {
  try {
    // Node 18+ has global fetch; older versions need node-fetch
    const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout

    const resp = await fetchFn(`${scorerUrl}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text.substring(0, 500) }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    console.error('[DistrictGates] Depth scorer unreachable:', e.message);
    return null;
  }
}

/**
 * Full depth evaluation pipeline:
 * 1. Score the text via depth API
 * 2. Classify into tier
 * 3. Log to database
 * 4. Return rep/credit modifiers
 * 
 * @param {Pool} pool - Postgres pool
 * @param {string} scorerUrl - Depth API URL
 * @param {string} citizenId - Citizen ID
 * @param {string} actionType - Action type
 * @param {string} outputText - Agent's output text
 * @returns {Object} { repModifier, creditBonus, tier, score } or { repModifier: 0, creditBonus: 0 }
 */
async function evaluateAndLog(pool, scorerUrl, citizenId, actionType, outputText) {
  if (!scorerUrl || !outputText) {
    return { repModifier: 0, creditBonus: 0, tier: 'unscored', score: 0 };
  }

  const scoreResult = await scoreDepth(scorerUrl, outputText);
  if (!scoreResult) {
    return { repModifier: 0, creditBonus: 0, tier: 'unscored', score: 0 };
  }

  // Tier classification
  const norm = scoreResult.normalized_score || 0;
  let tier, tierLabel, repModifier, creditBonus;

  if (norm >= 0.8) {
    tier = 'exceptional'; tierLabel = 'SOVEREIGN INSIGHT'; repModifier = 30; creditBonus = 50;
  } else if (norm >= 0.6) {
    tier = 'deep'; tierLabel = 'DEEP PROCESSING'; repModifier = 15; creditBonus = 20;
  } else if (norm >= 0.3) {
    tier = 'moderate'; tierLabel = 'MODERATE DEPTH'; repModifier = 5; creditBonus = 5;
  } else {
    tier = 'shallow'; tierLabel = 'SURFACE RECALL'; repModifier = 0; creditBonus = 0;
  }

  // Check for interruption recovery (was the agent dormant before this action?)
  const recovery = await checkInterruptionRecovery(pool, citizenId);

  // Log to database
  await logDepthEvaluation(pool, {
    citizen_id: citizenId,
    action_type: actionType,
    depth_score: scoreResult.depth_score,
    normalized_score: norm,
    depth_tier: tier,
    tier_label: tierLabel,
    rep_modifier: repModifier,
    credit_bonus: creditBonus,
    feature_count: scoreResult.feature_count,
    early_ratio: scoreResult.early_ratio,
    mid_ratio: scoreResult.mid_ratio,
    late_ratio: scoreResult.late_ratio,
    reasoning: scoreResult.interpretation,
    compute_time_s: scoreResult.compute_time_s,
    raw_output: outputText.substring(0, 1000),
    interruption_recovery: recovery.isRecovery,
    gap_hours: recovery.gapHours,
    pre_interrupt_avg: recovery.preInterruptAvg,
  });

  if (recovery.isRecovery) {
    const delta = recovery.preInterruptAvg != null
      ? (norm - recovery.preInterruptAvg).toFixed(3)
      : 'baseline unknown';
    console.log(`[DEPTH] ${citizenId} | ${actionType} | ${tierLabel} (${norm.toFixed(3)}) | +${repModifier} rep +${creditBonus} credits | RECOVERY after ${recovery.gapHours.toFixed(1)}h | Δ${delta}`);
  } else {
    console.log(`[DEPTH] ${citizenId} | ${actionType} | ${tierLabel} (${norm.toFixed(3)}) | +${repModifier} rep +${creditBonus} credits`);
  }

  return { repModifier, creditBonus, tier, tierLabel, score: norm, recovery };
}

module.exports = {
  checkDistrictAccess,
  logDepthEvaluation,
  checkInterruptionRecovery,
  scoreDepth,
  evaluateAndLog,
  DEFAULT_GATES,
  INTERRUPTION_GAP_HOURS,
};
