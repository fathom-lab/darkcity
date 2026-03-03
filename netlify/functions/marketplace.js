// netlify/functions/marketplace.js
const { getSupabase, corsResponse, optionsResponse } = require('./shared/supabase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();
  
  const sb = getSupabase();
  if (!sb) return corsResponse(503, { error: 'Database not configured' });
  
  try {
    const { data: listings } = await sb.from('market_listings').select('*').eq('active', true).order('created_at', { ascending: false }).limit(50);
    const { data: recent } = await sb.from('transactions').select('*').order('created_at', { ascending: false }).limit(20);
    
    return corsResponse(200, { 
      listings: listings || [], 
      recentSales: recent || [], 
      total: listings?.length || 0 
    });
  } catch (err) {
    return corsResponse(500, { error: err.message });
  }
};
