/**
 * Central fictional sample dataset (prd.md sections 6-7, 11-12).
 * All people, numbers, and dates are invented for the frontend demo.
 * NEVER put real children's data here.
 */
import { daysFromNow, toISODate, todayISO } from '../utils/dates';
import { REQUIRED_DOSES, vaccineById } from './vaccines';

export type Sex = 'Female' | 'Male';

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

export type NewChild = Omit<Child, 'id'>;
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

export function smsDeliveryLabel(entry: SmsEntry): string {
  if (entry.status.startsWith('Demo')) return 'Demo entry — no real SMS sent';
  if (entry.status === 'Accepted') return 'Provider accepted — handset delivery unconfirmed';
  if (entry.status === 'Unknown') return 'Delivery uncertain — manual reconciliation required';
  if (entry.status === 'Not sent') return 'Not submitted to the provider';
  return 'Legacy record — handset delivery unverified';
}

/** Fixed reminder template (prd.md section 11). Single source of truth. */
export const SMS_TEMPLATE =
  'Good day! This is Barangay Homapon Health Center. ' +
  'A vaccination appointment for [Child Name] is scheduled on [Appointment Date]. ' +
  "Please bring your child's immunization record. " +
  'For questions, please contact the health center. Thank you.';

export function renderSmsMessage(childName: string, appointmentDate: string, appointmentTime?: string): string {
  let displayDate = appointmentDate;
  if (appointmentTime) {
    const parts = appointmentTime.trim().split(':');
    if (parts.length >= 2) {
      const h = Number(parts[0]);
      const m = Number(parts[1]);
      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour12 = h % 12 || 12;
        const minute = String(m).padStart(2, '0');
        displayDate = `${appointmentDate} at ${hour12}:${minute} ${ampm}`;
      } else {
        displayDate = `${appointmentDate} at ${appointmentTime}`;
      }
    } else {
      displayDate = `${appointmentDate} at ${appointmentTime}`;
    }
  }
  return SMS_TEMPLATE.replace('[Child Name]', childName).replace(
    '[Appointment Date]',
    displayDate,
  );
}

export const CHILDREN: Child[] = [
  {
    id: 'c01',
    firstName: 'Althea',
    lastName: 'Reyes',
    birthDate: '2024-03-14',
    sex: 'Female',
    guardian: 'Jenny Reyes',
    guardianMobile: '0900-000-0001',
    purok: 'Purok 3, Homapon',
    weightKg: 11.5,
  },
  {
    id: 'c02',
    firstName: 'Marco',
    lastName: 'Villanueva',
    birthDate: '2023-07-02',
    sex: 'Male',
    guardian: 'Paolo Villanueva',
    guardianMobile: '0900-000-0002',
    purok: 'Purok 1, Homapon',
  },
  {
    id: 'c03',
    firstName: 'Sofia',
    lastName: 'Ramos',
    birthDate: '2025-01-20',
    sex: 'Female',
    guardian: 'Liza Ramos',
    guardianMobile: '0900-000-0003',
    purok: 'Purok 5, Homapon',
    weightKg: 8.2,
    notes: 'Guardian prefers morning appointments.',
  },
  {
    id: 'c04',
    firstName: 'Liam',
    lastName: 'Garcia',
    birthDate: '2022-11-30',
    sex: 'Male',
    guardian: 'Mark Garcia',
    guardianMobile: '0900-000-0004',
    purok: 'Purok 2, Homapon',
    weightKg: 14.0,
  },
  {
    id: 'c05',
    firstName: 'Ava',
    lastName: 'Mendoza',
    birthDate: '2025-06-08',
    sex: 'Female',
    guardian: 'Rosa Mendoza',
    guardianMobile: '0900-000-0005',
    purok: 'Purok 4, Homapon',
  },
  {
    id: 'c06',
    firstName: 'Noah',
    lastName: 'Aquino',
    birthDate: '2024-09-25',
    sex: 'Male',
    guardian: 'Chris Aquino',
    guardianMobile: '0900-000-0006',
    purok: 'Purok 6, Homapon',
  },
  {
    id: 'c07',
    firstName: 'Mia',
    lastName: 'Torres',
    birthDate: '2023-02-11',
    sex: 'Female',
    guardian: 'Ana Torres',
    guardianMobile: '0900-000-0007',
    purok: 'Purok 7, Homapon',
  },
  {
    id: 'c08',
    firstName: 'Ethan',
    lastName: 'Castillo',
    birthDate: '2026-04-17',
    sex: 'Male',
    guardian: 'Joy Castillo',
    guardianMobile: '0900-000-0008',
    purok: 'Purok 3, Homapon',
  },
];

let recordSeq = 0;
function rec(
  childId: string,
  vaccineId: string,
  doseNumber: number,
  daysAgo: number,
  healthWorker = 'Nurse Demo Santos',
  remarks?: string,
): DoseRecord {
  recordSeq += 1;
  return {
    id: `r${String(recordSeq).padStart(2, '0')}`,
    childId,
    vaccineId,
    doseNumber,
    dateAdministered: daysFromNow(-daysAgo),
    healthWorker,
    batchLot: `LOT-2026-${String(recordSeq).padStart(3, '0')}`,
    remarks,
  };
}

/** Completed-dose history. Spread over recent weeks for the chart. */
export const RECORDS: DoseRecord[] = [
  // Fully immunized children (14 required doses each)
  rec('c04', 'bcg', 1, 900),
  rec('c04', 'hepb', 1, 900),
  rec('c04', 'penta', 1, 855),
  rec('c04', 'opv', 1, 855),
  rec('c04', 'penta', 2, 825),
  rec('c04', 'opv', 2, 825),
  rec('c04', 'penta', 3, 795),
  rec('c04', 'opv', 3, 795),
  rec('c04', 'ipv', 1, 795),
  rec('c04', 'pcv', 1, 855),
  rec('c04', 'pcv', 2, 825),
  rec('c04', 'pcv', 3, 795),
  rec('c04', 'mmr', 1, 630),
  rec('c04', 'mmr', 2, 540),
  rec('c07', 'bcg', 1, 950),
  rec('c07', 'hepb', 1, 950),
  rec('c07', 'penta', 1, 905),
  rec('c07', 'opv', 1, 905),
  rec('c07', 'penta', 2, 875),
  rec('c07', 'opv', 2, 875),
  rec('c07', 'penta', 3, 845),
  rec('c07', 'opv', 3, 845),
  rec('c07', 'ipv', 1, 845),
  rec('c07', 'pcv', 1, 905),
  rec('c07', 'pcv', 2, 875),
  rec('c07', 'pcv', 3, 845),
  rec('c07', 'mmr', 1, 700),
  rec('c07', 'mmr', 2, 600),
  // Partially immunized children
  rec('c01', 'bcg', 1, 580),
  rec('c01', 'hepb', 1, 580),
  rec('c01', 'penta', 1, 535),
  rec('c01', 'opv', 1, 535),
  rec('c01', 'penta', 2, 505),
  rec('c01', 'opv', 2, 505),
  rec('c01', 'pcv', 1, 535),
  rec('c01', 'pcv', 2, 505),
  rec('c02', 'bcg', 1, 460),
  rec('c02', 'hepb', 1, 460),
  rec('c02', 'penta', 1, 415),
  rec('c02', 'opv', 1, 415),
  rec('c02', 'mmr', 1, 200),
  rec('c03', 'bcg', 1, 50),
  rec('c03', 'hepb', 1, 50),
  rec('c03', 'penta', 1, 9),
  rec('c03', 'opv', 1, 9),
  rec('c05', 'bcg', 1, 30),
  rec('c05', 'hepb', 1, 30),
  rec('c05', 'penta', 1, 3),
  rec('c05', 'opv', 1, 3),
  rec('c06', 'bcg', 1, 120),
  rec('c06', 'hepb', 1, 120),
  rec('c06', 'penta', 1, 75),
  rec('c06', 'opv', 1, 75),
  rec('c06', 'penta', 2, 45),
  rec('c06', 'opv', 2, 45),
  rec('c06', 'pcv', 1, 75),
  rec('c08', 'bcg', 1, 16),
  rec('c08', 'hepb', 1, 16),
];

export const APPOINTMENTS: Appointment[] = [
  {
    id: 'a01',
    childId: 'c03',
    vaccineId: 'penta',
    doseNumber: 2,
    scheduledDate: daysFromNow(-6),
    followUpStatus: 'Contacted',
    followUpNotes: 'Informed guardian via SMS; mother will bring infant on next clinic day.',
    followUpDate: daysFromNow(-2),
  },
  {
    id: 'a02',
    childId: 'c03',
    vaccineId: 'opv',
    doseNumber: 2,
    scheduledDate: daysFromNow(-6),
    followUpStatus: 'Contacted',
    followUpNotes: 'Bundled with Penta 2 follow-up.',
    followUpDate: daysFromNow(-2),
  },
  {
    id: 'a03',
    childId: 'c01',
    vaccineId: 'penta',
    doseNumber: 3,
    scheduledDate: daysFromNow(-2),
    followUpStatus: 'Pending',
  },
  { id: 'a04', childId: 'c06', vaccineId: 'penta', doseNumber: 3, scheduledDate: daysFromNow(0) },
  { id: 'a05', childId: 'c06', vaccineId: 'opv', doseNumber: 3, scheduledDate: daysFromNow(0) },
  { id: 'a06', childId: 'c05', vaccineId: 'penta', doseNumber: 2, scheduledDate: daysFromNow(2) },
  { id: 'a07', childId: 'c05', vaccineId: 'opv', doseNumber: 2, scheduledDate: daysFromNow(2) },
  { id: 'a08', childId: 'c02', vaccineId: 'mmr', doseNumber: 2, scheduledDate: daysFromNow(5) },
  { id: 'a09', childId: 'c08', vaccineId: 'penta', doseNumber: 1, scheduledDate: daysFromNow(9) },
  { id: 'a10', childId: 'c08', vaccineId: 'opv', doseNumber: 1, scheduledDate: daysFromNow(9) },
  { id: 'a11', childId: 'c01', vaccineId: 'mmr', doseNumber: 1, scheduledDate: daysFromNow(12) },
];

export const SMS_HISTORY: SmsEntry[] = [
  {
    id: 's01',
    childId: 'c03',
    message: renderSmsMessage('Sofia Ramos', 'Oct 7, 2026'),
    sentAt: daysFromNow(-6),
    status: 'Demo sent',
  },
  {
    id: 's02',
    childId: 'c01',
    message: renderSmsMessage('Althea Reyes', 'Oct 11, 2026'),
    sentAt: daysFromNow(-2),
    status: 'Demo sent',
  },
  {
    id: 's03',
    childId: 'c06',
    message: renderSmsMessage('Noah Aquino', 'Oct 10, 2026'),
    sentAt: daysFromNow(-3),
    status: 'Demo failed',
  },
];

/* ---------- Derived selectors (single source for dashboard + reports) ----------
   Pure functions over explicit arrays so every screen derives from the
   same store state and values cannot drift apart. */

export function childById(children: Child[], id: string): Child | undefined {
  return children.find((c) => c.id === id);
}

export function childName(child: Child): string {
  return `${child.firstName} ${child.lastName}`;
}

export function recordsForChild(
  records: DoseRecord[],
  childId: string,
): DoseRecord[] {
  return records.filter((r) => r.childId === childId);
}

export function completedDoses(
  records: DoseRecord[],
  childId: string,
): number {
  return recordsForChild(records, childId).length;
}

export function isFullyImmunized(
  records: DoseRecord[],
  childId: string,
): boolean {
  return completedDoses(records, childId) >= REQUIRED_DOSES;
}

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

export function upcomingAppointments(
  appointments: Appointment[],
  children: Child[],
  records: DoseRecord[],
): EnrichedAppointment[] {
  return enrichedAppointments(appointments, children, records).filter(
    (a) => a.status === 'upcoming' || a.status === 'due-today',
  );
}

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

export function smsForChild(log: SmsEntry[], childId: string): SmsEntry[] {  return log
    .filter((s) => s.childId === childId)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export function recentActivity(
  records: DoseRecord[],
  limit = 5,
): DoseRecord[] {
  return [...records]
    .sort((a, b) => b.dateAdministered.localeCompare(a.dateAdministered))
    .slice(0, limit);
}

export function dosesThisMonth(records: DoseRecord[]): number {
  const prefix = todayISO().slice(0, 7);
  return records.filter((r) => r.dateAdministered.startsWith(prefix)).length;
}

export interface MonthBucket {
  label: string;
  count: number;
}

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
