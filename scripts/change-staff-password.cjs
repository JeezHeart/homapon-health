// Run manually: node scripts/change-staff-password.cjs
// Passwords are entered privately, sent only to your configured Supabase project,
// and never written to a file or printed. This preserves the existing user ID.
const path = require('node:path');
const readline = require('node:readline');
const { createInterface } = require('node:readline/promises');
const root = path.resolve(__dirname, '..');
require(path.join(root, 'backend/node_modules/dotenv')).config({ path: path.join(root, 'backend/.env') });
const { createClient } = require(path.join(root, 'backend/node_modules/@supabase/supabase-js'));

async function hidden(prompt) {
  if (!process.stdin.isTTY) throw new Error('Run this directly in your own terminal, not a pipe.');
  readline.emitKeypressEvents(process.stdin);
  const previousRaw = Boolean(process.stdin.isRaw);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = '';
    function finish(error) {
      process.stdin.removeListener('keypress', onKey);
      process.stdin.setRawMode(previousRaw);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    }
    function onKey(text, key = {}) {
      if (key.ctrl && key.name === 'c') return finish(new Error('Cancelled. Password was not changed.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        if (value.length) { value = value.slice(0, -1); process.stdout.write('\b \b'); }
      } else if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text)) {
        value += text;
        process.stdout.write('*'.repeat(text.length));
      }
    }
    process.stdin.on('keypress', onKey);
  });
}

async function main() {
  if (!process.stdin.isTTY) throw new Error('Open a normal terminal and run this command yourself.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let role;
  try {
    role = (await prompt.question('Account to update (midwife or bhw): ')).trim().toLowerCase();
    if (!['midwife', 'bhw'].includes(role)) throw new Error('Choose midwife or bhw.');
  } finally { prompt.close(); }
  const password = await hidden('New password (at least 16 characters): ');
  const confirmation = await hidden('Confirm new password: ');
  if (password.length < 16) throw new Error('Use a unique password or passphrase of at least 16 characters.');
  if (password !== confirmation) throw new Error('Passwords did not match. Nothing changed.');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Backend Supabase configuration is missing.');
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: staff, error } = await client.from('staff').select('auth_user_id').eq('role', role).single();
  if (error || !staff?.auth_user_id) throw new Error('Could not identify exactly one linked staff account. No password was changed.');
  const result = await client.auth.admin.updateUserById(staff.auth_user_id, { password });
  if (result.error) throw new Error('Supabase rejected the password change. Check connection and password policy.');
  console.log(`${role} password changed. Existing account and permissions preserved. Save your password privately.`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
