/**
 * Layout.tsx
 * Guide pang-defense: Ito yung pinaka-shell o wrapper ng lahat ng authenticated pages.
 * Hawak nito yung left sidebar menu (plus mobile drawer), top header na may child search bar,
 * dark/light theme toggle, overdue alert badge, staff name/role badge, at yung React Router `<Outlet />`.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { apiEnabled } from '../data/api';
import { ROLE_LABEL, useStore } from '../state/store-context';
import Dialog from './Dialog';
import NavIcon from './NavIcon';
import ThemeToggle from './ThemeToggle';
import { childName, overdueAppointments } from '../data/mockData';
import { vaccineById } from '../data/vaccines';

// Mga main links sa sidebar menu; naka-hide muna yung Record Review pag hindi connected sa backend API.
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/children', label: 'Child Records', icon: 'children' },
  { to: '/schedule', label: 'Schedule', icon: 'calendar' },
  { to: '/records', label: 'Records', icon: 'records' },
  { to: '/review', label: 'Record Review', icon: 'records' },
  { to: '/sms', label: 'SMS', icon: 'sms' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
] as const;

/** Shared na "Homapon Health" logo/brand mark na gamit sa sidebar, mobile drawer, at login page. */
export function Brand() {
  return <div className="flex items-center gap-3">
    <img src="/homapon-logo-light.svg" alt="" aria-hidden="true" width={36} height={36} className="brand-logo-light h-9 w-9 shrink-0 rounded-lg border border-[var(--color-border)]" />
    <img src="/homapon-logo-dark.svg" alt="" aria-hidden="true" width={36} height={36} className="brand-logo-dark h-9 w-9 shrink-0 rounded-lg border border-[var(--color-border)]" />
    <p className="text-lg font-semibold tracking-tight">Homapon Health</p>
  </div>;
}

/** Main layout wrapper na laging naka-display: may desktop sidebar, responsive top bar, mobile drawer, at route Outlet. */
export default function Layout() {
  const location = useLocation();
  const { demoUser, connected, signOut, appointments, children, records } = useStore();
  const overdue = overdueAppointments(appointments, children, records);
  const overdueCount = overdue.length;
  const followUpPanel = useRef<HTMLDivElement>(null);
  const followUpButton = useRef<HTMLButtonElement>(null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const current = NAV_ITEMS.find((item) => item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to));
  const pageTitle = location.pathname.startsWith('/children/') ? 'Child Profile' : current?.label ?? 'Homapon Health';

  // Sini-sync yung browser tab title sa active page at nire-reset ang scroll sa taas kapag lumipat ng page.
  useEffect(() => {
    document.title = pageTitle === 'Homapon Health' ? 'Homapon Health' : `${pageTitle} · Homapon Health`;
  }, [pageTitle]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // React effect para automatic magsara yung mobile drawer pag lumaki na yung screen into desktop size.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!followUpOpen) return;
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !followUpPanel.current?.contains(event.target)) setFollowUpOpen(false);
    }
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [followUpOpen]);

  // Helper pang-render ng parehong nav link list na ginagamit sa desktop sidebar at mobile drawer.
  function navigation() {
    return <nav aria-label="Main navigation"><ul className="space-y-1">
      {NAV_ITEMS.filter((item) => item.to !== '/review' || (apiEnabled && connected)).map((item) => <li key={item.to}><NavLink to={item.to} end={'end' in item ? item.end : false}
        onClick={() => setMenuOpen(false)}
        className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
        <NavIcon name={item.icon} /><span>{item.label}</span>
      </NavLink></li>)}
    </ul></nav>;
  }

  return <div className="app-ui app-frame lg:flex lg:items-stretch">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    {/* Left sidebar pang-desktop (automatic naka-hide pag nag-print ng ITR o reports) */}
    <aside aria-label="Main navigation sidebar" className="app-sidebar no-print">
      <Link to="/" aria-label="Homapon Health dashboard" className="sidebar-brand transition-colors hover:bg-[var(--color-elevated)]/60"><Brand /></Link>
      <div className="flex-1 overflow-y-auto px-3 py-4">{navigation()}</div>
      <div className="border-t border-[var(--color-border)] p-4">
        <button type="button" onClick={signOut} className="nav-item w-full text-left"><NavIcon name="logout" />Sign out</button>
      </div>
    </aside>
    <div className="min-w-0 flex-1">
      {/* Top header bar: may mobile menu button, theme toggle, at staff profile badge */}
      <header className="app-header no-print">
        <div className="header-primary flex min-w-0 flex-1 items-center gap-3">
          <button ref={menuButton} type="button" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)} className="icon-button lg:hidden"><NavIcon name="menu" /></button>
          <span className="header-page-title">{pageTitle}</span>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          <div ref={followUpPanel} className="relative hidden md:block"
            onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFollowUpOpen(false); }}
            onKeyDown={event => {
              if (event.key === 'Escape' && followUpOpen) {
                setFollowUpOpen(false);
                followUpButton.current?.focus();
              }
            }}>
            <button ref={followUpButton} type="button" aria-controls={followUpOpen ? "header-follow-up" : undefined} aria-expanded={followUpOpen} onClick={() => setFollowUpOpen(open => !open)}
              aria-label={`Notifications (${overdueCount} overdue appointments)`}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-medium hover:bg-[var(--color-accent-soft)]">
              <span className="relative inline-flex shrink-0">
                <NavIcon name="bell" />
                {overdueCount > 0 && <span className="notification-count translate-x-1/2 -translate-y-1/2" aria-hidden="true">{overdueCount}</span>}
              </span>
              Notifications
          </button>
              {followUpOpen && <section id="header-follow-up" aria-label="Follow-up alerts" className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg">
                <h2 className="mb-2 text-sm font-semibold">Follow-up alerts</h2>
                {overdueCount === 0 ? <p className="text-sm">No overdue appointments.</p> :
                  <ul className="space-y-2">
                    {overdue.slice(0, 5).map(appointment => (
                      <li key={appointment.id}>
                        <Link
                          to={`/schedule?filter=overdue&appointment=${encodeURIComponent(appointment.id)}`}
                          onClick={() => setFollowUpOpen(false)}
                          className="block rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-elevated)]"
                        >
                          <strong className="block">{childName(appointment.child)}</strong>
                          <span>{vaccineById(appointment.vaccineId)?.shortName ?? appointment.vaccineId} · Dose {appointment.doseNumber}</span>
                          <span className="block text-xs text-[var(--color-navy-soft)]">{appointment.daysOverdue} {appointment.daysOverdue === 1 ? 'day' : 'days'} overdue</span>
                        </Link>
                      </li>
                    ))}
                  </ul>}
                {overdueCount > 0 && <Link to="/schedule?filter=overdue" onClick={() => setFollowUpOpen(false)} className="mt-3 inline-block text-sm font-medium underline">View all overdue</Link>}
              </section>}
          </div>
          <Link to="/settings" aria-label="Staff account settings" className="header-identity rounded-lg py-1 pr-1 transition-opacity hover:opacity-85"><div className="hidden min-w-0 text-right lg:block"><p className="max-w-28 truncate text-sm xl:max-w-48">{demoUser?.name ?? 'Health Worker'}</p><p className="text-xs text-[var(--color-navy-soft)]">{demoUser ? ROLE_LABEL[demoUser.role] : 'Staff'}</p></div>
          <span aria-hidden="true" className="staff-avatar">{(demoUser?.name.trim().charAt(0) || 'H').toUpperCase()}</span>
          </Link>
        </div>
      </header>
      {/* Dito lumalabas yung active page content plus warning banner pag offline o down ang API */}
      <main id="main-content" tabIndex={-1} key={location.pathname} className={`app-content${['/', '/children', '/schedule'].includes(location.pathname) ? '' : ' page-enter'}`}>
        {apiEnabled && !connected && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">Could not load records from the server. Check your connection, then refresh the page.</p>}
        <Suspense fallback={<p role="status" className="text-sm text-[var(--color-navy-soft)]">Loading page…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
    {/* Slide-over navigation drawer para sa cellphone at tablet screens */}
    {menuOpen && <Dialog title="Navigation" variant="drawer" onClose={() => setMenuOpen(false)} returnFocusRef={menuButton}>
      <Link to="/" aria-label="Homapon Health dashboard" onClick={() => setMenuOpen(false)} className="mb-6 block rounded-lg"><Brand /></Link>{navigation()}
      <button type="button" onClick={signOut} className="nav-item mt-6 w-full text-left"><NavIcon name="logout" />Sign out</button>
    </Dialog>}
  </div>;
}
