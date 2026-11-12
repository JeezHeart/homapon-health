import type { EnrichedAppointment } from '../data/mockData';
import { childName, extractPurok } from '../data/mockData';
import { isoWeekRange, todayISO } from './dates';

export type ScheduleFilter = 'all' | 'today' | 'week' | 'upcoming' | 'overdue' | 'completed';

export function validScheduleDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function filterSchedule(
  appointments: EnrichedAppointment[],
  { query = '', purok = 'all', filter = 'all', date = null }: { query?: string; purok?: string; filter?: ScheduleFilter; date?: string | null },
  today = todayISO(),
) {
  const search = query.trim().toLocaleLowerCase();
  const week = isoWeekRange(today);
  return appointments.filter((appointment) => {
    if (search && !`${childName(appointment.child)} ${appointment.child.guardian}`.toLocaleLowerCase().includes(search)) return false;
    if (purok !== 'all' && extractPurok(appointment.child.purok) !== purok) return false;
    if (date && appointment.scheduledDate !== date) return false;
    switch (filter) {
      case 'today': return appointment.scheduledDate === today && appointment.status !== 'completed';
      case 'week': return appointment.scheduledDate >= week.start && appointment.scheduledDate <= week.end && appointment.status !== 'completed';
      case 'upcoming': return appointment.status === 'upcoming' || appointment.status === 'due-today';
      case 'overdue': return appointment.status === 'overdue';
      case 'completed': return appointment.status === 'completed';
      default: return true;
    }
  }).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? '') || childName(a.child).localeCompare(childName(b.child)) || a.id.localeCompare(b.id));
}
