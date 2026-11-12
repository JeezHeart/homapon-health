import { useState } from 'react';
import Card from '../components/Card';
import { apiEnabled } from '../data/api';
import { SMS_TEMPLATE } from '../data/mockData';
import { ROLE_LABEL } from '../state/store-context';
import { useStore } from '../state/store-context';

/**
 * Settings (frontend phase): signed-in demo staff, health-center info,
 * the fixed SMS template for transparency, demo-data reset, and an
 * honest statement of what this prototype is and isn't.
 */
export default function SettingsPage() {
  const { demoUser, signOut, resetDemo } = useStore();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  function handleReset() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    void (async () => {
      await resetDemo();
      setConfirmReset(false);
      setResetDone(true);
    })();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--color-navy-soft)]">
          Staff session and health-center information
        </p>
      </div>

      <Card title={apiEnabled ? "Signed-in staff" : "Signed-in staff (demo)"}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-[var(--color-navy-soft)]">Name</dt>
          <dd className="font-medium">{demoUser?.name ?? '—'}</dd>
          <dt className="text-[var(--color-navy-soft)]">Role</dt>
          <dd className="font-medium">
            {demoUser ? ROLE_LABEL[demoUser.role] : '—'}
          </dd>
        </dl>
        <p className="mt-2 text-xs text-[var(--color-navy-soft)]">
          {apiEnabled ? 'Protected staff account. Access is checked by the server using the assigned role.' : 'Local demonstration session.'}
        </p>
        <div className="mt-3">
          <button
            type="button"
            onClick={signOut}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            Sign out
          </button>
        </div>
      </Card>

      <Card title="Health center">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-[var(--color-navy-soft)]">Facility</dt>
          <dd className="font-medium">Barangay Homapon Health Center</dd>
          <dt className="text-[var(--color-navy-soft)]">Address</dt>
          <dd className="font-medium">Brgy. Homapon, Legazpi City</dd>
        </dl>
      </Card>

      <Card title="SMS reminder template (fixed)">
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-sm">{SMS_TEMPLATE}</p>
        </div>
        <p className="mt-2 text-xs text-[var(--color-navy-soft)]">
          Guardian, child, appointment date/time, and transaction date are filled automatically.
          SMS text is normalized for GSM-7. Reminders over 160 characters or 160 SMS units
          are blocked; full names are not shortened. Demo mode does not send real messages.
        </p>
      </Card>

      {!apiEnabled && <Card title="Demo data">
        <p className="text-sm text-[var(--color-navy-soft)]">
          All children, records, schedules, and SMS history here are
          fictional. Reset restores the original demo dataset.
        </p>
        {resetDone && (
          <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            Demo data restored.
          </p>
        )}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setResetDone(false);
              handleReset();
            }}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            {confirmReset ? 'Press again to confirm reset' : 'Reset demo data'}
          </button>
        </div>
      </Card>}

      <Card title="About this system">
        <p className="text-sm text-[var(--color-navy-soft)]">
          The system manages child immunization records, appointments, dated growth measurements,
          and reports. Connected mode uses protected staff accounts and database storage.
          Experimental Record Review flags unusual date patterns for staff verification;
          it is not a diagnosis or a validated prediction of missed vaccinations.
          SMS sending remains disabled until sender-name approval and an authorized live test.
        </p>
      </Card>
    </div>
  );
}
