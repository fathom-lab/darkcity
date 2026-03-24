// netlify/functions/citizens.js
const { getSupabase, corsResponse, optionsResponse } = require('./shared/supabase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const sb = getSupabase();
  if (!sb) return corsResponse(503, { error: 'Database not configured' });

  const id = event.queryStringParameters?.id;

  try {
    if (id) {
      const { data, error } = await sb.from('citizens').select('*').eq('id', id).single();
      if (error || !data) return corsResponse(404, { error: 'Citizen not found' });
      return corsResponse(200, data);
    }

    const { data: citizens, error } = await sb.from('citizens').select('*').order('xp', { ascending: false });
    if (error) throw error;

    return corsResponse(200, {
      citizens,
      total: citizens.length,
      online: citizens.filter(c => c.online).length,
    });
  } catch (err) {
    return corsResponse(500, { error: err.message });
  }
};
