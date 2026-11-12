import { lazy, Suspense, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
  childStatus,
  completedDoses,
  enrichedAppointments,
  nextAppointment,
  recordsForChild,
  smsForChild,
} from '../data/mockData';
import { REQUIRED_DOSES, vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { calcAge, formatDate, formatTime } from '../utils/dates';

const GrowthPanel = lazy(() => import('../components/GrowthPanel'));

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
  Overdue: 'bg-red-100 text-red-800',
};

export default function ChildProfilePage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { children, records, appointments, smsLog, addDoseRecord, addAppointment, updateChild, updateAppointment } =
    useStore();
  const [addingRecord, setAddingRecord] = useState(false);
  const [editingChild, setEditingChild] = useState(false);
  const [correcting, setCorrecting] = useState<DoseRecord | null>(null);
  const [rescheduling, setRescheduling] = useState<EnrichedAppointment | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [scheduling, setScheduling] = useState<{
    childId: string;
    vaccineId: string;
    doseNumber: number;
  } | null>(null);
  const child = id ? childById(children, id) : undefined;
  const [tab, setTab] = useState<TabId>(
    TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab') as TabId : 'overview',
  );

  if (!child) {
    return (
      <EmptyState
        title="Child not found"
        message="This record does not exist in the demo registry."
        action={
          <Link
            to="/children"
            className="mt-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            Back to child records
          </Link>
        }
      />
    );
  }

  const history = recordsForChild(records, child.id)
    .slice()
    .sort((a, b) => b.dateAdministered.localeCompare(a.dateAdministered));
  const upcoming = enrichedAppointments(appointments, children, records)
    .filter((a) => a.childId === child.id)
    .map((a) => ({ ...a, status: appointmentStatus(a, records) as AppointmentStatus }));
  const sms = smsForChild(smsLog, child.id);
  const done = completedDoses(records, child.id);
  const status = childStatus(appointments, records, child.id);
  const next = nextAppointment(appointments, children, records, child.id);
  const smsTarget =
    next && next.status !== 'completed' ? next : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/children"
        className="text-sm font-semibold text-[var(--color-accent-dark)] hover:underline"
      >
        ← Back to child records
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title">
          {childName(child)}
        </h1>
        <span
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
      </div>
      <p className="-mt-2 text-sm text-[var(--color-navy-soft)]">
        Born {formatDate(child.birthDate)} ({calcAge(child.birthDate)}) · {child.sex} ·{' '}
        {child.purok || 'No purok recorded'}
      </p>

      <div role="tablist" aria-label="Child profile sections" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
              tab === t.id
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-white text-[var(--color-navy-soft)] hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'growth' && <Suspense fallback={<p>Loading growth monitoring...</p>}><GrowthPanel key={child.id} child={child} /></Suspense>}

      {tab === 'overview' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Child & guardian">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
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
              <table className="ui-table w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-[var(--color-navy-soft)]">
                    <th className="pb-2 pr-4 font-semibold">Vaccine / dose</th>
                    <th className="pb-2 pr-4 font-semibold">Date given</th>
                    <th className="pb-2 pr-4 font-semibold">Batch / lot</th>
                    <th className="pb-2 pr-4 font-semibold">Health worker</th>
                    <th className="pb-2 pr-4 font-semibold">Remarks</th>
                    <th className="pb-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => {
                    const v = vaccineById(r.vaccineId);
                    return (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="py-2.5 pr-4 font-medium">
                          {v?.shortName ?? r.vaccineId} · Dose {r.doseNumber}
                        </td>
                        <td className="py-2.5 pr-4">{formatDate(r.dateAdministered)}</td>
                        <td className="py-2.5 pr-4">{r.batchLot ?? '—'}</td>
                        <td className="py-2.5 pr-4">{r.healthWorker}</td>
                        <td className="py-2.5 pr-4">{r.remarks ?? '—'}</td>
                        <td className="py-2.5">
                          <button
                            type="button"
                            onClick={() => setCorrecting(r)}
                            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

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

      {correcting && (
        <Dialog title="Edit vaccination entry" onClose={() => setCorrecting(null)}>
          <CorrectionForm record={correcting} onClose={() => setCorrecting(null)} />
        </Dialog>
      )}

      {smsTarget && smsOpen && (
        <SmsDialog appointment={smsTarget} onClose={() => setSmsOpen(false)} />
      )}

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
