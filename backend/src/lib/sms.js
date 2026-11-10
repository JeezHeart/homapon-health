// Semaphore SMS sending (Phase 5). Keys live in backend/.env only.
// Default is DRY-RUN (log without calling) until a live test is approved.

const TEMPLATE =
  'Good day! This is Barangay Homapon Health Center. ' +
  'A vaccination appointment for [Child Name] is scheduled on [Appointment Date]. ' +
  "Please bring your child's immunization record. " +
  'For questions, please contact the health center. Thank you.';

// Must stay identical in wording to frontend/src/data/mockData.ts SMS_TEMPLATE.
function composeMessage(childName, appointmentDateISO, appointmentTime) {
  const d = new Date(`${appointmentDateISO}T00:00:00`);
  let dateStr = Number.isNaN(d.getTime())
    ? appointmentDateISO
    : d.toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
  if (appointmentTime && typeof appointmentTime === 'string' && appointmentTime.trim()) {
    const parts = appointmentTime.trim().split(':');
    if (parts.length >= 2) {
      const h = Number(parts[0]);
      const m = Number(parts[1]);
      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        const mm = String(m).padStart(2, '0');
        dateStr = `${dateStr} at ${h12}:${mm} ${ampm}`;
      } else {
        dateStr = `${dateStr} at ${appointmentTime}`;
      }
    } else {
      dateStr = `${dateStr} at ${appointmentTime}`;
    }
  }
  return TEMPLATE.replace('[Child Name]', childName).replace(
    '[Appointment Date]',
    dateStr,
  );
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
  SMS_TEMPLATE: TEMPLATE,
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
