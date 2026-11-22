/**
 * Child Records directory page (`/children`).
 *
 * Hawak nito: searchable at URL-synced filtering (pangalan ng bata/guardian, purok, vaccination completion, at appointment schedule),
 * paginated table ng mga registered na bata na may dose progress at click-to-open Quick-View card,
 * CSV export ng naka-filter na listahan, at yung "Register child" modal.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import ChildForm from '../components/ChildForm';
import Dialog from '../components/Dialog';
import EmptyState from '../components/EmptyState';
import FadeContent from '../components/FadeContent';
import StatusBadge from '../components/StatusBadge';
import { childName, completedDoses, extractPurok, PUROKS } from '../data/mockData';
import { REQUIRED_DOSES, vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { childDirectoryRows, directoryPage } from '../utils/childDirectory';
import type { DirectorySchedule, VaccinationStatus } from '../utils/childDirectory';
import { exportChildrenList } from '../utils/csv';
import { calcAge, formatDate, formatTime } from '../utils/dates';

const selectClass = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm';

// Nagpapakita ng filterable na child directory na may X/14 progress, clean next-visit layout, at click-to-open Quick-View card.
export default function ChildrenPage() {
  const { children, records, appointments, addChild } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [registering, setRegistering] = useState(false);
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  // Binabasa at vina-validate dito lahat ng active filters mula sa URL query params para hindi mawala ang state pag nag-Back navigation.
  const query = searchParams.get('q') ?? '';
  const rawStatus = searchParams.get('status');
  const status: VaccinationStatus | 'all' = rawStatus === 'Fully immunized' || rawStatus === 'Partially immunized' ? rawStatus : 'all';
  const rawSchedule = searchParams.get('schedule');
  const schedule: DirectorySchedule = rawSchedule === 'upcoming' || rawSchedule === 'overdue' ? rawSchedule : rawStatus === 'Overdue' ? 'overdue' : 'all';
  const rawPurok = searchParams.get('purok');
  const purok = PUROKS.find((value) => value === rawPurok) ?? 'all';
  const size = [5, 10, 25].find((value) => value === Number(searchParams.get('size'))) ?? 10;
  const requestedPage = Number(searchParams.get('page') ?? 1);
  // Kino-compute yung naka-filter na rows at current page slice gamit yung pure helpers sa utils/childDirectory.
  const filtered = useMemo(
    () => childDirectoryRows(children, records, appointments, { query, vaccination: status, schedule, purok }),
    [children, records, appointments, query, status, schedule, purok],
  );
  const pagination = directoryPage(filtered, requestedPage, size);
  const activeFilters = Boolean(query || status !== 'all' || schedule !== 'all' || purok !== 'all');
  const returnTo = `/children${searchParams.size ? `?${searchParams.toString()}` : ''}`;
  const quickViewRow = useMemo(
    () => (quickViewId ? filtered.find((row) => row.child.id === quickViewId) ?? null : null),
    [filtered, quickViewId],
  );

  // Ina-update yung URL search params tuwing magpapalit ng filter o page; tinatanggal yung default values para malinis tingnan ang URL.
  function update(patch: Partial<{ q: string; status: string; schedule: string; purok: string; page: number; size: number }>) {
    const values = { q: query, status, schedule, purok, size, page: 1, ...patch };
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(values)) {
      if (value === '' || value === 'all' || key === 'page' && value === 1 || key === 'size' && value === 10) next.delete(key);
      else next.set(key, String(value));
    }
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header ng page: count ng nag-match na bata, CSV export, at Register child button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Child Records</h1>
          <p className="mt-1 text-sm text-[var(--color-navy-soft)]">
            {filtered.length} of {children.length} children · click a child's name for a quick summary
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            title="Export all filtered children, across all pages"
            onClick={() => exportChildrenList(filtered.map((row) => row.child), appointments, records)}
            className="rounded-xl border border-slate-300 bg-[var(--color-card)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--color-elevated)]"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setRegistering(true)}
            className="rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-dark)]"
          >
            Register child
          </button>
        </div>
      </div>

      {/* Search bar at mga filter dropdowns para sa purok, vaccination status, at appointment schedule */}
      <Card>
        <div className="flex flex-col items-start gap-3 xl:flex-row">
          <input
            type="search"
            aria-label="Search by child or guardian name"
            placeholder="Search child or guardian"
            value={query}
            onChange={(event) => update({ q: event.target.value })}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="directory-filters flex shrink-0 flex-wrap gap-2">
            <select aria-label="Filter by purok" className={selectClass} value={purok} onChange={(event) => update({ purok: event.target.value })}>
              <option value="all">All puroks</option>
              {PUROKS.map((value) => <option key={value} value={value}>{value}</option>)}
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
            {activeFilters && (
              <button
                type="button"
                onClick={() => update({ q: '', status: 'all', schedule: 'all', purok: 'all' })}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-[var(--color-elevated)]"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--color-navy-soft)]">
          Vaccination status uses recorded doses; overdue refers to appointment dates.
        </p>
      </Card>

      {/* Directory table at pagination controls (o EmptyState kapag walang nag-match na bata) */}
      <FadeContent className="flex flex-col gap-4">
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
                    {['Child', 'Guardian', 'Purok', 'Vaccination status', 'Next vaccination', 'Action'].map((label) => (
                      <th role="columnheader" key={label} scope="col" className="!px-3">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {pagination.visible.map(({ child, vaccination, next }) => {
                    const done = completedDoses(records, child.id);
                    const pct = Math.min(100, Math.round((done / REQUIRED_DOSES) * 100));
                    return (
                      <tr role="row" key={child.id} className="hover:bg-[var(--color-elevated)] focus-within:bg-[var(--color-elevated)]">
                        <td role="cell" className="!px-3">
                          <span className="mobile-cell-label" aria-hidden="true">Child</span>
                          <div className="mobile-cell-value">
                            <button
                              type="button"
                              onClick={() => setQuickViewId(child.id)}
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
                            </button>
                          </div>
                        </td>
                        <td role="cell" className="!px-3">
                          <span className="mobile-cell-label" aria-hidden="true">Guardian</span>
                          <div className="mobile-cell-value">
                            <span className="block font-medium">{child.guardian}</span>
                            <span className="block text-xs text-[var(--color-navy-soft)]">{child.guardianMobile}</span>
                          </div>
                        </td>
                        <td role="cell" className="!px-3 whitespace-nowrap">
                          <span className="mobile-cell-label" aria-hidden="true">Purok</span>
                          <div className="mobile-cell-value">{extractPurok(child.purok)}</div>
                        </td>
                        <td role="cell" className="!px-3">
                          <span className="mobile-cell-label" aria-hidden="true">Vaccination status</span>
                          <div className="mobile-cell-value">
                            <div className="space-y-1.5">
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
                        <td role="cell" className="!px-3">
                          <span className="mobile-cell-label" aria-hidden="true">Next vaccination</span>
                          <div className="mobile-cell-value">
                            {next ? (
                              <div className="space-y-1">
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
                          </div>
                        </td>
                        <td role="cell" className="!px-3">
                          <span className="mobile-cell-label" aria-hidden="true">Action</span>
                          <div className="mobile-cell-value">
                            <Link
                              to={`/children/${child.id}`}
                              state={{ directory: returnTo }}
                              aria-label={`View record for ${childName(child)}`}
                              className="inline-flex whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                            >
                              View record
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination footer na naka-sync sa `page` at `size` URL params */}
            <nav aria-label="Child directory pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p role="status" aria-live="polite" className="text-[var(--color-navy-soft)]">
                {pagination.first}–{pagination.last} of {filtered.length} children
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="directory-size" className="text-xs">Rows per page</label>
                <select id="directory-size" value={size} onChange={(event) => update({ size: Number(event.target.value) })} className={selectClass}>
                  {[5, 10, 25].map((value) => <option key={value}>{value}</option>)}
                </select>
                <button type="button" disabled={pagination.page === 1} onClick={() => update({ page: pagination.page - 1 })} className="rounded-xl border border-slate-300 px-3 py-2 disabled:opacity-40">Previous</button>
                <span className="text-xs">Page {pagination.page} of {pagination.pages}</span>
                <button type="button" disabled={pagination.page === pagination.pages} onClick={() => update({ page: pagination.page + 1 })} className="rounded-xl border border-slate-300 px-3 py-2 disabled:opacity-40">Next</button>
              </div>
            </nav>
          </>
        )}
      </FadeContent>

      {/* Click-to-open Quick-View summary card ng bata */}
      {quickViewRow && !registering && (() => {
        const { child, vaccination, next } = quickViewRow;
        const done = completedDoses(records, child.id);
        const pct = Math.min(100, Math.round((done / REQUIRED_DOSES) * 100));
        return (
          <Dialog
            title={`Child summary — ${childName(child)}`}
            size="wide"
            onClose={() => setQuickViewId(null)}
          >
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${vaccination === 'Fully immunized' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>
                      {vaccination}
                    </span>
                    <span className="text-sm font-semibold text-[var(--color-navy)]">
                      {done}/{REQUIRED_DOSES} required doses ({pct}%)
                    </span>
                  </div>
                  <span className="text-xs text-[var(--color-navy-soft)]">{extractPurok(child.purok)}</span>
                </div>
                <div aria-hidden="true" className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                  <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
                </div>

                <dl className="mt-4 grid gap-x-4 gap-y-3 border-t border-[var(--color-border)] pt-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-[var(--color-navy-soft)]">Age</dt>
                    <dd className="mt-0.5 font-medium text-[var(--color-navy)]">{calcAge(child.birthDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-navy-soft)]">Date of birth</dt>
                    <dd className="mt-0.5 font-medium text-[var(--color-navy)]">{formatDate(child.birthDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-navy-soft)]">Sex</dt>
                    <dd className="mt-0.5 font-medium text-[var(--color-navy)]">{child.sex}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-navy-soft)]">Parent / guardian</dt>
                    <dd className="mt-0.5 font-medium text-[var(--color-navy)]">{child.guardian}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-navy-soft)]">Mobile number</dt>
                    <dd className="mt-0.5 font-medium text-[var(--color-navy)]">{child.guardianMobile || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-navy-soft)]">Address / Purok</dt>
                    <dd className="mt-0.5 font-medium text-[var(--color-navy)]">{child.purok || '—'}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-navy-soft)]">
                  Next scheduled vaccination
                </p>
                {next ? (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-navy)]">
                        {vaccineById(next.vaccineId)?.shortName ?? next.vaccineId} · Dose {next.doseNumber}
                      </p>
                      <p className="text-xs text-[var(--color-navy-soft)]">
                        {formatDate(next.scheduledDate)}
                        {next.scheduledTime ? ` at ${formatTime(next.scheduledTime)}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={next.status} />
                  </div>
                ) : (
                  <p className="mt-1.5 text-sm text-[var(--color-navy-soft)]">No appointment booked.</p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setQuickViewId(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Close
                </button>
                <Link
                  to={`/children/${child.id}`}
                  state={{ directory: returnTo }}
                  className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)]"
                >
                  Open full profile
                </Link>
              </div>
            </div>
          </Dialog>
        );
      })()}

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
