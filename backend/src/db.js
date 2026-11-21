/*
 * FILE GUIDE: Server-Side Supabase Database Client (backend/src/db.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Naglo-load ng backend/.env credentials at gumagawa ng shared Supabase
 *   service-role client na gamit ng lahat ng backend routes, RPCs, auth, at audit logs.
 *
 * Kapag may bug o babaguhing feature, dito unang silipin:
 *   - Nag-e-exit agad yung server sa startup na may "Missing Supabase config"
 *   - Mali yung SUPABASE_URL o placeholder pa rin yung SUPABASE_SERVICE_ROLE_KEY sa backend/.env
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Startup config guard: pinapatay agad yung server kapag kulang o placeholder pa rin
// yung Supabase keys sa .env para hindi na umabot sa weird runtime DB errors.
// Debugging tip: kapag nag-crash agad yung backend sa boot, silipin muna yung backend/.env.
if (!url || !key || key.includes('paste-')) {
  console.error(
    'Missing Supabase config. Copy .env.example to .env and fill SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.',
  );
  process.exit(1);
}

// Service-role client: full DB access, pang-server ONLY. Bawal na bawal i-import
// yung file na 'to (o yung service-role key) sa frontend code.
const supabase = createClient(url, key);

module.exports = { supabase };
