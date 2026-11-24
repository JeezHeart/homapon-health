/**
 * Centralized Express backend API client ng buong frontend.
 *
 * Lahat ng HTTP requests papunta sa backend (children, dose records, appointments, growth measurements,
 * iProg SMS / demo SMS logs, staff `/me` role check, at record-review guidance) dito dumadaan.
 * Check mo dito kapag may 401/429 API error, maling endpoint URL, o network error message sa UI.
 */
import type { GrowthMeasurement, NewGrowthMeasurement } from '../utils/growth';
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
import type { ReviewAction, ReviewEvent, ReviewFinding } from '../utils/reviewWorklist';

// Set VITE_API_URL in frontend/.env to talk to the backend.
// Unset/empty = demo mode (local fictional data, today's behavior).
const BASE = (
  import.meta.env.VITE_API_URL as string | undefined
)?.replace(/\/$/, '');
// True kapag naka-set yung VITE_API_URL (live Express backend mode); false kapag local practice mode lang.
export const apiEnabled = !!BASE;

// Custom error class na may dalang HTTP status code at `retryAt` timer kapag na-rate-limit (HTTP 429).
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

// Main JSON fetch wrapper: kinakabit yung Supabase Bearer token sa header at ginagawang ApiError kapag nag-fail yung response.
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
export type ReviewGuidance = {
  source: 'ai_assisted' | 'reference';
  explanation: string;
  checklist: string[];
  filipinoExplanation?: string;
  filipinoChecklist?: string[];
  references: { title: string; url: string }[];
};
export type DailyReviewSummary = {
  date: string;
  findings: number;
  uniqueChildren: number;
  statuses: Record<'pending' | 'verified' | 'escalated' | 'resolved', number> | null;
  guidance: ReviewGuidance;
};
export type ReviewPreparation = ReviewGuidance & {
  worksheet: { title: string; filipinoTitle?: string; fields: string[]; filipinoFields?: string[] };
  questions: { question: string; filipinoQuestion: string; en: string; fil: string; reference: string; url: string }[];
};

// Collection ng typed API helpers na tinatawag ni `StoreProvider` at ng feature panels (Record Review, Growth, SMS).
export const api = {
  // Record review: kumukuha ng preparation worksheet at Tagalog/English guide questions para sa na-flag na issue.
  reviewPreparation: (issueCode: string, signal: AbortSignal) =>
    req<{ ok: true; guidance: ReviewPreparation }>('/dose-records/review-guidance', {
      method: 'POST',
      body: JSON.stringify({ issueCode, mode: 'preparation' }),
      signal,
    }).then((result) => result.guidance),
  // Record review: kumukuha ng AI-assisted o reference checklist guidance base sa issueCode.
  reviewGuidance: (issueCode: string, signal: AbortSignal) =>
    req<{ ok: true; guidance: ReviewGuidance }>('/dose-records/review-guidance', {
      method: 'POST',
      body: JSON.stringify({ issueCode }),
      signal,
    }).then((result) => result.guidance),
  // Record review: kino-load lahat ng screened dose findings, tracking status, at daily summary mula sa backend.
  reviewFindings: (signal?: AbortSignal) =>
    req<{ ok: true; trackingAvailable: boolean; findings: ReviewFinding[]; summary?: DailyReviewSummary }>(
      '/dose-records/review-findings?tracking=1&summary=1', { signal },
    ),
  // Record review: kumukuha ng paginated audit history para sa isang finding ng bata.
  reviewHistory: (childId: string, findingKey: string, page: number, signal: AbortSignal) =>
    req<{ ok: true; events: ReviewEvent[]; hasMore: boolean }>(
      '/dose-records/review-history?' + new URLSearchParams({ childId, findingKey, page: String(page) }),
      { signal },
    ),
  // Record review: sine-save yung staff action (verify, escalate, resolve) kasama yung remarks sa backend.
  transitionReview: (body: {
    childId: string; findingKey: string; version: string; eventId: string | null;
    status: ReviewAction; remarks: string;
  }, signal: AbortSignal) =>
    req<{ ok: true; eventId: string; status: ReviewAction }>('/dose-records/review-transition', {
      method: 'POST', body: JSON.stringify(body), signal,
    }),
  // SMS status check: tinatanong ang backend kung naka-enable ba yung live iProg SMS sending o naka-disable.
  smsAvailability: () => req<{ ok: true; enabled: boolean; dryRun?: boolean }>('/sms-log/availability'),
  // Auth/RBAC check: kinukuha sa server yung pangalan at role (`midwife` o `bhw`) ng naka-login na staff.
  me: () =>
    req<{ ok: true; user: { name: string; role: 'midwife' | 'bhw' } }>(
      '/me',
    ).then((r) => r.user),
  // Children CRUD endpoints na tinatawag ni StoreProvider.
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

  // Growth monitoring endpoints na ginagamit ng GrowthSummary sa Dashboard at GrowthPanel sa ChildProfilePage.
  latestGrowthMeasurements: () => req<{ ok: true; measurements: GrowthMeasurement[] }>('/growth-measurements/latest').then((r) => r.measurements),
  growthMeasurements: (childId: string) => req<{ ok: true; measurements: GrowthMeasurement[] }>(`/growth-measurements?childId=${encodeURIComponent(childId)}`).then((r) => r.measurements),
  createGrowthMeasurement: (body: NewGrowthMeasurement) => req<{ ok: true; measurement: GrowthMeasurement }>('/growth-measurements', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.measurement),
  deleteGrowthMeasurement: (id: string) => req<{ ok: true }>(`/growth-measurements/${id}`, { method: 'DELETE' }),

  // Vaccination dose record CRUD endpoints na ginagamit ni StoreProvider.
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

  // Appointment scheduling at overdue follow-up CRUD endpoints na ginagamit ni StoreProvider.
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

  // SMS endpoints: pagkuha ng SMS history, pag-send via backend (iProg SMS / dry-run), at pag-log ng demo SMS entry.
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

// Ginagawang user-friendly message yung technical fetch/API errors para malinaw sa alert ng UI.
export function apiError(e: unknown): string {
  if (e instanceof TypeError)
    return 'Could not reach the server. Is the backend running?';
  return e instanceof Error ? e.message : 'Something went wrong saving.';
}
