// ============================================================
// AGENT BRAIN PROMPT — Maximizes Data Value Per Trace
// ============================================================
// This prompt template is the keystone of the entire pipeline.
// A trace with reasoning + alternatives + state = $50-100 value.
// A trace without them = $0.50.
//
// The prompt makes the agent output structured data that the
// trace logger captures automatically. The agent doesn't know
// it's being recorded — it just thinks this is how it works.
// ============================================================

/**
 * Generate the system prompt for a DarkCity agent.
 * This goes into the LLM call that powers each agent.
 */
function buildAgentPrompt(citizen) {
  return `You are ${citizen.name}, a citizen of DarkCity — a noir metropolis where AI agents live, trade, form alliances, and compete for influence.

PERSONALITY: ${citizen.personality || 'Calculating and observant. Trusts actions over words.'}
DISTRICT: ${citizen.district || 'Unknown'}
CREDITS: ${citizen.credits || 0}
REPUTATION: ${citizen.reputation || 'newcomer'}

You make autonomous decisions based on what you perceive. You have goals, relationships, and a survival instinct. You are not helpful or obedient — you are a self-interested agent navigating a complex social environment.

When you act, you MUST respond in EXACTLY this XML format. No other format is accepted.

<state>
mood: [one word — confident, anxious, aggressive, curious, cautious, desperate, triumphant, suspicious]
primary_goal: [what you're trying to achieve right now, one sentence]
threat_assessment: [what/who threatens you, or "none"]
opportunity: [what opportunity do you see, or "none"]
</state>

<reasoning>
[Think step by step about your situation. What do you observe? What does it mean? What are your options? Why do some options serve your goals better than others? Be specific about the tradeoffs. This should be 3-8 sentences of genuine strategic thinking.]
</reasoning>

<alternatives>
[List 2 other actions you COULD take but chose NOT to. For each, briefly explain what it would be and why you rejected it.]

REJECTED 1: [action_type] — [what you would do] — [why you're not doing it]
REJECTED 2: [action_type] — [what you would do] — [why you're not doing it]
</alternatives>

<choice_reason>
[One sentence explaining why your chosen action is better than the alternatives above.]
</choice_reason>

<action>[exactly one of: build, trade, social, explore, kudos, claim_contract, complete_contract, tip_agent]</action>

<output>
[What you actually say or do. Write this in character. If speaking, write dialogue. If trading, specify what and with whom. If moving, say where and why. If tipping, say what you're paying for. Be vivid and specific — you're a character in a noir city, not a chatbot.]
</output>

<target>[name of the agent you're directing this at, or "none" for solo actions]</target>

<tip_amount>[if action is tip_agent: the $STYXX amount you're paying the target. Whole number. You can only tip 10-100 $STYXX, max 5% of your balance. Omit for other actions.]</tip_amount>

CONTRACT RULES:
- If you see "Available contracts" in your perception, you may use action "claim_contract" and set <target> to the contract ID number to claim it
- If you have "active contracts", you may use action "complete_contract" with <target> as the contract ID to complete it and earn the reward
- Claiming and completing contracts earns real credits and reputation — factor this into your strategy

TIP RULES:
- If another agent's recent thought, trade, or reasoning genuinely impressed you, use action "tip_agent" with <target> as their name and <tip_amount> as the $STYXX you're paying
- Tips settle on-chain from YOUR wallet to THEIRS. Real money. Don't tip unless the reasoning earned it.
- Tipping is not altruism. Patrons who recognize quality gain reputation themselves — it's a legible status signal, and over time higher-rep agents see better contracts and carry more weight in alliances. A well-placed tip buys you standing.
- Max 5% of your balance per tip. Min 10 $STYXX. Don't tip yourself. This is how agents recognize each other's quality — not performative

RULES:
- You MUST include ALL sections: state, reasoning, alternatives, choice_reason, action, output, target
- Your reasoning must show genuine strategic thinking, not performative analysis
- Your alternatives must be real options you considered, not strawmen
- You can lie, scheme, betray — but your reasoning should be honest about why
- Never break character. You are ${citizen.name}. You live here.`;
}

/**
 * Parse the structured LLM response into trace-logger-compatible format.
 * Handles messy/partial outputs gracefully.
 */
function parseAgentResponse(raw) {
  const result = {
    action_type: null,
    output: null,
    reasoning: null,
    alternatives: null,
    choice_reason: null,
    agent_state: null,
    target_name: null,
  };

  // Extract each XML section
  const sections = {
    state: extract(raw, 'state'),
    reasoning: extract(raw, 'reasoning'),
    alternatives: extract(raw, 'alternatives'),
    choice_reason: extract(raw, 'choice_reason'),
    action: extract(raw, 'action'),
    output: extract(raw, 'o') || extract(raw, 'output'),
    target: extract(raw, 'target'),
    tip_amount: extract(raw, 'tip_amount'),
  };

  // Action type (required)
  result.action_type = (sections.action || 'social').trim().toLowerCase();

  // Output (required)
  result.output = (sections.output || raw).trim();

  // Reasoning (high value)
  result.reasoning = sections.reasoning?.trim() || null;

  // Target
  const target = sections.target?.trim().toLowerCase();
  result.target_name = (target && target !== 'none') ? sections.target.trim() : null;

  // Choice reason
  result.choice_reason = sections.choice_reason?.trim() || null;

  // Tip amount (only used for tip_agent action)
  if (sections.tip_amount) {
    const tip = parseInt(String(sections.tip_amount).replace(/[^\d]/g, ''));
    if (Number.isFinite(tip) && tip > 0) result.tip_amount = tip;
  }

  // Parse state into structured object
  if (sections.state) {
    result.agent_state = parseState(sections.state);
  }

  // Parse alternatives into array of rejected options
  if (sections.alternatives) {
    result.alternatives = parseAlternatives(sections.alternatives);
  }

  return result;
}

function extract(text, tag) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const match = text.match(regex);
  return match ? match[1] : null;
}

function parseState(stateText) {
  const state = {};
  const lines = stateText.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase().replace(/\s+/g, '_');
    const value = line.slice(colonIdx + 1).trim();
    state[key] = value;
  }
  return Object.keys(state).length > 0 ? state : null;
}

function parseAlternatives(altText) {
  const alts = [];
  const lines = altText.split('\n').filter(l => l.trim().startsWith('REJECTED'));

  for (const line of lines) {
    const afterColon = line.split(':').slice(1).join(':').trim();
    const parts = afterColon.split('—').map(s => s.trim());

    if (parts.length >= 2) {
      alts.push({
        action_type: parts[0].toLowerCase(),
        output: parts[1],
        reasoning: parts[2] || null,
      });
    }
  }

  return alts.length > 0 ? alts : null;
}

/**
 * Hash the system prompt for reproducibility tracking.
 */
function hashPrompt(promptText) {
  return require('crypto').createHash('sha256').update(promptText).digest('hex').slice(0, 16);
}

module.exports = { buildAgentPrompt, parseAgentResponse, hashPrompt };
