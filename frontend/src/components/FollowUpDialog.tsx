import { useState } from 'react';
import type { FormEvent } from 'react';
import Dialog from './Dialog';
import type { EnrichedAppointment, FollowUpStatus } from '../data/mockData';
import { childName } from '../data/mockData';
import { vaccineById } from '../data/vaccines';
import { formatDate } from '../utils/dates';

interface FollowUpDialogProps {
  appointment: EnrichedAppointment;
  onClose: () => void;
  onSave: (status: FollowUpStatus, notes: string) => Promise<void>;
}

const STATUS_OPTIONS: { id: FollowUpStatus; label: string; desc: string }[] = [
  { id: 'Pending', label: 'Pending / Needs Follow-up', desc: 'No action taken yet' },
  { id: 'Contacted', label: 'Contacted via SMS / Call', desc: 'Guardian reached remotely' },
  { id: 'Home Visited', label: 'Home Visit Conducted', desc: 'BHW visited the household' },
  { id: 'Rescheduled', label: 'Rescheduled', desc: 'New appointment date agreed upon' },
];

const QUICK_REASONS = [
  'Child had fever / mild illness',
  'Parent working / out of town',
  'Guardian promised to attend next clinic day',
  'Relocated / temporary stay',
];

const inputClass =
  'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-[var(--color-navy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

export default function FollowUpDialog({
  appointment,
  onClose,
  onSave,
}: FollowUpDialogProps) {
  const [status, setStatus] = useState<FollowUpStatus>(
    appointment.followUpStatus ?? 'Contacted',
  );
  const [notes, setNotes] = useState(appointment.followUpNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const vaccine = vaccineById(appointment.vaccineId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(status, notes.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save follow-up record.');
      setSaving(false);
    }
  }

  function appendReason(reason: string) {
    if (!notes.trim()) {
      setNotes(reason);
    } else if (!notes.includes(reason)) {
      setNotes(`${notes.trim()}; ${reason}`);
    }
  }

  return (
    <Dialog
      title={`Log Defaulter Follow-up · ${childName(appointment.child)}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-sm">
        <div className="rounded-xl bg-slate-50 p-3 text-xs text-[var(--color-navy-soft)]">
          <p className="font-semibold text-[var(--color-navy)]">
            {childName(appointment.child)} · {vaccine?.shortName} Dose {appointment.doseNumber}
          </p>
          <p className="mt-0.5">
            Due date: <span className="font-medium text-red-700">{formatDate(appointment.scheduledDate)}</span>
            {appointment.daysOverdue ? ` (${appointment.daysOverdue} days overdue)` : ''} · Guardian: {appointment.child.guardian} ({appointment.child.guardianMobile})
          </p>
          <p className="mt-0.5">Address: {appointment.child.purok}</p>
        </div>

        {error && (
          <p role="alert" className="text-xs font-medium text-red-700">
            {error}
          </p>
        )}

        <div>
          <label htmlFor="fup-status" className="mb-1 block text-xs font-semibold">
            Follow-up Status *
          </label>
          <select
            id="fup-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as FollowUpStatus)}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label} — {opt.desc}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="fup-notes" className="mb-1 block text-xs font-semibold">
            Follow-up Notes / Reason for Delay
          </label>
          <textarea
            id="fup-notes"
            rows={3}
            placeholder="e.g. Visited house in Purok 3. Mother said infant had slight cough, will visit clinic on Wednesday."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="text-[11px] text-[var(--color-navy-soft)]">Quick tags:</span>
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => appendReason(r)}
                className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              >
                + {r}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-[var(--color-accent)] px-4 py-2 font-semibold text-white hover:bg-[var(--color-accent-dark)] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Follow-up'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
