import { useEffect, useState } from 'react';
import NavIcon from './NavIcon';

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== 'homapon-theme' && event.key !== null) return;
      const next = event.newValue === 'dark';
      document.documentElement.dataset.theme = next ? 'dark' : 'light';
      setDark(next);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function toggle() {
    const next = !dark;
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    setDark(next);
    try { localStorage.setItem('homapon-theme', next ? 'dark' : 'light'); }
    catch { /* The toggle still works when browser storage is restricted. */ }
  }

  return <div className="theme-toggle no-print">
    <span className={!dark ? 'theme-icon-active' : ''}><NavIcon name="sun" /></span>
    <button type="button" role="switch" aria-label="Dark mode" aria-checked={dark} title={dark ? 'Switch to light mode' : 'Switch to dark mode'} className="theme-switch" onClick={toggle}><span /></button>
    <span className={dark ? 'theme-icon-active' : ''}><NavIcon name="moon" /></span>
  </div>;
}
