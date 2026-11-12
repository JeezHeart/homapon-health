import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { apiEnabled } from '../data/api';
import { ROLE_LABEL, useStore } from '../state/store-context';
import Dialog from './Dialog';
import NavIcon from './NavIcon';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/children', label: 'Child Records', icon: 'children' },
  { to: '/schedule', label: 'Schedule', icon: 'calendar' },
  { to: '/records', label: 'Records', icon: 'records' },
  { to: '/record-review', label: 'Record Review', icon: 'review' },
  { to: '/sms', label: 'SMS', icon: 'sms' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
] as const;

export function Brand() {
  return <div className="flex items-center gap-3">
    <span aria-hidden="true" className="brand-mark">H<span className="brand-dot" /></span>
    <div><p className="text-base font-bold tracking-tight">Homapon Health</p><p className="mt-0.5 text-xs text-[var(--color-navy-soft)]">Child immunization care</p></div>
  </div>;
}

export default function Layout() {
  const location = useLocation();
  const { demoUser, connected, signOut } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const current = NAV_ITEMS.find((item) => item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to));
  const pageTitle = location.pathname.startsWith('/children/') ? 'Child Profile' : current?.label ?? 'Homapon Health';

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  function navigation() {
    return <nav aria-label="Main navigation"><ul className="space-y-1">
      {NAV_ITEMS.map((item) => <li key={item.to}><NavLink to={item.to} end={'end' in item ? item.end : false}
        onClick={() => setMenuOpen(false)}
        className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
        <NavIcon name={item.icon} /><span>{item.label}</span>
      </NavLink></li>)}
    </ul></nav>;
  }

  return <div className="app-ui min-h-screen lg:flex lg:items-stretch">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <aside aria-label="Main navigation sidebar" className="app-sidebar no-print">
      <div className="border-b border-[var(--color-border)] px-6 py-7"><Brand /></div>
      <div className="flex-1 overflow-y-auto px-4 py-6">{navigation()}</div>
      <div className="border-t border-[var(--color-border)] p-4">
        <p className="mb-3 px-3 text-xs leading-relaxed text-[var(--color-navy-soft)]">Barangay Homapon<br />Legazpi City</p>
        <button type="button" onClick={signOut} className="nav-item w-full text-left"><NavIcon name="logout" />Sign out</button>
      </div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="app-header no-print">
        <div className="flex min-w-0 items-center gap-3">
          <button ref={menuButton} type="button" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)} className="icon-button lg:hidden"><NavIcon name="menu" /></button>
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{pageTitle}</p><p className="hidden text-xs text-[var(--color-navy-soft)] sm:block">Barangay Homapon Health Center</p></div>
        </div>
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="staff-avatar">{(demoUser?.name.trim().charAt(0) || 'H').toUpperCase()}</span>
          <div className="hidden min-w-0 text-sm sm:block"><p className="max-w-48 truncate font-semibold">{demoUser?.name ?? 'Health Worker'}</p><p className="text-xs text-[var(--color-navy-soft)]">{demoUser ? ROLE_LABEL[demoUser.role] : 'Staff'}</p></div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} key={location.pathname} className="app-content page-enter">
        {apiEnabled && !connected && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">Could not load records from the server. Check your connection, then refresh the page.</p>}
        <Outlet />
      </main>
    </div>
    {menuOpen && <Dialog title="Navigation" variant="drawer" onClose={() => setMenuOpen(false)} returnFocusRef={menuButton}>
      <div className="mb-6"><Brand /></div>{navigation()}
      <button type="button" onClick={signOut} className="nav-item mt-6 w-full text-left"><NavIcon name="logout" />Sign out</button>
    </Dialog>}
  </div>;
}
