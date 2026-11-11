export const SMS_TEMPLATE = 'Good day [Guardian]! Brgy Homapon HC: [Child] has a vaccination on [Appt Date]. Bring the Brgy. Booklet. Thank you. (Ref: [Transaction Date])';

export function normalizeSmsText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ').replace(/[^\x20-\x7e]|`/gu, '?').trim();
}

export function smsUnits(message: string): number {
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

export function smsMessageError(message: string): string {
  if (typeof message !== 'string' || !message.trim()) return 'Guardian name, child name, and valid dates/time are required.';
  const units = smsUnits(message);
  if (!Number.isFinite(units)) return 'Message contains unsupported SMS characters.';
  if (message.length > 160 || units > 160) return 'Message exceeds the one-SMS limit. Sending is blocked; full names will not be shortened.';
  return '';
}

function smsDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function renderSmsMessage(guardian: string, child: string, appointmentISO: string, time: string | undefined, transactionISO: string): string {
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

/** Clinic transaction dates match the backend regardless of device timezone. */
export function smsTodayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
