import type { EnrichedAppointment } from '../data/mockData';
import { todayISO } from './dates';

export function isRegularClinicDay(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 3;
}

/** Include today when it is Wednesday; never infer holiday replacements. */
export function nextRegularClinicDate(date: string = todayISO()): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + (3 - day.getUTCDay() + 7) % 7);
  return day.toISOString().slice(0, 10);
}

export function nextClinicSession(
  appointments: Pick<EnrichedAppointment, 'childId' | 'scheduledDate' | 'status'>[],
): { date: string; appointmentCount: number; childCount: number } | null {
  const pending = appointments.filter((a) => a.status === 'upcoming' || a.status === 'due-today');
  const date = pending.map((a) => a.scheduledDate).sort()[0];
  if (!date) return null;
  const session = pending.filter((a) => a.scheduledDate === date);
  return { date, appointmentCount: session.length, childCount: new Set(session.map((a) => a.childId)).size };
}
