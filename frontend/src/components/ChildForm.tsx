import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Child, NewChild } from '../data/mockData';
import { PUROKS } from '../data/mockData';
import { smsTodayISO as todayISO } from '../utils/sms';

interface ChildFormProps {
  initial?: Child;
  onSubmit: (data: NewChild) => void | Promise<void>;
  onCancel: () => void;
}

const inputClass =
  'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-[var(--color-navy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

export default function ChildForm({ initial, onSubmit, onCancel }: ChildFormProps) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? '');
  const [lastName, setLastName] = useState(initial?.lastName ?? '');
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? '');
  const [sex, setSex] = useState<'Female' | 'Male' | ''>(initial?.sex ?? '');
  const [guardian, setGuardian] = useState(initial?.guardian ?? '');
  const [guardianMobile, setGuardianMobile] = useState(
    initial?.guardianMobile ?? '',
  );
  const [purok, setPurok] = useState(initial?.purok ?? '');
  const [weight, setWeight] = useState(
    initial?.weightKg !== undefined ? String(initial.weightKg) : '',
  );
  const [measuredOn, setMeasuredOn] = useState(todayISO);
  const [height, setHeight] = useState('');
  const [position, setPosition] = useState<'' | 'lying' | 'standing'>('');
  const [oedema, setOedema] = useState<'' | 'unknown' | 'no' | 'yes'>('');
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'First name is required.';
    if (!lastName.trim()) next.lastName = 'Last name is required.';
    if (!birthDate) next.birthDate = 'Date of birth is required.';
    else if (birthDate > todayISO())
      next.birthDate = 'Date of birth cannot be in the future.';
    if (!sex) next.sex = 'Sex is required.';
    if (!guardian.trim()) next.guardian = 'Parent/guardian name is required.';
    if (!guardianMobile.trim())
      next.guardianMobile = 'Mobile number is required.';
    else if (!/^[0-9+\-()\s]{7,20}$/.test(guardianMobile.trim()))
      next.guardianMobile = 'Enter a valid mobile number.';
    if (weight.trim()) {
      const w = Number(weight.trim());
      if (!Number.isFinite(w) || w <= 0 || w > (initial ? 300 : 200))
        next.weight = 'Enter a weight in kg (e.g. 9.5).';
    }
    if (!initial) {
      if (!weight.trim()) next.weight = 'Weight is required for the first growth measurement.';
      const h = Number(height);
      if (!height || !Number.isFinite(h) || h <= 0 || h > 250) next.height = 'Enter a length/height above 0 and at most 250 cm.';
      if (!measuredOn || measuredOn < birthDate || measuredOn > todayISO()) next.measuredOn = 'Measurement date must be between birth and today.';
      if (!position) next.position = 'Select lying down or standing.';
      if (!oedema) next.oedema = 'Select the assessment status; choose Not assessed if unknown.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || !validate()) return;
    setSubmitting(true);
    setSaveError('');
    try {
      await onSubmit({
        ...(!initial ? { initialMeasurement: {
          measuredOn, weightKg: Number(weight), heightCm: Number(height),
          position: position as 'lying' | 'standing', oedema: oedema as 'unknown' | 'no' | 'yes', notes: '',
        } } : {}),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate,
        sex: sex as 'Female' | 'Male',
        guardian: guardian.trim(),
        guardianMobile: guardianMobile.trim(),
        purok: purok.trim(),
        weightKg: weight.trim() ? Number(weight.trim()) : undefined,
        notes: notes.trim() ? notes.trim() : undefined,
      });
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Could not save the child record.',
      );
    } finally { setSubmitting(false); }
  }

  function fieldError(name: string) {
    return errors[name] ? (
      <p role="alert" className="mt-1 text-xs font-medium text-red-700">
        {errors[name]}
      </p>
    ) : null;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cf-first" className="mb-1 block text-xs font-semibold">
            First name *
          </label>
          <input
            id="cf-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputClass}
          />
          {fieldError('firstName')}
        </div>
        <div>
          <label htmlFor="cf-last" className="mb-1 block text-xs font-semibold">
            Last name *
          </label>
          <input
            id="cf-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputClass}
          />
          {fieldError('lastName')}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cf-dob" className="mb-1 block text-xs font-semibold">
            Date of birth *
          </label>
          <input
            id="cf-dob"
            type="date"
            value={birthDate}
            max={todayISO()}
            onChange={(e) => setBirthDate(e.target.value)}
            className={inputClass}
          />
          {fieldError('birthDate')}
        </div>
        <div>
          <label htmlFor="cf-sex" className="mb-1 block text-xs font-semibold">
            Sex *
          </label>
          <select
            id="cf-sex"
            value={sex}
            onChange={(e) => setSex(e.target.value as 'Female' | 'Male' | '')}
            className={inputClass}
          >
            <option value="">Select…</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </select>
          {fieldError('sex')}
        </div>
      </div>
      <div>
        <label htmlFor="cf-guardian" className="mb-1 block text-xs font-semibold">
          Parent / guardian name *
        </label>
        <input
          id="cf-guardian"
          value={guardian}
          onChange={(e) => setGuardian(e.target.value)}
          className={inputClass}
        />
        {fieldError('guardian')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cf-mobile" className="mb-1 block text-xs font-semibold">
            Guardian mobile number *
          </label>
          <input
            id="cf-mobile"
            inputMode="tel"
            placeholder="09xx-xxx-xxxx"
            value={guardianMobile}
            onChange={(e) => setGuardianMobile(e.target.value)}
            className={inputClass}
          />
          {fieldError('guardianMobile')}
        </div>
        <div>
          <label htmlFor="cf-purok" className="mb-1 block text-xs font-semibold">
            Address / purok
          </label>
          <input
            id="cf-purok"
            list="cf-purok-list"
            placeholder="Purok _, Homapon"
            value={purok}
            onChange={(e) => setPurok(e.target.value)}
            className={inputClass}
          />
          <datalist id="cf-purok-list">
            {PUROKS.map((p) => (
              <option key={p} value={`${p}, Homapon`} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cf-weight" className="mb-1 block text-xs font-semibold">
            {initial ? 'Weight (kg, optional)' : 'Weight (kg) *'}
          </label>
          <input
            id="cf-weight"
            inputMode="decimal"
            placeholder="e.g. 9.5"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className={inputClass}
          />
          {fieldError('weight')}
        </div>
      </div>
      {!initial && <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">First growth measurement (required)</legend>
        <p className="text-xs text-slate-600 sm:col-span-2">Use actual measurements from the selected date. Saving registration adds these to growth history and updates the dashboard summary. Choose Not assessed when swelling has not been checked.</p>
        <div><label htmlFor="cf-measured" className="mb-1 block text-xs font-semibold">Measurement date *</label><input id="cf-measured" type="date" min={birthDate} max={todayISO()} value={measuredOn} onChange={(e) => setMeasuredOn(e.target.value)} className={inputClass} />{fieldError('measuredOn')}</div>
        <div><label htmlFor="cf-height" className="mb-1 block text-xs font-semibold">Length / height (cm) *</label><input id="cf-height" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} className={inputClass} />{fieldError('height')}</div>
        <div><label htmlFor="cf-position" className="mb-1 block text-xs font-semibold">Measurement position *</label><select id="cf-position" value={position} onChange={(e) => setPosition(e.target.value as typeof position)} className={inputClass}><option value="">Select position</option><option value="lying">Lying down (length)</option><option value="standing">Standing (height)</option></select>{fieldError('position')}</div>
        <div><label htmlFor="cf-oedema" className="mb-1 block text-xs font-semibold">Swelling of both feet (staff assessment) *</label><select id="cf-oedema" value={oedema} onChange={(e) => setOedema(e.target.value as typeof oedema)} className={inputClass}><option value="">Select assessment</option><option value="unknown">Not assessed</option><option value="no">Absent</option><option value="yes">Present</option></select>{fieldError('oedema')}</div>
      </fieldset>}
      <div>
        <label htmlFor="cf-notes" className="mb-1 block text-xs font-semibold">
          Notes / remarks
        </label>
        <textarea
          id="cf-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={inputClass}
        />
      </div>
      {saveError && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {saveError}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-[var(--color-navy)] hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
        >
          {submitting ? 'Saving...' : initial ? 'Save changes' : 'Register child'}
        </button>
      </div>
    </form>
  );
}
