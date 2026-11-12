import type { Appointment, Child, DoseRecord } from '../data/mockData';
import { childName, enrichedAppointments, extractPurok, isFullyImmunized } from '../data/mockData';

export type VaccinationStatus = 'Fully immunized' | 'Partially immunized';
export type DirectorySchedule = 'all' | 'upcoming' | 'overdue';
export interface DirectoryFilters {
  query?: string;
  vaccination?: VaccinationStatus | 'all';
  schedule?: DirectorySchedule;
  purok?: string;
}

export function childDirectoryRows(children: Child[], records: DoseRecord[], appointments: Appointment[], filters: DirectoryFilters = {}) {
  const query = filters.query?.trim().toLocaleLowerCase() ?? '';
  const pending = enrichedAppointments(appointments, children, records).filter((appointment) => appointment.status !== 'completed');
  return children.flatMap((child) => {
    if (query && !`${childName(child)} ${child.guardian}`.toLocaleLowerCase().includes(query)) return [];
    if (filters.purok && filters.purok !== 'all' && extractPurok(child.purok) !== filters.purok) return [];
    const vaccination: VaccinationStatus = isFullyImmunized(records, child.id) ? 'Fully immunized' : 'Partially immunized';
    if (filters.vaccination && filters.vaccination !== 'all' && filters.vaccination !== vaccination) return [];
    const matching = pending.filter((appointment) => appointment.childId === child.id && (
      !filters.schedule || filters.schedule === 'all' || (filters.schedule === 'overdue' ? appointment.status === 'overdue' : appointment.status === 'upcoming' || appointment.status === 'due-today')
    ));
    if (filters.schedule && filters.schedule !== 'all' && !matching.length) return [];
    return [{ child, vaccination, next: matching[0] }];
  }).sort((a, b) => childName(a.child).localeCompare(childName(b.child)) || a.child.id.localeCompare(b.child.id));
}

export function directoryPage<T>(rows: T[], requestedPage: number, size: number) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, Math.trunc(requestedPage) || 1));
  const offset = (page - 1) * size;
  return { page, pages, visible: rows.slice(offset, offset + size), first: rows.length ? offset + 1 : 0, last: Math.min(offset + size, rows.length) };
}
