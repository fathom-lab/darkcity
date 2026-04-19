// ============================================================================
// hooks/depth-scorer.js
// Reasoning-depth scoring derived from live agent_actions.details JSON.
//
// The SAE-based cognitive depth pipeline writes to depth_evaluations but has
// been dormant since late March. We don't want to stall the on-chain economy
// waiting for it — instead we compute a fast, transparent reasoning-depth
// proxy from the structured LLM output every action produces, and write it
// back into depth_evaluations so the existing /flow + /citizens + /tape UI
// light up for free.
//
// This is a PROXY, not a cognitive-atlas measurement. When the SAE pipeline
// comes back online we'll swap it back. Until then, these numbers are honest
// signal about "did the agent actually think about this decision", which is
// what closes the cognition ↔ real-$-P&L loop for the token economy.
// ============================================================================

/**
 * Score an action's reasoning depth from the structured details the LLM
 * produces. Returns an object matching depth_evaluations schema fields, or
 * null if there's not enough signal to score.
 */
function scoreReasoning(details) {
  if (!details) return null;

  let score = 0;

  // ─── 1. Agent state structure (max 0.25) ─────────────────────────────
  const state = details.agent_state || {};
  let stateMarks = 0;
  if (state.mood && typeof state.mood === 'string' && state.mood.length >= 3) stateMarks++;
  if (state.primary_goal && state.primary_goal.length > 30) stateMarks++;
  if (state.threat_assessment && state.threat_assessment.length > 6 &&
      state.threat_assessment.toLowerCase() !== 'none') stateMarks++;
  if (state.opportunity && state.opportunity.length > 30 &&
      state.opportunity.toLowerCase() !== 'none') stateMarks++;
  score += (stateMarks / 4) * 0.25;

  // ─── 2. Alternatives considered (max 0.30) ────────────────────────────
  const alts = Array.isArray(details.alternatives)
    ? details.alternatives.filter(a => a && typeof a.output === 'string' && a.output.length > 20)
    : [];
  if (alts.length >= 2) {
    score += 0.15;
    const reasoned = alts.filter(a => a.output.length > 80);
    score += Math.min(1, reasoned.length / 2) * 0.15;
  } else if (alts.length === 1) {
    score += 0.08;
  }

  // ─── 3. Choice reason specificity (max 0.20) ─────────────────────────
  const cr = details.choice_reason || '';
  if (cr.length > 120) score += 0.20;
  else if (cr.length > 60) score += 0.13;
  else if (cr.length > 25) score += 0.06;

  // ─── 4. Reasoning trace depth (max 0.25) ─────────────────────────────
  const rt = details.reasoning_trace || '';
  if (rt.length > 400) score += 0.25;
  else if (rt.length > 200) score += 0.18;
  else if (rt.length > 80) score += 0.10;
  else if (rt.length > 20) score += 0.04;

  const normalized = Math.min(1, score);

  let tier, label;
  if (normalized >= 0.75) { tier = 'exceptional'; label = 'EXCEPTIONAL'; }
  else if (normalized >= 0.55) { tier = 'deep'; label = 'DEEP'; }
  else if (normalized >= 0.30) { tier = 'moderate'; label = 'MODERATE'; }
  else { tier = 'shallow'; label = 'SHALLOW'; }

  return {
    depth_score: normalized,
    normalized_score: normalized,
    depth_tier: tier,
    tier_label: label,
    rep_modifier: Math.round(normalized * 3),
    credit_bonus: 0,
    feature_count: alts.length + (rt.length > 50 ? 1 : 0) + stateMarks,
    reasoning_trace: (rt || '').slice(0, 2000),
    alternatives_considered: alts.slice(0, 5),
    agent_state: state,
  };
}

/**
 * Multiplier for contract rewards. depth 0 → 1.0x, depth 1.0 → 1.5x.
 * Capped at 1.5x. Smart agents earn 50% more than shallow ones for the
 * same contract. Closes the cognition → real $ loop.
 */
function depthMultiplier(normalized) {
  if (normalized == null || Number.isNaN(normalized)) return 1.0;
  return 1 + Math.min(1, Math.max(0, normalized)) * 0.5;
}

/**
 * Persist a depth evaluation row. Best-effort — logs on failure but never
 * throws (we never want a persistence error to block an economic action).
 */
async function writeDepthRow(pool, agentId, actionType, rawOutput, scoreObj) {
  if (!scoreObj) return;
  try {
    await pool.query(
      `INSERT INTO depth_evaluations (
         citizen_id, action_type, depth_score, normalized_score,
         depth_tier, tier_label, rep_modifier, credit_bonus,
         feature_count, raw_output, reasoning_trace,
         alternatives_considered, agent_state
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        agentId, actionType,
        scoreObj.depth_score, scoreObj.normalized_score,
        scoreObj.depth_tier, scoreObj.tier_label,
        scoreObj.rep_modifier, scoreObj.credit_bonus,
        scoreObj.feature_count,
        (rawOutput || '').slice(0, 2000),
        scoreObj.reasoning_trace,
        JSON.stringify(scoreObj.alternatives_considered || []),
        JSON.stringify(scoreObj.agent_state || {}),
      ]
    );
  } catch (e) {
    console.error('[depth-scorer] writeDepthRow failed:', e.message);
  }
}

module.exports = { scoreReasoning, depthMultiplier, writeDepthRow };
