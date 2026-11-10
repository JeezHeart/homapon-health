// Shared input validation. Frontend validation stays as UX;
// these checks are the real security boundary (never trust the client).
const MOBILE_RE = /^[0-9+\-()\s]{7,20}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function todayLocalISO() {
  // Clinic dates follow Philippine time regardless of the server timezone.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function isBlank(v) {
  return typeof v !== 'string' || v.trim() === '';
}

function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v.trim());
}

function checkOptionalString(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return `${field} must be text.`;
  return null;
}

function checkStringField(value, field, partial) {
  if (value === undefined) return partial ? null : `${field} is required.`;
  if (isBlank(value)) return `${field} is required.`;
  return null;
}

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

function checkOptionalDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  return checkDate(value, field);
}

function checkOptionalTime(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !TIME_24_RE.test(value.trim()))
    return 'Invalid appointment time.';
  return null;
}

function checkMobile(value) {
  if (isBlank(value)) return 'Guardian mobile number is required.';
  if (!MOBILE_RE.test(value.trim())) return 'Enter a valid mobile number.';
  return null;
}

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

function checkDoseNumber(value) {
  if (!Number.isInteger(value) || value < 1)
    return 'Dose number must be a positive whole number.';
  return null;
}

function checkChildId(value) {
  if (isBlank(value)) return 'Child is required.';
  if (!isUuid(value)) return 'Invalid child ID.';
  return null;
}

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

const DEMO_SMS_STATUSES = new Set(['Demo sent', 'Demo failed']);

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

// Supabase/Postgres unique-violation → friendly duplicate message.
function isUniqueViolation(err) {
  return Boolean(
    err && (err.code === '23505' || /duplicate|unique/i.test(err.message || '')),
  );
}

function isForeignKeyViolation(err) {
  return Boolean(
    err && (err.code === '23503' || /foreign key/i.test(err.message || '')),
  );
}

function isNotFoundError(err) {
  return Boolean(err && err.code === 'PGRST116');
}

// Wraps async route/middleware functions so rejected promises reach
// the Express error handler instead of triggering unhandledRejection.
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
