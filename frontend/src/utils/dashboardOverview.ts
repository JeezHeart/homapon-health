/**
 * 6-month activity counter para sa trend chart ng Dashboard.
 *
 * Dito kino-compute kung ilang vaccine doses yung na-record at ilang appointments
 * yung naka-schedule sa nakaraang 6 na buwan hanggang sa current reference month.
 *
 * Tinatawag ito ng: `MonthlyTrendChart.tsx`.
 */
import type { Appointment, DoseRecord } from '../data/mockData';
import { todayISO } from './dates';

export function dosesByDayThisMonth(records: Pick<DoseRecord, 'dateAdministered'>[], referenceISO = todayISO()) {
  const month = referenceISO.slice(0, 7);
  const counts = Array<number>(Number(referenceISO.slice(8, 10))).fill(0);
  for (const { dateAdministered } of records) {
    if (dateAdministered.slice(0, 7) !== month || dateAdministered > referenceISO) continue;
    const index = Number(dateAdministered.slice(8, 10)) - 1;
    if (index >= 0 && index < counts.length) counts[index]++;
  }
  return counts;
}

/**
 * Gumagawa ng 6 monthly buckets (oldest hanggang pinakabago) na nagtatapos sa buwan ng `referenceISO`.
 * Recorded counts lang ito: hindi porke may naka-schedule na appointment ay ibig sabihin um-attend na.
 *
 * Inputs:
 * - `records`: mga dose records (`dateAdministered` lang yung kailangan).
 * - `appointments`: mga appointments (`scheduledDate` lang yung kailangan).
 * - `referenceISO`: anchor `YYYY-MM-DD` date para sa huling buwan (default ay today).
 *
 * Output: 6 na objects `{ prefix, label, fullLabel, doses, appointments }`.
 *
 * Edge cases na hawak nito:
 * - Gamit ang `Date.UTC(year, month - 6 + index, 1)` kaya safe mag-wrap pabalik sa nakaraang taon
 *   (hal. Jan–Mar) nang walang local-timezone shift.
 * - `YYYY-MM` prefix yung gamit sa pag-count kaya hindi masasali yung mga dates sa labas ng 6 months.
 */
export function overviewMonths(
  records: Pick<DoseRecord, 'dateAdministered'>[],
  appointments: Pick<Appointment, 'scheduledDate'>[],
  referenceISO = todayISO(),
) {
  const [year, month] = referenceISO.split('-').map(Number);
  // 0-based yung JS month pero 1-based yung ISO month, kaya (month - 6 + index)
  // ay lumalakad mula 5 months ago (index 0) hanggang sa reference month (index 5).
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 6 + index, 1));
    const prefix = date.toISOString().slice(0, 7);
    return {
      prefix,
      label: date.toLocaleDateString('en-PH', { month: 'short', timeZone: 'UTC' }),
      fullLabel: date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      doses: records.filter((record) => record.dateAdministered.startsWith(prefix)).length,
      appointments: appointments.filter((appointment) => appointment.scheduledDate.startsWith(prefix)).length,
    };
  });
}
