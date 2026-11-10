/** Small date helpers. All demo dates are plain YYYY-MM-DD strings. */

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** ISO date n days from today (negative = past). Keeps demo data fresh. */
export function daysFromNow(n: number): string {
  const now = new Date();
  return toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Formats a 24-hour HH:mm time string into friendly 12-hour format like "9:00 AM". */
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

/** Sunday-to-Saturday ISO range containing refISO (default today). */export function isoWeekRange(refISO: string = todayISO()): {
  start: string;
  end: string;
} {
  const [y, m, d] = refISO.split('-').map(Number);
  const ref = new Date(y, m - 1, d);
  const start = new Date(ref);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: toISODate(start), end: toISODate(end) };
}

/** Short relative label like "today", "1d ago", "3w ago". */
export function timeAgo(iso: string, refISO: string = todayISO()): string {
  const [y1, m1, d1] = iso.split('-').map(Number);
  const [y2, m2, d2] = refISO.split('-').map(Number);
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

/** Month-grid cells (Sunday-first) as ISO dates; null fills blanks. */
export function monthCells(year: number, month: number): (string | null)[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      toISODate(new Date(year, month, i + 1)),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Shift a {year, month} cursor by delta months. */
export function shiftMonthCursor(
  cursor: { year: number; month: number },
  delta: number,
): { year: number; month: number } {
  const d = new Date(cursor.year, cursor.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** Age like "2 yrs 4 mos" or "8 mos". */
export function calcAge(birthISO: string, refISO: string = todayISO()): string {
  const [by, bm, bd] = birthISO.split('-').map(Number);
  const [ry, rm, rd] = refISO.split('-').map(Number);
  let months = (ry - by) * 12 + (rm - bm);
  if (rd < bd) months -= 1;
  if (months < 0) return '—';
  if (months < 12) return `${months} mo${months === 1 ? '' : 's'}`;
  const yrs = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0
    ? `${yrs} yr${yrs === 1 ? '' : 's'}`
    : `${yrs} yr${yrs === 1 ? '' : 's'} ${rem} mo${rem === 1 ? '' : 's'}`;
}
