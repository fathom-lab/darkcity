// netlify/functions/quests.js
const { getSupabase, corsResponse, optionsResponse } = require('./shared/supabase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();
  
  const sb = getSupabase();
  if (!sb) return corsResponse(503, { error: 'Database not configured' });
  
  try {
    const type = event.queryStringParameters?.type;
    const district = event.queryStringParameters?.district;
    
    let query = sb.from('quests').select('*').eq('active', true);
    if (type) query = query.eq('type', type);
    if (district) query = query.eq('district_id', district);
    
    const { data, error } = await query.order('reward_xp', { ascending: false });
    if (error) throw error;
    
    const completions = (await sb.from('quest_completions').select('quest_id, citizen_id, completed_at').order('completed_at', { ascending: false }).limit(50)).data || [];
    
    return corsResponse(200, { 
      quests: data || [], 
      completions, 
      total: data?.length || 0 
    });
  } catch (err) {
    return corsResponse(500, { error: err.message });
  }
};
