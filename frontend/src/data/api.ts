import type {
  Appointment,
  Child,
  DoseRecord,
  NewAppointment,
  NewChild,
  NewDoseRecord,
  SmsEntry,
} from './mockData';
import { getAccessToken } from './supabaseClient';

// Set VITE_API_URL in frontend/.env to talk to the backend.
// Unset/empty = demo mode (local fictional data, today's behavior).
const BASE = (
  import.meta.env.VITE_API_URL as string | undefined
)?.replace(/\/$/, '');
export const apiEnabled = !!BASE;

export class ApiError extends Error {
  status: number;
  retryAfter: string | null;
  retryAt: number | null;

  constructor(message: string, status: number, retryAfter: string | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
    const seconds = retryAfter?.trim();
    const deadline = seconds && /^\d+$/.test(seconds)
      ? Date.now() + Number(seconds) * 1000
      : Date.parse(retryAfter ?? '');
    // A missing/unreadable header must not enable an immediate retry.
    this.retryAt = status === 429
      ? Number.isFinite(deadline) ? Math.max(Date.now(), deadline) : Date.now() + 60000
      : null;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => {
    if (res.ok) throw new Error('Could not read the server response. Delivery may be uncertain.');
    return {};
  });
  if (!res.ok || (body as { ok?: boolean }).ok === false)
    throw new ApiError(
      (body as { error?: string }).error || `Request failed (${res.status}).`,
      res.status,
      res.headers.get('Retry-After'),
    );
  return body as T;
}

export type DoseSaveOk = { ok: true; record: DoseRecord };
export type DoseSaveFail = { ok: false; error: string };

export const api = {
  me: () =>
    req<{ ok: true; user: { name: string; role: 'midwife' | 'bhw' } }>(
      '/me',
    ).then((r) => r.user),
  children: () =>
    req<{ ok: true; children: Child[] }>('/children').then((r) => r.children),
  createChild: (d: NewChild) =>
    req<{ ok: true; child: Child }>('/children', {
      method: 'POST',
      body: JSON.stringify(d),
    }).then((r) => r.child),
  updateChild: (id: string, p: Partial<NewChild>) =>
    req<{ ok: true; child: Child }>(`/children/${id}`, {
      method: 'PUT',
      body: JSON.stringify(p),
    }).then((r) => r.child),
  deleteChild: (id: string) =>
    req<{ ok: true }>(`/children/${id}`, { method: 'DELETE' }),

  records: (childId?: string) =>
    req<{ ok: true; records: DoseRecord[] }>(
      childId ? `/dose-records?childId=${childId}` : '/dose-records',
    ).then((r) => r.records),
  createDose: (d: NewDoseRecord): Promise<DoseSaveOk> =>
    req<DoseSaveOk>('/dose-records', {
      method: 'POST',
      body: JSON.stringify(d),
    }),
  updateDose: (
    id: string,
    p: Partial<NewDoseRecord>,
  ): Promise<DoseSaveOk | DoseSaveFail> =>
    req<DoseSaveOk | DoseSaveFail>(`/dose-records/${id}`, {
      method: 'PUT',
      body: JSON.stringify(p),
    }),
  deleteDose: (id: string) =>
    req<{ ok: true }>(`/dose-records/${id}`, { method: 'DELETE' }),

  appointments: () =>
    req<{ ok: true; appointments: Appointment[] }>('/appointments').then(
      (r) => r.appointments,
    ),
  createAppointment: (d: NewAppointment) =>
    req<{ ok: true; appointment: Appointment }>('/appointments', {
      method: 'POST',
      body: JSON.stringify(d),
    }).then((r) => r.appointment),
  updateAppointment: (id: string, p: Partial<NewAppointment>) =>
    req<{ ok: true; appointment: Appointment }>(`/appointments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(p),
    }).then((r) => r.appointment),
  deleteAppointment: (id: string) =>
    req<{ ok: true }>(`/appointments/${id}`, { method: 'DELETE' }),

  smsLog: () =>
    req<{ ok: true; log: SmsEntry[] }>('/sms-log').then((r) => r.log),
  sendSms: (childId: string, appointmentId: string) =>
    req<{
      ok: true;
      entry: SmsEntry;
      provider: { name: string; dryRun: boolean; providerId: string | null };
    }>('/sms-log/send', {
      method: 'POST',
      body: JSON.stringify({ childId, appointmentId }),
    }),
  logSms: (
    childId: string,
    message: string,
    status: SmsEntry['status'],
    sentAt: string,
  ) =>
    req<{ ok: true; entry: SmsEntry }>('/sms-log', {
      method: 'POST',
      body: JSON.stringify({ childId, message, status, sentAt }),
    }).then((r) => r.entry),
};

export function apiError(e: unknown): string {
  if (e instanceof TypeError)
    return 'Could not reach the server. Is the backend running?';
  return e instanceof Error ? e.message : 'Something went wrong saving.';
}
