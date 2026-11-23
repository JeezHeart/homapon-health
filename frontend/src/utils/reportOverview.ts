/**
 * Computation ng metrics, purok breakdown, at reporting-period dose counts para sa Reports page.
 *
 * Dito pinagsasama-sama yung mga bata, dose records, at appointments base sa napiling
 * purok at date range para mabuo lahat ng summary cards at tables sa Reports view.
 *
 * Tinatawag ito ng: `ReportsPage.tsx`.
 */
import type { Appointment, Child, DoseRecord } from '../data/mockData';
import { childName, completedDoses, enrichedAppointments, extractPurok, isFullyImmunized, PUROKS } from '../data/mockData';
import { vaccineById } from '../data/vaccines';
import { validScheduleDate } from './scheduleDirectory';

export function weeklyDoseCounts(records: DoseRecord[]) {
  const counts = new Map<string, number>();
  for (const { dateAdministered } of records) {
    const date = validScheduleDate(dateAdministered);
    if (!date) continue;
    const monday = new Date(date + 'T00:00:00Z');
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    const week = monday.toISOString().slice(0, 10);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Kino-compute yung buong reporting dataset para sa napiling purok at `[from, to]` date window.
 *
 * Inputs:
 * - `children`, `records`, `appointments`: buong clinic datasets.
 * - `{ purok = 'all', from, to }`: optional purok filter at ISO reporting date range.
 *
 * Output object:
 * - `registry` / `registryRecords`: mga bata (at dose records nila) na pasok sa napiling purok.
 * - `progress` / `fully` / `partial`: per-child progress at total count ng Fully vs Partially immunized.
 * - `overdue` / `upcoming`: pending appointments ng mga batang ito (kasama sa `upcoming` yung `due-today`).
 * - `purokSummary`: breakdown per purok ng total, fully, partial, at bilang ng distinct overdue children.
 * - `periodValid` / `periodRecords` / `perVaccine`: flag kung valid yung date range, listahan ng doses
 *   na naibigay sa loob ng `[from, to]`, at bilang bawat vaccine.
 *
 * Edge cases na hawak nito:
 * - Kapag invalid yung `from`/`to` ISO date o mas malaki yung `from` kaysa `to`, nagiging `false` yung
 *   `periodValid` at empty arrays yung binabalik para walang maling numbers.
 * - Kapag `purok === 'all'`, pinagsasama yung standard `PUROKS` list at kahit anong extra purok sa data
 *   para walang batang malalaglag sa summary table.
 * - Gumagamit ng `Set` sa overdue children count para 1 beses lang mabilang si baby kahit marami siyang overdue vaccine.
 */
export function reportOverview(children: Child[], records: DoseRecord[], appointments: Appointment[], { purok = 'all', from, to }: { purok?: string; from: string; to: string }) {
  // 1. I-scope yung mga bata sa napiling purok at i-sort alphabetically para sa tables at CSV exports.
  const registry = children.filter((child) => purok === 'all' || extractPurok(child.purok) === purok)
    .sort((a, b) => childName(a).localeCompare(childName(b)) || a.id.localeCompare(b.id));
  const ids = new Set(registry.map((child) => child.id));
  const registryRecords = records.filter((record) => ids.has(record.childId));

  // 2. I-compute yung progress ng bawat bata at bilangin yung Fully vs Partially immunized.
  const progress = registry.map((child) => ({ child, done: completedDoses(registryRecords, child.id), status: isFullyImmunized(registryRecords, child.id) ? 'Fully immunized' as const : 'Partially immunized' as const }));
  const fully = progress.filter((row) => row.status === 'Fully immunized').length;
  const partial = registry.length - fully;

  // 3. Ihiwalay yung pending appointments sa overdue vs upcoming (kasama yung due-today).
  const pending = enrichedAppointments(appointments, registry, records);
  const overdue = pending.filter((appointment) => appointment.status === 'overdue');
  const upcoming = pending.filter((appointment) => appointment.status === 'upcoming' || appointment.status === 'due-today');

  // 4. I-validate yung reporting dates at bilangin yung doses na naibigay bawat vaccine sa loob ng period.
  const periodValid = Boolean(validScheduleDate(from) && validScheduleDate(to) && from <= to);
  const periodRecords = periodValid ? registryRecords.filter((record) => record.dateAdministered >= from && record.dateAdministered <= to).sort((a, b) => b.dateAdministered.localeCompare(a.dateAdministered) || a.id.localeCompare(b.id)) : [];
  const counts = new Map<string, number>();
  for (const record of periodRecords) counts.set(record.vaccineId, (counts.get(record.vaccineId) ?? 0) + 1);
  const perVaccine = [...counts].map(([id, count]) => ({ id, name: vaccineById(id)?.name ?? id, count })).sort((a, b) => a.name.localeCompare(b.name));

  // 5. Buuin yung per-purok summary table (pinapakita pa rin yung standard Barangay Homapon puroks kahit 0).
  const puroks = purok === 'all' ? [...new Set<string>([...PUROKS, ...registry.map((child) => extractPurok(child.purok))])] : [purok];
  const purokSummary = puroks.map((name) => {
    const rows = progress.filter((row) => extractPurok(row.child.purok) === name);
    const fully = rows.filter((row) => row.status === 'Fully immunized').length;
    return { purok: name, total: rows.length, fully, partial: rows.length - fully, overdueChildren: new Set(overdue.filter((appointment) => extractPurok(appointment.child.purok) === name).map((appointment) => appointment.childId)).size };
  });
  return { registry, registryRecords, progress, fully, partial, overdue, upcoming, purokSummary, periodValid, periodRecords, perVaccine };
}
