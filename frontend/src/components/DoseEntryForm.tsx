import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Child, DoseRecord } from '../data/mockData';
import { childName } from '../data/mockData';
import type { NewDoseRecord } from '../data/mockData';
import { VACCINES, vaccineById } from '../data/vaccines';
import { todayISO } from '../utils/dates';
import RemarksField from './RemarksField';

interface DoseEntryFormProps {
  childList: Child[];
  records: DoseRecord[];
  defaultChildId?: string;
  lockChild?: boolean;
  defaultVaccineId?: string;
  defaultDoseNumber?: number;
  onSave: (
    data: NewDoseRecord,
  ) =>
    | Promise<{ ok: true; record: DoseRecord } | { ok: false; error: string }>
    | { ok: true; record: DoseRecord }
    | { ok: false; error: string };
  onDone: () => void;
  onScheduleNext?: (info: {
    childId: string;
    vaccineId: string;
    doseNumber: number;
  }) => void;
}

const inputClass =
  'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-[var(--color-navy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

/**
 * Recordkeeping workflow for a vaccine that was administered (prd.md
 * section 9). Form -> review -> confirm. No clinical guidance.
 */
export default function DoseEntryForm({
  childList,
  records,
  defaultChildId,
  lockChild,
  defaultVaccineId,
  defaultDoseNumber,
  onSave,
  onDone,
  onScheduleNext,
}: DoseEntryFormProps) {
  const [childId, setChildId] = useState(defaultChildId ?? childList[0]?.id ?? '');
  const [vaccineId, setVaccineId] = useState(defaultVaccineId ?? 'penta');
  const [doseNumber, setDoseNumber] = useState(defaultDoseNumber ?? 1);
  const [dateAdministered, setDateAdministered] = useState(todayISO());
  const [healthWorker, setHealthWorker] = useState('');
  const [batchLot, setBatchLot] = useState('');
  const [remarks, setRemarks] = useState('');
  const [step, setStep] = useState<'form' | 'review' | 'saved'>('form');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');

  const completedDoses = useMemo(
    () =>
      new Set(
        records
          .filter((r) => r.childId === childId && r.vaccineId === vaccineId)
          .map((r) => r.doseNumber),
      ),
    [records, childId, vaccineId],
  );

  const vaccine = vaccineById(vaccineId);
  const availableDoses = (vaccine?.doses ?? []).filter(
    (d) => !completedDoses.has(d.doseNumber),
  );
  const selectedChild = childList.find((c) => c.id === childId);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!childId) next.child = 'Choose a child.';
    if (!vaccineId) next.vaccine = 'Choose a vaccine.';
    if (!dateAdministered) next.date = 'Date administered is required.';
    else if (dateAdministered > todayISO())
      next.date = 'Date cannot be in the future.';
    if (!healthWorker.trim())
      next.healthWorker = 'Administering health worker is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleReview(e: FormEvent) {
    e.preventDefault();
    setSaveError('');
    if (!validate()) return;
    if (completedDoses.has(doseNumber)) {
      setErrors({
        dose: 'This dose is already recorded as completed for this child.',
      });
      return;
    }
    setStep('review');
  }

  async function handleConfirm() {
    const result = await onSave({
      childId,
      vaccineId,
      doseNumber,
      dateAdministered,
      healthWorker: healthWorker.trim(),
      batchLot: batchLot.trim() ? batchLot.trim() : undefined,
      remarks: remarks.trim() ? remarks.trim() : undefined,
    });
    if (!result.ok) {
      setSaveError(result.error);
      setStep('form');
      return;
    }
    setStep('saved');
  }

  function fieldError(name: string) {
    return errors[name] ? (
      <p role="alert" className="mt-1 text-xs font-medium text-red-700">
        {errors[name]}
      </p>
    ) : null;
  }

  function childOptions() {
    return childList.map((c) => (
      <option key={c.id} value={c.id}>
        {childName(c)}
      </option>
    ));
  }

  if (step === 'saved' && selectedChild) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          Record saved for {childName(selectedChild)}. Booking the next
          visit keeps the schedule — and future SMS reminders — alive.
        </p>
        <div className="flex justify-end gap-2">
          {onScheduleNext && (
            <button
              type="button"
              onClick={() =>
                onScheduleNext({ childId, vaccineId, doseNumber })
              }
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
            >
              Schedule next appointment
            </button>
          )}
          <button
            type="button"
            onClick={onDone}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (step === 'review' && selectedChild) {
    const v = vaccineById(vaccineId);
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-navy-soft)]">
          Review the entry before saving. Nothing is recorded until you confirm.
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-4 text-sm">
          <dt className="text-[var(--color-navy-soft)]">Child</dt>
          <dd className="font-medium">{childName(selectedChild)}</dd>
          <dt className="text-[var(--color-navy-soft)]">Vaccine</dt>
          <dd className="font-medium">{v?.name}</dd>
          <dt className="text-[var(--color-navy-soft)]">Dose</dt>
          <dd className="font-medium">Dose {doseNumber}</dd>
          <dt className="text-[var(--color-navy-soft)]">Date given</dt>
          <dd className="font-medium">{dateAdministered}</dd>
          <dt className="text-[var(--color-navy-soft)]">Health worker</dt>
          <dd className="font-medium">{healthWorker}</dd>
          <dt className="text-[var(--color-navy-soft)]">Batch / lot</dt>
          <dd className="font-medium">{batchLot || '—'}</dd>
          <dt className="text-[var(--color-navy-soft)]">Remarks</dt>
          <dd className="font-medium">{remarks || '—'}</dd>
        </dl>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setStep('form')}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            Back to edit
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
          >
            Confirm & save
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleReview} noValidate className="flex flex-col gap-4">
      <div>
        <label htmlFor="de-child" className="mb-1 block text-xs font-semibold">
          Child *
        </label>
        <select
          id="de-child"
          value={childId}
          disabled={lockChild}
          onChange={(e) => setChildId(e.target.value)}
          className={inputClass}
        >
          {childOptions()}
        </select>
        {fieldError('child')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="de-vaccine" className="mb-1 block text-xs font-semibold">
            Vaccine *
          </label>
          <select
            id="de-vaccine"
            value={vaccineId}
            onChange={(e) => {
              const nextVaccine = e.target.value;
              setVaccineId(nextVaccine);
              const done = new Set(
                records
                  .filter(
                    (r) => r.childId === childId && r.vaccineId === nextVaccine,
                  )
                  .map((r) => r.doseNumber),
              );
              const firstOpen = vaccineById(nextVaccine)?.doses.find(
                (d) => !done.has(d.doseNumber),
              );
              setDoseNumber(firstOpen?.doseNumber ?? 1);
            }}
            className={inputClass}
          >
            {VACCINES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.shortName}
              </option>
            ))}
          </select>
          {fieldError('vaccine')}
        </div>
        <div>
          <label htmlFor="de-dose" className="mb-1 block text-xs font-semibold">
            Dose number *
          </label>
          <select
            id="de-dose"
            value={doseNumber}
            onChange={(e) => setDoseNumber(Number(e.target.value))}
            className={inputClass}
          >
            {(vaccine?.doses ?? []).map((d) => (
              <option
                key={d.doseNumber}
                value={d.doseNumber}
                disabled={completedDoses.has(d.doseNumber)}
              >
                Dose {d.doseNumber}
                {completedDoses.has(d.doseNumber) ? ' (recorded)' : ''} ·{' '}
                {d.timingNote}
              </option>
            ))}
          </select>
          {fieldError('dose')}
          {availableDoses.length === 0 && (
            <p className="mt-1 text-xs text-[var(--color-navy-soft)]">
              All doses of this vaccine are already recorded for this child.
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="de-date" className="mb-1 block text-xs font-semibold">
            Date administered *
          </label>
          <input
            id="de-date"
            type="date"
            value={dateAdministered}
            max={todayISO()}
            onChange={(e) => setDateAdministered(e.target.value)}
            className={inputClass}
          />
          {fieldError('date')}
        </div>
        <div>
          <label htmlFor="de-worker" className="mb-1 block text-xs font-semibold">
            Administering health worker *
          </label>
          <input
            id="de-worker"
            placeholder="Name of staff"
            value={healthWorker}
            onChange={(e) => setHealthWorker(e.target.value)}
            className={inputClass}
          />
          {fieldError('healthWorker')}
        </div>
      </div>
      <div>
        <label htmlFor="de-batch" className="mb-1 block text-xs font-semibold">
          Batch / lot number (optional)
        </label>
        <input
          id="de-batch"
          value={batchLot}
          onChange={(e) => setBatchLot(e.target.value)}
          className={inputClass}
        />
      </div>
      <RemarksField
        id="de-remarks"
        value={remarks}
        onChange={setRemarks}
        selectClassName={inputClass}
        inputClassName={inputClass}
        labelClassName="mb-1 block text-xs font-semibold"
      />
      {saveError && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {saveError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
        >
          Review entry
        </button>
      </div>
    </form>
  );
}
