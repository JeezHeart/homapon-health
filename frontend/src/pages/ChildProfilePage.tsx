/**
 * Profile screen ng isang bata (`/children/:id`).
 *
 * Hawak nito: mga tabs para sa isang child record (Growth monitoring, Overview, Dose history, Schedule, printable Document, at SMS history),
 * pati mga modals pang-edit/delete ng bata (midwife-only ang delete para sa RBAC), pag-add o pag-correct ng dose entries,
 * pag-schedule/reschedule ng visits, at pag-prepare ng SMS reminder sa next incomplete appointment.
 * Dito kayo mag-check pag may bug sa profile tabs, edit/delete ng bata, dose history actions, o print/PDF document.
 */
import { lazy, Suspense, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import AppointmentDialog from '../components/AppointmentDialog';
import ChildForm from '../components/ChildForm';
import CorrectionForm from '../components/CorrectionForm';
import Dialog from '../components/Dialog';
import DoseEntryForm from '../components/DoseEntryForm';
import SmsDialog from '../components/SmsDialog';
import EmptyState from '../components/EmptyState';
import ImmunizationDocument from '../components/ImmunizationDocument';
import StatusBadge from '../components/StatusBadge';
import type { AppointmentStatus, DoseRecord, EnrichedAppointment, NewChild } from '../data/mockData';
import {
  appointmentStatus,
  childById,
  childName,
  isFullyImmunized,
  completedDoses,
  enrichedAppointments,
  nextAppointment,
  recordsForChild,
  smsForChild,
} from '../data/mockData';
import { REQUIRED_DOSES, vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { calcAge, formatDate, formatTime } from '../utils/dates';

// Naka-lazy load ito para ma-download lang yung GrowthPanel code kapag binuksan mismo ang Growth tab.
const GrowthPanel = lazy(() => import('../components/GrowthPanel'));

// Mga section tabs sa profile (pwede ring i-select gamit ang `?tab=` sa URL, halimbawa galing sa ReviewWorklistPage).
const TABS = [
  { id: 'growth', label: 'Growth monitoring' },
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'Dose history' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'document', label: 'Document' },
  { id: 'sms', label: 'SMS history' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const CHILD_BADGE: Record<string, string> = {
  'Fully immunized': 'bg-emerald-100 text-emerald-800',
  'Partially immunized': 'bg-sky-100 text-sky-800',
};

// Nagre-render ng kumpletong record at interactive actions para sa batang naka-match sa `:id` ng URL.
export default function ChildProfilePage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  // Safe na kinukuha kung saan babalik yung "Back" link (Children, Schedule, o Records) habang pinapanatili yung dating filters.
  const returnTo = typeof location.state?.directory === 'string' && /^\/(?:children|schedule|records)(?:\?|$)/.test(location.state.directory) ? location.state.directory : '/children';
  const backLabel = returnTo.startsWith('/schedule') ? 'Back to schedule' : returnTo.startsWith('/records') ? 'Back to vaccination records' : 'Back to child records';
  const [searchParams] = useSearchParams();
  const { children, records, appointments, smsLog, demoUser, deleteChild, addDoseRecord, addAppointment, updateChild, updateAppointment } =
    useStore();
  // Local React states para sa pag-open/close ng modals (edit, delete, add/correct doses, schedule, at SMS reminders).
  const [addingRecord, setAddingRecord] = useState(false);
  const [editingChild, setEditingChild] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [correcting, setCorrecting] = useState<DoseRecord | null>(null);
  const [rescheduling, setRescheduling] = useState<EnrichedAppointment | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [scheduling, setScheduling] = useState<{
    childId: string;
    vaccineId: string;
    doseNumber: number;
  } | null>(null);
  const child = id ? childById(children, id) : undefined;
  // Active na tab sa profile; kinukuha muna sa `?tab=...` kung valid, otherwise default sa `overview`.
  const [tab, setTab] = useState<TabId>(
    TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab') as TabId : 'overview',
  );

  // Midwife-only RBAC action: permanenteng binubura yung child record pati lahat ng connected records via StoreProvider.deleteChild.
  async function removeChild() {
    if (!child || deleting || demoUser?.role !== 'midwife') return;
    setDeleting(true); setDeleteError('');
    try {
      const result = await deleteChild(child.id);
      if (!result.ok) { setDeleteError(result.error); return; }
      navigate(returnTo, { replace: true });
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Could not delete child record.'); }
    finally { setDeleting(false); }
  }

  // Fallback UI kapag hindi nag-match yung `:id` sa URL sa kahit anong naka-load na child record.
  if (!child) {
    return (
      <EmptyState
        title="Child not found"
        message="This child record is not available."
        action={
          <Link
            to={returnTo}
            className="mt-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            {backLabel}
          </Link>
        }
      />
    );
  }

  // Kinukuha at sino-sort dito yung dose history, appointments, SMS log, completion status, at next appointment na pwedeng i-remind para sa batang ito.
  const history = recordsForChild(records, child.id)
    .slice()
    .sort((a, b) => b.dateAdministered.localeCompare(a.dateAdministered));
  const upcoming = enrichedAppointments(appointments, children, records)
    .filter((a) => a.childId === child.id)
    .map((a) => ({ ...a, status: appointmentStatus(a, records) as AppointmentStatus }));
  const sms = smsForChild(smsLog, child.id);
  const done = completedDoses(records, child.id);
  const status = isFullyImmunized(records, child.id) ? 'Fully immunized' : 'Partially immunized';
  const next = nextAppointment(appointments, children, records, child.id);
  const smsTarget =
    next && next.status !== 'completed' ? next : undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* Back link pabalik sa pinanggalingang directory, schedule, o records page */}
      <Link
        to={returnTo}
        className="text-sm font-semibold text-[var(--color-accent-dark)] hover:underline"
      >
        ← {backLabel}
      </Link>

      {/* Header ng bata: full name, vaccination status badge, SMS reminder, edit, at midwife-only delete button */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title">
          {childName(child)}
        </h1>
        <span
          aria-label={`Vaccination status: ${status}`}
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${CHILD_BADGE[status]}`}
        >
          {status}
        </span>
        <button
          type="button"
          onClick={() => smsTarget && setSmsOpen(true)}
          disabled={!smsTarget}
          title={
            smsTarget
              ? 'Prepare an SMS reminder for the next appointment'
              : 'No upcoming appointment to remind about'
          }
          className="rounded-xl bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-accent-dark)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send SMS reminder
        </button>
        <button
          type="button"
          onClick={() => setEditingChild(true)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Edit record
        </button>
        {demoUser?.role === 'midwife' && <button type="button" onClick={() => { setDeleteError(''); setConfirmDelete(true); }} className="rounded-xl border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Delete child record</button>}
      </div>
      <p className="-mt-2 text-sm text-[var(--color-navy-soft)]">
        Born {formatDate(child.birthDate)} ({calcAge(child.birthDate)}) · {child.sex} ·{' '}
        {child.purok || 'No purok recorded'}
      </p>

      {/* Tab bar ng mga sections sa profile */}
      <div role="tablist" aria-label="Child profile sections" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
              tab === t.id
                ? 'bg-[var(--color-lavender-soft)] text-[var(--color-navy)]'
                : 'bg-white text-[var(--color-navy-soft)] hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Growth monitoring tab (naka-lazy load yung WHO GrowthPanel component) */}
      {tab === 'growth' && <Suspense fallback={<p>Loading growth monitoring...</p>}><GrowthPanel key={child.id} child={child} /></Suspense>}

      {/* Overview tab: detalye ng guardian at overall dose progress bar ng bata */}
      {tab === 'overview' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Child & guardian">
            <dl className="profile-details grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-[var(--color-navy-soft)]">Guardian</dt>
              <dd className="font-medium">{child.guardian}</dd>
              <dt className="text-[var(--color-navy-soft)]">Mobile</dt>
              <dd className="font-medium">{child.guardianMobile}</dd>
              <dt className="text-[var(--color-navy-soft)]">Address</dt>
              <dd className="font-medium">{child.purok || '—'}</dd>
              <dt className="text-[var(--color-navy-soft)]">Weight</dt>
              <dd className="font-medium">
                {child.weightKg !== undefined ? `${child.weightKg} kg` : '—'}
              </dd>
              <dt className="text-[var(--color-navy-soft)]">Notes</dt>
              <dd className="font-medium">{child.notes ?? '—'}</dd>
            </dl>
          </Card>
          <Card title="Immunization summary">
            <p className="text-3xl font-bold text-[var(--color-navy)]">
              {done} <span className="text-base font-medium">/ {REQUIRED_DOSES} doses</span>
            </p>
            <div
              className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={done}
              aria-valuemin={0}
              aria-valuemax={REQUIRED_DOSES}
              aria-label="Immunization progress"
            >
              <div
                className="h-full rounded-full bg-[var(--color-accent)]"
                style={{ width: `${Math.min(100, (done / REQUIRED_DOSES) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-[var(--color-navy-soft)]">
              Status: <span className="font-semibold">{status}</span>
            </p>
          </Card>
        </div>
      )}

      {/* Dose history tab: listahan ng mga naturok na bakuna na may Add at Edit buttons */}
      {tab === 'history' && (
        <Card
          title={`Vaccine dose history (${history.length})`}
          action={
            <button
              type="button"
              onClick={() => setAddingRecord(true)}
              className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-accent-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              Add vaccination record
            </button>
          }
        >
          {history.length === 0 ? (
            <EmptyState
              title="No doses recorded"
              message="Completed vaccinations for this child will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table role="table" className="mobile-record-table ui-table w-full min-w-[640px] text-left text-sm">
                <thead role="rowgroup">
                  <tr role="row" className="text-xs uppercase tracking-wide text-[var(--color-navy-soft)]">
                    <th role="columnheader" className="pb-2 pr-4 font-semibold">Vaccine / dose</th>
                    <th role="columnheader" className="pb-2 pr-4 font-semibold">Date given</th>
                    <th role="columnheader" className="pb-2 pr-4 font-semibold">Batch / lot</th>
                    <th role="columnheader" className="pb-2 pr-4 font-semibold">Health worker</th>
                    <th role="columnheader" className="pb-2 pr-4 font-semibold">Remarks</th>
                    <th role="columnheader" className="pb-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {history.map((r) => {
                    const v = vaccineById(r.vaccineId);
                    return (
                      <tr role="row" key={r.id} className="border-t border-slate-100">
                        <td role="cell" className="py-2.5 pr-4 font-medium"><span className="mobile-cell-label" aria-hidden="true">Vaccine / dose</span><div className="mobile-cell-value">
                          {v?.shortName ?? r.vaccineId} · Dose {r.doseNumber}
                        </div></td>
                        <td role="cell" className="py-2.5 pr-4"><span className="mobile-cell-label" aria-hidden="true">Date given</span><div className="mobile-cell-value">{formatDate(r.dateAdministered)}</div></td>
                        <td role="cell" className="py-2.5 pr-4"><span className="mobile-cell-label" aria-hidden="true">Batch / lot</span><div className="mobile-cell-value">{r.batchLot ?? '—'}</div></td>
                        <td role="cell" className="py-2.5 pr-4"><span className="mobile-cell-label" aria-hidden="true">Health worker</span><div className="mobile-cell-value">{r.healthWorker}</div></td>
                        <td role="cell" className="py-2.5 pr-4"><span className="mobile-cell-label" aria-hidden="true">Remarks</span><div className="mobile-cell-value">{r.remarks ?? '—'}</div></td>
                        <td role="cell" className="py-2.5"><span className="mobile-cell-label" aria-hidden="true">Action</span><div className="mobile-cell-value">
                          <button
                            type="button"
                            onClick={() => setCorrecting(r)}
                            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                          >
                            Edit
                          </button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Mga modals pang-add ng dose, book/reschedule ng appointment, edit/delete ng bata, correction ng dose, at pag-prepare ng SMS */}
      {addingRecord && (
        <Dialog title="Add vaccination record" onClose={() => setAddingRecord(false)}>
          <DoseEntryForm
            childList={children}
            records={records}
            defaultChildId={child.id}
            lockChild
            onSave={(data) => addDoseRecord(data)}
            onDone={() => setAddingRecord(false)}
            onScheduleNext={(info) => {
              setAddingRecord(false);
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
            defaultDoseNumber={scheduling.doseNumber}
            onSave={async (data) => {
              await addAppointment(data);
            }}
            onClose={() => setScheduling(null)}
          />
        </Dialog>
      )}

      {rescheduling && (
        <Dialog title="Reschedule appointment" onClose={() => setRescheduling(null)}>
          <AppointmentDialog
            childList={children}
            records={records}
            defaultChildId={rescheduling.childId}
            lockChild
            defaultVaccineId={rescheduling.vaccineId}
            initial={rescheduling}
            onSave={async (data, id) => {
              if (id) await updateAppointment(id, data);
            }}
            onClose={() => setRescheduling(null)}
          />
        </Dialog>
      )}

      {editingChild && (
        <Dialog title="Edit child record" onClose={() => setEditingChild(false)}>
          <ChildForm
            initial={child}
            onSubmit={async (data: NewChild) => {
              await updateChild(child.id, data);
              setEditingChild(false);
            }}
            onCancel={() => setEditingChild(false)}
          />
        </Dialog>
      )}

      {confirmDelete && demoUser?.role === 'midwife' && <Dialog title="Delete child record" onClose={() => { if (!deleting) setConfirmDelete(false); }}>
        <p className="text-sm">Delete the record for <strong>{childName(child)}</strong>?</p>
        <p className="mt-3 text-sm text-[var(--color-navy-soft)]">This also deletes their vaccination records, appointments, growth measurements, and SMS history. This cannot be undone.</p>
        {deleteError && <p role="alert" className="mt-3 text-sm text-red-700">{deleteError}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" disabled={deleting} onClick={() => setConfirmDelete(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Keep record</button><button type="button" disabled={deleting} onClick={() => void removeChild()} className="rounded-xl bg-red-700 px-4 py-2 text-sm text-white">{deleting ? 'Deleting...' : 'Delete child record'}</button></div>
      </Dialog>}

      {correcting && (
        <Dialog title="Edit vaccination entry" onClose={() => setCorrecting(null)}>
          <CorrectionForm record={correcting} onClose={() => setCorrecting(null)} />
        </Dialog>
      )}

      {smsTarget && smsOpen && (
        <SmsDialog appointment={smsTarget} onClose={() => setSmsOpen(false)} />
      )}

      {/* Schedule tab: mga appointments ng bata na may Schedule at Reschedule buttons */}
      {tab === 'schedule' && (
        <Card
          title="Upcoming schedule"
          action={
            <button
              type="button"
              onClick={() =>
                setScheduling({ childId: child.id, vaccineId: 'penta', doseNumber: 1 })
              }
              className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-accent-dark)]"
            >
              Schedule appointment
            </button>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState
              title="Nothing scheduled"
              message="No upcoming or overdue appointments for this child."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {upcoming.map((a) => {
                const v = vaccineById(a.vaccineId);
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm"
                  >
                    <span className="font-medium">
                      {v?.shortName} · Dose {a.doseNumber} · {formatDate(a.scheduledDate)}
                      {a.scheduledTime ? ` · ${formatTime(a.scheduledTime)}` : ''}
                      {a.scheduleExceptionReason && (
                        <span className="mt-1 block break-words text-xs font-normal text-amber-950">
                          Schedule exception: {a.scheduleExceptionReason}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={a.status} />
                      {a.status !== 'completed' && (
                        <button
                          type="button"
                          onClick={() => setRescheduling(a)}
                          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                        >
                          Reschedule
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {/* Document tab: printable paper-style na immunization card ng bata */}
      {tab === 'document' && (
        <div className="flex flex-col gap-3">
          <div className="no-print flex justify-end">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              Print / Save as PDF
            </button>
          </div>
          <ImmunizationDocument
            child={child}
            records={records}
            appointments={appointments}
          />
        </div>
      )}

      {/* SMS history tab: log ng mga nakaraang SMS reminder attempts para sa batang ito */}
      {tab === 'sms' && (
        <Card title="SMS reminder history">
          {sms.length === 0 ? (
            <EmptyState
              title="No reminders yet"
              message="Simulated sends for this child will be logged here. No real messages are sent in this phase."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {sms.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-slate-200 p-3 text-sm"
                >
                  <p>{s.message}</p>
                  <p className="mt-1 text-xs text-[var(--color-navy-soft)]">
                    {formatDate(s.sentAt)} · {s.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
