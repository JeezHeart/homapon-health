/**
 * CSV builder at browser file-download utilities para sa mga clinic reports.
 *
 * Dito naka-handle yung tamang CSV escaping, Excel-friendly UTF-8 download, at yung
 * tatlong exportable spreadsheets: full vaccination register, date-filtered administered
 * doses, at children summary directory.
 *
 * Tinatawag ito ng:
 * - `exportChildrenList`: `ChildrenPage.tsx`.
 * - `exportVaccinationRegister`, `exportAdministeredDoses`: `ReportsPage.tsx`.
 */
import type { Appointment, Child, DoseRecord } from '../data/mockData';
import { childName, isFullyImmunized, completedDoses, extractPurok } from '../data/mockData';
import { vaccineById } from '../data/vaccines';
import { calcAge, todayISO } from './dates';
import { childDirectoryRows } from './childDirectory';
import { showToast } from './toast';

/**
 * Nililinis at ine-escape yung isang cell value para hindi masira yung columns ng CSV.
 *
 * Input: string, number, `undefined`, o `null`.
 * Output: safe CSV cell string.
 *
 * Edge cases na hawak nito:
 * - Ginagawang blank (`''`) kapag `null` o `undefined`.
 * - Kapag may comma, double-quote, o newline yung text, binabalot sa quotes at dinodoble
 *   yung internal quotes (`"` -> `""`) ayon sa standard CSV rules.
 */
function escapeCsvField(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Ginagawang isang buong CSV text (gamit ang `\r\n` line breaks) yung headers at rows array.
 *
 * Inputs: `headers` (column titles) at `rows` (2D array ng values).
 * Output: complete CSV string na ready na i-download.
 */
export function toCsvString(
  headers: string[],
  rows: (string | number | undefined | null)[][],
): string {
  const headerLine = headers.map(escapeCsvField).join(',');
  const rowLines = rows.map((r) => r.map(escapeCsvField).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}

/**
 * Nagti-trigger ng browser file download para sa ginawang CSV string.
 *
 * Inputs: `filename` (pangalan ng file) at `csvContent` (yung CSV text).
 * Output: wala (gumagawa ng temporary Blob URL, iki-click yung hidden link, tapos lilinisin agad).
 *
 * Edge case: may UTF-8 BOM (`\uFEFF`) sa unahan para maayos pa rin mabasa sa Microsoft Excel
 * yung mga special characters gaya ng `ñ`.
 */
export function downloadCsv(filename: string, csvContent: string): void {
  // Maglagay ng UTF-8 BOM sa simula para hindi mag-garble yung special characters sa Excel.
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
  showToast('CSV exported');
}

/**
 * Nag-e-export ng buong vaccination register (isang row bawat dose, o isang placeholder row
 * para sa mga batang wala pang dose) bilang dated CSV file.
 *
 * Inputs: `children` na isasama sa report at lahat ng `records` na itutugma sa kanila.
 * Output: ida-download yung `Homapon_Vaccination_Register_YYYY-MM-DD.csv`.
 *
 * Edge cases na hawak nito:
 * - Lalabas pa rin nang isang beses yung mga batang wala pang bakuna (`Vaccine = 'None'`, count = `0`).
 * - Kapag hindi makita yung vaccine sa catalog, gagamitin yung raw `rec.vaccineId` bilang fallback.
 */
export function exportVaccinationRegister(
  children: Child[],
  records: DoseRecord[],
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
    'Vaccination Status',
    'Completed Doses Count',
    'Vaccine',
    'Dose #',
    'Date Administered',
    'Health Worker',
    'Batch/Lot',
    'Remarks',
  ];

  const rows: (string | number | undefined | null)[][] = [];

  // I-flatten bawat bata kasama lahat ng naka-record nilang vaccine doses.
  for (const child of children) {
    const childRecords = records.filter((r) => r.childId === child.id);
    const status = isFullyImmunized(records, child.id) ? 'Fully immunized' : 'Partially immunized';
    const age = calcAge(child.birthDate);

    if (childRecords.length === 0) {
      // Maglagay pa rin ng row para kay baby kahit wala pa siyang recorded doses.
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
  downloadCsv(`Homapon_Vaccination_Register_${todayISO()}.csv`, csv);
}

/**
 * Nag-e-export ng lahat ng bakunang naibigay sa loob ng inclusive `[from, to]` date range,
 * naka-sort mula pinakabago hanggang luma, bilang CSV file.
 *
 * Inputs: `records`, `children` (para sa lookup ng pangalan/sex/purok), at ISO `from`/`to` dates.
 * Output: ida-download yung `Homapon_Doses_Administered_<from>_to_<to>.csv`.
 *
 * Edge case: kapag wala sa `children` yung `childId` ng isang record, `'Unknown'` yung ilalagay para hindi mag-crash.
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

  // Gawing Map yung children para mabilis i-lookup bawat dose row.
  const childMap = new Map(children.map((c) => [c.id, c]));

  // Kunin lang yung doses na pasok sa inclusive reporting dates, pinakabago muna.
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
 * Nag-e-export ng summary list ng mga bata (isang row bawat bata) kasama yung completed doses,
 * immunization status, at status ng next appointment nila.
 *
 * Inputs: `children`, `appointments`, at `records`.
 * Output: ida-download yung `Homapon_Children_Directory_YYYY-MM-DD.csv`.
 *
 * Edge case: ginagamit din nito yung `childDirectoryRows` para tugma yung ayos at status sa UI;
 * kapag walang pending visit si baby, `'No appointment booked'` yung lalabas.
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
