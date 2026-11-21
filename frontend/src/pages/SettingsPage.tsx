/**
 * SettingsPage.tsx
 * Guide pang-defense: Ito yung Settings page (`/settings`) para sa account info ng naka-login na staff,
 * light/dark theme toggle, health center details, SMS availability status + fixed reminder template,
 * system overview, at two-step clear button ng local practice data (pag naka-demo mode lang).
 */
import { useState } from 'react';
import Card from '../components/Card';
import ThemeToggle from '../components/ThemeToggle';
import { apiEnabled } from '../data/api';
import { SMS_TEMPLATE } from '../data/mockData';
import { ROLE_LABEL, useStore } from '../state/store-context';
import { useSmsAvailability } from '../utils/useSmsAvailability';

/** Main Settings page component na nagre-read ng staff RBAC role sa store at live SMS status via hook. */
export default function SettingsPage() {
  const { demoUser, signOut, resetDemo } = useStore();
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

  return <div className="flex flex-col gap-4">
    <div><h1 className="page-title">Settings</h1><p className="mt-1 text-sm text-[var(--color-navy-soft)]">Staff account, appearance, and health-center information.</p></div>
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {/* Staff profile card: pangalan, assigned RBAC role, at sign-out button */}
      <Card title="Staff account">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm"><dt className="text-[var(--color-navy-soft)]">Name</dt><dd className="break-words font-medium">{demoUser?.name ?? 'Not available'}</dd><dt className="text-[var(--color-navy-soft)]">Role</dt><dd className="break-words font-medium">{demoUser ? ROLE_LABEL[demoUser.role] : 'Not available'}</dd></dl>
        <p className="mt-3 text-xs text-[var(--color-navy-soft)]">{apiEnabled ? 'Your assigned role controls which actions you can perform.' : 'Local practice session.'}</p>
        <button type="button" onClick={signOut} className="mt-3 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">Sign out</button>
      </Card>
      {/* Light/Dark theme switcher card */}
      <section aria-label="Appearance"><Card title="Appearance"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Light or dark appearance</p><ThemeToggle /></div></Card></section>
      {/* Static info ng Barangay Homapon Health Center at regular Wednesday clinic schedule */}
      <Card title="Health center">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm"><dt className="text-[var(--color-navy-soft)]">Facility</dt><dd className="break-words font-medium">Barangay Homapon Health Center</dd><dt className="text-[var(--color-navy-soft)]">Address</dt><dd className="break-words">Brgy. Homapon, Legazpi City</dd><dt className="text-[var(--color-navy-soft)]">Regular clinic</dt><dd>Every Wednesday</dd></dl>
        <p className="mt-3 text-xs text-[var(--color-navy-soft)]">When a clinic day is a holiday, staff choose the replacement date in Schedule.</p>
      </Card>
      {/* Live SMS status indicator plus preview ng fixed 1-SMS reminder template */}
      <Card title="SMS reminders">
        <div role="status"><p className="text-sm font-medium">{smsStatus}</p>{availability.message && <p className="mt-1 text-xs text-[var(--color-navy-soft)]">{availability.message}</p>}</div>
        <h3 className="mt-4 text-sm font-medium">Fixed reminder template</h3><p className="mt-2 break-words rounded-xl border border-slate-200 p-3 text-sm">{SMS_TEMPLATE}</p>
        <p className="mt-3 text-xs text-[var(--color-navy-soft)]">Guardian, child, appointment date/time, and transaction date fill automatically. Each reminder must fit one SMS. Full names are kept; messages that are too long are blocked.</p>
        <p className="mt-2 text-xs text-[var(--color-navy-soft)]">Provider acceptance does not confirm delivery to the phone.</p>
      </Card>
    </div>
    {/* System info card (title at summary ng capstone project) */}
    <Card title="About this system"><p className="break-words font-medium">AI-Powered Child Immunization Health Monitoring and Management System with SMS Notification in Barangay Homapon, Legazpi City</p><p className="mt-3 text-sm text-[var(--color-navy-soft)]">Manages child immunization records, appointments, dated growth measurements, reports, and SMS reminders.</p></Card>
    {/* Demo-only reset card: pang-clear ng temporary local practice records (hindi gagalawin ang real DB) */}
    {!apiEnabled && <Card title="Local practice data"><p className="text-sm text-[var(--color-navy-soft)]">Local preview starts empty. Clear removes only records added in this local session; it does not change connected database records.</p>{resetDone && <p role="status" className="mt-3 text-sm text-emerald-800">Local practice data cleared.</p>}{resetError && <p role="alert" className="mt-3 text-sm text-red-700">{resetError}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={resetting} onClick={() => { setResetDone(false); void handleReset(); }} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40">{resetting ? 'Clearing...' : confirmReset ? 'Confirm clear' : 'Clear local practice data'}</button>{confirmReset && <button type="button" disabled={resetting} onClick={() => { setConfirmReset(false); setResetError(''); }} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Cancel reset</button>}</div></Card>}
  </div>;
}
