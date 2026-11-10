require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key || key.includes('paste-')) {
  console.error(
    'Missing Supabase config. Copy .env.example to .env and fill SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.',
  );
  process.exit(1);
}

// Service-role client: full DB access, server-side ONLY. Never import
// this file (or the key) into frontend code.
const supabase = createClient(url, key);

module.exports = { supabase };
