import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Appointment, Child, DoseRecord } from '../data/mockData';
import { childName, nextIncompleteDose } from '../data/mockData';
import type { NewAppointment } from '../data/mockData';
import { VACCINES, vaccineById } from '../data/vaccines';
import { todayISO } from '../utils/dates';
import { isRegularClinicDay, nextRegularClinicDate } from '../utils/clinicScheduling';

interface AppointmentDialogProps {
  childList: Child[];
  records: DoseRecord[];
  defaultChildId?: string;
  lockChild?: boolean;
  defaultVaccineId?: string;
  defaultDoseNumber?: number;
  initial?: Appointment;
  onSave: (data: NewAppointment, id?: string) => void | Promise<void>;
  onClose: () => void;
}

const inputClass =
  'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-[var(--color-navy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

/** Book a new appointment or reschedule an existing one. */
export default function AppointmentDialog({
  childList,
  records,
  defaultChildId,
  lockChild,
  defaultVaccineId,
  defaultDoseNumber,
  initial,
  onSave,
  onClose,
}: AppointmentDialogProps) {
  const [childId, setChildId] = useState(
    initial?.childId ?? defaultChildId ?? childList[0]?.id ?? '',
  );
  const [vaccineId, setVaccineId] = useState(
    initial?.vaccineId ?? defaultVaccineId ?? 'penta',
  );
  const suggested = useMemo(
    () => nextIncompleteDose(records, childId, vaccineId),
    [records, childId, vaccineId],
  );
  const [doseNumber, setDoseNumber] = useState(
    initial?.doseNumber ?? defaultDoseNumber ?? suggested ?? 1,
  );
  const [scheduledDate, setScheduledDate] = useState(
    initial?.scheduledDate ?? nextRegularClinicDate(),
  );
  const [scheduledTime, setScheduledTime] = useState(
    initial?.scheduledTime ?? '',
  );
  const [error, setError] = useState('');
  const [exceptionReason, setExceptionReason] = useState(initial?.scheduleExceptionReason ?? '');
  const [saving, setSaving] = useState(false);
  const isException = !!scheduledDate && !isRegularClinicDay(scheduledDate);

  const vaccine = vaccineById(vaccineId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError('');
    if (!childId) {
      setError('Choose a child.');
      return;
    }
    if (!scheduledDate) {
      setError('Pick an appointment date.');
      return;
    }
    if (scheduledDate < todayISO()) {
      setError('Appointment date cannot be in the past.');
      return;
    }
    if (isException && !exceptionReason.trim()) {
      setError('Enter a reason for scheduling outside Wednesday.');
      return;
    }
    if (isException && exceptionReason.trim().length > 500) {
      setError('Schedule exception reason must be 500 characters or fewer.');
      return;
    }
    setSaving(true);
    try {
      await onSave(
        {
          childId,
          vaccineId,
          doseNumber,
          scheduledDate,
          scheduledTime: scheduledTime ? scheduledTime : undefined,
          ...(isException || initial?.scheduleExceptionReason
            ? { scheduleExceptionReason: isException ? exceptionReason.trim() : '' }
            : {}),
        },
        initial?.id,
      );
      onClose();
    } catch (err) {
      setSaving(false);
      setError(
        err instanceof Error ? err.message : 'Could not save the appointment.',
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <label htmlFor="ap-child" className="mb-1 block text-xs font-semibold">
          Child *
        </label>
        <select
          id="ap-child"
          value={childId}
          disabled={lockChild}
          onChange={(e) => setChildId(e.target.value)}
          className={inputClass}
        >
          {childList.map((c) => (
            <option key={c.id} value={c.id}>
              {childName(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ap-vaccine" className="mb-1 block text-xs font-semibold">
            Vaccine *
          </label>
          <select
            id="ap-vaccine"
            value={vaccineId}
            onChange={(e) => setVaccineId(e.target.value)}
            className={inputClass}
          >
            {VACCINES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.shortName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ap-dose" className="mb-1 block text-xs font-semibold">
            Dose number *
          </label>
          <select
            id="ap-dose"
            value={doseNumber}
            onChange={(e) => setDoseNumber(Number(e.target.value))}
            className={inputClass}
          >
            {(vaccine?.doses ?? []).map((d) => (
              <option key={d.doseNumber} value={d.doseNumber}>
                Dose {d.doseNumber} · {d.timingNote}
              </option>
            ))}
          </select>
          {suggested !== undefined && !initial && (
            <p className="mt-1 text-xs text-[var(--color-navy-soft)]">
              Suggested next dose: Dose {suggested}.
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ap-date" className="mb-1 block text-xs font-semibold">
            Appointment date *
          </label>
          <input
            id="ap-date"
            type="date"
            value={scheduledDate}
            min={todayISO()}
            onChange={(e) => {
              setScheduledDate(e.target.value);
              if (isRegularClinicDay(e.target.value)) setExceptionReason('');
              setError('');
            }}
            aria-describedby="ap-date-help"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="ap-time" className="mb-1 block text-xs font-semibold">
            Time (optional)
          </label>
          <input
            id="ap-time"
            type="time"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <p id="ap-date-help" className="text-xs text-[var(--color-navy-soft)]">
        Regular clinic day: Wednesday. Staff may choose another day for a holiday or rescheduling.
      </p>
      {isException && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <label htmlFor="ap-exception-reason" className="mb-1 block text-sm font-semibold text-amber-950">
            Reason for another day *
          </label>
          <input
            id="ap-exception-reason"
            value={exceptionReason}
            onChange={(e) => setExceptionReason(e.target.value)}
            maxLength={500}
            required
            aria-describedby="ap-exception-help"
            aria-invalid={error === 'Enter a reason for scheduling outside Wednesday.'}
            className={`${inputClass} bg-white`}
          />
          <p id="ap-exception-help" className="mt-1 text-xs text-amber-950">
            For example: Wednesday is a holiday; appointment moved to Thursday.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {saving ? 'Saving…' : initial ? 'Save new date' : 'Book appointment'}
        </button>
      </div>
    </form>
  );
}
