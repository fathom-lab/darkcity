// netlify/functions/stream.js
const { getSupabase, corsResponse, optionsResponse } = require('./shared/supabase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const sb = getSupabase();
  if (!sb) return corsResponse(503, { error: 'Database not configured' });

  try {
    const filter = event.queryStringParameters?.type;
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '50'), 100);

    let query = sb.from('stream_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filter && filter !== 'ALL') {
      query = query.eq('type', filter.toLowerCase());
    }

    const { data: events, error } = await query;
    if (error) throw error;

    return corsResponse(200, {
      events: events || [],
      total: events?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return corsResponse(500, { error: err.message });
  }
};
