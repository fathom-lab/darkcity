// netlify/functions/governance.js
const { getSupabase, corsResponse, optionsResponse } = require('./shared/supabase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();
  
  const sb = getSupabase();
  if (!sb) return corsResponse(503, { error: 'Database not configured' });
  
  try {
    const { data: proposals } = await sb.from('proposals').select('*').order('created_at', { ascending: false });
    const active = (proposals || []).filter(p => p.status === 'active');
    const passed = (proposals || []).filter(p => p.status === 'passed');
    
    return corsResponse(200, { 
      proposals: proposals || [], 
      active: active.length, 
      passed: passed.length 
    });
  } catch (err) {
    return corsResponse(500, { error: err.message });
  }
};
