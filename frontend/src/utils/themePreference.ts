export const THEME_KEY = 'homapon-theme';
export const THEME_CHANGE_EVENT = 'homapon-theme-change';

type Theme = 'light' | 'dark';
export let sessionPreference: Theme | null = null;

export function rememberTheme(theme: Theme | null) {
  sessionPreference = theme;
}

export function setThemePreference(theme: Theme) {
  rememberTheme(theme);
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); }
  catch { /* The theme still applies when browser storage is unavailable. */ }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
