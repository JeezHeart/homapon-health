/**
 * Child Records directory page (`/children`).
 *
 * Hawak nito: compact searchable directory table na may URL-synced filtering (pangalan ng bata/guardian, purok,
 * vaccination completion, at appointment schedule), click-anywhere-on-row child profile,
 * CSV export ng naka-filter na listahan, at yung "Register child" modal.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import KpiCard from '../components/KpiCard';
import ChildForm from '../components/ChildForm';
import Dialog from '../components/Dialog';
import EmptyState from '../components/EmptyState';
import FadeContent from '../components/FadeContent';
import StatusBadge from '../components/StatusBadge';
import { childName, completedDoses, extractPurok, PUROKS } from '../data/mockData';
import { REQUIRED_DOSES, vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { AGE_GROUPS, childDirectoryRows, directoryPage } from '../utils/childDirectory';
import type { DirectorySchedule, VaccinationStatus } from '../utils/childDirectory';
import { exportChildrenList } from '../utils/csv';
import { calcAge, formatDate, formatTime } from '../utils/dates';

const selectClass = 'clinic-control';

// Nagpapakita ng compact child directory table kung saan pwedeng i-click ang kahit anong row para buksan ang child profile.
export default function ChildrenPage() {
  const { children, records, appointments, addChild } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [registering, setRegistering] = useState(false);
  const navigate = useNavigate();
  // Binabasa at vina-validate dito lahat ng active filters mula sa URL query params para hindi mawala ang state pag nag-Back navigation.
  const query = searchParams.get('q') ?? '';
  const rawStatus = searchParams.get('status');
  const status: VaccinationStatus | 'all' = rawStatus === 'Fully immunized' || rawStatus === 'Partially immunized' ? rawStatus : 'all';
  const rawSchedule = searchParams.get('schedule');
  const schedule: DirectorySchedule = rawSchedule === 'upcoming' || rawSchedule === 'overdue' ? rawSchedule : rawStatus === 'Overdue' ? 'overdue' : 'all';
  const puroks = [...new Set<string>([...PUROKS, ...children.map(child => extractPurok(child.purok))])];
  const rawPurok = searchParams.get('purok');
  const ageGroup = AGE_GROUPS.find(group => group.id === searchParams.get('age'))?.id;
  const purok = puroks.find((value) => value === rawPurok) ?? 'all';
  const size = [5, 10, 25].find((value) => value === Number(searchParams.get('size'))) ?? 10;
  const requestedPage = Number(searchParams.get('page') ?? 1);
  // Kino-compute yung naka-filter na rows at current page slice gamit yung pure helpers sa utils/childDirectory.
  const matchingChildren = useMemo(
    () => childDirectoryRows(children, records, appointments, { query, schedule, purok, ageGroup }),
    [children, records, appointments, query, schedule, purok, ageGroup],
  );
  const fullyImmunized = matchingChildren.filter(row => row.vaccination === 'Fully immunized').length;
  const filtered = status === 'all' ? matchingChildren : matchingChildren.filter(row => row.vaccination === status);
  const pagination = directoryPage(filtered, requestedPage, size);
  const activeFilters = Boolean(query || status !== 'all' || schedule !== 'all' || purok !== 'all' || ageGroup);
  const returnTo = `/children${searchParams.size ? `?${searchParams.toString()}` : ''}`;

  // Ina-update yung URL search params tuwing magpapalit ng filter o page; tinatanggal yung default values para malinis tingnan ang URL.
  function update(patch: Partial<{ q: string; status: string; schedule: string; purok: string; age: string; page: number; size: number }>) {
    const values = { q: query, status, schedule, purok, age: ageGroup ?? 'all', size, page: 1, ...patch };
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(values)) {
      if (value === '' || value === 'all' || key === 'page' && value === 1 || key === 'size' && value === 10) next.delete(key);
      else next.set(key, String(value));
    }
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Child Records</h1>
      <section aria-label="Child records totals" className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        <KpiCard label="Registered children" count={matchingChildren.length} icon="children" description="Matching directory filters"
          selected={status === 'all'} onSelect={() => update({ status: 'all' })} />
        <KpiCard label="Fully immunized" count={fullyImmunized} icon="records" description="All required doses recorded"
          selected={status === 'Fully immunized'} onSelect={() => update({ status: 'Fully immunized' })} />
        <KpiCard label="Partially immunized" count={matchingChildren.length - fullyImmunized} icon="review" description="Required dose records incomplete"
          selected={status === 'Partially immunized'} onSelect={() => update({ status: 'Partially immunized' })} />
      </section>
      {/* Compact search & filter bar */}
      <div className="health-card !p-3.5">
        <div className="flex flex-col items-start gap-2.5 xl:flex-row">
          <input
            type="search"
            aria-label="Search by child or guardian name"
            placeholder="Search child or guardian"
            value={query}
            onChange={(event) => update({ q: event.target.value })}
            className="clinic-control w-full"
          />
          <div className="directory-filters flex shrink-0 flex-wrap gap-2">
            <select aria-label="Filter by purok" className={selectClass} value={purok} onChange={(event) => update({ purok: event.target.value })}>
              <option value="all">All puroks</option>
              {puroks.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select aria-label="Filter by vaccination status" className={selectClass} value={status} onChange={(event) => update({ status: event.target.value })}>
              <option value="all">All vaccination records</option>
              <option>Fully immunized</option>
              <option>Partially immunized</option>
            </select>
            <select aria-label="Filter by appointment status" className={selectClass} value={schedule} onChange={(event) => update({ schedule: event.target.value })}>
              <option value="all">All appointments</option>
              <option value="upcoming">Upcoming / due today</option>
              <option value="overdue">Overdue appointments</option>
            </select>
            <select aria-label="Filter by age group" className={selectClass} value={ageGroup ?? 'all'} onChange={(event) => update({ age: event.target.value })}>
              <option value="all">All ages</option>
              {AGE_GROUPS.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
            </select>
            {activeFilters && (
              <button
                type="button"
                onClick={() => update({ q: '', status: 'all', schedule: 'all', purok: 'all', age: 'all' })}
                className="clinic-control"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--color-navy-soft)]">
            Vaccination status uses recorded doses; overdue refers to appointment dates.
          </p>
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            <button type="button" title="Export all filtered children, across all pages"
              onClick={() => exportChildrenList(filtered.map((row) => row.child), appointments, records)}
              className="clinic-control font-medium">Export CSV</button>
            <button type="button" onClick={() => setRegistering(true)}
              className="min-h-10 rounded-xl bg-[var(--color-accent)] px-3.5 py-1.5 text-sm font-semibold text-[var(--color-on-accent)] hover:bg-[var(--color-accent-dark)]">
              Register child
            </button>
          </div>
        </div>
      </div>

      {/* Compact 5-column click-to-open directory table */}
      <FadeContent className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <EmptyState
            title={children.length ? 'No matching records' : 'No children registered'}
            message={children.length ? 'Change your search or clear the filters.' : 'Register a child to start the registry.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table role="table" className="mobile-record-table ui-table w-full text-left">
                <caption className="sr-only">Child directory</caption>
                <thead role="rowgroup">
                  <tr role="row">
                    {['Child', 'Guardian', 'Purok', 'Vaccination status', 'Next vaccination'].map((label) => (
                      <th role="columnheader" key={label} scope="col" className="!px-3 !py-1.5">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {pagination.visible.map(({ child, vaccination, next }) => {
                    const done = completedDoses(records, child.id);
                    const pct = Math.min(100, Math.round((done / REQUIRED_DOSES) * 100));
                    return (
                      <tr
                        role="row"
                        key={child.id}
                        onClick={() => navigate(`/children/${child.id}`, { state: { directory: returnTo } })}
                        className="cursor-pointer hover:bg-[var(--color-elevated)] focus-within:bg-[var(--color-elevated)]"
                      >
                        <td role="cell" className="!px-3 !py-1.5">
                          <span className="mobile-cell-label" aria-hidden="true">Child</span>
                          <div className="mobile-cell-value">
                            <Link
                              to={`/children/${child.id}`}
                              state={{ directory: returnTo }}
                              onClick={event => event.stopPropagation()}
                              className="group flex items-center gap-2.5 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                            >
                              <span className="child-avatar" aria-hidden="true">
                                {child.firstName.charAt(0)}{child.lastName.charAt(0)}
                              </span>
                              <span>
                                <span className="block font-semibold text-[var(--color-navy)] group-hover:underline">
                                  {childName(child)}
                                </span>
                                <span className="block text-xs text-[var(--color-navy-soft)]">
                                  {calcAge(child.birthDate)}
                                </span>
                              </span>
                            </Link>
                          </div>
                        </td>
                        <td role="cell" className="!px-3 !py-1.5">
                          <span className="mobile-cell-label" aria-hidden="true">Guardian</span>
                          <div className="mobile-cell-value">
                            <span className="block font-medium">{child.guardian}</span>
                            <span className="block text-xs text-[var(--color-navy-soft)]">{child.guardianMobile}</span>
                          </div>
                        </td>
                        <td role="cell" className="!px-3 !py-1.5 whitespace-nowrap">
                          <span className="mobile-cell-label" aria-hidden="true">Purok</span>
                          <div className="mobile-cell-value">{extractPurok(child.purok)}</div>
                        </td>
                        <td role="cell" className="!px-3 !py-1.5">
                          <span className="mobile-cell-label" aria-hidden="true">Vaccination status</span>
                          <div className="mobile-cell-value">
                            <div className="space-y-1">
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${vaccination === 'Fully immunized' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>
                                {vaccination}
                              </span>
                              <div className="flex items-center gap-2 text-xs text-[var(--color-navy-soft)]">
                                <span className="font-medium">{done}/{REQUIRED_DOSES}</span>
                                <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--color-border)]">
                                  <span className="block h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td role="cell" className="!px-3 !py-1.5">
                          <span className="mobile-cell-label" aria-hidden="true">Next vaccination</span>
                          <div className="mobile-cell-value">
                            <div className="flex items-center justify-between gap-3">
                              {next ? (
                                <div className="space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs font-semibold text-[var(--color-navy)]">
                                      {vaccineById(next.vaccineId)?.shortName ?? next.vaccineId} · Dose {next.doseNumber}
                                    </span>
                                    <StatusBadge status={next.status} />
                                  </div>
                                  <span className="block text-xs text-[var(--color-navy-soft)]">
                                    {formatDate(next.scheduledDate)}
                                    {next.scheduledTime ? ` · ${formatTime(next.scheduledTime)}` : ''}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-[var(--color-navy-soft)]">No appointment booked</span>
                              )}
                              <span aria-hidden="true" className="hidden shrink-0 text-sm text-[var(--color-navy-soft)] lg:inline">›</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Compact pagination footer na naka-sync sa `page` at `size` URL params */}
            <nav aria-label="Child directory pagination" className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <p role="status" aria-live="polite" className="text-[var(--color-navy-soft)]">
                {pagination.first}–{pagination.last} of {filtered.length} children
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="directory-size" className="text-xs">Rows per page</label>
                <select id="directory-size" value={size} onChange={(event) => update({ size: Number(event.target.value) })} className={selectClass}>
                  {[5, 10, 25].map((value) => <option key={value}>{value}</option>)}
                </select>
                <button type="button" disabled={pagination.page === 1} onClick={() => update({ page: pagination.page - 1 })} className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40">Previous</button>
                <span className="text-xs">Page {pagination.page} of {pagination.pages}</span>
                <button type="button" disabled={pagination.page === pagination.pages} onClick={() => update({ page: pagination.page + 1 })} className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40">Next</button>
              </div>
            </nav>
          </>
        )}
      </FadeContent>

      {/* Modal dialog para sa pag-register ng bagong bata */}
      {registering && (
        <Dialog title="Register child" onClose={() => setRegistering(false)}>
          <ChildForm
            onSubmit={async (data) => {
              await addChild(data);
              setRegistering(false);
            }}
            onCancel={() => setRegistering(false)}
          />
        </Dialog>
      )}
    </div>
  );
}
