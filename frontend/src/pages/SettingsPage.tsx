import { useState } from 'react';
import Card from '../components/Card';
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
        <h1 className="text-2xl font-bold text-[var(--color-navy)]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--color-navy-soft)]">
          Staff session, health-center info, and demo controls
        </p>
      </div>

      <Card title="Signed-in staff (demo)">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-[var(--color-navy-soft)]">Name</dt>
          <dd className="font-medium">{demoUser?.name ?? '—'}</dd>
          <dt className="text-[var(--color-navy-soft)]">Role</dt>
          <dd className="font-medium">
            {demoUser ? ROLE_LABEL[demoUser.role] : '—'}
          </dd>
        </dl>
        <p className="mt-2 text-xs text-[var(--color-navy-soft)]">
          Demo session only — real passwords and accounts arrive with the
          backend phase, where the midwife administers accounts.
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
          One template for the whole system — [Child Name] and [Appointment
          Date] are filled per child. Sending is simulated in this phase.
        </p>
      </Card>

      <Card title="Demo data">
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
      </Card>

      <Card title="About this system">
        <p className="text-sm text-[var(--color-navy-soft)]">
          Frontend prototype (Phase 1): React + TypeScript + Tailwind with
          local demo state. No real database, accounts, AI predictions, or
          SMS delivery yet — those arrive with the backend phases. AI-assisted
          risk prediction stays dormant until requirements and real data are
          confirmed.
        </p>
      </Card>
    </div>
  );
}
