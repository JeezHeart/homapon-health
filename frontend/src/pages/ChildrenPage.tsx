import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import ChildForm from '../components/ChildForm';
import Dialog from '../components/Dialog';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import { childName, extractPurok, PUROKS } from '../data/mockData';
import { vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { childDirectoryRows, directoryPage } from '../utils/childDirectory';
import type { DirectorySchedule, VaccinationStatus } from '../utils/childDirectory';
import { exportChildrenList } from '../utils/csv';
import { calcAge, formatDate, formatTime } from '../utils/dates';

const selectClass = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm';

export default function ChildrenPage() {
  const { children, records, appointments, addChild } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [registering, setRegistering] = useState(false);
  const query = searchParams.get('q') ?? '';
  const rawStatus = searchParams.get('status');
  const status: VaccinationStatus | 'all' = rawStatus === 'Fully immunized' || rawStatus === 'Partially immunized' ? rawStatus : 'all';
  const rawSchedule = searchParams.get('schedule');
  const schedule: DirectorySchedule = rawSchedule === 'upcoming' || rawSchedule === 'overdue' ? rawSchedule : rawStatus === 'Overdue' ? 'overdue' : 'all';
  const rawPurok = searchParams.get('purok');
  const purok = PUROKS.find((value) => value === rawPurok) ?? 'all';
  const size = [5, 10, 25].find((value) => value === Number(searchParams.get('size'))) ?? 10;
  const requestedPage = Number(searchParams.get('page') ?? 1);
  const filtered = useMemo(() => childDirectoryRows(children, records, appointments, { query, vaccination: status, schedule, purok }), [children, records, appointments, query, status, schedule, purok]);
  const pagination = directoryPage(filtered, requestedPage, size);
  const activeFilters = Boolean(query || status !== 'all' || schedule !== 'all' || purok !== 'all');
  const returnTo = `/children${searchParams.size ? `?${searchParams.toString()}` : ''}`;

  function update(patch: Partial<{ q: string; status: string; schedule: string; purok: string; page: number; size: number }>) {
    const values = { q: query, status, schedule, purok, size, page: 1, ...patch };
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(values)) {
      if (value === '' || value === 'all' || key === 'page' && value === 1 || key === 'size' && value === 10) next.delete(key);
      else next.set(key, String(value));
    }
    setSearchParams(next, { replace: true });
  }

  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="page-title">Child Records</h1><p className="mt-1 text-sm text-[var(--color-navy-soft)]">{filtered.length} of {children.length} children</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" title="Export all filtered children, across all pages" onClick={() => exportChildrenList(filtered.map((row) => row.child), appointments, records)} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium">Export CSV</button>
        <button type="button" onClick={() => setRegistering(true)} className="rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-dark)]">Register child</button>
      </div>
    </div>
    <Card>
      <div className="flex flex-col items-start gap-3 xl:flex-row">
        <input type="search" aria-label="Search by child or guardian name" placeholder="Search child or guardian" value={query} onChange={(event) => update({ q: event.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <div className="flex shrink-0 flex-wrap gap-2">
          <select aria-label="Filter by purok" className={selectClass} value={purok} onChange={(event) => update({ purok: event.target.value })}><option value="all">All puroks</option>{PUROKS.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <select aria-label="Filter by vaccination status" className={selectClass} value={status} onChange={(event) => update({ status: event.target.value })}><option value="all">All vaccination records</option><option>Fully immunized</option><option>Partially immunized</option></select>
          <select aria-label="Filter by appointment status" className={selectClass} value={schedule} onChange={(event) => update({ schedule: event.target.value })}><option value="all">All appointments</option><option value="upcoming">Upcoming / due today</option><option value="overdue">Overdue appointments</option></select>
          {activeFilters && <button type="button" onClick={() => update({ q: '', status: 'all', schedule: 'all', purok: 'all' })} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">Clear filters</button>}
        </div>
      </div>
      <p className="mt-3 text-xs text-[var(--color-navy-soft)]">Vaccination status uses recorded doses; overdue refers to appointment dates.</p>
    </Card>
    {filtered.length === 0 ? <EmptyState title={children.length ? 'No matching records' : 'No children registered'} message={children.length ? 'Change your search or clear the filters.' : 'Register a child to start the registry.'} /> : <>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="ui-table min-w-[820px] text-left">
          <caption className="sr-only">Child directory</caption>
          <thead><tr>{['Child', 'Guardian', 'Purok', 'Vaccination status', 'Next vaccination', 'Action'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{pagination.visible.map(({ child, vaccination, next }) => <tr key={child.id}>
            <td><Link to={`/children/${child.id}`} state={{ directory: returnTo }} className="flex items-center gap-3"><span className="child-avatar" aria-hidden="true">{child.firstName.charAt(0)}{child.lastName.charAt(0)}</span><span><span className="block font-medium">{childName(child)}</span><span className="block text-xs text-[var(--color-navy-soft)]">{calcAge(child.birthDate)}</span></span></Link></td>
            <td><span className="block">{child.guardian}</span><span className="block text-xs text-[var(--color-navy-soft)]">{child.guardianMobile}</span></td>
            <td className="whitespace-nowrap">{extractPurok(child.purok)}</td>
            <td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${vaccination === 'Fully immunized' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>{vaccination}</span></td>
            <td>{next ? <div className="space-y-1"><span className="block text-xs">{vaccineById(next.vaccineId)?.shortName ?? next.vaccineId} · Dose {next.doseNumber} · {formatDate(next.scheduledDate)}{next.scheduledTime ? ` · ${formatTime(next.scheduledTime)}` : ''}</span><StatusBadge status={next.status} /></div> : <span className="text-xs text-[var(--color-navy-soft)]">No appointment booked</span>}</td>
            <td><Link to={`/children/${child.id}`} state={{ directory: returnTo }} aria-label={`View record for ${childName(child)}`} className="inline-flex whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50">View record</Link></td>
          </tr>)}</tbody>
        </table>
      </div>
      <nav aria-label="Child directory pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p role="status" aria-live="polite" className="text-[var(--color-navy-soft)]">{pagination.first}–{pagination.last} of {filtered.length} children</p>
        <div className="flex flex-wrap items-center gap-2"><label htmlFor="directory-size" className="text-xs">Rows per page</label><select id="directory-size" value={size} onChange={(event) => update({ size: Number(event.target.value) })} className={selectClass}>{[5, 10, 25].map((value) => <option key={value}>{value}</option>)}</select><button type="button" disabled={pagination.page === 1} onClick={() => update({ page: pagination.page - 1 })} className="rounded-xl border border-slate-300 px-3 py-2 disabled:opacity-40">Previous</button><span className="text-xs">Page {pagination.page} of {pagination.pages}</span><button type="button" disabled={pagination.page === pagination.pages} onClick={() => update({ page: pagination.page + 1 })} className="rounded-xl border border-slate-300 px-3 py-2 disabled:opacity-40">Next</button></div>
      </nav>
    </>}
    {registering && <Dialog title="Register child" onClose={() => setRegistering(false)}><ChildForm onSubmit={async (data) => { await addChild(data); setRegistering(false); }} onCancel={() => setRegistering(false)} /></Dialog>}
  </div>;
}
