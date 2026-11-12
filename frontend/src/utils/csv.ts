import type { Appointment, Child, DoseRecord } from '../data/mockData';
import { childName, childStatus, completedDoses, extractPurok } from '../data/mockData';
import { vaccineById } from '../data/vaccines';
import { calcAge, todayISO } from './dates';
import { childDirectoryRows } from './childDirectory';

function escapeCsvField(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsvString(
  headers: string[],
  rows: (string | number | undefined | null)[][],
): string {
  const headerLine = headers.map(escapeCsvField).join(',');
  const rowLines = rows.map((r) => r.map(escapeCsvField).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}

export function downloadCsv(filename: string, csvContent: string): void {
  // Prepend UTF-8 BOM so Microsoft Excel opens special characters correctly
  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export DOH Target Client List (TCL) conforming to barangay immunization registry.
 */
export function exportTargetClientList(
  children: Child[],
  records: DoseRecord[],
  appointments: Appointment[],
): void {
  const headers = [
    'Child ID',
    'Full Name',
    'Sex',
    'Date of Birth',
    'Age',
    'Guardian',
    'Contact Number',
    'Purok',
    'Status',
    'Completed Doses Count',
    'Vaccine',
    'Dose #',
    'Date Administered',
    'Health Worker',
    'Batch/Lot',
    'Remarks',
  ];

  const rows: (string | number | undefined | null)[][] = [];

  for (const child of children) {
    const childRecords = records.filter((r) => r.childId === child.id);
    const status = childStatus(appointments, records, child.id);
    const age = calcAge(child.birthDate);

    if (childRecords.length === 0) {
      // Row with child details even if no doses yet
      rows.push([
        child.id,
        childName(child),
        child.sex,
        child.birthDate,
        age,
        child.guardian,
        child.guardianMobile,
        child.purok,
        status,
        0,
        'None',
        '',
        '',
        '',
        '',
        child.notes ?? '',
      ]);
    } else {
      for (const rec of childRecords) {
        const vac = vaccineById(rec.vaccineId);
        rows.push([
          child.id,
          childName(child),
          child.sex,
          child.birthDate,
          age,
          child.guardian,
          child.guardianMobile,
          child.purok,
          status,
          childRecords.length,
          vac?.name ?? rec.vaccineId,
          rec.doseNumber,
          rec.dateAdministered,
          rec.healthWorker,
          rec.batchLot ?? '',
          rec.remarks ?? '',
        ]);
      }
    }
  }

  const csv = toCsvString(headers, rows);
  downloadCsv(`Homapon_TCL_Immunization_${todayISO()}.csv`, csv);
}

/**
 * Export doses administered during a specific reporting period.
 */
export function exportAdministeredDoses(
  records: DoseRecord[],
  children: Child[],
  from: string,
  to: string,
): void {
  const headers = [
    'Date Administered',
    'Child Name',
    'Sex',
    'Purok',
    'Vaccine',
    'Dose #',
    'Health Worker',
    'Batch/Lot',
    'Remarks',
  ];

  const childMap = new Map(children.map((c) => [c.id, c]));

  const filtered = records
    .filter((r) => r.dateAdministered >= from && r.dateAdministered <= to)
    .sort((a, b) => b.dateAdministered.localeCompare(a.dateAdministered));

  const rows = filtered.map((r) => {
    const child = childMap.get(r.childId);
    const vac = vaccineById(r.vaccineId);
    return [
      r.dateAdministered,
      child ? childName(child) : 'Unknown',
      child?.sex ?? '',
      child?.purok ?? '',
      vac?.name ?? r.vaccineId,
      r.doseNumber,
      r.healthWorker,
      r.batchLot ?? '',
      r.remarks ?? '',
    ];
  });

  const csv = toCsvString(headers, rows);
  downloadCsv(`Homapon_Doses_Administered_${from}_to_${to}.csv`, csv);
}

/**
 * Export children summary directory.
 */
export function exportChildrenList(
  children: Child[],
  appointments: Appointment[],
  records: DoseRecord[],
): void {
  const headers = [
    'Child Name',
    'Sex',
    'Date of Birth',
    'Age',
    'Parent/Guardian',
    'Mobile',
    'Purok',
    'Completed Doses',
    'Immunization Status',
    'Notes',
    'Next appointment status',
  ];

  const rows = childDirectoryRows(children, records, appointments).map(({ child: c, vaccination, next }) => [
    childName(c),
    c.sex,
    c.birthDate,
    calcAge(c.birthDate),
    c.guardian,
    c.guardianMobile,
    extractPurok(c.purok),
    completedDoses(records, c.id),
    vaccination,
    c.notes ?? '',
    next ? ({ upcoming: 'Upcoming', 'due-today': 'Due today', overdue: 'Overdue', completed: 'Completed' })[next.status] : 'No appointment booked',
  ]);

  const csv = toCsvString(headers, rows);
  downloadCsv(`Homapon_Children_Directory_${todayISO()}.csv`, csv);
}
