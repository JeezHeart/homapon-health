import type { Appointment, Child, DoseRecord } from '../data/mockData';
import { childName, completedDoses, enrichedAppointments, extractPurok, isFullyImmunized, PUROKS } from '../data/mockData';
import { vaccineById } from '../data/vaccines';
import { validScheduleDate } from './scheduleDirectory';

export function reportOverview(children: Child[], records: DoseRecord[], appointments: Appointment[], { purok = 'all', from, to }: { purok?: string; from: string; to: string }) {
  const registry = children.filter((child) => purok === 'all' || extractPurok(child.purok) === purok)
    .sort((a, b) => childName(a).localeCompare(childName(b)) || a.id.localeCompare(b.id));
  const ids = new Set(registry.map((child) => child.id));
  const registryRecords = records.filter((record) => ids.has(record.childId));
  const progress = registry.map((child) => ({ child, done: completedDoses(registryRecords, child.id), status: isFullyImmunized(registryRecords, child.id) ? 'Fully immunized' as const : 'Partially immunized' as const }));
  const fully = progress.filter((row) => row.status === 'Fully immunized').length;
  const partial = registry.length - fully;
  const pending = enrichedAppointments(appointments, registry, records);
  const overdue = pending.filter((appointment) => appointment.status === 'overdue');
  const upcoming = pending.filter((appointment) => appointment.status === 'upcoming' || appointment.status === 'due-today');
  const periodValid = Boolean(validScheduleDate(from) && validScheduleDate(to) && from <= to);
  const periodRecords = periodValid ? registryRecords.filter((record) => record.dateAdministered >= from && record.dateAdministered <= to).sort((a, b) => b.dateAdministered.localeCompare(a.dateAdministered) || a.id.localeCompare(b.id)) : [];
  const counts = new Map<string, number>();
  for (const record of periodRecords) counts.set(record.vaccineId, (counts.get(record.vaccineId) ?? 0) + 1);
  const perVaccine = [...counts].map(([id, count]) => ({ id, name: vaccineById(id)?.name ?? id, count })).sort((a, b) => a.name.localeCompare(b.name));
  const puroks = purok === 'all' ? [...new Set<string>([...PUROKS, ...registry.map((child) => extractPurok(child.purok))])] : [purok];
  const purokSummary = puroks.map((name) => {
    const rows = progress.filter((row) => extractPurok(row.child.purok) === name);
    const fully = rows.filter((row) => row.status === 'Fully immunized').length;
    return { purok: name, total: rows.length, fully, partial: rows.length - fully, overdueChildren: new Set(overdue.filter((appointment) => extractPurok(appointment.child.purok) === name).map((appointment) => appointment.childId)).size };
  });
  return { registry, registryRecords, progress, fully, partial, overdue, upcoming, purokSummary, periodValid, periodRecords, perVaccine };
}
