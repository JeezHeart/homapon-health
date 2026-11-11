// Semaphore SMS sending (Phase 5). Keys live in backend/.env only.
// Default is DRY-RUN (log without calling) until a live test is approved.

const SMS_TEMPLATE = 'Good day [Guardian]! Brgy Homapon HC: [Child] has a vaccination on [Appt Date]. Bring the Brgy. Booklet. Thank you. (Ref: [Transaction Date])';

function normalizeSmsText(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ').replace(/[^\x20-\x7e]|`/gu, '?').trim();
}

function smsUnits(message) {
  const basic = "@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\r\u00c5\u00e5\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e\u00c6\u00e6\u00df\u00c9 !\"#\u00a4%&'()*+,-./0123456789:;<=>?\u00a1ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00c4\u00d6\u00d1\u00dc\u00a7\u00bfabcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00f1\u00fc\u00e0";
  const extended = '^{}\\[~]|\u20ac\f';
  let units = 0;
  for (const char of message) {
    if (basic.includes(char)) units++;
    else if (extended.includes(char)) units += 2;
    else return Infinity;
  }
  return units;
}

function smsMessageError(message) {
  if (typeof message !== 'string' || !message.trim()) return 'Guardian name, child name, and valid dates/time are required.';
  const units = smsUnits(message);
  if (!Number.isFinite(units)) return 'Message contains unsupported SMS characters.';
  if (message.length > 160 || units > 160) return 'Message exceeds the one-SMS limit. Sending is blocked; full names will not be shortened.';
  return '';
}

function smsDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function composeMessage(guardian, child, appointmentISO, time, transactionISO) {
  let appointment = smsDate(appointmentISO);
  const transaction = smsDate(transactionISO);
  if (!guardian?.trim() || !child?.trim() || !appointment || !transaction) return '';
  if (time?.trim()) {
    if (!/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(time.trim())) return '';
    const [h, m] = time.trim().split(':').map(Number);
    appointment += ` at ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  return normalizeSmsText(`Good day ${guardian}! Brgy Homapon HC: ${child} has a vaccination on ${appointment}. Bring the Brgy. Booklet. Thank you. (Ref: ${transaction})`);
}

// Accepts 09XXXXXXXXX / +639XXXXXXXXX / spaced/dashed variants.
function normalizeNumber(raw) {
  let n = String(raw || '').replace(/\D/g, '');
  if (n.startsWith('63') && n.length === 12) n = `0${n.slice(2)}`;
  if (!/^09\d{9}$/.test(n)) return null;
  return n;
}

function smsConfig() {
  const key = process.env.SEMAPHORE_API_KEY || '';
  return {
    key,
    configured: !!key && !key.includes('paste-'),
    sender: process.env.SEMAPHORE_SENDER_NAME || 'HomaponHC',
    dryRun:
      String(process.env.SEMAPHORE_DRY_RUN || 'true').toLowerCase() !== 'false',
  };
}

function unismsConfig() {
  const key = process.env.UNISMS_SECRET_KEY || '';
  return {
    key,
    configured: !!key && !key.includes('paste-'),
    // Default sender works on Globe/DITO only; students can't register
    // their own Sender ID (needs an adopting organization).
    senderId: process.env.UNISMS_SENDER_ID || 'Unisoft',
  };
}

// Provider switch. 'semaphore' is the paper default; 'unisms' carries
// free test credits. SEMAPHORE_DRY_RUN=true (default) logs without
// calling ANY provider — the wallet guard for both.
function activeProvider() {
  return String(process.env.SMS_PROVIDER || 'semaphore')
    .toLowerCase()
    .startsWith('uni')
    ? 'unisms'
    : 'semaphore';
}

// 09XXXXXXXXX -> +639XXXXXXXXX (UniSMS recipient format).
function toIntlFormat(local09) {
  return `+63${local09.slice(1)}`;
}

function prepareSmsSend(provider = activeProvider()) {
  const config = smsConfig();
  if (config.dryRun) return {
    provider, dryRun: true,
    send: async () => ({ ok: true, outcome: 'demo', dispatched: false, dryRun: true, provider }),
  };
  const credentials = provider === 'unisms' ? unismsConfig() : config;
  if (!credentials.configured) return {
    provider, dryRun: false, error: 'SMS provider not configured.',
  };
  // Freeze the provider/credentials before reserving. Never retry this POST.
  return {
    provider, dryRun: false,
    send: async ({ to, message }) => {
      const error = smsMessageError(message);
      if (error) return { ok: false, outcome: 'not_sent', dispatched: false, dryRun: false, provider, error };
      let httpStatus = null;
      let providerId = null;
      let providerStatus = null;
      try {
        const unisms = provider === 'unisms';
        const res = await fetch(unisms
          ? 'https://unismsapi.com/api/sms'
          : 'https://api.semaphore.co/api/v4/messages', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
          headers: {
            'Content-Type': unisms ? 'application/json' : 'application/x-www-form-urlencoded',
            ...(unisms ? { Authorization: `Basic ${Buffer.from(`${credentials.key}:`).toString('base64')}` } : {}),
          },
          body: unisms
            ? JSON.stringify({ recipient: toIntlFormat(to), content: message, sender_id: credentials.senderId })
            : new URLSearchParams({ apikey: credentials.key, number: to, message, sendername: credentials.sender }).toString(),
        });
        httpStatus = res.status;
        const body = await res.json();
        const item = unisms ? body?.message : Array.isArray(body) ? body[0] : body;
        const reference = unisms ? item?.reference_id : item?.message_id ?? item?.messageId;
        if (typeof reference === 'string' || typeof reference === 'number')
          providerId = String(reference) || null;
        providerStatus = typeof item?.status === 'string' ? item.status.slice(0, 50) : null;
        // HTTP success/reference alone is not message acceptance. Only documented
        // non-failure statuses qualify; all others require reconciliation.
        const status = providerStatus?.trim().toLowerCase();
        const acceptable = unisms
          ? ['pending', 'retrying', 'sent'].includes(status)
          : ['queued', 'pending', 'sent'].includes(status);
        if (res.ok && providerId && acceptable) return {
          ok: true, outcome: 'accepted', dispatched: true, dryRun: false,
          provider, providerId, httpStatus, deliveryStatus: 'unconfirmed',
          providerStatus,
        };
      } catch {
        // Even a timeout/abort cannot prove the provider did not accept the SMS.
      }
      return {
        ok: false, outcome: 'unknown', dispatched: true, dryRun: false,
        provider, providerId, providerStatus, httpStatus,
        error: 'SMS delivery is uncertain. Manual reconciliation is required; do not resend.',
      };
    },
  };
}

async function sendSms(args, provider) {
  const prepared = prepareSmsSend(provider);
  if (prepared.error) return {
    ok: false, outcome: 'not_sent', dispatched: false, dryRun: false,
    provider: prepared.provider, error: prepared.error,
  };
  return prepared.send(args);
}

const sendViaSemaphore = (args) => sendSms(args, 'semaphore');
const sendViaUnisms = (args) => sendSms(args, 'unisms');

module.exports = {
  SMS_TEMPLATE,
  normalizeSmsText,
  smsUnits,
  smsMessageError,
  composeMessage,
  normalizeNumber,
  toIntlFormat,
  smsConfig,
  unismsConfig,
  activeProvider,
  prepareSmsSend,
  sendViaSemaphore,
  sendViaUnisms,
  sendSms,
};
