const { createHash, randomUUID } = require('node:crypto');
const { supabase } = require('../db');

function reminderKeys(appt) {
  const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const scope = ['appointment-reminder-v1', appt.child_id, appt.vaccine_id.trim().toLowerCase(), appt.dose_number];
  // Appointment IDs may be duplicated; mutable names/phones/providers are not identity.
  const time = (appt.scheduled_time || '').trim().replace(/^(\d{2}:\d{2}):00$/, '$1');
  return { scope: hash(scope), key: hash([...scope, appt.scheduled_date, time]) };
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error('Could not persist the SMS reservation. Do not resend until its state is checked.');
  if (data === null || data === undefined) throw new Error('Missing SMS reservation result.');
  return data;
}

function reserveSms(appt, staffId, to, message, provider) {
  const keys = reminderKeys(appt);
  return rpc('claim_sms_send', {
    p_key: keys.key, p_scope: keys.scope, p_attempt_id: randomUUID(),
    p_child_id: appt.child_id, p_appointment_id: appt.id, p_staff_id: staffId,
    p_recipient: to, p_message: message, p_provider: provider,
  });
}

function beginDispatch(r) {
  return rpc('begin_sms_dispatch', { p_key: r.reminder_key, p_attempt_id: r.attempt_id });
}

function finishReservation(r, outcome, providerId = null, providerStatus = null) {
  return rpc('finish_sms_send', {
    p_key: r.reminder_key, p_attempt_id: r.attempt_id, p_outcome: outcome,
    p_provider_id: providerId, p_provider_status: providerStatus,
  });
}

module.exports = { reminderKeys, reserveSms, beginDispatch, finishReservation };
