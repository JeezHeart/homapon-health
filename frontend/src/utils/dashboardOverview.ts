import type { Appointment, DoseRecord } from '../data/mockData';
import { todayISO } from './dates';

/** Recorded counts only: scheduled appointments do not establish attendance. */
export function overviewMonths(
  records: Pick<DoseRecord, 'dateAdministered'>[],
  appointments: Pick<Appointment, 'scheduledDate'>[],
  referenceISO = todayISO(),
) {
  const [year, month] = referenceISO.split('-').map(Number);
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
