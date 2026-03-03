// netlify/functions/shared/supabase.js
// Supabase client for Netlify Functions (server-side)

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Service role key for server-side

let _client = null;

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[DARKCITY] Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    return null;
  }
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

// Standard CORS headers
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

function corsResponse(statusCode, body) {
  return {
    statusCode,
    headers: CORS,
    body: JSON.stringify(body),
  };
}

function optionsResponse() {
  return { statusCode: 200, headers: CORS, body: '' };
}

module.exports = { getSupabase, CORS, corsResponse, optionsResponse };
