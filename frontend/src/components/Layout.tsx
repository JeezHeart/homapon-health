import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { apiEnabled } from '../data/api';
import { ROLE_LABEL } from '../state/store-context';
import { useStore } from '../state/store-context';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/children', label: 'Child Records' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/records', label: 'Records' },
  { to: '/record-review', label: 'Record Review' },
  { to: '/sms', label: 'SMS' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
];

const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

function sidebarNavClass(isActive: boolean): string {
  const base = `block w-full rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-colors ${focusRing}`;
  return isActive
    ? `${base} bg-[var(--color-accent)] text-white`
    : `${base} text-slate-300 hover:bg-white/10 hover:text-white`;
}

function topNavClass(isActive: boolean): string {
  const base = `whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${focusRing}`;
  return isActive
    ? `${base} bg-[var(--color-navy)] text-white`
    : `${base} text-[var(--color-navy-soft)] hover:bg-white`;
}

function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-accent)] text-sm font-bold text-white"
      >
        H
      </span>
      <span
        className={`whitespace-nowrap text-sm font-bold ${dark ? 'text-white' : 'text-[var(--color-navy)]'}`}
      >
        Homapon Health
      </span>
    </div>
  );
}

function WorkerIdentity({ dark = false }: { dark?: boolean }) {
  const { demoUser } = useStore();
  const nameClass = dark ? 'text-white' : 'text-[var(--color-navy)]';
  const subClass = dark ? 'text-slate-300' : 'text-[var(--color-navy-soft)]';
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-bold text-white"
      >
        {(demoUser?.name.trim().charAt(0) ?? 'H').toUpperCase()}
      </span>
      <span className="whitespace-nowrap text-xs leading-tight">
        <span className={`block font-semibold ${nameClass}`}>
          {demoUser?.name ?? 'Health Worker'}
        </span>
        <span className={`block ${subClass}`}>
          {demoUser ? ROLE_LABEL[demoUser.role] : 'Brgy. Homapon'}
        </span>
      </span>
    </div>
  );
}

/**
 * App shell: fixed left sidebar on desktop, compact scrollable top
 * bar on mobile. Both render the same nav items. Sidebar and top
 * bar are hidden in print so documents print clean.
 */
export default function Layout() {
  const location = useLocation();
  const { connected } = useStore();
  const showOfflineBanner = apiEnabled && !connected;
  return (
    <div className="min-h-screen lg:flex lg:items-stretch">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-[var(--color-navy)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      {/* Mobile / tablet top bar */}
      <header className="no-print sticky top-0 z-10 border-b border-slate-200/70 bg-[var(--color-page)]/95 backdrop-blur lg:hidden">
        <div className="flex items-center gap-4 overflow-x-auto px-4 py-3">
          <Brand />
          <nav aria-label="Main navigation" className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => topNavClass(isActive)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Desktop left sidebar */}
      <aside
        aria-label="Main navigation sidebar"
        className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-[var(--color-navy)] lg:flex"
      >
        <div className="px-5 pb-4 pt-6">
          <Brand dark />
        </div>
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => sidebarNavClass(isActive)}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-white/10 px-5 py-4">
          <WorkerIdentity dark />
        </div>
      </aside>

      <div className="min-w-0 flex-1 px-4 py-4 lg:px-8 lg:py-6">
        {showOfflineBanner && (
          <p
            role="alert"
            className="mb-3 rounded-2xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800"
          >
            Could not load records from the server. Check your connection or
            make sure the backend server is running, then refresh the page.
          </p>
        )}
        <main
          id="main-content"
          key={location.pathname}
          className="page-enter min-w-0 rounded-3xl border border-slate-200/70 bg-[var(--color-surface)] p-4 shadow-sm sm:p-6"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
