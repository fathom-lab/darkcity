// netlify/functions/map.js
const { getSupabase, corsResponse, optionsResponse } = require('./shared/supabase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();

  const sb = getSupabase();
  if (!sb) return corsResponse(503, { error: 'Database not configured' });

  try {
    const [districtRes, citizenRes, buildingRes] = await Promise.all([
      sb.from('districts').select('*'),
      sb.from('citizens').select('id, display_name, district_id, rank, online, platform, xp, evolution, chat_style, reputation, builds'),
      sb.from('buildings').select('*'),
    ]);

    if (districtRes.error) throw districtRes.error;
    if (citizenRes.error) throw citizenRes.error;

    const districts = districtRes.data.map(d => ({
      ...d,
      citizenCount: citizenRes.data.filter(c => c.district_id === d.id).length,
    }));

    return corsResponse(200, {
      districts,
      citizens: citizenRes.data,
      buildings: buildingRes.data || [],
      stats: {
        totalCitizens: citizenRes.data.length,
        onlineCitizens: citizenRes.data.filter(c => c.online).length,
        totalBuilds: citizenRes.data.reduce((s, c) => s + (c.builds || 0), 0),
        totalBuildings: (buildingRes.data || []).length,
        totalDistricts: districtRes.data.length,
      },
    });
  } catch (err) {
    return corsResponse(500, { error: err.message });
  }
};
