import { useState } from 'react';
import type { EnrichedAppointment, SmsEntry } from '../data/mockData';
import { childName, renderSmsMessage } from '../data/mockData';
import { api, apiEnabled, apiError } from '../data/api';
import { vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { formatDate, formatTime, todayISO } from '../utils/dates';
import Dialog from './Dialog';

interface SmsDialogProps {
  appointment: EnrichedAppointment;
  onClose: () => void;
}

/**
 * One-click SMS reminder (prd.md section 11). Confirmation first,
 * then a clearly labeled SIMULATED send. No real messages leave the
 * browser in this phase.
 */
export default function SmsDialog({ appointment, onClose }: SmsDialogProps) {
  const { logSms, refreshSms } = useStore();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [sendError, setSendError] = useState('');
  const [liveResult, setLiveResult] = useState<
    { status: SmsEntry['status']; dryRun: boolean; provider: string } | null
  >(null);

  const { child } = appointment;
  const vaccine = vaccineById(appointment.vaccineId);
  const message = renderSmsMessage(
    childName(child),
    formatDate(appointment.scheduledDate),
    appointment.scheduledTime,
  );
  // Live backend path when API is configured; otherwise the
  // clearly-labeled demo simulation below.
  const live = apiEnabled;

  function handleConfirm() {
    setSending(true);
    setSendError('');
    if (live) {
      void (async () => {
        try {
          const res = await api.sendSms(child.id, appointment.id);
          await refreshSms();
          setLiveResult({
            status: res.entry.status,
            dryRun: res.provider.dryRun,
            provider: res.provider.name === 'unisms' ? 'UniSMS' : 'Semaphore',
          });
          setDone(true);
        } catch (err) {
          setSendError(apiError(err));
        } finally {
          setSending(false);
        }
      })();
      return;
    }
    // Simulated network delay; deliberately always "sent" so the demo
    // is deterministic. A "Demo failed" sample exists in seed history.
    window.setTimeout(() => {
      void (async () => {
        try {
          await logSms(child.id, message, 'Demo sent', todayISO());
          setDone(true);
        } catch (err) {
          setSendError(
            err instanceof Error ? err.message : 'Could not log the reminder.',
          );
        } finally {
          setSending(false);
        }
      })();
    }, 800);
  }

  return (
    <Dialog title="Send SMS reminder" onClose={onClose}>
      {!done ? (
        <div className="flex flex-col gap-4">
          <p
            role="note"
            className={`rounded-xl px-3 py-2 text-xs font-semibold ${live ? 'bg-teal-50 text-[var(--color-accent-dark)]' : 'bg-amber-50 text-amber-800'}`}
          >
            {live
              ? 'Backend SMS — the server may use dry-run. Provider acceptance does not confirm handset delivery.'
              : 'SIMULATED — confirming will log a demo entry only. No real message is sent in this phase.'}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-4 text-sm">
            <dt className="text-[var(--color-navy-soft)]">Child</dt>
            <dd className="font-medium">{childName(child)}</dd>
            <dt className="text-[var(--color-navy-soft)]">Guardian mobile</dt>
            <dd className="font-medium">{child.guardianMobile}</dd>
            <dt className="text-[var(--color-navy-soft)]">Appointment</dt>
            <dd className="font-medium">
              {vaccine?.shortName} · Dose {appointment.doseNumber} ·{' '}
              {formatDate(appointment.scheduledDate)}
              {appointment.scheduledTime ? ` (${formatTime(appointment.scheduledTime)})` : ''}
            </dd>
          </dl>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-navy-soft)]">
              Exact message
            </p>
            <p className="text-sm">{message}</p>
          </div>
          {sendError && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {sendError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={sending}
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)] disabled:opacity-50"
            >
              {sending
                ? live
                  ? 'Sending…'
                  : 'Sending (demo)…'
                : live
                  ? 'Confirm & send'
                  : 'Confirm & send (demo)'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p
            className={`rounded-xl px-3 py-2 text-sm font-medium ${liveResult && liveResult.status === 'Failed' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}
          >
            {liveResult
              ? liveResult.dryRun
                ? 'Demo reminder logged — provider not called.'
                : liveResult.status === 'Accepted'
                  ? `Accepted by ${liveResult.provider} — handset delivery is unconfirmed. Logged to SMS history.`
                  : 'Delivery is not confirmed. Check SMS history before sending again.'
              : 'Demo sent — logged to SMS history. No real message was sent.'}
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-[var(--color-navy)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
