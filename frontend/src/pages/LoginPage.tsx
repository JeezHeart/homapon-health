import { useState } from 'react';
import type { FormEvent } from 'react';
import { apiEnabled } from '../data/api';
import type { DemoRole } from '../state/store-context';
import { useStore } from '../state/store-context';

const inputClass =
  'w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-[var(--color-navy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

function BrandHead() {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent)] text-base font-bold text-white"
      >
        H
      </span>
      <div>
        <p className="text-lg font-bold leading-tight text-[var(--color-navy)]">
          Homapon Health
        </p>
        <p className="text-xs text-[var(--color-navy-soft)]">
          Brgy. Homapon · Legazpi City
        </p>
      </div>
    </div>
  );
}

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
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200/70 bg-[var(--color-surface)] p-6 shadow-md sm:p-8">
        <BrandHead />
        <h1 className="mt-6 text-2xl font-bold text-[var(--color-navy)]">
          Staff sign-in
        </h1>

        {apiEnabled ? (
          <>
            <p
              role="note"
              className="mt-2 rounded-xl bg-teal-50 px-3 py-2 text-xs font-semibold text-[var(--color-accent-dark)]"
            >
              Protected sign-in — passwords are checked by our secure server,
              never stored in this app.
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
              Demo sign-in — pick your role to enter. Real passwords and
              accounts arrive with the backend phase.
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
      </div>
    </div>
  );
}
