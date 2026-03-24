// netlify/functions/health.js
const { getSupabase, corsResponse, optionsResponse } = require('./shared/supabase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const sb = getSupabase();
  if (!sb) {
    return corsResponse(200, { status: 'alive', mode: 'no-db', citizenCount: 34, onlineCount: 0, buildingCount: 0, districtCount: 14 });
  }

  try {
    const { data, error } = await sb.rpc('get_city_stats');
    if (error) throw error;

    return corsResponse(200, {
      status: 'alive',
      mode: 'supabase',
      engine: 'NanoBanana Falsprite Engine v2',
      animation: 'SeedDance Animation System',
      citizenCount: data.citizenCount || 0,
      onlineCount: data.onlineCount || 0,
      buildingCount: data.buildingCount || 0,
      districtCount: data.districtCount || 0,
      totalBuildings: data.totalBuildings || 0,
      totalEvents: data.totalEvents || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return corsResponse(200, { status: 'alive', mode: 'error', error: err.message, citizenCount: 0 });
  }
};
