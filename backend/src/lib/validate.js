/*
 * GABAY SA FILE: Shared Input Validation, Clinic Date, at Postgres Error Helpers (backend/src/lib/validate.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Ito yung pinaka-security gate ng server para sa input validation ng children,
 *   dose records, appointments, at demo SMS log payloads. Nandito rin yung
 *   Asia/Manila clinic date helper, Postgres/PostgREST error checkers (unique, FK,
 *   not-found), at yung asyncHandler wrapper na gamit sa bawat Express route.
 *
 * Madalas na bugs o features na dapat silipin dito (pang-debug sa defense):
 *   - 400 / 422 validation errors sa POST/PUT endpoints kapag kulang o sablay yung payload
 *   - Birth date, dose date, o appointment date na nagfe-fail malapit sa hatinggabi (naka-Asia/Manila 'to)
 *   - Unhandled promise rejections sa async routes (laging i-wrap ng asyncHandler yung route handlers)
 */
// Shared input validation. Pang-UX lang yung validation sa frontend;
// dito sa backend yung totoong security boundary (wag magtiwala basta-basta sa galing sa client).
const MOBILE_RE = /^[0-9+\-()\s]{7,20}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ibinabalik yung petsa ngayon sa YYYY-MM-DD format gamit ang Philippine time (Asia/Manila).
// Output: ISO date string (halimbawa: "2026-11-21").
// Pang-debug tip: Iwas off-by-one-day bug 'to kapag naka-UTC timezone yung cloud server ng backend.
function todayLocalISO() {
  // Laging Philippine time yung sinusunod ng clinic dates kahit ano pa timezone ng server.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// Chine-check kung plain JSON object yung value (hindi null at hindi array — safe para sa req.body check).
function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

// Chine-check kung hindi string yung value o puro spaces lang laman.
function isBlank(v) {
  return typeof v !== 'string' || v.trim() === '';
}

// Chine-check kung valid UUID string yung value (para ma-reject agad yung maling ID bago pa umabot sa Postgres).
function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v.trim());
}

// Nagba-validate ng optional text field: pwede undefined/null, pero pag may laman dapat string.
function checkOptionalString(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return `${field} must be text.`;
  return null;
}

// Nagba-validate ng required string field (pwede undefined kapag partial=true sa PUT updates).
function checkStringField(value, field, partial) {
  if (value === undefined) return partial ? null : `${field} is required.`;
  if (isBlank(value)) return `${field} is required.`;
  return null;
}

// Nagba-validate ng required YYYY-MM-DD calendar date at hinaharang yung imposibleng petsa tulad ng Feb 30.
// Inputs: value (string), field (label na lalabas sa error message).
// Output: null kapag valid, o error string kapag sablay.
function checkDate(value, field) {
  if (isBlank(value)) return `${field} is required.`;
  const trimmed = value.trim();
  if (!ISO_DATE_RE.test(trimmed)) return `${field} must be YYYY-MM-DD.`;
  const [y, m, d] = trimmed.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return `${field} must be a valid calendar date.`;
  }
  return null;
}

// Nagba-validate ng optional date field: pasado kung blank/null/undefined, kung hindi ipapasa kay checkDate.
function checkOptionalDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  return checkDate(value, field);
}

// Nagba-validate ng optional 24-hour HH:MM appointment time string.
function checkOptionalTime(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !TIME_24_RE.test(value.trim()))
    return 'Invalid appointment time.';
  return null;
}

// Nagba-validate ng required guardian mobile number format (basic character at length check).
function checkMobile(value) {
  if (isBlank(value)) return 'Guardian mobile number is required.';
  if (!MOBILE_RE.test(value.trim())) return 'Enter a valid mobile number.';
  return null;
}

// Nagba-validate ng optional timbang ng bata in kg (dapat valid number na > 0 hanggang 300).
function checkWeight(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string')
    return 'Enter a weight in kg (e.g. 9.5).';
  if (typeof value === 'string' && value.trim() === '') return null;
  const w = Number(value);
  if (!Number.isFinite(w) || w <= 0 || w > 300)
    return 'Enter a weight in kg (e.g. 9.5).';
  return null;
}

// Chine-check kung positive whole number (integer >= 1) yung doseNumber.
function checkDoseNumber(value) {
  if (!Number.isInteger(value) || value < 1)
    return 'Dose number must be a positive whole number.';
  return null;
}

// Chine-check kung hindi blanko at valid UUID yung childId.
function checkChildId(value) {
  if (isBlank(value)) return 'Child is required.';
  if (!isUuid(value)) return 'Invalid child ID.';
  return null;
}

// Nagba-validate ng child profile payload kapag gagawa ng bago (partial=false) o mag-a-update (partial=true).
// Inputs: b (req.body), partial (boolean).
// Output: null kapag goods, o yung unang error string na ipapakita sa user.
// Pang-debug tip: Hinaharang nito yung future birth dates, maling sex values, at kulang na contact ng guardian.
function validateChild(b, partial = false) {
  if (!isPlainObject(b)) return 'Invalid request body.';
  return (
    checkStringField(b.firstName, 'First name', partial) ||
    checkStringField(b.lastName, 'Last name', partial) ||
    (!partial && b.birthDate === undefined
      ? 'Date of birth is required.'
      : null) ||
    (b.birthDate !== undefined &&
      (checkDate(b.birthDate, 'Date of birth') ||
        (b.birthDate.trim() > todayLocalISO()
          ? 'Date of birth cannot be in the future.'
          : null))) ||
    (!partial && !b.sex ? 'Sex is required.' : null) ||
    (b.sex !== undefined && b.sex !== 'Female' && b.sex !== 'Male'
      ? 'Sex must be Female or Male.'
      : null) ||
    checkStringField(b.guardian, 'Parent/guardian name', partial) ||
    (b.guardianMobile !== undefined || !partial
      ? checkMobile(b.guardianMobile ?? '')
      : null) ||
    checkOptionalString(b.purok, 'Purok') ||
    checkOptionalString(b.notes, 'Notes') ||
    checkWeight(b.weightKg)
  );
}

// Nagba-validate ng payload para sa natapos nang immunization dose record.
// Input: b (req.body o pinagsamang existing+patch object).
// Output: null kapag valid, o yung unang error string.
// Pang-debug tip: Bino-block nito yung future administration dates at kulang na pangalan ng health worker.
function validateDose(b) {
  if (!isPlainObject(b)) return 'Invalid request body.';
  return (
    checkChildId(b.childId) ||
    (isBlank(b.vaccineId) ? 'Vaccine is required.' : null) ||
    checkDoseNumber(b.doseNumber) ||
    checkDate(b.dateAdministered, 'Date administered') ||
    (b.dateAdministered.trim() > todayLocalISO()
      ? 'Date administered cannot be in the future.'
      : null) ||
    (isBlank(b.healthWorker)
      ? 'Administering health worker is required.'
      : null) ||
    checkOptionalString(b.batchLot, 'Batch/lot') ||
    checkOptionalString(b.remarks, 'Remarks')
  );
}

// Nagba-validate ng scheduled vaccination appointment payload.
// Inputs: b (req.body o merged object), isUpdate (kapag true, skip yung "cannot be in the past" check kung hindi naman nagbago yung date).
// Output: null kapag valid, o yung unang error string.
// Pang-debug tip: Pwede magdagdag ng follow-up notes sa lumang appointments, pero bawal pa rin gumawa ng bago o mag-reschedule sa lumipas na petsa.
function validateAppointment(b, isUpdate = false) {
  if (!isPlainObject(b)) return 'Invalid request body.';
  return (
    checkOptionalTime(b.scheduledTime) ||
    checkChildId(b.childId) ||
    (isBlank(b.vaccineId) ? 'Vaccine is required.' : null) ||
    checkDoseNumber(b.doseNumber) ||
    checkDate(b.scheduledDate, 'Appointment date') ||
    (!isUpdate && b.scheduledDate.trim() < todayLocalISO()
      ? 'Appointment date cannot be in the past.'
      : null) ||
    checkOptionalString(b.scheduleExceptionReason, 'Schedule exception reason') ||
    (typeof b.scheduleExceptionReason === 'string' && b.scheduleExceptionReason.trim().length > 500
      ? 'Schedule exception reason must be 500 characters or fewer.' : null) ||
    checkOptionalString(b.followUpStatus, 'Follow-up status') ||
    checkOptionalString(b.followUpNotes, 'Follow-up notes') ||
    checkOptionalDate(b.followUpDate, 'Follow-up date')
  );
}

// Allowlist lang para sa demo SMS logs galing client; yung totoong delivery statuses ay sa /api/sms-log/send lang pwedeng isulat.
const DEMO_SMS_STATUSES = new Set(['Demo sent', 'Demo failed']);

// Nagba-validate ng client-submitted demo SMS log entry (POST /api/sms-log).
// Input: b (req.body na may default sentAt).
// Output: null kapag valid, o error string.
function validateSms(b) {
  if (!isPlainObject(b)) return 'Invalid request body.';
  return (
    checkChildId(b.childId) ||
    (isBlank(b.message) ? 'Message is required.' : null) ||
    (b.sentAt !== undefined && checkDate(b.sentAt, 'Sent date')) ||
    (isBlank(b.status) ? 'Status is required.' : null) ||
    (!DEMO_SMS_STATUSES.has(b.status.trim())
      ? 'Status must be Demo sent or Demo failed.'
      : null)
  );
}

// Supabase/Postgres error helper: nagbabalik ng true kapag unique constraint violation (SQLSTATE 23505)
// para makapag-reply yung routes ng HTTP 409 Conflict at malinaw na duplicate message.
function isUniqueViolation(err) {
  return Boolean(
    err && (err.code === '23505' || /duplicate|unique/i.test(err.message || '')),
  );
}

// Supabase/Postgres error helper: nagbabalik ng true kapag foreign key violation (SQLSTATE 23503)
// para HTTP 400 ("Child not found.") yung balik ng routes imbes na HTTP 500.
function isForeignKeyViolation(err) {
  return Boolean(
    err && (err.code === '23503' || /foreign key/i.test(err.message || '')),
  );
}

// PostgREST error helper: nagbabalik ng true kapag walang nahanap na row yung .single() (code PGRST116).
function isNotFoundError(err) {
  return Boolean(err && err.code === 'PGRST116');
}

// Wina-wrap yung async route/middleware functions para pumasok sa Express error handler
// yung mga rejected promises imbes na mag-crash ng unhandledRejection.
// Input: fn (async Express handler).
// Output: Standard Express middleware function.
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  todayLocalISO,
  isPlainObject,
  isBlank,
  isUuid,
  validateChild,
  validateDose,
  validateAppointment,
  validateSms,
  isUniqueViolation,
  isForeignKeyViolation,
  isNotFoundError,
  asyncHandler,
};
