import { useState } from 'react';
import type { FormEvent } from 'react';
import { apiEnabled } from '../data/api';
import type { DemoRole } from '../state/store-context';
import { useStore } from '../state/store-context';
import { Brand } from '../components/Layout';

const inputClass =
  'w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-[var(--color-navy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

/**
 * Sign-in. Two honest modes:
 * - API configured: email + password via Supabase Auth (passwords live
 *   in Supabase, never in our code). Roles come from the staff table.
 * - Demo mode: name + role picker, no password box (a password without
 *   a backend would be security theater).
 */
export default function LoginPage() {
  const { signIn, signInReal } = useStore();
  const [name, setName] = useState('');
  const [role, setRole] = useState<DemoRole>('bhw');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function handleDemo(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    signIn({ name: name.trim(), role });
  }

  async function handleReal(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await signInReal(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-ui login-shell">
      <section className="login-intro" aria-label="Homapon Health">
        <Brand />
        <div className="max-w-lg">
          <p className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">A clear record<br />for every child.</p>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-[var(--color-navy-soft)]">Child records, vaccination schedules, and growth monitoring in one place.</p>
          <div className="mt-8 hidden border-t border-[var(--color-accent)]/20 pt-6 md:block"><p className="text-sm font-semibold">Barangay Homapon Health Center</p><p className="mt-1 text-sm text-[var(--color-navy-soft)]">Legazpi City</p></div>
        </div>
        <p className="hidden text-xs text-[var(--color-navy-soft)] md:block">For authorized health-center staff</p>
      </section>
      <div className="login-form-side"><div className="login-form-panel">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-navy)]">
          Staff sign-in
        </h1>

        {apiEnabled ? (
          <>
            <p
              role="note"
              className="mt-2 rounded-xl bg-teal-50 px-3 py-2 text-xs font-semibold text-[var(--color-accent-dark)]"
            >
              Sign in with your assigned staff account.
            </p>
            <form
              onSubmit={(e) => void handleReal(e)}
              noValidate
              className="mt-4 flex flex-col gap-4"
            >
              <div>
                <label htmlFor="login-email" className="mb-1 block text-xs font-semibold">
                  Email *
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="midwife@homapon.local"
                  autoComplete="email"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="login-password" className="mb-1 block text-xs font-semibold">
                  Password *
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className={inputClass}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm font-medium text-red-700">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p
              role="note"
              className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
            >
              Local practice only. These fictional records are separate from the connected website.
            </p>
            <form onSubmit={handleDemo} noValidate className="mt-4 flex flex-col gap-4">
              <div>
                <label htmlFor="login-name" className="mb-1 block text-xs font-semibold">
                  Your name *
                </label>
                <input
                  id="login-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Maria Santos"
                  autoComplete="name"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="login-role" className="mb-1 block text-xs font-semibold">
                  Role *
                </label>
                <select
                  id="login-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as DemoRole)}
                  className={inputClass}
                >
                  <option value="bhw">BHW · Encoder — records, schedules, reminders</option>
                  <option value="midwife">Midwife · Admin — everything + reports</option>
                </select>
              </div>
              {error && (
                <p role="alert" className="text-sm font-medium text-red-700">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-dark)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
              >
                Enter system
              </button>
            </form>
          </>
        )}
      </div></div>
    </div>
  );
}
