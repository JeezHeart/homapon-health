import { Fragment, useState } from 'react';
import type { Appointment, Child, DoseRecord } from '../data/mockData';
import { appointmentStatus, childName } from '../data/mockData';
import { VACCINES, vaccineById } from '../data/vaccines';
import { useStore } from '../state/store-context';
import { formatDate, todayISO } from '../utils/dates';
import RemarksField from './RemarksField';

interface ImmunizationDocumentProps {
  child: Child;
  records: DoseRecord[];
  appointments: Appointment[];
}

type DoseState = 'Completed' | 'Scheduled' | 'Overdue' | 'Not yet given';

function doseState(
  childId: string,
  vaccineId: string,
  doseNumber: number,
  records: DoseRecord[],
  appointments: Appointment[],
): { state: DoseState; date?: string } {
  const rec = records.find(
    (r) =>
      r.childId === childId &&
      r.vaccineId === vaccineId &&
      r.doseNumber === doseNumber,
  );
  if (rec) return { state: 'Completed', date: rec.dateAdministered };
  const appt = appointments.find(
    (a) =>
      a.childId === childId &&
      a.vaccineId === vaccineId &&
      a.doseNumber === doseNumber,
  );
  if (appt) {
    const st = appointmentStatus(appt, records);
    if (st === 'overdue') return { state: 'Overdue', date: appt.scheduledDate };
    return { state: 'Scheduled', date: appt.scheduledDate };
  }
  return { state: 'Not yet given' };
}

type EditorStatus = 'completed' | 'scheduled' | 'none';

interface DoseRowEditorProps {
  childId: string;
  vaccineId: string;
  doseNumber: number;
  record?: DoseRecord;
  appointment?: Appointment;
  onDone: () => void;
}

const editorInputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-[var(--color-navy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

const editorLabelClass =
  'mb-1 block text-xs font-semibold text-[var(--color-navy-soft)]';

/**
 * Inline editor for one dose row. The status dropdown decides which
 * fields matter; saving writes dose records / appointments through
 * the store, and the row status re-derives from the saved data.
 */
function DoseRowEditor({
  childId,
  vaccineId,
  doseNumber,
  record,
  appointment,
  onDone,
}: DoseRowEditorProps) {
  const {
    addDoseRecord,
    updateDoseRecord,
    deleteDoseRecord,
    addAppointment,
    updateAppointment,
    deleteAppointment,
  } = useStore();
  const [status, setStatus] = useState<EditorStatus>(
    record ? 'completed' : appointment ? 'scheduled' : 'none',
  );
  const [dateGiven, setDateGiven] = useState(record?.dateAdministered ?? '');
  const [scheduledDate, setScheduledDate] = useState(
    appointment?.scheduledDate ?? '',
  );
  const [batchLot, setBatchLot] = useState(record?.batchLot ?? '');
  const [healthWorker, setHealthWorker] = useState(record?.healthWorker ?? '');
  const [remarks, setRemarks] = useState(record?.remarks ?? '');
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const hasExisting = record !== undefined || appointment !== undefined;
  const today = todayISO();

  function preview(): string {
    if (status === 'completed') return dateGiven ? 'Completed' : 'Completed (needs date given)';
    if (status === 'scheduled') {
      if (!scheduledDate) return 'Scheduled (needs a date)';
      if (scheduledDate < today) return 'Overdue';
      if (scheduledDate === today) return 'Due today';
      return 'Scheduled';
    }
    return hasExisting ? 'Will remove the existing entry' : 'Not yet given';
  }

  function handleSave() {
    setError('');
    if (status === 'completed') {
      if (!dateGiven) {
        setError('Date given is required to mark this dose completed.');
        return;
      }
      if (dateGiven > today) {
        setError('Date given cannot be in the future.');
        return;
      }
      if (!healthWorker.trim()) {
        setError('Health worker is required to mark this dose completed.');
        return;
      }
      const payload = {
        childId,
        vaccineId,
        doseNumber,
        dateAdministered: dateGiven,
        healthWorker: healthWorker.trim(),
        batchLot: batchLot.trim() ? batchLot.trim() : undefined,
        remarks: remarks.trim() ? remarks.trim() : undefined,
      };
      void (async () => {
        const result = record
          ? await updateDoseRecord(record.id, payload)
          : await addDoseRecord(payload);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone();
      })();
      return;
    }
    if (status === 'scheduled') {
      if (!scheduledDate) {
        setError('Scheduled date is required.');
        return;
      }
      if (scheduledDate < today) {
        setError('Scheduled date cannot be in the past. Overdue dates stay as they are until rescheduled forward.');
        return;
      }
      void (async () => {
        try {
          if (appointment) {
            await updateAppointment(appointment.id, {
              childId,
              vaccineId,
              doseNumber,
              scheduledDate,
            });
          } else {
            await addAppointment({ childId, vaccineId, doseNumber, scheduledDate });
          }
          onDone();
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Could not save the appointment.',
          );
        }
      })();
      return;
    }
    if (!hasExisting) {
      onDone();
      return;
    }
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    void (async () => {
      const results = await Promise.all([
        record ? deleteDoseRecord(record.id) : Promise.resolve({ ok: true as const }),
        appointment
          ? deleteAppointment(appointment.id)
          : Promise.resolve({ ok: true as const }),
      ]);
      const failed = results.find((r) => !r.ok);
      if (failed) {
        setError(
          (failed as { ok: false; error: string }).error ||
            'Could not remove the entry.',
        );
        return;
      }
      onDone();
    })();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div>
          <label htmlFor={`doc-status-${vaccineId}-${doseNumber}`} className={editorLabelClass}>
            Status *
          </label>
          <select
            id={`doc-status-${vaccineId}-${doseNumber}`}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as EditorStatus);
              setConfirmRemove(false);
              setError('');
            }}
            className={editorInputClass}
          >
            <option value="completed">Completed</option>
            <option value="scheduled">Scheduled</option>
            <option value="none">Not yet given</option>
          </select>
        </div>
        {status === 'completed' && (
          <div>
            <label htmlFor={`doc-given-${vaccineId}-${doseNumber}`} className={editorLabelClass}>
              Date given (Petsa) *
            </label>
            <input
              id={`doc-given-${vaccineId}-${doseNumber}`}
              type="date"
              value={dateGiven}
              max={today}
              onChange={(e) => setDateGiven(e.target.value)}
              className={editorInputClass}
            />
          </div>
        )}
        {status === 'scheduled' && (
          <div>
            <label htmlFor={`doc-sched-${vaccineId}-${doseNumber}`} className={editorLabelClass}>
              Scheduled date *
            </label>
            <input
              id={`doc-sched-${vaccineId}-${doseNumber}`}
              type="date"
              value={scheduledDate}
              min={today}
              onChange={(e) => setScheduledDate(e.target.value)}
              className={editorInputClass}
            />
          </div>
        )}
        {status === 'completed' && (
          <div>
            <label htmlFor={`doc-worker-${vaccineId}-${doseNumber}`} className={editorLabelClass}>
              Health worker *
            </label>
            <input
              id={`doc-worker-${vaccineId}-${doseNumber}`}
              value={healthWorker}
              onChange={(e) => setHealthWorker(e.target.value)}
              placeholder="Name of staff"
              className={editorInputClass}
            />
          </div>
        )}
        {status === 'completed' && (
          <div>
            <label htmlFor={`doc-batch-${vaccineId}-${doseNumber}`} className={editorLabelClass}>
              Batch / Lot
            </label>
            <input
              id={`doc-batch-${vaccineId}-${doseNumber}`}
              value={batchLot}
              onChange={(e) => setBatchLot(e.target.value)}
              className={editorInputClass}
            />
          </div>
        )}
        {status === 'completed' && (
          <div className="col-span-2 sm:col-span-1">
            <RemarksField
              id={`doc-remarks-${vaccineId}-${doseNumber}`}
              value={remarks}
              onChange={setRemarks}
              selectClassName={editorInputClass}
              inputClassName={editorInputClass}
              labelClassName={editorLabelClass}
            />
          </div>
        )}
      </div>
      <p className="text-xs text-[var(--color-navy-soft)]" aria-live="polite">
        Will save as: <span className="font-semibold">{preview()}</span>
      </p>
      {status === 'none' && hasExisting && (
        <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-800">
          Saving as “Not yet given” removes the existing entry for this dose.
          {confirmRemove ? ' Press “Confirm removal” to proceed.' : ' Press Save once more to confirm.'}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-[var(--color-navy)] px-3 py-1 text-xs font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          {status === 'none' && hasExisting && confirmRemove
            ? 'Confirm removal'
            : 'Save'}
        </button>
      </div>
    </div>
  );
}

/**
 * Digital immunization record modeled on the paper BAKUNA table
 * (columns: vaccine / dose / date / status / batch / worker / remarks).
 * Prints cleanly via the browser print flow; app chrome has .no-print.
 *
 * Every dose row is editable inline by the BHW: a status dropdown
 * (Completed / Scheduled / Not yet given) plus type-in fields for the
 * dates, batch/lot, health worker, and remarks. Status itself is never
 * stored — it is derived from the entered data (a filled "date given"
 * means Completed; a scheduled date in the past means Overdue), so the
 * schedule math in the rest of the app cannot drift out of sync.
 * The editing UI is hidden in print.
 */
export default function ImmunizationDocument({
  child,
  records,
  appointments,
}: ImmunizationDocumentProps) {
  const childRecords = records.filter((r) => r.childId === child.id);
  const recordFor = (vaccineId: string, doseNumber: number) =>
    childRecords.find(
      (r) => r.vaccineId === vaccineId && r.doseNumber === doseNumber,
    );
  const appointmentFor = (vaccineId: string, doseNumber: number) =>
    appointments.find(
      (a) =>
        a.childId === child.id &&
        a.vaccineId === vaccineId &&
        a.doseNumber === doseNumber,
    );
  const [editingKey, setEditingKey] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-[var(--color-navy)]">
      <div className="border-b-2 border-[var(--color-navy)] pb-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-navy-soft)]">
          Barangay Homapon Health Center · Legazpi City
        </p>
        <h3 className="text-xl font-bold">Child Immunization Record (ITR)</h3>
        <p className="mt-1 text-sm">
          {childName(child)} · Born {formatDate(child.birthDate)} · Guardian:{' '}
          {child.guardian}
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-100 text-[var(--color-navy)]">
              {['Bakuna', 'Dose', 'Petsa', 'Status', 'Batch / Lot', 'Health worker', 'Remarks'].map(
                (h) => (
                  <th key={h} className="border border-slate-300 px-2 py-1.5 font-semibold">
                    {h}
                  </th>
                ),
              )}
              <th className="no-print border border-slate-300 px-2 py-1.5 font-semibold">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {VACCINES.map((v) =>
              v.doses.map((d, i) => {
                const { state, date } = doseState(
                  child.id,
                  v.id,
                  d.doseNumber,
                  records,
                  appointments,
                );
                const rec = recordFor(v.id, d.doseNumber);
                const key = `${v.id}-${d.doseNumber}`;
                return (
                  <Fragment key={key}>
                  <tr>
                    {i === 0 && (
                      <td
                        rowSpan={v.doses.length}
                        className="border border-slate-300 px-2 py-1.5 align-top font-semibold"
                      >
                        {v.name}
                        <span className="block text-xs font-normal text-[var(--color-navy-soft)]">
                          {v.doses.length} dose{v.doses.length === 1 ? '' : 's'}
                        </span>
                      </td>
                    )}
                    <td className="border border-slate-300 px-2 py-1.5">
                      Dose {d.doseNumber} ({d.timingNote})
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5">
                      {date ? formatDate(date) : '—'}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 font-medium">
                      {state}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5">
                      {rec?.batchLot ?? '—'}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5">
                      {rec?.healthWorker ?? '—'}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5">
                      {rec?.remarks ?? '—'}
                    </td>
                    <td className="no-print border border-slate-300 px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingKey((cur) => (cur === key ? null : key))
                        }
                        aria-expanded={editingKey === key}
                        className="rounded-lg border border-slate-300 px-2 py-0.5 text-xs font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                      >
                        {editingKey === key ? 'Close' : 'Edit'}
                      </button>
                    </td>
                  </tr>
                  {editingKey === key && (
                    <tr className="no-print">
                      <td colSpan={8} className="border border-slate-300 bg-slate-50 px-3 py-3">
                        <DoseRowEditor
                          childId={child.id}
                          vaccineId={v.id}
                          doseNumber={d.doseNumber}
                          record={rec}
                          appointment={appointmentFor(v.id, d.doseNumber)}
                          onDone={() => setEditingKey(null)}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              }),
            )}
            <tr>
              <td className="border border-slate-300 px-2 py-1.5 font-semibold">
                Iba pang mga bakuna
              </td>
              <td colSpan={6} className="border border-slate-300 px-2 py-1.5 text-[var(--color-navy-soft)]">
                Additional locally required entries — none recorded in this demo.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-[var(--color-navy-soft)]">
        Prototype record transcribed from the supplied paper reference. Dose
        counts and timing must be confirmed against the current Philippine
        immunization schedule before clinical use. Schedule details:{' '}
        {VACCINES.map((v) => vaccineById(v.id)?.shortName).join(', ')}.
      </p>
    </div>
  );
}
