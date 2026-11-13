import { useEffect, useState } from 'react';
import NavIcon from './NavIcon';

// Also retain a manual choice for this session if localStorage cannot be written.
let sessionPreference: 'light' | 'dark' | null = null;

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const syncCurrentPage = () => setDark(document.documentElement.dataset.theme === 'dark');
    const systemChanged = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem('homapon-theme'); } catch { /* Use session choice or OS. */ }
      if (sessionPreference || saved === 'light' || saved === 'dark') return;
      document.documentElement.dataset.theme = system.matches ? 'dark' : 'light';
      syncCurrentPage();
    };
    const sync = (event: StorageEvent) => {
      if (event.key !== 'homapon-theme' && event.key !== null) return;
      sessionPreference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : null;
      const next = sessionPreference ? sessionPreference === 'dark' : system.matches;
      document.documentElement.dataset.theme = next ? 'dark' : 'light';
      setDark(next);
    };
    window.addEventListener('storage', sync);
    window.addEventListener('homapon-theme-change', syncCurrentPage);
    system.addEventListener('change', systemChanged);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('homapon-theme-change', syncCurrentPage);
      system.removeEventListener('change', systemChanged);
    };
  }, []);

  function toggle() {
    const next = document.documentElement.dataset.theme !== 'dark';
    sessionPreference = next ? 'dark' : 'light';
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    setDark(next);
    try { localStorage.setItem('homapon-theme', next ? 'dark' : 'light'); }
    catch { /* The toggle still works when browser storage is restricted. */ }
    window.dispatchEvent(new Event('homapon-theme-change'));
  }

  return <div className="theme-toggle no-print">
    <span className={!dark ? 'theme-icon-active' : ''}><NavIcon name="sun" /></span>
    <button type="button" role="switch" aria-label="Dark mode" aria-checked={dark} title={dark ? 'Switch to light mode' : 'Switch to dark mode'} className="theme-switch" onClick={toggle}><span /></button>
    <span className={dark ? 'theme-icon-active' : ''}><NavIcon name="moon" /></span>
  </div>;
}
