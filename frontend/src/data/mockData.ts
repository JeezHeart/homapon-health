/**
 * Shared TypeScript models, empty local-practice arrays, at mga pure selector helpers ng buong app.
 *
 * Dito naka-define yung shape ng `Child`, `DoseRecord`, `Appointment`, at `SmsEntry` — pati yung
 * mga helper functions na nagko-compute ng status (Fully immunized, Overdue, Upcoming), purok label,
 * at chart totals para pare-pareho yung numbers sa Dashboard, Schedule, Reports, at Child Profile.
 * Check mo dito kapag nagka-mismatch yung bilang ng overdue, status badges, o SMS delivery labels.
 */

/**
 * Shared record types and selectors with empty local-preview collections.
 * Patient records belong in the protected API/database, never in this module.
 */
import { toISODate, todayISO } from '../utils/dates';
import { REQUIRED_DOSES, vaccineById } from './vaccines';

export type Sex = 'Female' | 'Male';

// Listahan ng mga purok sa Barangay Homapon na ginagamit sa forms at dropdown filters.
export const PUROKS = [
  'Purok 1',
  'Purok 2',
  'Purok 3',
  'Purok 4',
  'Purok 5',
  'Purok 6',
  'Purok 7',
] as const;

export type Purok = (typeof PUROKS)[number];

// Kinukuha at nililinis yung purok name (hal. "purok  3" -> "Purok 3"), o "Unassigned" kapag walang nakalagay.
export function extractPurok(addressOrPurok?: string): string {
  if (!addressOrPurok) return 'Unassigned';
  const match = addressOrPurok.match(/Purok\s*\d+/i);
  if (match) {
    const raw = match[0].replace(/\s+/g, ' ');
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return addressOrPurok.trim() || 'Unassigned';
}

export interface Child {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string; // YYYY-MM-DD
  sex: Sex;
  guardian: string;
  guardianMobile: string;
  purok: string;
  weightKg?: number; // latest known weight, per paper's manual flow
  notes?: string;
}

export interface DoseRecord {
  id: string;
  childId: string;
  vaccineId: string;
  doseNumber: number;
  dateAdministered: string; // YYYY-MM-DD
  healthWorker: string;
  batchLot?: string;
  remarks?: string;
}

export type FollowUpStatus = 'Pending' | 'Contacted' | 'Home Visited' | 'Rescheduled';

export interface Appointment {
  id: string;
  childId: string;
  vaccineId: string;
  doseNumber: number;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime?: string; // HH:mm format, e.g. "08:30"
  scheduleExceptionReason?: string; // Staff-entered reason for a non-Wednesday date.
  followUpStatus?: FollowUpStatus;
  followUpNotes?: string;
  followUpDate?: string; // YYYY-MM-DD
}

export type AppointmentStatus = 'upcoming' | 'due-today' | 'overdue' | 'completed';

export type NewChild = Omit<Child, 'id'> & { initialMeasurement?: Omit<import('../utils/growth').NewGrowthMeasurement, 'childId'> };
export type NewDoseRecord = Omit<DoseRecord, 'id'>;
export type NewAppointment = Omit<Appointment, 'id'>;

export interface SmsEntry {
  id: string;
  childId: string;
  message: string;
  sentAt: string; // YYYY-MM-DD
  status: 'Demo sent' | 'Demo failed' | 'Sent' | 'Failed' | 'Accepted' | 'Unknown' | 'Not sent';
  provider?: string | null;
  providerId?: string | null;
  deliveryStatus?: 'demo' | 'unconfirmed' | 'unknown' | 'not_sent' | 'legacy_unknown';
}

// Ginagawang honest na explanation yung status ng SMS log para hindi magmukhang "delivered sa phone" yung demo o unconfirmed sends.
export function smsDeliveryLabel(entry: SmsEntry): string {
  if (entry.status.startsWith('Demo')) return 'Demo entry — no real SMS sent';
  if (entry.status === 'Accepted') return 'Provider accepted — handset delivery unconfirmed';
  if (entry.status === 'Unknown') return 'Delivery uncertain — manual reconciliation required';
  if (entry.status === 'Not sent') return 'Not submitted to the provider';
  return 'Legacy record — handset delivery unverified';
}

export { SMS_TEMPLATE, renderSmsMessage } from '../utils/sms';

// Local preview starts empty. Patient data is entered through the system;
// retired demonstration records must not be preloaded or reseeded.
export const CHILDREN: Child[] = [];
export const RECORDS: DoseRecord[] = [];
export const APPOINTMENTS: Appointment[] = [];
export const SMS_HISTORY: SmsEntry[] = [];

/* ---------- Derived selectors (single source for dashboard + reports) ----------
   Pure functions over explicit arrays so every screen derives from the
   same store state and values cannot drift apart. */

// Hinahanap yung isang child record sa listahan gamit yung `id` niya.
export function childById(children: Child[], id: string): Child | undefined {
  return children.find((c) => c.id === id);
}

// Pinagsasama yung firstName at lastName ng bata para sa display sa tables at headers.
export function childName(child: Child): string {
  return `${child.firstName} ${child.lastName}`;
}

// Kinukuha lahat ng vaccination dose records ng isang specific na bata.
export function recordsForChild(
  records: DoseRecord[],
  childId: string,
): DoseRecord[] {
  return records.filter((r) => r.childId === childId);
}

// Binibilang kung ilang doses na yung naitala para sa bata.
export function completedDoses(
  records: DoseRecord[],
  childId: string,
): number {
  return recordsForChild(records, childId).length;
}

// Nagre-return ng true kapag umabot o lumampas na sa REQUIRED_DOSES (14) yung naitalang doses ng bata.
export function isFullyImmunized(
  records: DoseRecord[],
  childId: string,
): boolean {
  return completedDoses(records, childId) >= REQUIRED_DOSES;
}

// Tsine-check kung completed na (may kaparehong dose record), overdue, due-today, o upcoming yung isang appointment.
export function appointmentStatus(
  appt: Appointment,
  records: DoseRecord[],
): AppointmentStatus {
  const done = records.some(
    (r) =>
      r.childId === appt.childId &&
      r.vaccineId === appt.vaccineId &&
      r.doseNumber === appt.doseNumber,
  );
  if (done) return 'completed';
  const today = todayISO();
  if (appt.scheduledDate < today) return 'overdue';
  if (appt.scheduledDate === today) return 'due-today';
  return 'upcoming';
}

export interface EnrichedAppointment extends Appointment {
  status: AppointmentStatus;
  child: Child;
  daysOverdue?: number;
}

// Pinagsasama yung bawat appointment sa kaniyang Child object, computed status, at `daysOverdue`, tapos naka-sort by date.
export function enrichedAppointments(
  appointments: Appointment[],
  children: Child[],
  records: DoseRecord[],
): EnrichedAppointment[] {
  const today = todayISO();
  const todayMs = new Date(today).getTime();

  return appointments
    .flatMap((a) => {
      const child = childById(children, a.childId);
      if (!child) return [];
      const status = appointmentStatus(a, records);
      let daysOverdue: number | undefined;
      if (status === 'overdue') {
        const apptMs = new Date(a.scheduledDate).getTime();
        daysOverdue = Math.max(1, Math.round((todayMs - apptMs) / 86400000));
      }
      return [{ ...a, status, child, daysOverdue }];
    })
    .sort((x, y) => x.scheduledDate.localeCompare(y.scheduledDate));
}

// Kinukuha lang yung mga appointments na due today o upcoming pa.
export function upcomingAppointments(
  appointments: Appointment[],
  children: Child[],
  records: DoseRecord[],
): EnrichedAppointment[] {
  return enrichedAppointments(appointments, children, records).filter(
    (a) => a.status === 'upcoming' || a.status === 'due-today',
  );
}

// Kinukuha lang yung overdue appointments, una sa listahan yung pinakamatagal nang overdue para madali i-follow up.
export function overdueAppointments(
  appointments: Appointment[],
  children: Child[],
  records: DoseRecord[],
): EnrichedAppointment[] {
  return enrichedAppointments(appointments, children, records)
    .filter((a) => a.status === 'overdue')
    .sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));
}

export type ChildStatus = 'Fully immunized' | 'Overdue' | 'Partially immunized';

// Overall vaccination/schedule status ng bata (Fully immunized, Overdue, o Partially immunized).
export function childStatus(
  appointments: Appointment[],
  records: DoseRecord[],
  childId: string,
): ChildStatus {
  if (isFullyImmunized(records, childId)) return 'Fully immunized';
  const hasOverdue = appointments.some(
    (a) =>
      a.childId === childId && appointmentStatus(a, records) === 'overdue',
  );
  return hasOverdue ? 'Overdue' : 'Partially immunized';
}

// Hinahanap yung pinakamalapit na hindi pa tapos na appointment ng bata (ginagamit sa directory at SMS reminder button).
/** Nearest not-yet-completed appointment for a child, if any. */
export function nextAppointment(
  appointments: Appointment[],
  children: Child[],
  records: DoseRecord[],
  childId: string,
): EnrichedAppointment | undefined {
  return enrichedAppointments(appointments, children, records).find(
    (a) => a.childId === childId && a.status !== 'completed',
  );
}

// Hinahanap yung susunod na kulang na dose number ng bata sa isang bakuna para ma-autofill sa DoseEntryForm at AppointmentDialog.
/** Smallest not-yet-completed dose number, or undefined if all done. */
export function nextIncompleteDose(
  records: DoseRecord[],
  childId: string,
  vaccineId: string,
): number | undefined {
  const vaccine = vaccineById(vaccineId);
  const done = new Set(
    records
      .filter((r) => r.childId === childId && r.vaccineId === vaccineId)
      .map((r) => r.doseNumber),
  );
  return vaccine?.doses.map((d) => d.doseNumber).find((n) => !done.has(n));
}

// Kinukuha lahat ng SMS history entries ng isang bata, pinakabago muna.
export function smsForChild(log: SmsEntry[], childId: string): SmsEntry[] {  return log
    .filter((s) => s.childId === childId)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

// Kinukuha yung pinakabagong administered dose records sa buong clinic.
export function recentActivity(
  records: DoseRecord[],
  limit = 5,
): DoseRecord[] {
  return [...records]
    .sort((a, b) => b.dateAdministered.localeCompare(a.dateAdministered))
    .slice(0, limit);
}

// Binibilang kung ilang vaccine doses yung naibigay ngayong buwan (nakadisplay sa DashboardPage KPI card).
export function dosesThisMonth(records: DoseRecord[]): number {
  const prefix = todayISO().slice(0, 7);
  return records.filter((r) => r.dateAdministered.startsWith(prefix)).length;
}

export interface MonthBucket {
  label: string;
  count: number;
}

// Gino-group yung administered doses per month para sa trend chart ng Dashboard.
/** Doses administered per month for the last `months` months (oldest first). */
export function dosesPerMonth(
  records: DoseRecord[],
  months = 6,
): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  const now = new Date();
  for (let m = months - 1; m >= 0; m--) {
    const ref = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const prefix = toISODate(ref).slice(0, 7);
    const count = records.filter((r) =>
      r.dateAdministered.startsWith(prefix),
    ).length;
    buckets.push({
      label: ref.toLocaleDateString('en-PH', { month: 'short' }),
      count,
    });
  }
  return buckets;
}

export interface WeekBucket {
  label: string;
  count: number;
}

// Gino-group yung administered doses per 7-day week para sa weekly view ng trend charts.
/** Doses administered per week for the last `weeks` weeks (oldest first). */
export function dosesPerWeek(
  records: DoseRecord[],
  weeks = 8,
): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let w = weeks - 1; w >= 0; w--) {
    const end = new Date(startOfToday);
    end.setDate(end.getDate() - w * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const count = records.filter((r) => {
      const [y, m, d] = r.dateAdministered.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt >= start && dt <= end;
    }).length;
    buckets.push({
      label: end.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
      count,
    });
  }
  return buckets;
}
