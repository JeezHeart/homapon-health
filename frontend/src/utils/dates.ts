/**
 * Mga date, time, calendar-grid, at child-age formatting helpers ng app.
 *
 * Dito naka-centralize lahat ng local ISO date (`YYYY-MM-DD`) conversions, 12-hour time
 * formatting, Sunday-to-Saturday week range, calendar cells ng isang buwan, "time ago"
 * labels, at pag-compute ng edad ni baby sa years/months.
 *
 * Tinatawag ito ng: `DashboardPage.tsx`, `ChildrenPage.tsx`, `ChildProfilePage.tsx`,
 * `RecordsPage.tsx`, `SchedulePage.tsx`, `ReportsPage.tsx`, `SmsPage.tsx`,
 * `AppointmentDialog.tsx`, `BatchSmsDialog.tsx`, `CorrectionForm.tsx`,
 * `DashboardAppointments.tsx`, `DashboardCalendar.tsx`, `DoseEntryForm.tsx`,
 * `FollowUpDialog.tsx`, `GrowthPanel.tsx`, `GrowthSummary.tsx`,
 * `ImmunizationDocument.tsx`, `SmsDialog.tsx`, `data/mockData.ts`, at ibang utils.
 */

/**
 * Kino-convert yung local JavaScript `Date` object sa plain ISO date string (`YYYY-MM-DD`).
 *
 * Input: `Date` object.
 * Output: zero-padded `YYYY-MM-DD` string gamit ang local year/month/day para hindi mag-shift dahil sa UTC.
 */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Binabalik yung local date ngayon bilang ISO date string (`YYYY-MM-DD`).
 */
export function todayISO(): string {
  return toISODate(new Date());
}

/**
 * Kinukuha yung local ISO date na `n` days mula ngayon (negative kapag nakaraan).
 * Ginagamit para laging fresh yung demo data at relative filters gaya ng "tomorrow".
 *
 * Input: integer day offset `n`.
 * Output: `YYYY-MM-DD` string.
 */
export function daysFromNow(n: number): string {
  const now = new Date();
  return toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
}

/**
 * Fino-format yung ISO date (`YYYY-MM-DD`) sa madaling basahing petsa gaya ng `"Nov 21, 2026"`.
 *
 * Input: `iso` date string (`YYYY-MM-DD`).
 * Output: formatted PH-locale date string.
 *
 * Edge case: hinahati muna sa `(y, m - 1, d)` numbers imbes na `new Date(iso)` para sa local time
 * mabuo yung date at hindi umatras ng isang araw.
 */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Kino-convert yung 24-hour `HH:mm` (o `HH:mm:ss`) time string sa 12-hour format gaya ng `"9:00 AM"`.
 *
 * Input: optional 24-hour time string.
 * Output: formatted 12-hour string, `''` kapag blank, o yung raw input kapag hindi ma-parse.
 *
 * Edge cases na hawak nito:
 * - Ginagawang `12` yung `0` (12 AM) at `12` (12 PM) gamit yung `h % 12 || 12`.
 * - Safe na binabalik yung original string kapag kulang yung parts o hindi numero.
 */
export function formatTime(time24?: string): string {
  if (!time24) return '';
  const parts = time24.trim().split(':');
  if (parts.length < 2) return time24;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  const minute = String(m).padStart(2, '0');
  return `${hour12}:${minute} ${ampm}`;
}

/**
 * Kino-compute yung Sunday-to-Saturday ISO date range kung saan kabilang yung `refISO` (default ay today).
 *
 * Input: optional reference `YYYY-MM-DD` date.
 * Output: `{ start, end }` kung saan Sunday yung `start` at Saturday yung `end`.
 */
export function isoWeekRange(refISO: string = todayISO()): {
  start: string;
  end: string;
} {
  const [y, m, d] = refISO.split('-').map(Number);
  const ref = new Date(y, m - 1, d);
  // Ibinabawas yung weekday index (0 = Sun .. 6 = Sat) para makuha yung Sunday, tapos +6 para sa Saturday.
  const start = new Date(ref);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: toISODate(start), end: toISODate(end) };
}

/**
 * Gumagawa ng maikling relative label sa pagitan ng `iso` at `refISO`, gaya ng `"today"`, `"1d ago"`, `"3w ago"`, o `"2mo ago"`.
 *
 * Inputs: nakaraang `iso` date at optional reference `refISO` (default ay today).
 * Output: short relative string.
 *
 * Edge case: kapag parehong araw o future date (`days <= 0`), `"today"` yung ibabalik.
 */
export function timeAgo(iso: string, refISO: string = todayISO()): string {
  const [y1, m1, d1] = iso.split('-').map(Number);
  const [y2, m2, d2] = refISO.split('-').map(Number);
  // Nira-round yung day difference para whole days pa rin kahit may DST 23h/25h day.
  const days = Math.round(
    (new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) /
      86400000,
  );
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Gumagawa ng flat Sunday-first calendar grid para sa isang buwan at taon.
 *
 * Inputs: `year` (4-digit) at `month` (`0` = Jan .. `11` = Dec).
 * Output: array ng `YYYY-MM-DD` strings na may leading/trailing `null` padding para laging
 * multiple of 7 (buong 7-column calendar rows).
 */
export function monthCells(year: number, month: number): (string | null)[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    // Mga blankong box bago yung 1st day ng buwan.
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      toISODate(new Date(year, month, i + 1)),
    ),
  ];
  // Dagdagan ng trailing nulls sa dulo para kumpleto yung huling linggo ng calendar grid.
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Inililipat yung `{ year, month }` calendar cursor pasulong o paatras ng `delta` months.
 *
 * Inputs: kasalukuyang `{ year, month }` (0-based month) at integer `delta`.
 * Output: normalized `{ year, month }` (automatic nang tumatalon ng taon kapag lampas Dec o bago Jan).
 */
export function shiftMonthCursor(
  cursor: { year: number; month: number },
  delta: number,
): { year: number; month: number } {
  const d = new Date(cursor.year, cursor.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/**
 * Kino-compute yung readable age ni baby mula birth date hanggang reference date,
 * gaya ng `"2 yrs 4 mos"`, `"1 yr"`, o `"8 mos"`.
 *
 * Inputs: `birthISO` (`YYYY-MM-DD`) at optional `refISO` (default ay today).
 * Output: years/months text, o `'—'` kapag mas huli pa yung birth date kaysa `refISO`.
 *
 * Edge cases na hawak nito:
 * - Nagbabawas ng 1 buwan kapag hindi pa umaabot yung current day-of-month sa mismong birthday day.
 * - Tama yung singular vs. plural (`1 mo` vs `2 mos`, `1 yr` vs `2 yrs`) at eksaktong taon.
 */
export function calcAge(birthISO: string, refISO: string = todayISO()): string {
  const [by, bm, bd] = birthISO.split('-').map(Number);
  const [ry, rm, rd] = refISO.split('-').map(Number);
  let months = (ry - by) * 12 + (rm - bm);
  // Huwag muna bilangin yung kasalukuyang buwan hangga't hindi pa umaabot sa birth day.
  if (rd < bd) months -= 1;
  if (months < 0) return '—';
  if (months < 12) return `${months} mo${months === 1 ? '' : 's'}`;
  const yrs = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0
    ? `${yrs} yr${yrs === 1 ? '' : 's'}`
    : `${yrs} yr${yrs === 1 ? '' : 's'} ${rem} mo${rem === 1 ? '' : 's'}`;
}
