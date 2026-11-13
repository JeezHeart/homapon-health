import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { childName, extractPurok, PUROKS } from '../data/mockData';
import { useStore } from '../state/store-context';
import { exportAdministeredDoses, exportVaccinationRegister } from '../utils/csv';
import { formatDate, todayISO } from '../utils/dates';
import { directoryPage } from '../utils/childDirectory';
import { reportOverview } from '../utils/reportOverview';

type Progress = ReturnType<typeof reportOverview>['progress'];
function ProgressTable({ rows }: { rows: Progress }) {
  return <div className="overflow-x-auto"><table role="table" className="mobile-record-table ui-table w-full min-w-[540px] text-left text-sm print:min-w-0"><caption className="sr-only">Current recorded doses per child</caption><thead role="rowgroup"><tr role="row">{['Child', 'Purok', 'Recorded doses', 'Vaccination status'].map((heading) => <th role="columnheader" key={heading} scope="col">{heading}</th>)}</tr></thead><tbody role="rowgroup">{rows.map(({ child, done, status }) => <tr role="row" key={child.id}><td role="cell" className="font-medium"><span className="mobile-cell-label" aria-hidden="true">Child</span><div className="mobile-cell-value">{childName(child)}</div></td><td role="cell"><span className="mobile-cell-label" aria-hidden="true">Purok</span><div className="mobile-cell-value">{extractPurok(child.purok)}</div></td><td role="cell"><span className="mobile-cell-label" aria-hidden="true">Recorded doses</span><div className="mobile-cell-value">{done}</div></td><td role="cell"><span className="mobile-cell-label" aria-hidden="true">Vaccination status</span><div className="mobile-cell-value">{status}</div></td></tr>)}</tbody></table></div>;
}
const control = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm';

export default function ReportsPage() {
  const { children, records, appointments } = useStore();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const defaultFrom = today.slice(0, 7) + '-01';
  const from = params.get('from') ?? defaultFrom;
  const to = params.get('to') ?? today;
  const puroks = [...new Set<string>([...PUROKS, ...children.map((child) => extractPurok(child.purok))])];
  const purok = puroks.find((value) => value === params.get('purok')) ?? 'all';
  const size = [5, 10, 25].find((value) => value === Number(params.get('size'))) ?? 10;
  const report = useMemo(() => reportOverview(children, records, appointments, { purok, from, to }), [children, records, appointments, purok, from, to]);
  const validRange = report.periodValid && to <= today;
  const pagination = directoryPage(report.progress, Number(params.get('page') ?? 1), size);
  const percentage = report.registry.length ? Math.round(report.fully / report.registry.length * 100) : 0;
  const scheduleSupportsPurok = purok === 'all' || PUROKS.some((value) => value === purok);
  const currentPurok = purok === 'all' ? 'All puroks' : purok;
  function update(patch: Record<string, string | number>) {
    const next = new URLSearchParams(params);
    next.delete('page');
    for (const [key, value] of Object.entries(patch)) {
      if (value === 'all' || key === 'size' && value === 10 || key === 'page' && value === 1) next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next, { replace: true });
  }

  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="page-title">Reports</h1><p className="mt-1 text-sm text-[var(--color-navy-soft)]">{currentPurok} - Generated {formatDate(today)}</p></div><button type="button" onClick={() => window.print()} className="no-print rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white">Print / Save as PDF</button></div>
    <div className="no-print"><Card><div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_180px_180px_auto]">
      <label className="min-w-0 text-xs">Purok<select aria-label="Report purok" value={purok} onChange={(event) => update({ purok: event.target.value })} className={`${control} mt-1 block w-full`}><option value="all">All puroks</option>{puroks.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="min-w-0 text-xs">Doses given from<input type="date" value={from} max={to || today} onChange={(event) => update({ from: event.target.value })} className={`${control} mt-1 block w-full min-w-0`} /></label>
      <label className="min-w-0 text-xs">Doses given to<input type="date" value={to} min={from || undefined} max={today} onChange={(event) => update({ to: event.target.value })} className={`${control} mt-1 block w-full min-w-0`} /></label>
      <button type="button" onClick={() => update({ purok: 'all', from: defaultFrom, to: today })} className={control}>Reset filters</button>
    </div><p className="mt-3 text-xs text-[var(--color-navy-soft)]">Purok applies to the whole report. Dates apply to doses given and their CSV export.</p></Card></div>
    <section aria-label="Current registry summary">
      <Card title="Current registry summary" action={<button type="button" disabled={report.registry.length === 0} onClick={() => exportVaccinationRegister(report.registry, report.registryRecords)} className={`${control} no-print disabled:opacity-40`}>Export vaccination register (CSV)</button>}>
        <p className="text-sm text-[var(--color-navy-soft)]">As of {formatDate(today)} - {currentPurok}. Uses all recorded vaccination dates.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><h3 className="font-medium">Recorded vaccination completion</h3><dl className="mt-3 space-y-2 text-sm">{[['Registered children', report.registry.length], ['Fully immunized', report.fully], ['Partially immunized', report.partial]].map(([label, count]) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd className="font-semibold">{count}</dd></div>)}</dl><p className="mt-3 text-sm font-medium">{percentage}% fully immunized among registered children</p><p className="mt-1 text-xs text-[var(--color-navy-soft)]">Percentages use only children registered in this system.</p></div>
        <div><h3 className="font-medium">Appointment follow-up</h3><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>Upcoming / due today</dt><dd className="font-semibold">{report.upcoming.length} appointments</dd></div><div className="flex justify-between gap-3"><dt>Overdue appointments</dt><dd className="font-semibold">{report.overdue.length} appointments</dd></div><div className="flex justify-between gap-3"><dt>Children with overdue appointments</dt><dd className="font-semibold">{new Set(report.overdue.map((appointment) => appointment.childId)).size}</dd></div></dl>{scheduleSupportsPurok && <div className="no-print mt-3 flex flex-wrap gap-3 text-sm"><Link className="underline" to={`/schedule?filter=upcoming${purok !== 'all' ? `&purok=${encodeURIComponent(purok)}` : ''}`}>View upcoming in Schedule</Link><Link className="underline" to={`/schedule?filter=overdue${purok !== 'all' ? `&purok=${encodeURIComponent(purok)}` : ''}`}>View overdue in Schedule</Link></div>}<p className="mt-2 text-xs text-[var(--color-navy-soft)]">Overdue refers to the appointment date and needs staff follow-up.</p></div></div>
      </Card>
    </section>
    <Card title="Current records by purok"><div className="overflow-x-auto"><table role="table" className="mobile-record-table ui-table w-full min-w-[650px] text-left text-sm print:min-w-0"><caption className="sr-only">Current registry counts by purok</caption><thead role="rowgroup"><tr role="row">{['Purok', 'Registered', 'Fully immunized', 'Partially immunized', 'Children with overdue appointments'].map((heading) => <th role="columnheader" scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody role="rowgroup">{report.purokSummary.map((row) => <tr role="row" key={row.purok}><td role="cell" className="font-medium"><span className="mobile-cell-label" aria-hidden="true">Purok</span><div className="mobile-cell-value">{row.purok}</div></td><td role="cell"><span className="mobile-cell-label" aria-hidden="true">Registered</span><div className="mobile-cell-value">{row.total}</div></td><td role="cell"><span className="mobile-cell-label" aria-hidden="true">Fully immunized</span><div className="mobile-cell-value">{row.fully}</div></td><td role="cell"><span className="mobile-cell-label" aria-hidden="true">Partially immunized</span><div className="mobile-cell-value">{row.partial}</div></td><td role="cell"><span className="mobile-cell-label" aria-hidden="true">Children with overdue appointments</span><div className="mobile-cell-value">{row.overdueChildren}</div></td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-[var(--color-navy-soft)]">Children with overdue appointments may also appear under either vaccination status.</p></Card>
    <section aria-label="Doses given during the selected period"><Card title="Doses given during the selected period" action={<button type="button" disabled={!validRange || report.periodRecords.length === 0} onClick={() => exportAdministeredDoses(report.periodRecords, report.registry, from, to)} className={`${control} no-print disabled:opacity-40`}>Export period doses (CSV)</button>}>
      {validRange ? <><p className="mb-3 text-sm">{formatDate(from)} to {formatDate(to)} - {currentPurok} - {report.periodRecords.length} recorded doses</p>{report.perVaccine.length ? <table className="ui-table w-full text-left text-sm"><caption className="sr-only">Recorded doses by vaccine for the selected period</caption><thead><tr><th scope="col">Vaccine</th><th scope="col">Doses given</th></tr></thead><tbody>{report.perVaccine.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.count}</td></tr>)}</tbody><tfoot><tr><th scope="row">Total recorded doses</th><td className="font-semibold">{report.periodRecords.length}</td></tr></tfoot></table> : <EmptyState title="No doses in this period" message="Try another date range or purok." />}</> : <p role="alert" className="text-sm text-red-700">Choose valid dates in order, ending on or before today.</p>}
    </Card></section>
    <Card title={`Current doses per child (${report.progress.length})`}>
      {report.progress.length ? <><div className="no-print"><ProgressTable rows={pagination.visible} /></div><div className="hidden print:block"><ProgressTable rows={report.progress} /></div></> : <EmptyState title="No registered children in this view" message="Choose another purok or reset filters." />}
    </Card>
    {report.progress.length > 0 && <nav aria-label="Report child pagination" className="no-print flex flex-wrap items-center justify-between gap-3 text-sm"><p role="status" aria-live="polite">{pagination.first} - {pagination.last} of {report.progress.length} children</p><div className="flex flex-wrap items-center gap-2"><label htmlFor="report-size" className="text-xs">Children per page</label><select id="report-size" value={size} onChange={(event) => update({ size: Number(event.target.value) })} className={control}>{[5, 10, 25].map((value) => <option key={value}>{value}</option>)}</select><button type="button" disabled={pagination.page === 1} onClick={() => update({ page: pagination.page - 1 })} className={`${control} disabled:opacity-40`}>Previous</button><span className="text-xs">Page {pagination.page} of {pagination.pages}</span><button type="button" disabled={pagination.page === pagination.pages} onClick={() => update({ page: pagination.page + 1 })} className={`${control} disabled:opacity-40`}>Next</button></div></nav>}
  </div>;
}
