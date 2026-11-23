/**
 * Reports page (`/reports`).
 *
 * Hawak nito: printable at CSV-exportable immunization reports ng barangay — registry summary (fully/partially immunized at overdue follow-ups),
 * breakdown ng records per purok, doses na naibigay sa napiling date range, at paginated list ng current doses per bata.
 * Dito kayo mag-check pag may bug sa report filters (purok o date range), CSV exports, print/PDF layout, o pagination.
 */
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { childName, extractPurok, PUROKS } from '../data/mockData';
import { useStore } from '../state/store-context';
import { exportAdministeredDoses, exportVaccinationRegister } from '../utils/csv';
import { formatDate, todayISO } from '../utils/dates';
import { directoryPage } from '../utils/childDirectory';
import { reportOverview, weeklyDoseCounts } from '../utils/reportOverview';

type Progress = ReturnType<typeof reportOverview>['progress'];
// Reusable table para sa current recorded doses ng bawat bata (ginagamit sa full print/PDF view).
function ProgressTable({ rows }: { rows: Progress }) {
  return <div className="overflow-x-auto"><table role="table" className="mobile-record-table ui-table w-full min-w-[540px] text-left text-sm print:min-w-0"><caption className="sr-only">Current recorded doses per child</caption><thead role="rowgroup"><tr role="row">{['Child', 'Purok', 'Recorded doses', 'Vaccination status'].map((heading) => <th role="columnheader" key={heading} scope="col">{heading}</th>)}</tr></thead><tbody role="rowgroup">{rows.map(({ child, done, status }) => <tr role="row" key={child.id}><td role="cell" className="font-medium"><span className="mobile-cell-label" aria-hidden="true">Child</span><div className="mobile-cell-value">{childName(child)}</div></td><td role="cell"><span className="mobile-cell-label" aria-hidden="true">Purok</span><div className="mobile-cell-value">{extractPurok(child.purok)}</div></td><td role="cell"><span className="mobile-cell-label" aria-hidden="true">Recorded doses</span><div className="mobile-cell-value">{done}</div></td><td role="cell"><span className="mobile-cell-label" aria-hidden="true">Vaccination status</span><div className="mobile-cell-value">{status}</div></td></tr>)}</tbody></table></div>;
}
const control = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm';

// Nagre-render ng buong immunization report dashboard na may URL-synced filters, CSV exports, at print/PDF mode.
export default function ReportsPage() {
  const { children, records, appointments } = useStore();
  const [params, setParams] = useSearchParams();
  // Default date range: simula ng current month hanggang today; purok at page size naka-sync sa URL params.
  const today = todayISO();
  const defaultFrom = today.slice(0, 7) + '-01';
  const from = params.get('from') ?? defaultFrom;
  const to = params.get('to') ?? today;
  const puroks = [...new Set<string>([...PUROKS, ...children.map((child) => extractPurok(child.purok))])];
  const purok = puroks.find((value) => value === params.get('purok')) ?? 'all';
  const size = [5, 10, 25].find((value) => value === Number(params.get('size'))) ?? 10;
  // Kino-compute via useMemo yung summary stats, purok breakdown, at per-vaccine totals sa napiling date period.
  const report = useMemo(() => reportOverview(children, records, appointments, { purok, from, to }), [children, records, appointments, purok, from, to]);
  const validRange = report.periodValid && to <= today;
  const weeklyDoses = useMemo(() => weeklyDoseCounts(report.periodRecords), [report.periodRecords]);
  const largestWeek = weeklyDoses.reduce((largest, [, count]) => Math.max(largest, count), 1);
  const pagination = directoryPage(report.progress, Number(params.get('page') ?? 1), size);
  const percentage = report.registry.length ? Math.round(report.fully / report.registry.length * 100) : 0;
  const purokQuery = purok === 'all' ? '' : 'purok=' + encodeURIComponent(purok);
  const directoryUrl = '/children' + (purokQuery ? '?' + purokQuery : '');
  const overdueUrl = '/schedule?filter=overdue' + (purokQuery ? '&' + purokQuery : '');
  const currentPurok = purok === 'all' ? 'All puroks' : purok;
  // Ina-update yung URL query params pag nagpalit ng filter o page size, tapos nire-reset sa page 1.
  function update(patch: Record<string, string | number>) {
    const next = new URLSearchParams(params);
    next.delete('page');
    for (const [key, value] of Object.entries(patch)) {
      if (value === 'all' || key === 'size' && value === 10 || key === 'page' && value === 1) next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next, { replace: true });
  }

  return <div className="flex flex-col gap-3 [&_.health-card]:!p-3.5 [&_.health-card>div:first-child]:mb-3">
    {/* Header ng Reports page na may Print / Save as PDF button */}
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="page-title">Reports</h1><p className="mt-1 text-sm text-[var(--color-navy-soft)]">{currentPurok} - Generated {formatDate(today)}</p></div><button type="button" onClick={() => window.print()} className="no-print rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white">Print / Save as PDF</button></div>
    {/* Filter controls para sa purok at date range (naka-hide kapag nagpi-print via `no-print`) */}
    <div className="no-print"><Card><div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
      <label className="min-w-0 text-xs">Purok<select aria-label="Report purok" value={purok} onChange={(event) => update({ purok: event.target.value })} className={`${control} mt-1 block w-full`}><option value="all">All puroks</option>{puroks.map((value) => <option key={value}>{value}</option>)}</select></label>
      <button type="button" onClick={() => update({ purok: 'all', from: defaultFrom, to: today })} className={control}>Reset filters</button>
    </div><p className="mt-3 text-xs text-[var(--color-navy-soft)]">Purok applies to the whole report. Dates apply to doses given and their CSV export.</p></Card></div>
    {/* Current registry summary card: vaccination completion rate, appointment follow-ups, at CSV register export */}
    <section aria-label="Current registry summary">
      <Card title="Current registry summary" action={<button type="button" disabled={report.registry.length === 0} onClick={() => exportVaccinationRegister(report.registry, report.registryRecords)} className={`${control} no-print disabled:opacity-40`}>Export vaccination register (CSV)</button>}>
        <p className="text-sm text-[var(--color-navy-soft)]">As of {formatDate(today)} - {currentPurok}. Uses all recorded vaccination dates.</p>
        <dl className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            ['Registered children', report.registry.length, directoryUrl],
            ['Fully immunized', report.fully, directoryUrl + (purokQuery ? '&' : '?') + 'status=Fully%20immunized'],
            ['Partially immunized', report.partial, directoryUrl + (purokQuery ? '&' : '?') + 'status=Partially%20immunized'],
            ['Children with overdue appointments', new Set(report.overdue.map(appointment => appointment.childId)).size, overdueUrl],
          ].map(([label, count, url]) => (
            <div key={label} className="relative rounded-xl border border-[var(--color-border)] bg-[var(--color-elevated)] p-2.5 hover:border-[var(--color-accent)]">
              <dt className="text-xs text-[var(--color-navy-soft)]"><Link to={String(url)} className="block font-medium underline-offset-2 after:absolute after:inset-0 print:after:hidden hover:underline focus-visible:underline">{label}</Link></dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{count}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm font-medium">{percentage}% fully immunized among registered children</p>
        <div className="mt-4"><h3 className="font-medium">Appointment follow-up</h3><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>Upcoming / due today</dt><dd className="font-semibold">{report.upcoming.length} appointments</dd></div><div className="flex justify-between gap-3"><dt>Overdue appointments</dt><dd className="font-semibold">{report.overdue.length} appointments</dd></div></dl><div className="no-print mt-3 flex flex-wrap gap-3 text-sm"><Link className="underline" to={`/schedule?filter=upcoming${purok !== 'all' ? `&purok=${encodeURIComponent(purok)}` : ''}`}>View upcoming in Schedule</Link></div><p className="mt-2 text-xs text-[var(--color-navy-soft)]">Overdue refers to the appointment date and needs staff follow-up.</p></div>
      </Card>
    </section>
    {/* Table ng current registry counts naka-breakdown per purok */}
    <div className="grid gap-3 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] print:grid-cols-1">
    <Card title="Current records by purok"><div className="overflow-x-auto"><table role="table" className="mobile-record-table ui-table w-full min-w-[460px] text-left text-sm print:min-w-0"><caption className="sr-only">Current registry counts by purok</caption><thead role="rowgroup"><tr role="row">{['Purok', 'Registered', 'Fully immunized', 'Partially immunized', 'Children with overdue appointments'].map((heading) => <th role="columnheader" scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody role="rowgroup">{report.purokSummary.map((row) => <tr role="row" key={row.purok}><td role="cell" className="font-medium"><span className="mobile-cell-label" aria-hidden="true">Purok</span><div className="mobile-cell-value">{row.purok}</div></td><td role="cell"><span className="mobile-cell-label" aria-hidden="true">Registered</span><div className="mobile-cell-value">{row.total}</div></td><td role="cell"><span className="mobile-cell-label" aria-hidden="true">Fully immunized</span><div className="mobile-cell-value">{row.fully}</div></td><td role="cell"><span className="mobile-cell-label" aria-hidden="true">Partially immunized</span><div className="mobile-cell-value">{row.partial}</div></td><td role="cell"><span className="mobile-cell-label" aria-hidden="true">Children with overdue appointments</span><div className="mobile-cell-value">{row.overdueChildren}</div></td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-[var(--color-navy-soft)]">Children with overdue appointments may also appear under either vaccination status.</p></Card>
    {/* Doses na naibigay sa napiling date period, per vaccine, plus period CSV export */}
    <section aria-label="Doses given during the selected period"><Card title="Doses given during the selected period" action={<button type="button" disabled={!validRange || report.periodRecords.length === 0} onClick={() => exportAdministeredDoses(report.periodRecords, report.registry, from, to)} className={`${control} no-print disabled:opacity-40`}>Export period doses (CSV)</button>}>
      <div className="no-print mb-4 grid grid-cols-2 gap-2">
      <label className="min-w-0 text-xs">Doses given from<input type="date" value={from} max={to || today} onChange={(event) => update({ from: event.target.value })} className={`${control} mt-1 block w-full min-w-0`} /></label>
      <label className="min-w-0 text-xs">Doses given to<input type="date" value={to} min={from || undefined} max={today} onChange={(event) => update({ to: event.target.value })} className={`${control} mt-1 block w-full min-w-0`} /></label>
      </div>
      {validRange ? <><p className="mb-3 text-sm">{formatDate(from)} to {formatDate(to)} - {currentPurok} - {report.periodRecords.length} recorded doses</p>{report.perVaccine.length ? <table className="ui-table w-full text-left text-sm"><caption className="sr-only">Recorded doses by vaccine for the selected period</caption><thead><tr><th scope="col">Vaccine</th><th scope="col">Doses given</th></tr></thead><tbody>{report.perVaccine.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.count}</td></tr>)}</tbody><tfoot><tr><th scope="row">Total recorded doses</th><td className="font-semibold">{report.periodRecords.length}</td></tr></tfoot></table> : <EmptyState title="No doses in this period" message="Try another date range or purok." />}</> : <p role="alert" className="text-sm text-red-700">Choose valid dates in order, ending on or before today.</p>}
    </Card></section>
    </div>
    {/* Per-child doses progress table: naka-paginate sa screen pero buo lahat kapag naka-print */}
    {validRange && weeklyDoses.length > 0 && <Card title="Weekly doses given">
      <p className="mb-3 text-xs text-[var(--color-navy-soft)]">Doses recorded within the selected dates, grouped by Monday–Sunday. Only weeks with recorded doses are shown.</p>
      <ul className="max-h-64 space-y-2 overflow-y-auto print:max-h-none print:overflow-visible">
        {weeklyDoses.map(([week, count]) => (
          <li key={week} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-2 text-sm">
            <span>Week of {formatDate(week)}</span>
            <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[var(--color-elevated)]">
              <span className="block h-full rounded-full bg-[var(--color-chart-teal)]" style={{ width: (count / largestWeek * 100) + '%' }} />
            </span>
            <span className="tabular-nums">{count}<span className="sr-only"> {count === 1 ? 'dose' : 'doses'}</span></span>
          </li>
        ))}
      </ul>
    </Card>}
    <Card title={`Current doses per child (${report.progress.length})`}>
      {report.progress.length ? <><ul className="no-print grid gap-3 md:grid-cols-2">
        {pagination.visible.map(({ child, done, status }) => (
          <li key={child.id} className="min-w-0">
            <Link to={'/children/' + encodeURIComponent(child.id) + '?tab=history'} state={{ directory: '/reports' + (params.size ? '?' + params.toString() : '') }}
              className="block h-full rounded-xl border border-[var(--color-border)] p-2.5 hover:border-[var(--color-accent)] hover:bg-[var(--color-elevated)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]">
              <span className="flex flex-wrap items-center justify-between gap-2"><strong>{childName(child)}</strong><span className="text-xs font-medium">{status}</span></span>
              <span className="mt-1 block text-xs text-[var(--color-navy-soft)]">{extractPurok(child.purok)} ? {done} recorded {done === 1 ? 'dose' : 'doses'}</span>
            </Link>
          </li>
        ))}
      </ul><div className="hidden print:block"><ProgressTable rows={report.progress} /></div></> : <EmptyState title="No registered children in this view" message="Choose another purok or reset filters." />}
    </Card>
    {/* Pagination footer para sa per-child table (naka-hide pag print) */}
    {report.progress.length > 0 && <nav aria-label="Report child pagination" className="no-print flex flex-wrap items-center justify-between gap-3 text-sm"><p role="status" aria-live="polite">{pagination.first} - {pagination.last} of {report.progress.length} children</p><div className="flex flex-wrap items-center gap-2"><label htmlFor="report-size" className="text-xs">Children per page</label><select id="report-size" value={size} onChange={(event) => update({ size: Number(event.target.value) })} className={control}>{[5, 10, 25].map((value) => <option key={value}>{value}</option>)}</select><button type="button" disabled={pagination.page === 1} onClick={() => update({ page: pagination.page - 1 })} className={`${control} disabled:opacity-40`}>Previous</button><span className="text-xs">Page {pagination.page} of {pagination.pages}</span><button type="button" disabled={pagination.page === pagination.pages} onClick={() => update({ page: pagination.page + 1 })} className={`${control} disabled:opacity-40`}>Next</button></div></nav>}
  </div>;
}
