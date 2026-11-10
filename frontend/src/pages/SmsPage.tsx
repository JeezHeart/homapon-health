import { useMemo, useState } from 'react';
import BatchSmsDialog from '../components/BatchSmsDialog';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import SmsDialog from '../components/SmsDialog';
import StatusBadge from '../components/StatusBadge';
import type { EnrichedAppointment } from '../data/mockData';
import {
  childById,
  childName,
  extractPurok,
  overdueAppointments,
  smsForChild,
  smsDeliveryLabel,
  upcomingAppointments,
} from '../data/mockData';
import { vaccineById } from '../data/vaccines';
import { apiEnabled } from '../data/api';
import { useStore } from '../state/store-context';
import { daysFromNow, formatDate, formatTime, todayISO } from '../utils/dates';

type SmsTab = 'all' | 'tomorrow' | 'overdue' | 'today';

/**
 * SMS Notifications (prd.md section 11). Reminder actions use the
 * fixed central template with confirmation; sends are simulated and
 * every entry is labeled as a demo.
 */
export default function SmsPage() {
  const { children, records, appointments, smsLog } = useStore();
  const [smsFor, setSmsFor] = useState<EnrichedAppointment | null>(null);
  const [batchFor, setBatchFor] = useState<EnrichedAppointment[] | null>(null);
  const [tab, setTab] = useState<SmsTab>('all');

  const overdue = useMemo(
    () => overdueAppointments(appointments, children, records),
    [appointments, children, records],
  );

  const upcoming = useMemo(
    () => upcomingAppointments(appointments, children, records),
    [appointments, children, records],
  );

  const actionable = useMemo(
    () => [...overdue, ...upcoming],
    [overdue, upcoming],
  );

  const tomorrowISO = daysFromNow(1);
  const today = todayISO();

  const tomorrowAppts = useMemo(
    () => actionable.filter((a) => a.scheduledDate === tomorrowISO),
    [actionable, tomorrowISO],
  );

  const todayAppts = useMemo(
    () => actionable.filter((a) => a.scheduledDate === today),
    [actionable, today],
  );

  const displayed = useMemo(() => {
    switch (tab) {
      case 'tomorrow':
        return tomorrowAppts;
      case 'overdue':
        return overdue;
      case 'today':
        return todayAppts;
      case 'all':
      default:
        return actionable;
    }
  }, [tab, tomorrowAppts, overdue, todayAppts, actionable]);

  const history = [...smsLog].sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-navy)]">
          SMS Notifications
        </h1>
        <p className="mt-1 text-sm text-[var(--color-navy-soft)]">
          One-click reminders from a fixed template ·{' '}
          <span className="font-semibold">
            {apiEnabled ? 'Provider acceptance does not confirm handset delivery' : 'simulated — no real messages are sent'}
          </span>
        </p>
      </div>

      <Card
        title={`Prepare reminders (${displayed.length})`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {displayed.length > 0 && (
              <button
                type="button"
                onClick={() => setBatchFor(displayed)}
                className="rounded-xl bg-[var(--color-accent)] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-accent-dark)]"
              >
                Send Batch Reminders ({displayed.length})
              </button>
            )}
          </div>
        }
      >
        {/* Quick filter tabs */}
        <div className="mb-3 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === 'all'
                ? 'bg-[var(--color-navy)] text-white'
                : 'bg-slate-100 text-[var(--color-navy-soft)] hover:bg-slate-200'
            }`}
          >
            All Actionable ({actionable.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('tomorrow')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === 'tomorrow'
                ? 'bg-[var(--color-navy)] text-white'
                : 'bg-slate-100 text-[var(--color-navy-soft)] hover:bg-slate-200'
            }`}
          >
            Tomorrow's Clinic ({tomorrowAppts.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('today')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === 'today'
                ? 'bg-[var(--color-navy)] text-white'
                : 'bg-slate-100 text-[var(--color-navy-soft)] hover:bg-slate-200'
            }`}
          >
            Today's Clinic ({todayAppts.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('overdue')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === 'overdue'
                ? 'bg-[var(--color-navy)] text-white'
                : 'bg-slate-100 text-[var(--color-navy-soft)] hover:bg-slate-200'
            }`}
          >
            Overdue / Defaulters ({overdue.length})
          </button>
        </div>

        {displayed.length === 0 ? (
          <EmptyState
            title="Nothing to remind in this view"
            message="No appointments match this filter."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {displayed.map((a) => {
              const v = vaccineById(a.vaccineId);
              const last = smsForChild(smsLog, a.child.id)[0];
              return (
                <li
                  key={a.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[var(--color-navy)]">
                        {childName(a.child)} · {v?.shortName} · Dose{' '}
                        {a.doseNumber}
                      </p>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {extractPurok(a.child.purok)}
                      </span>
                    </div>
                    <p className="text-[var(--color-navy-soft)]">
                      {formatDate(a.scheduledDate)}
                      {a.scheduledTime ? ` · ${formatTime(a.scheduledTime)}` : ''}{' '}
                      · {a.child.guardian} · {a.child.guardianMobile}
                    </p>
                    <p className="text-xs text-[var(--color-navy-soft)]">
                      {last
                        ? `Last reminded ${formatDate(last.sentAt)} · ${last.status}`
                        : 'Not yet reminded'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={a.status} />
                    <button
                      type="button"
                      onClick={() => setSmsFor(a)}
                      className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-accent-dark)]"
                    >
                      Send SMS reminder
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={`SMS history (${history.length})`}>
        {history.length === 0 ? (
          <EmptyState
            title="No reminders logged"
            message="Reminder attempts will appear here with their status."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {history.map((s) => {
              const child = childById(children, s.childId);
              return (
                <li
                  key={s.id}
                  className="rounded-xl border border-slate-200 p-3 text-sm"
                >
                  <p className="font-medium">
                    To {child ? childName(child) : '—'} · {s.status}
                  </p>
                  <p className="mt-1 text-[var(--color-navy-soft)]">{s.message}</p>
                  <p className="mt-1 text-xs text-[var(--color-navy-soft)]">
                    {formatDate(s.sentAt)} · {smsDeliveryLabel(s)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {smsFor && <SmsDialog appointment={smsFor} onClose={() => setSmsFor(null)} />}

      {batchFor && (
        <BatchSmsDialog
          appointments={batchFor}
          onClose={() => setBatchFor(null)}
          title={`Batch Reminders · ${tab === 'tomorrow' ? "Tomorrow's Clinic" : tab === 'overdue' ? 'Defaulter Follow-up' : 'All Actionable'}`}
        />
      )}
    </div>
  );
}
