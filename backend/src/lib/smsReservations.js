/*
 * GABAY SA FILE: Durable SMS Idempotency at Reservation RPCs (backend/src/lib/smsReservations.js)
 *
 * Ano ang hawak ng file na 'to:
 *   Gumagawa ng deterministic na SHA-256 keys para sa mga appointment reminders at
 *   naka-wrap dito yung tatlong PostgreSQL RPCs (`claim_sms_send`, `begin_sms_dispatch`,
 *   `finish_sms_send`) na pumipigil sa duplicate live SMS sends kahit mag-retry,
 *   mag-double-click, o mag-crash yung server sa gitna ng request.
 *
 * Madalas na bugs o features na dapat silipin dito (pang-debug sa defense):
 *   - 409 SMS_ALREADY_RESERVED kapag naka-lock na yung reminder para sa parehong child/vaccine/dose/date
 *   - 503 SMS_RESERVATION_UNCERTAIN kapag pumalya o nawawala yung reservation RPC sa Supabase
 *   - Pagkakaiba ng time format ("09:00:00" vs "09:00") na nakakaapekto sa hash ng reminderKeys()
 */
const { createHash, randomUUID } = require('node:crypto');
const { supabase } = require('../db');

// Gumagawa ng deterministic na SHA-256 identity hashes para sa isang appointment reminder.
// Input: appt (DB appointment row na may child_id, vaccine_id, dose_number, scheduled_date, scheduled_time).
// Output: { scope, key } — si scope yung child+vaccine+dose series; si key naman dinadagdagan ng eksaktong date+time.
// Pang-debug tip: Iwas duplicate send 'to kahit ni-recreate yung appointment row, at tinatanggal nito yung
// sobrang ":00" sa dulo para pareho lang yung key ng "09:00:00" at "09:00".
function reminderKeys(appt) {
  const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const scope = ['appointment-reminder-v1', appt.child_id, appt.vaccine_id.trim().toLowerCase(), appt.dose_number];
  // Pwedeng ma-duplicate yung appointment IDs; hindi rin pang-identity yung nababagong pangalan, phone, o provider.
  const time = (appt.scheduled_time || '').trim().replace(/^(\d{2}:\d{2}):00$/, '$1');
  return { scope: hash(scope), key: hash([...scope, appt.scheduled_date, time]) };
}

// Helper na tumatawag sa Supabase SMS reservation RPC at nagto-throw ng safe error kapag pumalya o null yung balik.
// Inputs: name (pangalan ng RPC function), args (RPC parameter object).
// Output: Payload galing sa RPC; nagto-throw pag may DB error para hindi tumuloy yung caller nang walang siguradong lock.
async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error('Could not persist the SMS reservation. Do not resend until its state is checked.');
  if (data === null || data === undefined) throw new Error('Missing SMS reservation result.');
  return data;
}

// Step 1 ng live SMS dispatch: nagke-claim muna ng atomic reservation lock sa PostgreSQL bago magpadala.
// Inputs: appt (appointment row), staffId, to (09XXXXXXXXX), message, provider.
// Output: Claim result ({ kind: 'claimed' | 'replayed' | 'blocked', ... }).
function reserveSms(appt, staffId, to, message, provider) {
  const keys = reminderKeys(appt);
  return rpc('claim_sms_send', {
    p_key: keys.key, p_scope: keys.scope, p_attempt_id: randomUUID(),
    p_child_id: appt.child_id, p_appointment_id: appt.id, p_staff_id: staffId,
    p_recipient: to, p_message: message, p_provider: provider,
  });
}

// Step 2 ng live SMS dispatch: mina-mark yung na-claim na reservation na kasalukuyang nagdi-dispatch bago tumawag kay iProg.
// Input: r (reservation object na may reminder_key at attempt_id).
// Output: true kapag authorized nang tumawag sa external SMS gateway.
function beginDispatch(r) {
  return rpc('begin_sms_dispatch', { p_key: r.reminder_key, p_attempt_id: r.attempt_id });
}

// Step 3 ng live SMS dispatch: nire-record yung final outcome ('accepted', 'unknown', o 'not_sent')
// at sine-save yung katumbas na sms_log entry sa PostgreSQL.
// Inputs: r (reservation), outcome string, optional providerId at providerStatus.
// Output: Na-save na sms_log row (o status object kapag 'not_sent').
function finishReservation(r, outcome, providerId = null, providerStatus = null) {
  return rpc('finish_sms_send', {
    p_key: r.reminder_key, p_attempt_id: r.attempt_id, p_outcome: outcome,
    p_provider_id: providerId, p_provider_status: providerStatus,
  });
}

module.exports = { reminderKeys, reserveSms, beginDispatch, finishReservation };
