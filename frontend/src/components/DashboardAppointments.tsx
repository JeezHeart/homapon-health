/**
 * DashboardAppointments.tsx
 * Guide: Dashboard table widget na may Today/Weekly/Monthly/Yearly filter tabs, smart default period,
 * click-to-open Appointment Detail Card, multi-select checkbox para sa Batch SMS reminders,
 * at inline Reschedule / Send SMS / Remove popup modals.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { childName, enrichedAppointments } from '../data/mockData';
import type { EnrichedAppointment } from '../data/mockData';
import { vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { calcAge, formatDate, formatTime, isoWeekRange, todayISO } from '../utils/dates';
import AppointmentDialog from './AppointmentDialog';
import BatchSmsDialog from './BatchSmsDialog';
import Card from './Card';
import Dialog from './Dialog';
import NavIcon from './NavIcon';
import SmsDialog from './SmsDialog';
import StatusBadge from './StatusBadge';

// Filter tabs sa header ng Appointment overview card.
const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'year', label: 'Yearly' },
] as const;

type PeriodId = (typeof PERIODS)[number]['id'];

function filterByPeriod(list: EnrichedAppointment[], period: PeriodId, today: string, week: { start: string; end: string }) {
  return list
    .filter((appointment) => {
      const date = appointment.scheduledDate;
      if (period === 'today') return date === today;
      if (period === 'week') return date >= week.start && date <= week.end;
      return date.startsWith(today.slice(0, period === 'month' ? 7 : 4));
    })
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || childName(a.child).localeCompare(childName(b.child)));
}

/** Nagpapakita ng hanggang 8 appointments para sa napiling period na may click-to-open detail card, Batch SMS, reschedule, at delete actions. */
export default function DashboardAppointments() {
  const { children, records, appointments, updateAppointment, deleteAppointment } = useStore();
  const [manualPeriod, setManualPeriod] = useState<PeriodId | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EnrichedAppointment | null>(null);
  const [smsTarget, setSmsTarget] = useState<EnrichedAppointment | null>(null);
  const [removing, setRemoving] = useState<EnrichedAppointment | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectAll = useRef<HTMLInputElement>(null);

  const today = todayISO();
  const week = isoWeekRange(today);
  const allEnriched = useMemo(
    () => enrichedAppointments(appointments, children, records),
    [appointments, children, records],
  );

  // Smart default: gamitin ang Today kung may appointment ngayon; kung wala, Weekly -> Monthly para may nakikita agad sa demo.
  const period: PeriodId = useMemo(() => {
    if (manualPeriod) return manualPeriod;
    if (filterByPeriod(allEnriched, 'today', today, week).length > 0) return 'today';
    if (filterByPeriod(allEnriched, 'week', today, week).length > 0) return 'week';
    if (filterByPeriod(allEnriched, 'month', today, week).length > 0) return 'month';
    return 'today';
  }, [manualPeriod, allEnriched, today, week]);

  const rows = useMemo(
    () => filterByPeriod(allEnriched, period, today, week),
    [allEnriched, period, today, week],
  );
  const visible = rows.slice(0, 8);
  const eligible = visible.filter((appointment) => appointment.status !== 'completed');
  const selectedRows = eligible.filter((appointment) => selected.has(appointment.id));
  const allSelected = eligible.length > 0 && selectedRows.length === eligible.length;
  const partiallySelected = selectedRows.length > 0 && !allSelected;
  const viewing = useMemo(
    () => (viewingId ? allEnriched.find((item) => item.id === viewingId) ?? null : null),
    [allEnriched, viewingId],
  );

  // Sini-sync yung "indeterminate" dash state ng Select All checkbox kapag ilan lang ang naka-check.
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = partiallySelected;
  }, [partiallySelected]);

  // Fino-format yung vaccine short name at dose number (hal. "Penta · Dose 2").
  function vaccineLabel(appointment: EnrichedAppointment) {
    return `${vaccineById(appointment.vaccineId)?.shortName ?? appointment.vaccineId} · Dose ${appointment.doseNumber}`;
  }

  // Dine-delete yung napiling appointment sa store/API at tinatanggal sa selected checkboxes.
  async function remove() {
    if (!removing || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await deleteAppointment(removing.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(removing.id);
        return next;
      });
      if (viewingId === removing.id) setViewingId(null);
      setRemoving(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove appointment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Main Appointment overview card na may Today/Weekly/Monthly/Yearly tabs */}
      <section className="dashboard-records" aria-label="Appointment overview">
        <Card
          title="Appointment overview"
          action={
            <div className="segmented-control" role="group" aria-label="Appointment period">
              {PERIODS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={period === item.id}
                  onClick={() => {
                    setManualPeriod(item.id);
                    setSelected(new Set());
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          }
        >
          {/* Select-all toolbar at Prepare Batch SMS button */}
          <div className="overview-table-toolbar">
            <label className="flex min-h-11 items-center gap-2 text-xs text-[var(--color-navy-soft)]">
              <input
                ref={selectAll}
                type="checkbox"
                aria-label="Select visible appointments"
                checked={allSelected}
                disabled={!eligible.length}
                onChange={() =>
                  setSelected(allSelected ? new Set() : new Set(eligible.map((appointment) => appointment.id)))
                }
              />
              Select visible appointments
            </label>
            {selectedRows.length > 0 && (
              <button type="button" className="selection-action" onClick={() => setBatchOpen(true)}>
                Prepare SMS ({selectedRows.length})
              </button>
            )}
          </div>

          {/* Malinis at responsive na 6-column table (walang pilit na horizontal scroll sa laptop) */}
          <div className="overflow-x-auto">
            <table role="table" className="mobile-record-table ui-table dashboard-table w-full text-left">
              <caption className="sr-only">Appointments in the selected period</caption>
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" scope="col">Select</th>
                  {['Child & Vaccine', 'Schedule', 'Status', 'Guardian', 'Action'].map((label) => (
                    <th role="columnheader" key={label} scope="col">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody role="rowgroup">
                {visible.map((appointment) => (
                  <tr role="row" key={appointment.id}>
                    <td role="cell">
                      <span className="mobile-cell-label" aria-hidden="true">Select</span>
                      <div className="mobile-cell-value">
                        <input
                          type="checkbox"
                          aria-label={`Select ${childName(appointment.child)}, ${vaccineLabel(appointment)}`}
                          checked={selected.has(appointment.id)}
                          disabled={appointment.status === 'completed'}
                          onChange={() =>
                            setSelected((previous) => {
                              const next = new Set(previous);
                              if (next.has(appointment.id)) next.delete(appointment.id);
                              else next.add(appointment.id);
                              return next;
                            })
                          }
                        />
                      </div>
                    </td>
                    <td role="cell">
                      <span className="mobile-cell-label" aria-hidden="true">Child &amp; Vaccine</span>
                      <div className="mobile-cell-value">
                        <button
                          type="button"
                          onClick={() => setViewingId(appointment.id)}
                          className="group flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] rounded-lg"
                        >
                          <span className="child-avatar" aria-hidden="true">
                            {appointment.child.firstName.charAt(0)}
                            {appointment.child.lastName.charAt(0)}
                          </span>
                          <span>
                            <span className="block text-sm font-semibold text-[var(--color-navy)] group-hover:underline">
                              {childName(appointment.child)}
                            </span>
                            <span className="block text-xs text-[var(--color-navy-soft)]">
                              {vaccineLabel(appointment)}
                            </span>
                          </span>
                        </button>
                      </div>
                    </td>
                    <td role="cell" className="whitespace-nowrap text-sm">
                      <span className="mobile-cell-label" aria-hidden="true">Schedule</span>
                      <div className="mobile-cell-value">
                        <span className="block font-medium">{formatDate(appointment.scheduledDate)}</span>
                        {appointment.scheduledTime && (
                          <span className="block text-xs text-[var(--color-navy-soft)]">
                            {formatTime(appointment.scheduledTime)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td role="cell">
                      <span className="mobile-cell-label" aria-hidden="true">Status</span>
                      <div className="mobile-cell-value">
                        <StatusBadge status={appointment.status} />
                      </div>
                    </td>
                    <td role="cell" className="text-sm">
                      <span className="mobile-cell-label" aria-hidden="true">Guardian</span>
                      <div className="mobile-cell-value">
                        <span className="block font-medium">{appointment.child.guardian}</span>
                        <span className="block text-xs text-[var(--color-navy-soft)]">
                          {appointment.child.guardianMobile || '—'}
                        </span>
                      </div>
                    </td>
                    <td role="cell">
                      <span className="mobile-cell-label" aria-hidden="true">Action</span>
                      <div className="mobile-cell-value">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingId(appointment.id)}
                            className="rounded-lg bg-[var(--color-accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-accent-dark)] hover:opacity-90"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            className="table-action"
                            disabled={appointment.status === 'completed'}
                            aria-label={`Reschedule ${childName(appointment.child)}, ${vaccineLabel(appointment)}`}
                            onClick={() => setEditing(appointment)}
                          >
                            <NavIcon name="edit" />
                          </button>
                          <button
                            type="button"
                            className="table-action table-action-danger"
                            disabled={appointment.status === 'completed'}
                            aria-label={`Remove appointment for ${childName(appointment.child)}, ${vaccineLabel(appointment)}`}
                            onClick={() => {
                              setError('');
                              setRemoving(appointment);
                            }}
                          >
                            <NavIcon name="trash" />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Empty state text at link papuntang full Schedule page */}
          {rows.length === 0 && (
            <p role="status" className="py-10 text-center text-sm text-[var(--color-navy-soft)]">
              No appointments in this period.
            </p>
          )}
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[var(--color-navy-soft)]">
            <span>
              {visible.length} of {rows.length} appointments · click a child for full details
            </span>
            <Link
              className="font-medium hover:underline"
              to={`/schedule?filter=${period === 'today' ? 'today' : period === 'week' ? 'week' : 'upcoming'}`}
            >
              View schedule
            </Link>
          </div>
        </Card>
      </section>

      {/* Click-to-open Appointment Detail Card */}
      {viewing && !editing && !smsTarget && !removing && !batchOpen && (
        <Dialog
          title={`Appointment — ${childName(viewing.child)}`}
          size="wide"
          onClose={() => setViewingId(null)}
        >
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-base font-bold text-[var(--color-navy)]">
                    {vaccineLabel(viewing)}
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--color-navy-soft)]">
                    Scheduled for {formatDate(viewing.scheduledDate)}
                    {viewing.scheduledTime ? ` at ${formatTime(viewing.scheduledTime)}` : ''}
                  </p>
                </div>
                <StatusBadge status={viewing.status} />
              </div>

              <dl className="mt-4 grid gap-x-4 gap-y-3 border-t border-[var(--color-border)] pt-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-[var(--color-navy-soft)]">Age</dt>
                  <dd className="mt-0.5 font-medium text-[var(--color-navy)]">{calcAge(viewing.child.birthDate)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-navy-soft)]">Date of birth</dt>
                  <dd className="mt-0.5 font-medium text-[var(--color-navy)]">{formatDate(viewing.child.birthDate)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-navy-soft)]">Address / Purok</dt>
                  <dd className="mt-0.5 font-medium text-[var(--color-navy)]">{viewing.child.purok || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-navy-soft)]">Parent / guardian</dt>
                  <dd className="mt-0.5 font-medium text-[var(--color-navy)]">{viewing.child.guardian}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-navy-soft)]">Mobile number</dt>
                  <dd className="mt-0.5 font-medium text-[var(--color-navy)]">{viewing.child.guardianMobile || '—'}</dd>
                </div>
                {viewing.followUpStatus && (
                  <div>
                    <dt className="text-[var(--color-navy-soft)]">Follow-up status</dt>
                    <dd className="mt-0.5 font-medium text-[var(--color-navy)]">{viewing.followUpStatus}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4">
              <Link
                to={`/children/${viewing.child.id}`}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Open full profile
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                {viewing.status !== 'completed' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setSmsTarget(viewing)}
                      className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
                    >
                      Send SMS
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(viewing)}
                      className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)]"
                    >
                      Reschedule
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setViewingId(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* Popup modals para sa Reschedule, Send SMS, Remove confirmation, at Batch SMS */}
      {editing && (
        <Dialog title="Reschedule appointment" onClose={() => setEditing(null)}>
          <AppointmentDialog
            childList={children}
            records={records}
            lockChild
            initial={editing}
            onSave={async (data, id) => {
              if (id) await updateAppointment(id, data);
            }}
            onClose={() => setEditing(null)}
          />
        </Dialog>
      )}
      {smsTarget && <SmsDialog appointment={smsTarget} onClose={() => setSmsTarget(null)} />}
      {removing && (
        <Dialog title="Remove appointment" onClose={() => { if (!busy) setRemoving(null); }}>
          <p className="text-sm">
            Remove {vaccineLabel(removing)} for {childName(removing.child)} on {formatDate(removing.scheduledDate)}?
          </p>
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setRemoving(null)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
            >
              Keep appointment
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="rounded-xl bg-red-700 px-4 py-2 text-sm text-white"
            >
              {busy ? 'Removing…' : 'Remove appointment'}
            </button>
          </div>
        </Dialog>
      )}
      {batchOpen && <BatchSmsDialog appointments={selectedRows} onClose={() => setBatchOpen(false)} />}
    </>
  );
}
