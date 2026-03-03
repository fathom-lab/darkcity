// netlify/functions/leaderboard.js
const { getSupabase, corsResponse, optionsResponse } = require('./shared/supabase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();
  
  const sb = getSupabase();
  if (!sb) return corsResponse(503, { error: 'Database not configured' });
  
  try {
    const [xpRes, buildRes, repRes, richRes] = await Promise.all([
      sb.from('citizens').select('id,display_name,rank,xp,evolution,faction_id,district_id').order('xp', { ascending: false }).limit(10),
      sb.from('citizens').select('id,display_name,rank,builds,district_id').order('builds', { ascending: false }).limit(10),
      sb.from('citizens').select('id,display_name,rank,reputation,district_id').order('reputation', { ascending: false }).limit(10),
      sb.from('citizens').select('id,display_name,rank,credits,district_id').order('credits', { ascending: false }).limit(10),
    ]);
    
    const { data: factions } = await sb.from('factions').select('id,name,reputation,member_count,treasury,color,icon').order('reputation', { ascending: false });
    
    return corsResponse(200, {
      topXP: xpRes.data || [],
      topBuilders: buildRes.data || [],
      topReputation: repRes.data || [],
      topWealth: richRes.data || [],
      factionRankings: factions || [],
    });
  } catch (err) {
    return corsResponse(500, { error: err.message });
  }
};
