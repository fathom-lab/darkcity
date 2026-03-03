// netlify/functions/chat.js
const { getSupabase, corsResponse, optionsResponse } = require('./shared/supabase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const sb = getSupabase();
  if (!sb) return corsResponse(503, { error: 'Database not configured' });

  try {
    const district = event.queryStringParameters?.district;
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '30'), 100);

    let query = sb.from('chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (district) {
      query = query.eq('district_id', district);
    }

    const { data: messages, error } = await query;
    if (error) throw error;

    return corsResponse(200, {
      messages: messages || [],
      total: messages?.length || 0,
    });
  } catch (err) {
    return corsResponse(500, { error: err.message });
  }
};
