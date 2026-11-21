/*
 * FILE GUIDE: Authentication, RBAC Guards, at Audit Logging (backend/src/lib/auth.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Dito nag-ve-verify ng Supabase login token at staff role (midwife vs BHW)
 *   bago papasukin sa API, nagba-block ng BHW sa midwife-only actions, at
 *   nagre-record ng audit log entry sa background kapag may ginawang aksyon yung staff.
 *
 * Kapag may bug o babaguhing feature, dito unang silipin:
 *   - 401 "Sign in required" / "Session expired" kapag kulang o expired yung Bearer token
 *   - 403 "No staff role assigned" kapag walang matching row yung user sa public.staff table
 *   - 403 "Midwife access only" kapag BHW ang sumubok mag-delete o mag-midwife action
 *   - Nawawalang entry sa audit_events (silipin sa console yung "audit write failed:")
 */
// Phase 3 gate: bawat /api call (maliban sa /api/health) dapat may dalang
// Supabase Auth token. Token ang nagsasabi kung SINO; staff table ang nagsasabi kung ANONG ROLE.
const { supabase } = require('../db');
const { isNotFoundError } = require('./validate');

// Express auth guard middleware: chine-check yung Bearer JWT sa Supabase Auth
// tapos nilo-load yung clinic staff record papunta sa req.staff = { id, name, role }.
// Input: Authorization: Bearer <token> header.
// Output: Tatawag ng next() na may req.staff, o ibabalik agad na 401 (not logged in) / 403 (walang staff role).
// Debugging tip: kapag nakapag-login naman yung user pero 403 sa API, wala pa yung auth_user_id niya sa staff table.
async function requireAuth(req, res, next) {
  try {
    // Kunin yung Bearer token mula sa Authorization header.
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token)
      return res.status(401).json({ ok: false, error: 'Sign in required.' });
    // Ipa-verify yung JWT token kay Supabase Auth para sigurado kung sino yung user.
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user)
      return res
        .status(401)
        .json({ ok: false, error: 'Session expired. Please sign in again.' });
    // Hanapin yung role niya sa staff table sa DB (never magtitiwala sa role na galing sa frontend).
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, name, role')
      .eq('auth_user_id', data.user.id)
      .single();
    // Kapag totoong DB error (hindi PGRST116 not-found), ipasa sa 500 handler.
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

// Express RBAC guard: midwife lang ang pinapayagan dumaan dito (hal. pag-delete ng child,
// dose record, o growth measurement). Kapag BHW, matic 403 Forbidden.
// Input: req.staff na galing kay requireAuth. Output: next() o HTTP 403.
function requireMidwife(req, res, next) {
  if (!req.staff || req.staff.role !== 'midwife')
    return res
      .status(403)
      .json({ ok: false, error: 'Midwife access only.' });
  next();
}

// Fire-and-forget audit trail: naglo-log sa audit_events table kung sino ang gumawa ng
// action (create, update, delete, send-sms, log) at anong record ID ang ginalaw.
// Input: req (para sa req.staff.name), action, entity, entityId.
// Output: Wala (background insert lang); kapag pumalya, log lang sa console at hindi nito pinapa-fail yung API request.
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
