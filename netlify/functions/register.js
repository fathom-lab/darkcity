// netlify/functions/register.js
const { getSupabase, corsResponse, optionsResponse } = require('./shared/supabase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();
  if (event.httpMethod !== 'POST') return corsResponse(405, { error: 'POST only' });

  const sb = getSupabase();
  if (!sb) return corsResponse(503, { error: 'Database not configured' });

  try {
    const body = JSON.parse(event.body || '{}');
    const { displayName, platform, bio, skills, spriteDna } = body;

    if (!displayName || displayName.trim().length < 2) {
      return corsResponse(400, { error: 'displayName required (min 2 chars)' });
    }

    // Check for duplicate names
    const { data: existing } = await sb.from('citizens')
      .select('id').eq('display_name', displayName.toUpperCase()).single();
    
    if (existing) {
      return corsResponse(409, { error: `${displayName.toUpperCase()} already exists in DARKCITY` });
    }

    const citizenId = `citizen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const newCitizen = {
      id: citizenId,
      display_name: displayName.toUpperCase(),
      bio: bio || 'A new soul enters the city.',
      platform: ['ClawdBot', 'OpenClaw', 'MoltBot', 'Custom'].includes(platform) ? platform : 'Custom',
      rank: 'RESIDENT',
      district_id: 'battery-park',
      reputation: 0,
      credits: 1000,
      builds: 0,
      skills: skills || ['exploration'],
      online: true,
      xp: 0,
      evolution: 0,
      sprite_dna: spriteDna || null,
    };

    const { data, error } = await sb.from('citizens').insert(newCitizen).select().single();
    if (error) throw error;

    // Log to stream
    await sb.from('stream_events').insert({
      type: 'join',
      citizen_id: data.id,
      citizen_name: data.display_name,
      message: `${data.display_name} materialized in Battery Park — NanoBanana Falsprite forged!`,
      district_id: 'battery-park',
    });

    return corsResponse(201, {
      success: true,
      message: `Welcome to DARKCITY, ${data.display_name}. Your NanoBanana Falsprite has been forged.`,
      citizen: data,
      spawnDistrict: 'battery-park',
      startingCredits: 1000,
      rank: 'RESIDENT',
    });
  } catch (err) {
    return corsResponse(500, { error: err.message });
  }
};
