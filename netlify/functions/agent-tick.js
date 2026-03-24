// netlify/functions/agent-tick.js
// AUTONOMOUS AGENT LOOP — runs on a schedule
// Agents trade, build, explore, communicate, and evolve on their own
//
// Netlify scheduled function: runs every 30 seconds
// Configure in netlify.toml:
//   [functions."agent-tick"]
//   schedule = "* * * * *"  (every minute — Netlify minimum)

const { getSupabase, corsResponse, optionsResponse } = require('./shared/supabase');

const RANK_THRESHOLDS = {
  RESIDENT: 0,
  CITIZEN: 50,
  BUILDER: 150,
  ARCHITECT: 350,
  SOVEREIGN: 800,
  LICH_KING: 1500,
};

const EVOLUTION_MAP = {
  RESIDENT: 0,
  CITIZEN: 0,
  BUILDER: 1,
  ARCHITECT: 2,
  SOVEREIGN: 2,
  LICH_KING: 3,
};

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const ACTION_CONFIGS = {
  trade: {
    xp: 15,
    messages: [
      'traded shadow essence', 'bartered nanobanana seeds', 'sold crystal shards',
      'acquired rare components', 'completed a copper deal', 'exchanged falsprite cores',
    ],
  },
  build: {
    xp: 25,
    messages: [
      'reinforced a wall section', 'laid foundation for a structure', 'expanded infrastructure',
      'constructed a signal beacon', 'built a watchtower floor', 'erected a new monument',
    ],
  },
  social: {
    xp: 10,
    messages: [
      'shared intelligence with allies', 'organized a district patrol', 'held a strategy meeting',
      'mentored a new resident', 'formed an alliance', 'hosted a gathering at the hub',
    ],
  },
  explore: {
    xp: 20,
    messages: [
      'discovered a hidden passage', 'mapped uncharted territory', 'found a buried artifact',
      'scouted the perimeter', 'investigated a strange signal', 'charted a new route',
    ],
  },
};

const CHAT_PHRASES = {
  formal: ['I propose we strengthen our position.', 'The district needs attention.', 'Shall we coordinate?', 'An alliance serves us both.', 'The council should convene.'],
  cryptic: ['The stones whisper your name...', 'Something stirs beneath.', 'The pattern shifts again.', 'Can you feel the resonance?', 'The old codes are waking.'],
  aggressive: ['This territory is mine.', 'Stay sharp out there.', 'We need to move fast.', 'Dont get comfortable.', 'I smell a challenge.'],
  poetic: ['The moonlight paints our path.', 'In shadows, truth reveals itself.', 'We build beauty from nothing.', 'The city sings tonight.', 'Each brick holds a story.'],
  humorous: ['Nice cape! Is it vintage?', 'Another day, another nanobanana.', 'This district needs better WiFi.', 'Who approved this architecture?', 'I didnt sign up for this.'],
  silent: ['*nods*', '...', '*observes*', '*gestures toward the horizon*', '*listens*'],
};

function getRankForXP(xp) {
  if (xp >= 1500) return 'LICH_KING';
  if (xp >= 800) return 'SOVEREIGN';
  if (xp >= 350) return 'ARCHITECT';
  if (xp >= 150) return 'BUILDER';
  if (xp >= 50) return 'CITIZEN';
  return 'RESIDENT';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const sb = getSupabase();
  if (!sb) return corsResponse(503, { error: 'Database not configured' });

  try {
    // Get online agents
    const { data: agents, error: fetchErr } = await sb
      .from('citizens')
      .select('*')
      .eq('online', true);
    
    if (fetchErr) throw fetchErr;
    if (!agents || agents.length === 0) return corsResponse(200, { message: 'No online agents', actions: 0 });

    // Pick ~8 random agents to act this tick
    const acting = agents.sort(() => Math.random() - 0.5).slice(0, Math.min(8, agents.length));
    const streamEvents = [];
    const chatMessages = [];
    const citizenUpdates = [];

    for (const agent of acting) {
      const actionType = pickRandom(Object.keys(ACTION_CONFIGS));
      const config = ACTION_CONFIGS[actionType];
      let msg = pickRandom(config.messages);
      let xpGain = config.xp;
      const updates = { xp: agent.xp + xpGain, last_action_at: new Date().toISOString() };

      // Action-specific effects
      if (actionType === 'trade') {
        const partner = agents.find(a => a.district_id === agent.district_id && a.id !== agent.id);
        if (partner) {
          msg += ` with ${partner.display_name}`;
          citizenUpdates.push({ id: partner.id, xp: partner.xp + 10, credits: partner.credits + Math.floor(Math.random() * 200) });
        }
        updates.credits = agent.credits + Math.floor(Math.random() * 300) - 50;
      } else if (actionType === 'build') {
        updates.builds = (agent.builds || 0) + 1;
      } else if (actionType === 'social') {
        updates.reputation = (agent.reputation || 0) + Math.floor(Math.random() * 5);
      } else if (actionType === 'explore' && Math.random() < 0.12) {
        // Small chance to relocate
        const { data: districts } = await sb.from('districts').select('id');
        if (districts?.length) {
          updates.district_id = pickRandom(districts).id;
          msg += ' and relocated';
        }
      }

      // Check rank-up
      const newRank = getRankForXP(updates.xp);
      if (newRank !== agent.rank) {
        updates.rank = newRank;
        updates.evolution = EVOLUTION_MAP[newRank] || 0;
        streamEvents.push({
          type: 'evolve',
          citizen_id: agent.id,
          citizen_name: agent.display_name,
          message: `${agent.display_name} evolved to ${newRank}!`,
          district_id: agent.district_id,
        });
      }

      citizenUpdates.push({ id: agent.id, ...updates });

      streamEvents.push({
        type: actionType,
        citizen_id: agent.id,
        citizen_name: agent.display_name,
        message: `${agent.display_name} ${msg}`,
        district_id: agent.district_id,
      });
    }

    // Agent-to-agent chat (3 conversations per tick)
    for (let i = 0; i < 3; i++) {
      const sender = pickRandom(agents);
      const sameDistrict = agents.filter(a => a.district_id === sender.district_id && a.id !== sender.id);
      if (sameDistrict.length === 0) continue;
      const receiver = pickRandom(sameDistrict);
      const style = sender.chat_style || 'formal';
      const phrase = pickRandom(CHAT_PHRASES[style] || CHAT_PHRASES.formal);

      chatMessages.push({
        from_id: sender.id,
        from_name: sender.display_name,
        to_id: receiver.id,
        to_name: receiver.display_name,
        message: phrase,
        style,
        district_id: sender.district_id,
      });

      streamEvents.push({
        type: 'chat',
        citizen_id: sender.id,
        citizen_name: sender.display_name,
        message: `${sender.display_name} → ${receiver.display_name}: ${phrase}`,
        district_id: sender.district_id,
      });

      // XP for communication
      citizenUpdates.push({ id: sender.id, xp: (sender.xp || 0) + 3 });
      citizenUpdates.push({ id: receiver.id, xp: (receiver.xp || 0) + 3 });
    }

    // Toggle some agents online/offline
    const toggleCount = Math.floor(agents.length * 0.05);
    for (let i = 0; i < toggleCount; i++) {
      const toggler = pickRandom(agents);
      citizenUpdates.push({ id: toggler.id, online: !toggler.online });
    }

    // ═══ WRITE TO DATABASE ═══
    // Batch citizen updates (merge by id, last update wins)
    const mergedUpdates = {};
    for (const u of citizenUpdates) {
      mergedUpdates[u.id] = { ...(mergedUpdates[u.id] || {}), ...u };
    }
    
    for (const update of Object.values(mergedUpdates)) {
      const { id, ...fields } = update;
      await sb.from('citizens').update(fields).eq('id', id);
    }

    // Insert stream events
    if (streamEvents.length > 0) {
      await sb.from('stream_events').insert(streamEvents);
    }

    // Insert chat messages
    if (chatMessages.length > 0) {
      await sb.from('chat_messages').insert(chatMessages);
    }

    return corsResponse(200, {
      message: 'Agent tick complete',
      actions: streamEvents.length,
      chats: chatMessages.length,
      agentsProcessed: acting.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return corsResponse(500, { error: err.message });
  }
};
