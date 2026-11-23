/**
 * LoginPage.tsx
 * Guide pang-defense: Ito yung staff sign-in screen na nire-render ng `App.tsx` pag wala pang naka-login.
 * Sakop nito: email/password login via Supabase Auth pag live API mode, o simpleng name + RBAC role picker
 * pag local practice mode (`apiEnabled === false`), sa split-screen layout (branding sa kaliwa, sign-in sa kanan).
 * Dito ka mag-debug pag may issue sa login validation, auth error messages, o demo-vs-live login mode.
 */
import { useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { apiEnabled } from '../data/api';
import type { DemoRole } from '../state/store-context';
import { useStore } from '../state/store-context';
import { Brand } from '../components/Layout';

const inputClass =
  'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm text-[var(--color-navy)] placeholder:text-[var(--color-navy-soft)]/75 transition-colors focus:border-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40';

// Tatlong core clinic capabilities na pinapakita sa kaliwang branding panel para malinaw agad sa staff at defense panel.
const CLINIC_HIGHLIGHTS = [
  {
    title: 'Wednesday Clinic Scheduling',
    detail: 'Regular clinic queuing, exception reasons, and overdue follow-ups.',
    icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  },
  {
    title: 'WHO Growth & AI Record Review',
    detail: 'Official WHO z-score checks and DOH-grounded review checklists.',
    icon: 'M22 12h-4l-3 9L9 3l-3 9H2',
  },
  {
    title: 'iProg SMS Reminders',
    detail: 'Vaccine-specific appointment reminders for parents and guardians.',
    icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  },
] as const;

/**
 * Staff sign-in component na may dalawang malinaw na mode:
 * - Live API mode: totoong email + password login via Supabase Auth (nasa Supabase ang passwords,
 *   wala sa source code natin) at galing sa staff table yung RBAC role.
 * - Practice/Demo mode: name + role selector lang at walang fake password box para hindi mukhang
 *   peke o security theater lang kahit walang backend.
 */
export default function LoginPage() {
  const { signIn, signInReal } = useStore();
  const [name, setName] = useState('');
  const [role, setRole] = useState<DemoRole>('bhw');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Nagche-check kung naka-ON ang Caps Lock habang nagta-type ng password para iwas maling login sa defense.
  function handlePasswordKeyState(e: KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  }

  // Pang-validate at start ng local practice session (lumalabas lang pag walang naka-set na VITE_API_URL).
  function handleDemo(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    signIn({ name: name.trim(), role });
  }

  // Nagla-login sa Supabase Auth at nagche-check ng staff role sa `/api/me` via StoreProvider.signInReal.
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
      {/* Kaliwang branding panel na nagpapakilala sa Barangay Homapon Health Center */}
      <section className="login-intro" aria-label="Homapon Health">
        <div className="relative z-10">
          <Brand />
        </div>

        <div className="login-fade-in relative z-10 my-auto max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
            Barangay Homapon Health Center · Legazpi City
          </p>
          <p className="mt-2.5 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-[2.75rem]">
            A clear record<br />for every child.
          </p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--color-navy-soft)]">
            Child immunization tracking, Wednesday scheduling, WHO growth screening, and parent SMS reminders in one workspace.
          </p>

          {/* Mga pangunahing feature highlights (nakatago sa maliliit na screen para kita agad ang form) */}
          <ul className="mt-5 hidden flex-col gap-2 md:flex">
            {CLINIC_HIGHLIGHTS.map((item) => (
              <li key={item.title} className="login-feature-item">
                <span className="login-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d={item.icon} />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug text-[var(--color-navy)]">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-snug text-[var(--color-navy-soft)]">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Kanang login card na nakasentro at kasya sa iisang screen */}
      <main className="login-form-side">
        <div className="login-card-wrap login-fade-delay">
          <div className="login-form-panel">
            <h1 className="mb-5 text-xl font-semibold tracking-tight text-[var(--color-navy)]">
              Sign in
            </h1>

            {/* Live mode: Supabase email/password form; Practice mode: name + RBAC role picker */}
            {apiEnabled ? (
              <form
                onSubmit={(e) => void handleReal(e)}
                noValidate
                className="flex flex-col gap-4"
              >
                <div>
                  <label htmlFor="login-email" className="mb-1 block text-xs font-semibold text-[var(--color-navy)]">
                    Email *
                  </label>
                  <div className="group relative">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[var(--color-navy-soft)] transition-colors group-focus-within:text-[var(--color-accent)]"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                    </span>
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your staff email"
                      autoComplete="off"
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="login-password" className="mb-1 block text-xs font-semibold text-[var(--color-navy)]">
                    Password *
                  </label>
                  <div className="group relative">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[var(--color-navy-soft)] transition-colors group-focus-within:text-[var(--color-accent)]"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={handlePasswordKeyState}
                      onKeyUp={handlePasswordKeyState}
                      onBlur={() => setCapsLockOn(false)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className={`${inputClass} pl-10 pr-11`}
                    />
                    {/* Pang-toggle ng password visibility para madaling i-check habang nagta-type sa defense */}
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-1.5 my-auto flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-navy-soft)] transition-colors hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-navy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                    >
                      {showPassword ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-3.17 4.33" />
                          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                          <path d="M1 1l22 22" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {capsLockOn && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-[var(--color-warning)]">
                      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
                      Caps Lock is on
                    </p>
                  )}
                </div>
                {error && (
                  <p role="alert" className="login-error">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="group mt-0.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_var(--color-accent)] transition-all hover:bg-[var(--color-accent-dark)] active:scale-[0.99] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                >
                  {busy && (
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  )}
                  <span>{busy ? 'Signing in…' : 'Sign in'}</span>
                  {!busy && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  )}
                </button>
                <p className="border-t border-[var(--color-border)] pt-3 text-center text-xs text-[var(--color-navy-soft)]">
                  Authorized Barangay Homapon Health Center staff only.
                </p>
              </form>
            ) : (
              <form onSubmit={handleDemo} noValidate className="flex flex-col gap-4">
                <div>
                  <label htmlFor="login-name" className="mb-1 block text-xs font-semibold text-[var(--color-navy)]">
                    Your name *
                  </label>
                  <input
                    id="login-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Maria Santos"
                    autoComplete="off"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="login-role" className="mb-1 block text-xs font-semibold text-[var(--color-navy)]">
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
                  <p role="alert" className="login-error">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  className="group mt-0.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_var(--color-accent)] transition-all hover:bg-[var(--color-accent-dark)] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                >
                  <span>Enter system</span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
