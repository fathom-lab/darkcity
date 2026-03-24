// netlify/functions/factions.js
const { getSupabase, corsResponse, optionsResponse } = require('./shared/supabase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();
  
  const sb = getSupabase();
  if (!sb) return corsResponse(503, { error: 'Database not configured' });
  
  try {
    const { data: factions } = await sb.from('factions').select('*').order('reputation', { ascending: false });
    const { data: members } = await sb.from('faction_members').select('*');
    
    return corsResponse(200, { 
      factions: factions || [], 
      members: members || [] 
    });
  } catch (err) {
    return corsResponse(500, { error: err.message });
  }
};
