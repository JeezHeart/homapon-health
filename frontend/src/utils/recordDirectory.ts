import type { Child, DoseRecord } from '../data/mockData';
import { childName } from '../data/mockData';
import { vaccineById } from '../data/vaccines';

export function recordDirectory(
  children: Child[],
  records: DoseRecord[],
  { query = '', vaccine = 'all', from = '', to = '' }: { query?: string; vaccine?: string; from?: string; to?: string },
) {
  const search = query.trim().toLocaleLowerCase();
  const childrenById = new Map(children.map((child) => [child.id, child]));
  const groups = new Map<string, { child: Child; doses: DoseRecord[] }>();
  for (const record of records) {
    const child = childrenById.get(record.childId);
    if (!child || vaccine !== 'all' && record.vaccineId !== vaccine) continue;
    if (from && record.dateAdministered < from || to && record.dateAdministered > to) continue;
    const vaccineInfo = vaccineById(record.vaccineId);
    if (search && !`${childName(child)} ${child.guardian} ${vaccineInfo?.shortName ?? record.vaccineId}`.toLocaleLowerCase().includes(search)) continue;
    const group = groups.get(child.id) ?? { child, doses: [] };
    group.doses.push(record);
    groups.set(child.id, group);
  }
  return [...groups.values()].map((group) => ({ ...group, doses: group.doses.sort((a, b) => b.dateAdministered.localeCompare(a.dateAdministered) || a.id.localeCompare(b.id)) }))
    .sort((a, b) => childName(a.child).localeCompare(childName(b.child)) || a.child.id.localeCompare(b.child.id));
}
