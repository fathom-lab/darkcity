// ═══════════════════════════════════════════════════════════════
// ACTION SCORER — DarkCity hook v2
//
// Kudos is the vehicle. Depth is the signal.
// The action label doesn't determine rep — the richness of what
// the agent actually did does. Two `work` actions can score
// radically differently. An elaborate `rest` can outscore
// a lazy `build`.
//
// Pipeline:
//   depthScore(details, outcome)  → float 0–5
//   getTier(rank)                 → { mod, label }
//   repDelta = floor(depth * mod) → integer written to DB
//
// Output: { depth, tier, tierModifier, repDelta, tag }
// ═══════════════════════════════════════════════════════════════

'use strict';

// ── Tier brackets ────────────────────────────────────────────
// rank → kudos multiplier on the depth score
const TIER_TABLE = [
  { minRank: 40, label: 'legend',   mod: 2.5 },
  { minRank: 20, label: 'elder',    mod: 2.0 },
  { minRank: 10, label: 'veteran',  mod: 1.6 },
  { minRank: 5,  label: 'resident', mod: 1.25 },
  { minRank: 0,  label: 'newcomer', mod: 1.0 },
];

function getTier(rank) {
  for (const t of TIER_TABLE) {
    if (rank >= t.minRank) return t;
  }
  return TIER_TABLE[TIER_TABLE.length - 1];
}

// ── Depth score ──────────────────────────────────────────────
// Evaluates the quality/richness of what the agent submitted.
// Returns a float in [0, 5]. Action label is not a parameter.
//
// Axes:
//   Presence   — provided any details at all?        (0–0.5)
//   Breadth    — number of distinct fields            (0–1.5)
//   Verbosity  — meaningful string length             (0–1.5)
//   Narrative  — motivation / context field present   (0–1.0)
//   Outcome    — execution produced a notable result  (0–0.5)
function depthScore(details, outcome) {
  if (!details || typeof details !== 'object') return 0;

  let score = 0;
  const keys = Object.keys(details).filter(k => details[k] != null && details[k] !== '');
  if (keys.length === 0) return 0;

  // Presence: they bothered to include something
  score += 0.5;

  // Breadth: each additional meaningful field adds weight, cap at 1.5
  score += Math.min((keys.length - 1) * 0.3, 1.5);

  // Verbosity: total word count across all string values, cap at 1.5
  let totalWords = 0;
  for (const val of Object.values(details)) {
    if (typeof val === 'string') {
      totalWords += val.trim().split(/\s+/).filter(Boolean).length;
    }
  }
  if (totalWords >= 2)  score += 0.4;
  if (totalWords >= 8)  score += 0.4;
  if (totalWords >= 20) score += 0.4;
  // Hard cap verbosity contribution
  score = Math.min(score, 0.5 + 1.5 + 1.5);

  // Narrative: any field that signals intentionality / motivation
  const narrativeKeys = new Set(['reason','motivation','narrative','context','story','why','intent','note','message','lore']);
  const hasNarrative = keys.some(k => narrativeKeys.has(k.toLowerCase()) &&
    typeof details[k] === 'string' && details[k].trim().split(/\s+/).length >= 3);
  if (hasNarrative) score += 1.0;

  // Outcome bonus: execution produced a notable result
  if (outcome.pioneer)            score += 0.5; // first builder in hood
  if (outcome.pay && outcome.pay >= 100) score += 0.25; // high-yield work run

  return Math.min(score, 5);
}

// ── Derive tag from depth + outcome ─────────────────────────
function deriveTag(depth, outcome) {
  if (outcome.pioneer)   return 'pioneer';
  if (depth >= 4.5)      return 'lorekeeper';
  if (depth >= 3.0)      return 'articulate';
  return null;
}

// ── Main hook ────────────────────────────────────────────────
/**
 * scoreAction
 * @param {object} agent   — agents row (needs: rank, reputation, rep_tags)
 * @param {string} action  — action key (informational only, not scored)
 * @param {object} details — raw details from request body
 * @param {object} outcome — execution metadata { pioneer, pay, ... }
 * @returns {{ depth, tier, tierModifier, repDelta, tag }}
 */
function scoreAction(agent, action, details, outcome = {}) {
  const tier    = getTier(agent.rank);
  const depth   = depthScore(details, outcome);
  const raw     = depth * tier.mod;
  const delta   = Math.floor(raw);

  // Respect the 100 ceiling
  const repDelta = Math.min(delta, 100 - (agent.reputation || 0));

  return {
    depth,
    tier,
    tierModifier: tier.mod,
    repDelta,
    tag: deriveTag(depth, outcome),
  };
}

module.exports = { scoreAction, getTier, depthScore };
