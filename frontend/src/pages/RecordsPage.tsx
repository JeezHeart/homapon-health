/**
 * Vaccination Records page (`/records`).
 *
 * Hawak nito: summary card list ng mga bata na may naturok na doses, click-to-open detail card para makita
 * ang buong dose context per bata, URL-synced na search/vaccine/date-range filters, pagination per child,
 * at mga modals para mag-add ng dose, mag-schedule ng next dose, o mag-correct ng maling dose entry.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import KpiCard from '../components/KpiCard';
import AppointmentDialog from '../components/AppointmentDialog';
import CorrectionForm from '../components/CorrectionForm';
import Dialog from '../components/Dialog';
import DoseEntryForm from '../components/DoseEntryForm';
import EmptyState from '../components/EmptyState';
import type { DoseRecord } from '../data/mockData';
import {
  childName,
  isFullyImmunized,
  completedDoses,
} from '../data/mockData';
import { REQUIRED_DOSES, VACCINES, vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { formatDate } from '../utils/dates';
import { recordDirectory } from '../utils/recordDirectory';
import { directoryPage } from '../utils/childDirectory';
import { validScheduleDate } from '../utils/scheduleDirectory';

const STATUS_BADGE: Record<string, string> = {
  'Fully immunized': 'bg-emerald-100 text-emerald-800',
  'Partially immunized': 'bg-sky-100 text-sky-800',
};

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || 'CH';
}

// Nagpapakita ng mga naka-record na vaccine doses per bata: pindutin ang pangalan/card para buksan ang buong dose detail card.
export default function RecordsPage() {
  const { children, records, addDoseRecord, addAppointment } =
    useStore();
  const [params, setParams] = useSearchParams();
  // Binabasa dito yung URL-backed filters para sa search query, vaccine, date range, at page size.
  const query = params.get('q') ?? '';
  const vaccineFilter = VACCINES.find((vaccine) => vaccine.id === params.get('vaccine'))?.id ?? 'all';
  const doseOptions = [...new Set([
    ...VACCINES.flatMap(vaccine => vaccine.doses.map(dose => dose.doseNumber)),
    ...records.map(record => record.doseNumber),
  ])].sort((a, b) => a - b);
  const doseNumber = doseOptions.find(dose => String(dose) === params.get('dose'));
  const from = validScheduleDate(params.get('from')) ?? '';
  const to = validScheduleDate(params.get('to')) ?? '';
  const invalidRange = Boolean(from && to && from > to);
  const size = [5, 10, 25].find((value) => value === Number(params.get('size'))) ?? 10;
  const hasFilters = Boolean(query || vaccineFilter !== 'all' || doseNumber !== undefined || from || to);
  const returnTo = `/records${params.size ? `?${params.toString()}` : ''}`;

  // Ina-update yung URL search params pag nagpalit ng filter o page size, tapos nire-reset ang page sa 1 kapag bagong filter.
  function update(patch: Record<string, string | number>) {
    const next = new URLSearchParams(params);
    next.delete('page');
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === 'all' || key === 'page' && value === 1 || key === 'size' && value === 10) next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next, { replace: true });
  }

  // Modal states para sa click-to-open detail card, pag-add ng dose, pag-correct ng lumang entry, at follow-up appointment.
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [addingForChildId, setAddingForChildId] = useState<string | null | undefined>(undefined);
  const [correcting, setCorrecting] = useState<DoseRecord | null>(null);
  const [scheduling, setScheduling] = useState<{
    childId: string;
    vaccineId: string;
    doseNumber: number;
  } | null>(null);

  // Gini-group yung nag-match na dose records per bata (empty kapag baliktad yung date range) tapos pinapa-paginate per child group.
  const groups = useMemo(
    () => (invalidRange ? [] : recordDirectory(children, records, { query, vaccine: vaccineFilter, doseNumber, from, to })),
    [children, records, query, vaccineFilter, doseNumber, from, to, invalidRange],
  );
  const shownDoses = groups.reduce((total, group) => total + group.doses.length, 0);
  const pagination = directoryPage(groups, Number(params.get('page') ?? 1), size);
  const selectedGroup = useMemo(
    () => (selectedChildId ? groups.find((group) => group.child.id === selectedChildId) ?? null : null),
    [groups, selectedChildId],
  );
  const adding = addingForChildId !== undefined;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Vaccination Records</h1>
      <section aria-label="Vaccination record totals" className="grid grid-cols-2 gap-2.5">
        <KpiCard label="Recorded doses" count={shownDoses} icon="records" description="Matching current filters" />
        <KpiCard label="Children with records" count={groups.length} icon="children" description="At least one matching dose" />
      </section>
      {/* Filter card: search box, vaccine dropdown, at from/to date inputs */}
      <Card>
        <div className="flex flex-wrap items-end gap-2.5">
          <input
            type="search"
            aria-label="Search by child, guardian, or vaccine"
            placeholder="Search child, guardian, or vaccine"
            value={query}
            onChange={(e) => update({ q: e.target.value })}
            className="clinic-control flex-[1_1_100%] lg:flex-[1_1_11rem]"
          />
          <select
            aria-label="Filter by vaccine"
            value={vaccineFilter}
            onChange={(e) => update({ vaccine: e.target.value })}
            className="clinic-control"
          >
            <option value="all">All vaccines</option>
            {VACCINES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.shortName}
              </option>
            ))}
          </select>
          <select aria-label="Filter by dose number" value={doseNumber ?? 'all'}
            onChange={(event) => update({ dose: event.target.value })}
            className="clinic-control">
            <option value="all">All doses</option>
            {doseOptions.map(dose => <option key={dose} value={dose}>Dose {dose}</option>)}
          </select>
          <label className="min-w-0 flex-[1_1_8rem] text-xs text-[var(--color-navy-soft)]">From date<input type="date" value={from} max={to || undefined} onChange={(event) => update({ from: event.target.value })} className="clinic-control mt-1 block w-full" /></label>
          <label className="min-w-0 flex-[1_1_8rem] text-xs text-[var(--color-navy-soft)]">To date<input type="date" value={to} min={from || undefined} onChange={(event) => update({ to: event.target.value })} className="clinic-control mt-1 block w-full" /></label>
          {hasFilters && <button type="button" onClick={() => update({ q: '', vaccine: 'all', dose: 'all', from: '', to: '' })} className="clinic-control">Clear filters</button>}
          <button type="button" onClick={() => setAddingForChildId(null)}
            className="ml-auto min-h-10 rounded-xl bg-[var(--color-accent)] px-3.5 py-1.5 text-sm font-semibold text-[var(--color-on-accent)] hover:bg-[var(--color-accent-dark)]">
            Add Vaccination Record
          </button>
        </div>
        {invalidRange && <p role="alert" className="mt-3 text-sm text-red-700">From date must be on or before To date.</p>}
      </Card>

      {/* Click-to-open summary cards per bata */}
      {groups.length === 0 ? (
        <EmptyState
          title="No matching records"
          message="Change your search, vaccine, dose number, or date range. You can also clear the filters."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {pagination.visible.map(({ child, doses }) => {
            const done = completedDoses(records, child.id);
            const pct = Math.min(100, Math.round((done / REQUIRED_DOSES) * 100));
            const st = isFullyImmunized(records, child.id) ? 'Fully immunized' : 'Partially immunized';
            const vaccineTags = Array.from(
              new Set(doses.map((dose) => vaccineById(dose.vaccineId)?.shortName ?? dose.vaccineId)),
            );
            const previewTags = vaccineTags.slice(0, 4);
            const extraTagCount = vaccineTags.length - previewTags.length;
            const latestDate = doses[0]?.dateAdministered;

            return (
              <section
                key={child.id}
                aria-label={`Records for ${childName(child)}`}
                className="clinic-entry flex flex-col justify-between overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setSelectedChildId(child.id)}
                  className="flex w-full flex-1 flex-col gap-3 p-4 text-left hover:bg-[var(--color-elevated)]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="child-avatar text-xs font-bold" aria-hidden="true">
                        {initials(child.firstName, child.lastName)}
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-bold text-[var(--color-navy)]">
                          {childName(child)}
                        </h2>
                        <p className="truncate text-xs text-[var(--color-navy-soft)]">
                          {child.guardian} · {child.purok || 'Barangay Homapon'}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[st]}`}
                    >
                      {st}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[var(--color-navy)]">
                        {done}/{REQUIRED_DOSES} required doses
                      </span>
                      <span className="text-[var(--color-navy-soft)]">
                        {latestDate ? `Latest: ${formatDate(latestDate)}` : `${doses.length} recorded`}
                      </span>
                    </div>
                    <div
                      aria-hidden="true"
                      className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]"
                    >
                      <div
                        className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {previewTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {previewTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-0.5 text-xs font-medium text-[var(--color-navy-soft)]"
                        >
                          {tag}
                        </span>
                      ))}
                      {extraTagCount > 0 && (
                        <span className="text-xs font-medium text-[var(--color-navy-soft)]">
                          +{extraTagCount} more
                        </span>
                      )}
                    </div>
                  )}
                </button>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5 text-xs">
                  <span className="text-[var(--color-navy-soft)]">
                    {doses.length} {doses.length === 1 ? 'dose' : 'doses'} {hasFilters ? 'matching filter' : 'recorded'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedChildId(child.id)}
                      className="rounded-lg bg-[var(--color-accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-dark)] hover:opacity-90"
                    >
                      View doses
                    </button>
                    <Link
                      to={`/children/${child.id}`}
                      state={{ directory: returnTo }}
                      aria-label={`Open full profile for ${childName(child)}`}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                    >
                      Full profile
                    </Link>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Pagination controls para sa mga child cards */}
      {groups.length > 0 && <nav aria-label="Vaccination records pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p role="status" aria-live="polite">{pagination.first} - {pagination.last} of {groups.length} children</p>
        <div className="flex flex-wrap items-center gap-2"><label htmlFor="record-size" className="text-xs">Children per page</label><select id="record-size" value={size} onChange={(event) => update({ size: Number(event.target.value) })} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">{[5, 10, 25].map((value) => <option key={value}>{value}</option>)}</select><button type="button" disabled={pagination.page === 1} onClick={() => update({ page: pagination.page - 1 })} className="rounded-xl border border-slate-300 px-3 py-2 disabled:opacity-40">Previous</button><span className="text-xs">Page {pagination.page} of {pagination.pages}</span><button type="button" disabled={pagination.page === pagination.pages} onClick={() => update({ page: pagination.page + 1 })} className="rounded-xl border border-slate-300 px-3 py-2 disabled:opacity-40">Next</button></div>
      </nav>}

      {/* Click-to-open detail card ng napiling bata */}
      {selectedGroup && !correcting && !adding && !scheduling && (() => {
        const { child, doses } = selectedGroup;
        const done = completedDoses(records, child.id);
        const pct = Math.min(100, Math.round((done / REQUIRED_DOSES) * 100));
        const st = isFullyImmunized(records, child.id) ? 'Fully immunized' : 'Partially immunized';
        const totalForChild = records.filter((r) => r.childId === child.id).length;

        return (
          <Dialog
            title={`Vaccination records — ${childName(child)}`}
            size="wide"
            onClose={() => setSelectedChildId(null)}
          >
            <div className="flex flex-col gap-4">
              {/* Context card ng bata: guardian, contact, purok, DOB, at completion progress */}
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[st]}`}
                    >
                      {st}
                    </span>
                    <span className="text-sm font-semibold text-[var(--color-navy)]">
                      {done}/{REQUIRED_DOSES} required doses completed ({pct}%)
                    </span>
                  </div>
                  <span className="text-xs text-[var(--color-navy-soft)]">
                    Showing {doses.length} of {totalForChild} {totalForChild === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]"
                >
                  <div
                    className="h-full rounded-full bg-[var(--color-accent)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-[var(--color-navy-soft)]">Guardian</dt>
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
                  <div>
                    <dt className="text-[var(--color-navy-soft)]">Date of birth</dt>
                    <dd className="mt-0.5 font-medium text-[var(--color-navy)]">{formatDate(child.birthDate)}</dd>
                  </div>
                </dl>
              </div>

              {/* Listahan ng mga na-record na doses */}
              <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="overflow-x-auto">
                  <table role="table" className="mobile-record-table ui-table w-full text-left text-sm">
                    <thead role="rowgroup">
                      <tr role="row" className="text-xs uppercase tracking-wide text-[var(--color-navy-soft)]">
                        {[
                          'Vaccine / dose',
                          'Date given',
                          'Health worker',
                          'Batch / lot',
                          'Action',
                        ].map((h) => (
                          <th role="columnheader" key={h} scope="col" className="!px-3 !py-2.5 font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {doses.map((r) => {
                        const v = vaccineById(r.vaccineId);
                        return (
                          <tr role="row" key={r.id}>
                            <td role="cell" className="!px-3 !py-2.5 font-medium">
                              <span className="mobile-cell-label" aria-hidden="true">Vaccine / dose</span>
                              <div className="mobile-cell-value">
                                <div>{v?.shortName ?? r.vaccineId} · Dose {r.doseNumber}</div>
                                {r.remarks && (
                                  <p className="mt-0.5 text-xs font-normal text-[var(--color-navy-soft)]">
                                    {r.remarks}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td role="cell" className="!px-3 !py-2.5 whitespace-nowrap">
                              <span className="mobile-cell-label" aria-hidden="true">Date given</span>
                              <div className="mobile-cell-value">{formatDate(r.dateAdministered)}</div>
                            </td>
                            <td role="cell" className="!px-3 !py-2.5">
                              <span className="mobile-cell-label" aria-hidden="true">Health worker</span>
                              <div className="mobile-cell-value">{r.healthWorker}</div>
                            </td>
                            <td role="cell" className="!px-3 !py-2.5 whitespace-nowrap">
                              <span className="mobile-cell-label" aria-hidden="true">Batch / lot</span>
                              <div className="mobile-cell-value">{r.batchLot ?? '—'}</div>
                            </td>
                            <td role="cell" className="!px-3 !py-2.5 whitespace-nowrap">
                              <span className="mobile-cell-label" aria-hidden="true">Action</span>
                              <div className="mobile-cell-value">
                                <button
                                  type="button"
                                  onClick={() => setCorrecting(r)}
                                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                                >
                                  Correct entry
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer actions sa loob ng detail card */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4">
                <Link
                  to={`/children/${child.id}`}
                  state={{ directory: returnTo }}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Open full profile
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedChildId(null)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingForChildId(child.id)}
                    className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)]"
                  >
                    Add dose
                  </button>
                </div>
              </div>
            </div>
          </Dialog>
        );
      })()}

      {/* Mga modal dialogs pang-add ng dose, pang-book ng next dose, at pang-correct ng maling entry */}
      {adding && (
        <Dialog title="Add vaccination record" onClose={() => setAddingForChildId(undefined)}>
          <DoseEntryForm
            childList={children}
            records={records}
            defaultChildId={addingForChildId ?? undefined}
            lockChild={Boolean(addingForChildId)}
            onSave={(data) => addDoseRecord(data)}
            onDone={() => setAddingForChildId(undefined)}
            onScheduleNext={(info) => {
              setAddingForChildId(undefined);
              setScheduling(info);
            }}
          />
        </Dialog>
      )}

      {scheduling && (
        <Dialog title="Schedule next appointment" onClose={() => setScheduling(null)}>
          <AppointmentDialog
            childList={children}
            records={records}
            defaultChildId={scheduling.childId}
            lockChild
            defaultVaccineId={scheduling.vaccineId}
            onSave={async (data) => {
              await addAppointment(data);
            }}
            onClose={() => setScheduling(null)}
          />
        </Dialog>
      )}

      {correcting && (
        <Dialog title="Edit vaccination entry" onClose={() => setCorrecting(null)}>
          <CorrectionForm record={correcting} onClose={() => setCorrecting(null)} />
        </Dialog>
      )}
    </div>
  );
}
