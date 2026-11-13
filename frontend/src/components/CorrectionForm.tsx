import { useState } from 'react';
import type { FormEvent } from 'react';
import type { DoseRecord } from '../data/mockData';
import { useStore } from '../state/store-context';
import { todayISO } from '../utils/dates';
import RemarksField from './RemarksField';

const inputClass =
  'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-[var(--color-navy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

/**
 * Correction mode for a mistaken dose entry (prd.md section 9).
 * Only date/worker/batch/remarks are editable — the child, vaccine,
 * and dose stay fixed so history cannot be silently rewritten.
 */
export default function CorrectionForm({
  record,
  onClose,
}: {
  record: DoseRecord;
  onClose: () => void;
}) {
  const { updateDoseRecord } = useStore();
  const [dateAdministered, setDateAdministered] = useState(record.dateAdministered);
  const [healthWorker, setHealthWorker] = useState(record.healthWorker);
  const [batchLot, setBatchLot] = useState(record.batchLot ?? '');
  const [remarks, setRemarks] = useState(record.remarks ?? '');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dateAdministered) {
      setError('Date administered is required.');
      return;
    }
    if (dateAdministered > todayISO()) {
      setError('Date cannot be in the future.');
      return;
    }
    if (!healthWorker.trim()) {
      setError('Administering health worker is required.');
      return;
    }
    const result = await updateDoseRecord(record.id, {
      dateAdministered,
      healthWorker: healthWorker.trim(),
      batchLot: batchLot.trim() ? batchLot.trim() : undefined,
      remarks: remarks.trim() ? remarks.trim() : undefined,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <p className="-mt-1 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
        Correction mode — changes to this entry are for fixing mistakes.
        The child, vaccine, and dose cannot be changed here.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ce-date" className="mb-1 block text-xs font-semibold">
            Date administered *
          </label>
          <input
            id="ce-date"
            type="date"
            value={dateAdministered}
            max={todayISO()}
            onChange={(e) => setDateAdministered(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="ce-worker" className="mb-1 block text-xs font-semibold">
            Health worker *
          </label>
          <input
            id="ce-worker"
            value={healthWorker}
            onChange={(e) => setHealthWorker(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor="ce-batch" className="mb-1 block text-xs font-semibold">
          Batch / lot number
        </label>
        <input
          id="ce-batch"
          value={batchLot}
          onChange={(e) => setBatchLot(e.target.value)}
          className={inputClass}
        />
      </div>
      <RemarksField
        id="ce-remarks"
        value={remarks}
        onChange={setRemarks}
        selectClassName={inputClass}
        inputClassName={inputClass}
        labelClassName="mb-1 block text-xs font-semibold"
      />
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
        >
          Save changes
        </button>
      </div>
    </form>
  );
}
