/**
 * ThemeToggle.tsx
 * Guide: Light / Dark mode switch sa top header (Layout.tsx) at Login page.
 * Sine-save yung napiling theme sa localStorage at nagsi-sync across browser tabs at OS settings.
 */
import { useEffect, useState } from 'react';
import NavIcon from './NavIcon';
import { rememberTheme, sessionPreference, setThemePreference, THEME_CHANGE_EVENT, THEME_KEY } from '../utils/themePreference';

/** Accessible switch button na nagto-toggle ng `data-theme="light" | "dark"` sa root HTML element. */
export default function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  // Nakikinig sa localStorage events para laging in-sync ang theme across browser tabs (default: light mode).
  useEffect(() => {
    // Nire-refresh ang local switch state base sa current `data-theme` ng document.
    const syncCurrentPage = () => setDark(document.documentElement.dataset.theme === 'dark');
    // Nagsi-sync ng theme kapag binago ito ng user sa ibang open browser tab.
    const sync = (event: StorageEvent) => {
      if (event.key !== THEME_KEY && event.key !== null) return;
      rememberTheme(event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : null);
      const next = sessionPreference === 'dark';
      document.documentElement.dataset.theme = next ? 'dark' : 'light';
      setDark(next);
    };
    window.addEventListener('storage', sync);
    window.addEventListener(THEME_CHANGE_EVENT, syncCurrentPage);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(THEME_CHANGE_EVENT, syncCurrentPage);
    };
  }, []);

  // Nagpapalit sa light/dark mode, nagse-save sa localStorage, at nagno-notify sa ibang components.
  function toggle() {
    setThemePreference(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  }

  return <div className="theme-toggle no-print">
    {/* Sun icon, accessible switch control, at Moon icon */}
    <span className={!dark ? 'theme-icon-active' : ''}><NavIcon name="sun" /></span>
    <button type="button" role="switch" aria-label="Dark mode" aria-checked={dark} title={dark ? 'Switch to light mode' : 'Switch to dark mode'} className="theme-switch" onClick={toggle}><span /></button>
    <span className={dark ? 'theme-icon-active' : ''}><NavIcon name="moon" /></span>
  </div>;
}
