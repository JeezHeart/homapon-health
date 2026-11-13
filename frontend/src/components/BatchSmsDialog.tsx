import { useSmsAvailability } from '../utils/useSmsAvailability';
import { useCallback, useEffect, useRef, useState } from 'react';
import Dialog from './Dialog';
import { smsMessageError, smsUnits, smsTodayISO as todayISO } from '../utils/sms';
import type { EnrichedAppointment } from '../data/mockData';
import { childName, renderSmsMessage } from '../data/mockData';
import { api, apiEnabled, apiError } from '../data/api';
import { vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { formatDate, formatTime } from '../utils/dates';
import { sendBatch } from '../utils/batchSms';
import type { BatchResult } from '../utils/batchSms';

interface BatchSmsDialogProps {
  appointments: EnrichedAppointment[];
  onClose: () => void;
  title?: string;
}

export default function BatchSmsDialog({
  appointments,
  onClose,
  title = 'Send Batch SMS Reminders',
}: BatchSmsDialogProps) {
  const { logSms, refreshSms } = useStore();
  const availability = useSmsAvailability();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(appointments.map((a) => a.id)),
  );
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [completedCount, setCompletedCount] = useState<number | null>(null);
  const [batch, setBatch] = useState<EnrichedAppointment[] | null>(null);
  const [succeeded, setSucceeded] = useState(0);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [now, setNow] = useState(Date.now);
  const inFlight = useRef(false);

  const [transactionDate, setTransactionDate] = useState(todayISO);
  useEffect(() => {
    const timer = window.setInterval(() => setTransactionDate(todayISO()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const preview = (a: EnrichedAppointment) => renderSmsMessage(
    a.child.guardian, childName(a.child), a.scheduledDate, a.scheduledTime, transactionDate,
  );
  const live = apiEnabled;
  const selectedAppointments = appointments.filter((a) => selectedIds.has(a.id));
  const retryAt = result?.status === 'rate-limited' ? result.retryAt : null;
  const waitSeconds = retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000));
  const uncertain = result?.status === 'uncertain';
  const invalidSelection = (batch ? batch.slice(succeeded) : selectedAppointments).some((a) => Boolean(smsMessageError(preview(a))));

  useEffect(() => {
    if (retryAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const closeDialog = useCallback(() => {
    if (!inFlight.current) onClose();
  }, [onClose]);

  function toggleAll() {
    if (selectedIds.size === appointments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(appointments.map((a) => a.id)));
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  async function handleSend() {
    if (!availability.enabled || inFlight.current || invalidSelection || uncertain || (retryAt !== null && Date.now() < retryAt)) return;
    if (transactionDate !== todayISO()) {
      setTransactionDate(todayISO());
      return;
    }
    const queue = batch ?? [...selectedAppointments];
    if (queue.length === 0) return;
    inFlight.current = true;
    setBatch(queue);
    setSending(true);
    setResult(null);
    setProgress({ current: succeeded + 1, total: queue.length });

    try {
      const outcome = await sendBatch(queue, succeeded, async (appt) => {
        if (transactionDate !== todayISO()) throw new Error('Transaction date changed. Review the batch before sending further reminders.');
        const msg = preview(appt);
        const error = smsMessageError(msg);
        if (error) throw new Error(error);
        if (live) {
          await api.sendSms(appt.child.id, appt.id);
        } else {
          // Simulated send with slight delay for realistic UI feedback
          await new Promise((r) => setTimeout(r, 200));
          await logSms(appt.child.id, msg, 'Demo sent', transactionDate);
        }
      }, (count) => {
        setSucceeded(count);
        setProgress({ current: Math.min(count + 1, queue.length), total: queue.length });
      });
      setResult(outcome);
      setNow(Date.now());
      if (outcome.status === 'completed') setCompletedCount(outcome.succeeded);
      // History refresh is separate from delivery: failure must not undo successes.
      if (live) void refreshSms().catch(() => {});
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <Dialog title={title} onClose={closeDialog}>
      {completedCount !== null ? (
        <div className="flex flex-col gap-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--color-navy)]">
              Batch Reminders Processed
            </h3>
            <p className="mt-1 text-sm text-[var(--color-navy-soft)]">
              Successfully processed {completedCount} reminder
              {completedCount === 1 ? '' : 's'}.{' '}
              {!live && '(Simulated entries recorded in Demo SMS log)'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mx-auto rounded-xl bg-[var(--color-accent)] px-6 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Close
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <p
            role="note"
            className={`rounded-xl px-3 py-2 text-xs font-semibold ${
              live
                ? 'bg-teal-50 text-[var(--color-accent-dark)]'
                : 'bg-amber-50 text-amber-800'
            }`}
          >
            {live
              ? 'Backend SMS — the server may use dry-run. Provider acceptance does not confirm handset delivery.'
              : 'SIMULATED — Confirming will log demo reminder entries. No actual SMS will leave the browser.'}
          </p>

          {batch && (
            <p role="status" className="rounded-xl bg-slate-50 px-3 py-2 font-semibold">
              {succeeded} succeeded · {batch.length - succeeded} remaining unconfirmed.
              {uncertain && ` 1 delivery uncertain; ${batch.length - succeeded - 1} not attempted.`}
            </p>
          )}

          {result?.status === 'rate-limited' && (
            <p role="status" className="text-xs font-medium text-amber-800">
              Rate limit reached. {waitSeconds > 0 ? `Wait ${waitSeconds} seconds, then resume.` : 'Ready to resume.'}
              {' '}Successful reminders will not be sent again. Keep this dialog open to resume.
            </p>
          )}

          {result?.status === 'uncertain' && batch && (
            <p role="alert" className="text-xs font-medium text-red-700">
              {apiError(result.error)} Batch stopped at {childName(batch[result.succeeded].child)}.
              {' '}Delivery may be uncertain. Check SMS history and confirm the outcome before preparing another batch. No reminders will be retried here.
            </p>
          )}

          <p>Transaction Date: {formatDate(transactionDate)}</p>
          {invalidSelection && <p role="alert" className="text-red-700">Some selected reminders cannot fit one SMS or have missing details. Deselect the affected reminders to continue.</p>}
          {availability.message && <p role="status" className="text-sm text-amber-800">{availability.message}</p>}
          {/* Selection toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <label className="flex items-center gap-2 font-medium text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={
                  appointments.length > 0 &&
                  selectedIds.size === appointments.length
                }
                onChange={toggleAll}
                disabled={batch !== null}
                className="rounded text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
              />
              Select All ({appointments.length})
            </label>
            <span className="text-xs text-[var(--color-navy-soft)]">
              {selectedIds.size} of {appointments.length} selected
            </span>
          </div>

          <p className="text-xs text-[var(--color-navy-soft)]">Each selected appointment prepares a separate SMS, including appointments for the same child.</p>
          {/* Recipients List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
            {(batch ?? appointments).map((a, index) => {
              const checked = selectedIds.has(a.id);
              const vac = vaccineById(a.vaccineId);
              const message = preview(a);
              const error = smsMessageError(message);
              return (
                <label
                  key={a.id}
                  className={`flex items-start gap-3 p-2.5 transition-colors cursor-pointer hover:bg-slate-50 ${
                    checked ? 'bg-sky-50/40' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(a.id)}
                    disabled={batch !== null}
                    className="mt-1 rounded text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <div className="min-w-0 flex-1 break-words text-xs">
                    <p className="font-semibold text-[var(--color-navy)]">
                      {childName(a.child)} · {vac?.shortName} Dose {a.doseNumber}
                    </p>
                    <p className="text-[var(--color-navy-soft)]">
                      Date: {formatDate(a.scheduledDate)}
                      {a.scheduledTime ? ` · ${formatTime(a.scheduledTime)}` : ''} · Guardian: {a.child.guardian} ({a.child.guardianMobile})
                    </p>
                    <p className="text-[11px] text-slate-500">{a.child.purok}</p>
                    <p className="mt-2 break-words">{message}</p>
                    <p>{message.length}/160 characters | {smsUnits(message)}/160 SMS units</p>
                    {error && <p className="text-red-700">{error}</p>}
                    {batch && (
                      <p className="font-semibold">
                        {index < succeeded ? 'Successfully processed' : uncertain && index === succeeded ? 'Delivery uncertain — check before retrying' : 'Not sent yet'}
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          {/* Progress Indicator */}
          {sending && progress && (
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex justify-between text-xs font-medium text-[var(--color-navy)] mb-1">
                <span>Sending reminders…</span>
                <span>
                  {progress.current} / {progress.total}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-[var(--color-accent)] transition-all duration-200"
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              disabled={sending}
              onClick={closeDialog}
              className="rounded-xl border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {batch ? 'Close' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={!availability.enabled || sending || invalidSelection || selectedIds.size === 0 || waitSeconds > 0 || uncertain}
              onClick={handleSend}
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 font-semibold text-white hover:bg-[var(--color-accent-dark)] disabled:opacity-50"
            >
              {sending
                ? `Sending (${progress?.current ?? 0}/${progress?.total ?? selectedIds.size})…`
                : uncertain
                  ? 'Stopped — review delivery'
                  : batch
                    ? waitSeconds > 0 ? `Resume in ${waitSeconds}s` : `Resume ${batch.length - succeeded} remaining`
                    : `Send ${selectedIds.size} reminder${selectedIds.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
