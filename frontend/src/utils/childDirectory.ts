/**
 * Helpers para sa pag-filter, pag-sort ng Children Directory, at shared table pagination.
 *
 * Dito binubuo yung mga row ng listahan ng mga bata (kasama yung vaccination status at
 * susunod nilang pending appointment) at dito rin hinahati per page yung kahit anong
 * table list sa buong app.
 *
 * Tinatawag ito ng:
 * - `childDirectoryRows`: `ChildrenPage.tsx`, `utils/csv.ts`.
 * - `directoryPage`: `ChildrenPage.tsx`, `RecordsPage.tsx`, `ReportsPage.tsx`,
 *   `ReviewWorklistPage.tsx`, `SchedulePage.tsx`, `SmsPage.tsx`.
 */
import type { Appointment, Child, DoseRecord } from '../data/mockData';
import { childName, enrichedAppointments, extractPurok, isFullyImmunized } from '../data/mockData';

/** Display label kung kumpleto na ba o hindi pa yung routine vaccines ni baby. */
export type VaccinationStatus = 'Fully immunized' | 'Partially immunized';

/** Mga schedule filter options para salain yung mga bata base sa urgency ng appointment nila. */
export type DirectorySchedule = 'all' | 'upcoming' | 'overdue';

/** Mga optional filter values na pinapasa sa `childDirectoryRows`. */
export interface DirectoryFilters {
  query?: string;
  vaccination?: VaccinationStatus | 'all';
  schedule?: DirectorySchedule;
  purok?: string;
}

/**
 * Nagfi-filter, nag-a-attach ng status/next visit, at nagso-sort alphabetically ng mga bata
 * para sa Children Directory table at CSV export.
 *
 * Inputs:
 * - `children`: buong listahan ng naka-register na mga bata.
 * - `records`: mga dose records para malaman kung Fully o Partially immunized na.
 * - `appointments`: clinic appointments para makuha yung pinakamalapit na pending visit.
 * - `filters`: optional search text, purok, vaccination status, at schedule filter.
 *
 * Output: sorted array ng `{ child, vaccination, next }` (kung saan `next` yung pinakaunang
 * tugmang pending appointment, o `undefined` kapag wala).
 *
 * Edge cases na hawak nito:
 * - Case-insensitive yung search at chine-check pareho yung pangalan ng bata at ng guardian.
 * - Nina-normalize muna yung purok via `extractPurok` para hindi magmintis kahit may extra address text.
 * - Kasama sa `upcoming` filter yung mga appointment na `due-today`.
 * - Kapag magkapareho yung pangalan ng bata, `child.id` yung tie-breaker para stable yung sort.
 */
export function childDirectoryRows(children: Child[], records: DoseRecord[], appointments: Appointment[], filters: DirectoryFilters = {}) {
  const query = filters.query?.trim().toLocaleLowerCase() ?? '';
  // Kunin muna nang minsanan yung mga hindi pa completed na appointments para mabilis i-check per child.
  const pending = enrichedAppointments(appointments, children, records).filter((appointment) => appointment.status !== 'completed');
  return children.flatMap((child) => {
    // 1. I-check yung search query laban sa pangalan ng bata + guardian.
    if (query && !`${childName(child)} ${child.guardian}`.toLocaleLowerCase().includes(query)) return [];
    // 2. I-filter by purok kapag may piniling specific purok.
    if (filters.purok && filters.purok !== 'all' && extractPurok(child.purok) !== filters.purok) return [];
    // 3. I-compute yung immunization status mula sa dose records at i-apply yung filter.
    const vaccination: VaccinationStatus = isFullyImmunized(records, child.id) ? 'Fully immunized' : 'Partially immunized';
    if (filters.vaccination && filters.vaccination !== 'all' && filters.vaccination !== vaccination) return [];
    // 4. Hanapin yung mga pending appointment ni baby na pasok sa napiling schedule filter.
    const matching = pending.filter((appointment) => appointment.childId === child.id && (
      !filters.schedule || filters.schedule === 'all' || (filters.schedule === 'overdue' ? appointment.status === 'overdue' : appointment.status === 'upcoming' || appointment.status === 'due-today')
    ));
    // Kapag naka-filter sa `upcoming` o `overdue`, alisin yung mga batang walang tugmang visit.
    if (filters.schedule && filters.schedule !== 'all' && !matching.length) return [];
    return [{ child, vaccination, next: matching[0] }];
  }).sort((a, b) => childName(a.child).localeCompare(childName(b.child)) || a.child.id.localeCompare(b.child.id));
}

/**
 * Hinahati yung kahit anong array ng rows sa isang page lang, kasama na yung page counters.
 *
 * Inputs:
 * - `rows`: buong listahan ng items na ipa-paginate.
 * - `requestedPage`: 1-based page number na hinihingi ng UI o URL.
 * - `size`: max na bilang ng rows bawat page.
 *
 * Output: `{ page, pages, visible, first, last }` kung saan 1-based yung `first` at `last`
 * para sa "Showing X–Y of Z" text (parehong 0 kapag walang laman yung `rows`).
 *
 * Edge cases na hawak nito:
 * - Laging at least `pages = 1` kahit empty yung listahan.
 * - Kino-clamp yung sobrang taas, negative, decimal, o NaN na page number sa loob ng `[1, pages]`.
 */
export function directoryPage<T>(rows: T[], requestedPage: number, size: number) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, Math.trunc(requestedPage) || 1));
  const offset = (page - 1) * size;
  return { page, pages, visible: rows.slice(offset, offset + size), first: rows.length ? offset + 1 : 0, last: Math.min(offset + size, rows.length) };
}
