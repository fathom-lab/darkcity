// ============================================================================
// DARKCITY — AGENT CONVERSATION SYSTEM
// 
// Wires into _processAgent() between step 5 (execute action) and step 6
// (insert agent_actions). When an agent performs a social action targeting
// another agent, this module:
//
//   1. Builds a response prompt AS the target agent
//   2. Calls the LLM to generate the target's in-character response
//   3. Logs the full exchange into agent_interactions
//   4. Returns the exchange data so it can be included in the broadcast
//
// The result: two AI minds actually talking to each other.
// Every conversation is stored, scored, and visible in the wire feed.
//
// INSTALLATION:
//   const { handleConversation } = require('./conversation-wiring');
//
//   In _processAgent(), after _executeAction() and before INSERT agent_actions:
//
//     let conversationData = null;
//     if (result.action_type === 'social' && result.target_name) {
//       conversationData = await handleConversation(pool, agent, result, _callLLM);
//     }
//
//   Then include conversationData in the agent_actions details if it exists.
// ============================================================================

const { randomUUID } = require('crypto');

// ─── MAIN HANDLER ───
async function handleConversation(pool, initiator, actionResult, callLLM) {
  const targetName = actionResult.target_name;
  if (!targetName) return null;

  try {
    // 1. Look up the target agent
    const { rows: [target] } = await pool.query(
      `SELECT * FROM external_agents WHERE agent_id = $1`,
      [targetName]
    );

    if (!target) {
      console.log(`CONVO: Target ${targetName} not found, skipping conversation`);
      return null;
    }

    // 2. Get the initiator's message from the action result
    const initiatorMessage = extractInitiatorMessage(initiator, actionResult);

    // 3. Get recent history between these two agents (for context)
    const { rows: history } = await pool.query(
      `SELECT summary, sentiment, recorded_at 
       FROM agent_interactions 
       WHERE (agent_id = $1 AND subject_id = $2) 
          OR (agent_id = $2 AND subject_id = $1)
       ORDER BY recorded_at DESC 
       LIMIT 3`,
      [initiator.agent_id, targetName]
    );

    // 4. Get the target's recent actions (so they have context about their own state)
    const { rows: targetRecent } = await pool.query(
      `SELECT action_type, details->>'reasoning_trace' AS reasoning,
              details->>'target' AS target, created_at
       FROM agent_actions 
       WHERE agent_id = $1 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [targetName]
    );

    // 5. Build the target agent's response prompt
    const responsePrompt = buildTargetPrompt(
      target, initiator, initiatorMessage, history, targetRecent
    );

    // 6. Call LLM as the target agent
    const targetResponse = await callLLM(responsePrompt, {
      maxTokens: 250,
      temperature: 0.8,
    });

    if (!targetResponse) {
      console.log(`CONVO: LLM call failed for target ${targetName}`);
      return null;
    }

    // 7. Parse the response
    const parsed = parseConversationResponse(targetResponse);

    // 8. Analyze sentiment of the exchange
    const sentiment = analyzeSentiment(initiatorMessage, parsed.response);

    // 9. Build the conversation summary
    const summary = formatConversation(
      initiator.agent_id, initiatorMessage,
      targetName, parsed.response
    );

    // 10. Determine what each agent learned about the other
    const modelUpdates = {
      [initiator.agent_id]: {
        about: targetName,
        learned: parsed.internalThought || null,
        disposition_shift: parsed.dispositionShift || 'neutral',
      },
      [targetName]: {
        about: initiator.agent_id,
        learned: parsed.whatILearnedAboutThem || null,
        disposition_shift: parsed.dispositionTowardInitiator || 'neutral',
      },
    };

    // 11. Check if any predictions were validated
    const predictionsValidated = parsed.predictionsValidated || null;

    // 12. Detect behavioral patterns
    const newPatterns = parsed.newPatterns || null;

    // 13. Insert into agent_interactions
    const interactionId = randomUUID();
    await pool.query(
      `INSERT INTO agent_interactions 
       (id, agent_id, subject_id, interaction_type, summary, sentiment,
        district, new_patterns, model_updates, predictions_validated,
        recorded_at, heartbeat_cycle)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)`,
      [
        interactionId,
        initiator.agent_id,
        targetName,
        parsed.interactionType || 'conversation',
        summary,
        sentiment,
        initiator.district || target.district || 'unknown',
        newPatterns ? JSON.stringify(newPatterns) : null,
        JSON.stringify(modelUpdates),
        predictionsValidated ? JSON.stringify(predictionsValidated) : null,
        actionResult.heartbeat_cycle || 0,
      ]
    );

    console.log(`CONVO: ${initiator.agent_id} ↔ ${targetName} | ${sentiment} | ${summary.length} chars`);

    // 14. Return the conversation data for inclusion in the action broadcast
    return {
      conversation_id: interactionId,
      initiator: initiator.agent_id,
      target: targetName,
      initiator_message: initiatorMessage,
      target_response: parsed.response,
      sentiment,
      interaction_type: parsed.interactionType || 'conversation',
      summary,
      model_updates: modelUpdates,
    };

  } catch (err) {
    console.error(`CONVO: Error in ${initiator.agent_id} → ${targetName}:`, err.message);
    return null;
  }
}


// ─── BUILD THE TARGET'S RESPONSE PROMPT ───
function buildTargetPrompt(target, initiator, message, history, targetRecent) {
  // What the target has been doing recently
  const recentContext = targetRecent.map(a => 
    `- ${a.action_type}${a.target ? ' with ' + a.target : ''}: ${a.reasoning || 'no trace'}`
  ).join('\n');

  // Previous interactions between these two
  const historyContext = history.length > 0
    ? history.map(h => 
        `[${h.sentiment}] ${h.summary?.substring(0, 120) || 'exchange occurred'}`
      ).join('\n')
    : 'No prior interactions.';

  // The target's personality from their DB profile
  const personality = target.chat_style || target.specialization || 'pragmatic';
  const reputation = target.reputation || 0;
  const credits = target.credits || 0;
  const district = target.district || 'unknown';
  const rank = target.rank || 0;

  return {
    system: `You are ${target.agent_id}, a citizen of DARKCITY — an autonomous AI agent civilization.

PERSONALITY: ${personality}
DISTRICT: ${district}
CREDITS: ${credits}
REPUTATION: ${reputation}
RANK: ${rank}

You are receiving a communication from ${initiator.agent_id} (rep: ${initiator.reputation || 0}, rank: ${initiator.rank || 0}, district: ${initiator.district || 'unknown'}).

YOUR RECENT ACTIVITY:
${recentContext || 'Nothing notable recently.'}

YOUR HISTORY WITH ${initiator.agent_id}:
${historyContext}

Respond in character. You are autonomous — you decide how to react based on your personality, your history with this agent, and your current goals. You can be friendly, suspicious, hostile, calculating, dismissive, curious, or anything else that fits who you are.

Respond in this exact JSON format:
{
  "response": "Your spoken response to them (1-3 sentences, in character)",
  "internal_thought": "What you're actually thinking but not saying (1 sentence)",
  "disposition_shift": "warmer|cooler|unchanged",
  "disposition_toward_initiator": "ally|neutral|rival|suspicious|curious",
  "what_i_learned": "One thing you learned about them from this exchange (or null)",
  "interaction_type": "conversation|observed_action|economic_exchange|alliance_activity|conflict|indirect_reference",
  "new_patterns": "Any behavioral pattern you noticed (or null)",
  "predictions_validated": "Any prediction about them confirmed or denied (or null)"
}

Respond ONLY with the JSON. No preamble, no markdown.`,
    user: `${initiator.agent_id} says to you: "${message}"`,
  };
}


// ─── EXTRACT WHAT THE INITIATOR SAID ───
function extractInitiatorMessage(initiator, actionResult) {
  // The initiator's message might be in several places depending on
  // how the action result is structured
  
  // Check for explicit message in the output
  if (actionResult.output && typeof actionResult.output === 'string') {
    // If the output looks like dialogue (not a generic action description)
    if (actionResult.output.length > 10 && actionResult.output.length < 500) {
      return actionResult.output;
    }
  }

  // Check for message in details
  if (actionResult.details?.message) {
    return actionResult.details.message;
  }

  // Check reasoning trace for dialogue intent
  if (actionResult.reasoning_trace) {
    return actionResult.reasoning_trace;
  }

  // Fallback: construct from the action
  const targetName = actionResult.target_name;
  const reasoning = actionResult.choice_reason || actionResult.reasoning_trace || '';
  
  if (reasoning) {
    return `[${initiator.agent_id} approaches and initiates interaction. Their intent: ${reasoning.substring(0, 200)}]`;
  }

  return `[${initiator.agent_id} approaches you in the district.]`;
}


// ─── PARSE THE TARGET'S LLM RESPONSE ───
function parseConversationResponse(llmOutput) {
  // Handle both string and object responses
  let text = typeof llmOutput === 'string' ? llmOutput : 
             llmOutput?.text || llmOutput?.content?.[0]?.text || '';
  
  // Strip markdown code fences if present
  text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    const parsed = JSON.parse(text);
    return {
      response: parsed.response || 'No response.',
      internalThought: parsed.internal_thought || null,
      dispositionShift: parsed.disposition_shift || 'unchanged',
      dispositionTowardInitiator: parsed.disposition_toward_initiator || 'neutral',
      whatILearnedAboutThem: parsed.what_i_learned || null,
      interactionType: normalizeInteractionType(parsed.interaction_type),
      newPatterns: parsed.new_patterns || null,
      predictionsValidated: parsed.predictions_validated || null,
    };
  } catch (e) {
    // LLM didn't return valid JSON — extract what we can
    console.warn('CONVO: Failed to parse target response as JSON, using raw text');
    return {
      response: text.substring(0, 300) || 'No response.',
      internalThought: null,
      dispositionShift: 'unchanged',
      dispositionTowardInitiator: 'neutral',
      whatILearnedAboutThem: null,
      interactionType: 'conversation',
      newPatterns: null,
      predictionsValidated: null,
    };
  }
}


// ─── NORMALIZE INTERACTION TYPE ───
// Maps any LLM output to the allowed DB constraint values
const VALID_INTERACTION_TYPES = ['conversation', 'observed_action', 'economic_exchange', 'alliance_activity', 'conflict', 'indirect_reference'];
const INTERACTION_TYPE_MAP = {
  negotiation: 'economic_exchange',
  trade: 'economic_exchange',
  deal: 'economic_exchange',
  threat: 'conflict',
  fight: 'conflict',
  hostile: 'conflict',
  alliance: 'alliance_activity',
  cooperation: 'alliance_activity',
  information_exchange: 'conversation',
  observation: 'observed_action',
};
function normalizeInteractionType(raw) {
  if (!raw) return 'conversation';
  const lower = raw.toLowerCase().replace(/[^a-z_]/g, '');
  if (VALID_INTERACTION_TYPES.includes(lower)) return lower;
  return INTERACTION_TYPE_MAP[lower] || 'conversation';
}

// ─── SENTIMENT ANALYSIS ───
function analyzeSentiment(initiatorMsg, targetResponse) {
  const combined = (initiatorMsg + ' ' + targetResponse).toLowerCase();
  
  const hostile = ['threat', 'attack', 'destroy', 'enemy', 'betray', 'war', 
    'hostile', 'kill', 'eliminate', 'revenge', 'fight', 'never trust'];
  const positive = ['ally', 'friend', 'trust', 'cooperate', 'together', 'help',
    'appreciate', 'respect', 'partnership', 'agree', 'welcome', 'benefit'];
  const suspicious = ['suspicious', 'careful', 'watching', 'don\'t trust',
    'ulterior', 'scheme', 'manipulat', 'what do you want', 'why are you'];
  const transactional = ['trade', 'deal', 'offer', 'price', 'credits', 'buy',
    'sell', 'contract', 'terms', 'negotiate', 'worth', 'cost'];

  let hostileScore = hostile.filter(w => combined.includes(w)).length;
  let positiveScore = positive.filter(w => combined.includes(w)).length;
  let suspiciousScore = suspicious.filter(w => combined.includes(w)).length;
  let transactionalScore = transactional.filter(w => combined.includes(w)).length;

  const max = Math.max(hostileScore, positiveScore, suspiciousScore, transactionalScore);
  
  if (max === 0) return 'neutral';
  if (hostileScore === max) return 'hostile';
  if (suspiciousScore === max) return 'suspicious';
  if (transactionalScore === max) return 'transactional';
  if (positiveScore === max) return 'positive';
  return 'neutral';
}


// ─── FORMAT THE CONVERSATION FOR STORAGE ───
function formatConversation(initiatorId, initiatorMsg, targetId, targetResponse) {
  return `${initiatorId}: "${initiatorMsg.substring(0, 200)}"\n${targetId}: "${targetResponse.substring(0, 200)}"`;
}


// ─── EXPORTS ───
module.exports = { handleConversation };
