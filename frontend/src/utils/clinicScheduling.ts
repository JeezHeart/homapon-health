/**
 * Helpers para sa regular immunization clinic day schedule ng Barangay Homapon.
 *
 * Dito nakalagay yung business rule na tuwing Miyerkules (Wednesday) yung regular
 * vaccination clinic day, plus yung summary helper na naghahanap kung kailan yung
 * pinakamalapit na clinic session na may naka-book na appointments.
 *
 * Tinatawag ito ng: `AppointmentDialog.tsx`, `DashboardCalendar.tsx`.
 */
import type { EnrichedAppointment } from '../data/mockData';
import { todayISO } from './dates';

/**
 * Chine-check kung tumatama ba sa regular clinic day (Wednesday) yung isang ISO date (`YYYY-MM-DD`).
 *
 * Input: `date` sa `YYYY-MM-DD` format.
 * Output: `true` kapag Wednesday (`getUTCDay() === 3`), `false` kung ibang araw.
 *
 * Edge case: naka-parse sa `T00:00:00Z` (UTC) para hindi ma-shift ng local timezone yung araw.
 */
export function isRegularClinicDay(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 3;
}

/**
 * Dito kino-compute kung anong pinakamalapit na next Wednesday clinic date mula sa binigay na ISO date.
 * Kasama mismo yung araw na ito kapag Wednesday na; hindi ito nanghuhula ng holiday replacements.
 *
 * Input: `date` sa `YYYY-MM-DD` format (default ay today).
 * Output: ISO date string (`YYYY-MM-DD`) ng Wednesday na iyon.
 *
 * Edge case: gamit yung `(3 - day + 7) % 7` formula kaya 0 days ang dagdag kapag Wednesday,
 * 6 days kapag Thursday, at UTC math para walang timezone o DST bug.
 */
export function nextRegularClinicDate(date: string = todayISO()): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + (3 - day.getUTCDay() + 7) % 7);
  return day.toISOString().slice(0, 10);
}

/**
 * Kinukuha yung pinakamalapit na upcoming (o due-today) clinic session na may naka-schedule na appointments.
 *
 * Input: listahan ng appointments na may `childId`, `scheduledDate`, at `status`.
 * Output: `{ date, appointmentCount, childCount }` para sa pinakamaagang pending date,
 * o `null` kapag walang `upcoming` o `due-today` appointments.
 *
 * Edge cases na hawak nito:
 * - Hindi sinasama yung `overdue` at `completed` appointments.
 * - Gumagamit ng `Set` sa `childId` para tama yung bilang ng distinct children kahit may
 *   higit sa isang bakuna yung isang bata sa parehong araw.
 */
export function nextClinicSession(
  appointments: Pick<EnrichedAppointment, 'childId' | 'scheduledDate' | 'status'>[],
): { date: string; appointmentCount: number; childCount: number } | null {
  const pending = appointments.filter((a) => a.status === 'upcoming' || a.status === 'due-today');
  // Chronological agad yung sort ng ISO YYYY-MM-DD strings kahit plain string sort lang.
  const date = pending.map((a) => a.scheduledDate).sort()[0];
  if (!date) return null;
  const session = pending.filter((a) => a.scheduledDate === date);
  return { date, appointmentCount: session.length, childCount: new Set(session.map((a) => a.childId)).size };
}
