import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { apiEnabled } from '../data/api';
import { ROLE_LABEL, useStore } from '../state/store-context';
import Dialog from './Dialog';
import NavIcon from './NavIcon';
import ThemeToggle from './ThemeToggle';
import { overdueAppointments } from '../data/mockData';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/children', label: 'Child Records', icon: 'children' },
  { to: '/schedule', label: 'Schedule', icon: 'calendar' },
  { to: '/records', label: 'Records', icon: 'records' },
  { to: '/sms', label: 'SMS', icon: 'sms' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
] as const;

export function Brand() {
  return <div className="flex items-center gap-3">
    <span aria-hidden="true" className="brand-mark">H<span className="brand-dot" /></span>
    <p className="text-lg font-semibold tracking-tight">Homapon Health</p>
  </div>;
}

export default function Layout() {
  const location = useLocation();
  const { demoUser, connected, signOut, appointments, children, records } = useStore();
  const navigate = useNavigate();
  const overdueCount = overdueAppointments(appointments, children, records).length;
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

  return <div className="app-ui app-frame lg:flex lg:items-stretch">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <aside aria-label="Main navigation sidebar" className="app-sidebar no-print">
      <div className="sidebar-brand"><Brand /></div>
      <div className="flex-1 overflow-y-auto px-3 py-4">{navigation()}</div>
      <div className="border-t border-[var(--color-border)] p-4">
        <button type="button" onClick={signOut} className="nav-item w-full text-left"><NavIcon name="logout" />Sign out</button>
      </div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="app-header no-print">
        <div className="header-primary flex min-w-0 flex-1 items-center gap-3">
          <button ref={menuButton} type="button" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)} className="icon-button lg:hidden"><NavIcon name="menu" /></button>
          <form role="search" className="header-search" key={location.key} onSubmit={(event) => {
            event.preventDefault();
            const query = new FormData(event.currentTarget).get('q')?.toString().trim() ?? '';
            navigate(`/children${query ? `?q=${encodeURIComponent(query)}` : ''}`);
          }}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
            <input type="search" name="q" aria-label="Search child or guardian" placeholder="Search children" defaultValue={location.pathname === '/children' ? new URLSearchParams(location.search).get('q') ?? '' : ''} />
          </form>
          <span className="header-page-title">{pageTitle}</span>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          <Link to="/schedule?filter=overdue" aria-label={`${overdueCount} overdue appointments`} className="header-icon hidden sm:inline-flex"><NavIcon name="bell" />{overdueCount > 0 && <span className="notification-count">{overdueCount}</span>}</Link>
          <Link to="/sms" aria-label="SMS reminders" className="header-icon hidden sm:inline-flex"><NavIcon name="mail" /></Link>
          <div className="header-identity"><div className="hidden min-w-0 text-right lg:block"><p className="max-w-28 truncate text-sm xl:max-w-48">{demoUser?.name ?? 'Health Worker'}</p><p className="text-xs text-[var(--color-navy-soft)]">{demoUser ? ROLE_LABEL[demoUser.role] : 'Staff'}</p></div>
          <span aria-hidden="true" className="staff-avatar">{(demoUser?.name.trim().charAt(0) || 'H').toUpperCase()}</span>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} key={location.pathname} className={`app-content${['/', '/children', '/schedule'].includes(location.pathname) ? '' : ' page-enter'}`}>
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
