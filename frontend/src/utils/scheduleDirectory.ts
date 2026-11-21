/**
 * Helpers para sa validation ng schedule ISO dates at pag-filter/sort ng appointments.
 *
 * Dito naka-handle yung strict calendar-date check (para mahuli yung mga imposibleng
 * petsa gaya ng Feb 30) at yung multi-filter logic ng Schedule page (today, week,
 * upcoming, overdue, completed).
 *
 * Tinatawag ito ng:
 * - `filterSchedule`: `SchedulePage.tsx`.
 * - `validScheduleDate`: `SchedulePage.tsx`, `RecordsPage.tsx`, `utils/reportOverview.ts`.
 */
import type { EnrichedAppointment } from '../data/mockData';
import { childName, extractPurok } from '../data/mockData';
import { isoWeekRange, todayISO } from './dates';

/** Mga status/timeframe tabs na pwedeng piliin sa Schedule page. */
export type ScheduleFilter = 'all' | 'today' | 'week' | 'upcoming' | 'overdue' | 'completed';

/**
 * Chine-check kung totoong calendar date ba yung string at eksaktong `YYYY-MM-DD` ISO format.
 *
 * Input: candidate date string o `null` (madalas galing sa URL query params o date picker).
 * Output: yung valid na `YYYY-MM-DD` string, o `null` kapag blanko o invalid.
 *
 * Edge case: tahimik na niro-roll over ng JS yung `new Date('2026-02-30')` papuntang March 2;
 * dahil kino-compare natin yung `date.toISOString().slice(0, 10) === value`, nare-reject agad yung mga pekeng petsa.
 */
export function validScheduleDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

/**
 * Nagfi-filter at nagso-sort chronologically ng enriched appointments para sa Schedule page.
 *
 * Inputs:
 * - `appointments`: enriched appointments (may kasama nang child details at status).
 * - filters object:
 *   - `query`: case-insensitive search sa pangalan ng bata at guardian.
 *   - `purok`: `'all'` o specific purok.
 *   - `filter`: tab bucket (`'all'`, `'today'`, `'week'`, `'upcoming'`, `'overdue'`, `'completed'`).
 *   - `date`: optional exact `YYYY-MM-DD` date (hal. kapag nag-click ng araw sa calendar).
 * - `today`: reference ISO date (default ay today; pwedeng i-override sa unit tests).
 *
 * Output: filtered appointments na naka-sort by date -> time -> child name -> appointment ID.
 *
 * Edge cases na hawak nito:
 * - Automatic na hindi kasama yung mga `completed` visits sa `'today'` at `'week'` tabs.
 * - Parehong kasama sa `'upcoming'` tab yung `'upcoming'` at `'due-today'` appointments.
 */
export function filterSchedule(
  appointments: EnrichedAppointment[],
  { query = '', purok = 'all', filter = 'all', date = null }: { query?: string; purok?: string; filter?: ScheduleFilter; date?: string | null },
  today = todayISO(),
) {
  const search = query.trim().toLocaleLowerCase();
  const week = isoWeekRange(today);
  return appointments.filter((appointment) => {
    // 1. I-apply muna yung search query, purok, at exact selected calendar date.
    if (search && !`${childName(appointment.child)} ${appointment.child.guardian}`.toLocaleLowerCase().includes(search)) return false;
    if (purok !== 'all' && extractPurok(appointment.child.purok) !== purok) return false;
    if (date && appointment.scheduledDate !== date) return false;
    // 2. I-apply yung napiling status/timeframe tab.
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
