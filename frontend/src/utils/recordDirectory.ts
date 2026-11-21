/**
 * Helper para sa pag-filter at pag-group ng immunization dose records bawat bata.
 *
 * Dito sinasala yung mga naibigay na bakuna base sa search text, klase ng vaccine,
 * at date range, tapos pinagsasama-sama under bawat bata nang maayos ang pagkakasunod-sunod.
 *
 * Tinatawag ito ng: `RecordsPage.tsx`.
 */
import type { Child, DoseRecord } from '../data/mockData';
import { childName } from '../data/mockData';
import { vaccineById } from '../data/vaccines';

/**
 * Nagfi-filter ng dose records at ginu-group sila per child para sa Records page.
 *
 * Inputs:
 * - `children`: buong listahan ng mga bata (gamit sa lookup ng pangalan at guardian).
 * - `records`: lahat ng naka-record na vaccine doses.
 * - filters object:
 *   - `query`: optional search text na tumutugma sa pangalan ng bata, guardian, o vaccine short name.
 *   - `vaccine`: `'all'` o specific `vaccineId`.
 *   - `from` / `to`: optional inclusive ISO date (`YYYY-MM-DD`) bounds para sa `dateAdministered`.
 *
 * Output: array ng `{ child, doses }` na naka-sort alphabetically by child name, at pinakabago
 * muna (`dateAdministered` descending) yung mga doses sa loob ng bawat bata.
 *
 * Edge cases na hawak nito:
 * - Linalaktawan yung orphaned dose records na walang kapares na bata sa `children`.
 * - Hindi sinasama sa output yung mga batang walang tugmang dose.
 * - Nagfa-fallback sa raw `record.vaccineId` kapag wala sa catalog yung vaccine.
 * - May ID tie-breaker (`a.id.localeCompare(b.id)`) para stable yung sort order.
 */
export function recordDirectory(
  children: Child[],
  records: DoseRecord[],
  { query = '', vaccine = 'all', from = '', to = '' }: { query?: string; vaccine?: string; from?: string; to?: string },
) {
  const search = query.trim().toLocaleLowerCase();
  // Gawing Map yung children para mabilis (O(1)) yung lookup habang iniikutan yung dose records.
  const childrenById = new Map(children.map((child) => [child.id, child]));
  const groups = new Map<string, { child: Child; doses: DoseRecord[] }>();
  for (const record of records) {
    const child = childrenById.get(record.childId);
    // Laktawan kapag walang kapares na bata o hindi tugma sa piniling vaccine filter.
    if (!child || vaccine !== 'all' && record.vaccineId !== vaccine) continue;
    // I-apply yung inclusive date range kapag may binigay na `from` at/o `to`.
    if (from && record.dateAdministered < from || to && record.dateAdministered > to) continue;
    const vaccineInfo = vaccineById(record.vaccineId);
    // I-check yung free-text search laban sa pangalan ng bata, guardian, at vaccine short name.
    if (search && !`${childName(child)} ${child.guardian} ${vaccineInfo?.shortName ?? record.vaccineId}`.toLocaleLowerCase().includes(search)) continue;
    const group = groups.get(child.id) ?? { child, doses: [] };
    group.doses.push(record);
    groups.set(child.id, group);
  }
  // I-sort yung doses ng bawat bata mula pinakabago, tapos i-sort yung mga bata alphabetically.
  return [...groups.values()].map((group) => ({ ...group, doses: group.doses.sort((a, b) => b.dateAdministered.localeCompare(a.dateAdministered) || a.id.localeCompare(b.id)) }))
    .sort((a, b) => childName(a.child).localeCompare(childName(b.child)) || a.child.id.localeCompare(b.child.id));
}
