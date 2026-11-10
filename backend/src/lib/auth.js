// Phase 3 gate: every /api call (except /api/health) must carry a
// Supabase Auth token. The token says WHO (verified by Supabase);
// the staff table says WHAT ROLE (midwife admin, BHW encoder).
const { supabase } = require('../db');
const { isNotFoundError } = require('./validate');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token)
      return res.status(401).json({ ok: false, error: 'Sign in required.' });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user)
      return res
        .status(401)
        .json({ ok: false, error: 'Session expired. Please sign in again.' });
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, name, role')
      .eq('auth_user_id', data.user.id)
      .single();
    if (staffError && !isNotFoundError(staffError)) return next(staffError);
    if (!staff)
      return res
        .status(403)
        .json({ ok: false, error: 'No staff role assigned to this account.' });
    req.staff = staff;
    next();
  } catch (err) {
    next(err);
  }
}

function requireMidwife(req, res, next) {
  if (!req.staff || req.staff.role !== 'midwife')
    return res
      .status(403)
      .json({ ok: false, error: 'Midwife access only.' });
  next();
}

// Fire-and-forget audit trail (paper: responsible data handling).
// Never fails the request it records.
function audit(req, action, entity, entityId) {
  if (!req.staff) return;
  Promise.resolve(
    supabase.from('audit_events').insert({
      actor: req.staff.name,
      action,
      entity,
      entity_id: String(entityId),
    }),
  )
    .then(({ error } = {}) => {
      if (error) console.error('audit write failed:', error.message);
    })
    .catch((err) => {
      console.error('audit write failed:', err.message);
    });
}

module.exports = { requireAuth, requireMidwife, audit };
