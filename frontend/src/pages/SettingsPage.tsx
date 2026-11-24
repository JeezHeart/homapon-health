/**
 * SettingsPage.tsx
 * Guide pang-defense: Ito yung Settings page (`/settings`) para sa account info ng naka-login na staff,
 * staff access, health center details, SMS availability status + fixed reminder template,
 * system overview, at two-step clear button ng local practice data (pag naka-demo mode lang).
 */
import { useState } from 'react';
import Card from '../components/Card';
import NavIcon from '../components/NavIcon';
import { apiEnabled } from '../data/api';
import { SMS_TEMPLATE } from '../data/mockData';
import { ROLE_LABEL, useStore } from '../state/store-context';
import { useSmsAvailability } from '../utils/useSmsAvailability';

/** Main Settings page component na nagre-read ng staff RBAC role sa store at live SMS status via hook. */
export default function SettingsPage() {
  const { demoUser, resetDemo } = useStore();
  const availability = useSmsAvailability();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  // Two-step confirmation bago i-clear yung local practice data para iwas aksidenteng burahan.
  async function handleReset() {
    if (resetting) return;
    if (!confirmReset) { setConfirmReset(true); return; }
    setResetting(true); setResetError('');
    try { await resetDemo(); setConfirmReset(false); setResetDone(true); }
    catch { setResetError('Could not clear the practice data. Try again.'); }
    finally { setResetting(false); }
  }
  // Kino-convert yung raw SMS availability status galing sa API/hook into readable label sa UI.
  const smsStatus = availability.status === 'disabled' ? 'SMS sending disabled'
    : availability.status === 'checking' ? 'Checking SMS availability'
    : availability.status === 'unavailable' ? 'SMS availability could not be verified'
    : availability.status === 'practice' ? 'Practice only - no real SMS is sent' : 'SMS sending enabled';

  return <div className="flex flex-col gap-3 [&_.health-card]:!p-3.5 [&_.health-card>div:first-child]:mb-3">
    <h1 className="sr-only">Settings</h1>
    <div className="grid gap-3 md:grid-cols-2">
      {/* Staff profile card: pangalan at assigned RBAC role */}
      <Card title="Staff account" titleIcon={<NavIcon name="children" />}>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm"><dt className="text-[var(--color-navy-soft)]">Name</dt><dd className="break-words font-medium">{demoUser?.name ?? 'Not available'}</dd><dt className="text-[var(--color-navy-soft)]">Role</dt><dd className="break-words font-medium">{demoUser ? ROLE_LABEL[demoUser.role] : 'Not available'}</dd></dl>
        {!apiEnabled && <p className="mt-2 text-xs text-[var(--color-navy-soft)]">Local practice session.</p>}
      </Card>
      <Card title="Staff access" titleIcon={<NavIcon name="sparkles" />}>
        <p className="text-sm font-medium">AI Record Review</p>
        <p className="mt-1 text-sm text-[var(--color-navy-soft)]">
          {!apiEnabled ? 'AI Record Review is available in the connected staff system.'
            : demoUser?.role === 'midwife' ? 'You can verify findings, flag them for review, and resolve escalations.'
            : demoUser?.role === 'bhw' ? 'You can verify findings and escalate them to the midwife. The midwife handles resolution.'
            : 'Sign in with a staff account to review findings.'}
        </p>
      </Card>
      {/* Static info ng Barangay Homapon Health Center at regular Wednesday clinic schedule */}
      <Card title="Health center" titleIcon={<NavIcon name="calendar" />}>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm"><dt className="text-[var(--color-navy-soft)]">Facility</dt><dd className="break-words font-medium">Barangay Homapon Health Center</dd><dt className="text-[var(--color-navy-soft)]">Address</dt><dd className="break-words">Brgy. Homapon, Legazpi City</dd><dt className="text-[var(--color-navy-soft)]">Regular clinic</dt><dd>Every Wednesday</dd></dl>
        <p className="mt-3 text-xs text-[var(--color-navy-soft)]">When a clinic day is a holiday, staff choose the replacement date in Schedule.</p>
      </Card>
      {/* Live SMS status indicator plus preview ng fixed 1-SMS reminder template */}
      <Card title="SMS reminders" titleIcon={<NavIcon name="sms" />}>
        <div role="status"><p className="text-sm font-medium">{smsStatus}</p>{availability.message && <p className="mt-1 text-xs text-[var(--color-navy-soft)]">{availability.message}</p>}</div>
        <details className="mt-3 rounded-lg border border-[var(--color-border)] px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Fixed reminder template</summary>
          <p className="mt-2 break-words text-sm">{SMS_TEMPLATE}</p>
          <p className="mt-2 text-xs text-[var(--color-navy-soft)]">Guardian, child, appointment date and time, and transaction date fill automatically. Each reminder must fit one SMS. Full names are kept. Messages that are too long are blocked.</p>
          <p className="mt-2 text-xs text-[var(--color-navy-soft)]">Delivery to the phone is tracked separately from provider acceptance.</p>
        </details>
      </Card>
    </div>
    {/* System info card (title at summary ng capstone project) */}
    <Card title="About this system"><p className="break-words font-medium">AI-Powered Child Immunization Health Monitoring and Management System with SMS Notification in Barangay Homapon, Legazpi City</p><p className="mt-3 text-sm text-[var(--color-navy-soft)]">Manages child immunization records, appointments, dated growth measurements, reports, and SMS reminders.</p></Card>
    {/* Demo-only reset card: pang-clear ng temporary local practice records (hindi gagalawin ang real DB) */}
    {!apiEnabled && <Card title="Local practice data"><p className="text-sm text-[var(--color-navy-soft)]">Local preview starts empty. Clear removes only records added in this local session; it does not change connected database records.</p>{resetDone && <p role="status" className="mt-3 text-sm text-emerald-800">Local practice data cleared.</p>}{resetError && <p role="alert" className="mt-3 text-sm text-red-700">{resetError}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={resetting} onClick={() => { setResetDone(false); void handleReset(); }} className="clinic-control font-medium">{resetting ? 'Clearing...' : confirmReset ? 'Confirm clear' : 'Clear local practice data'}</button>{confirmReset && <button type="button" disabled={resetting} onClick={() => { setConfirmReset(false); setResetError(''); }} className="clinic-control">Cancel reset</button>}</div></Card>}
  </div>;
}
