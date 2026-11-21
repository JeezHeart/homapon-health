/**
 * Pinaka-shell at routing table ng buong frontend app.
 *
 * Dito tsine-check kung kumpleto yung production env config, kung naka-login na yung staff,
 * at kung connected ba sa backend API — tapos dito rin naka-map lahat ng URL routes (`/`, `/children`,
 * `/schedule`, `/records`, `/review`, `/sms`, `/reports`, `/settings`) papunta sa kani-kanilang page.
 * Check mo dito kapag may broken route, stuck sa loading, ayaw lumabas ng LoginPage, o lumalabas yung "Records could not be loaded".
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ChildProfilePage from './pages/ChildProfilePage';
import ChildrenPage from './pages/ChildrenPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import RecordsPage from './pages/RecordsPage';
import ReviewWorklistPage from './pages/ReviewWorklistPage';
import ReportsPage from './pages/ReportsPage';
import SchedulePage from './pages/SchedulePage';
import SettingsPage from './pages/SettingsPage';
import SmsPage from './pages/SmsPage';
import { StoreProvider } from './state/store';
import { useStore } from './state/store-context';
import { apiEnabled } from './data/api';
import { supabase } from './data/supabaseClient';

// Binabasa yung auth at connection status mula sa StoreProvider para pumili kung loading, LoginPage, error screen, o main routes ang ipapakita.
function Shell() {
  const { demoUser, dataReady, connected, signOut } = useStore();
  // Hintayin muna matapos yung initial session/data check bago mag-decide kung LoginPage o dashboard.
  if (!dataReady)
    return (
      <div className="app-ui system-state">
        {/* Startup loading screen habang kinokonekta at nire-restore yung staff session */}
        <div className="system-state-panel" role="status" aria-live="polite"><p className="text-lg font-semibold">Opening Homapon Health</p><p className="mt-2 text-sm text-[var(--color-navy-soft)]">Connecting to the server…</p><div aria-hidden="true" className="mt-5 space-y-3 motion-safe:animate-pulse"><div className="h-3 w-3/4 rounded bg-[var(--color-accent-soft)]" /><div className="h-3 w-1/2 rounded bg-[var(--color-page)]" /></div></div>
      </div>
    );
  // Kapag walang naka-login na staff user, diretso sa LoginPage.
  if (!demoUser) return <LoginPage />;
  // Kapag naka-login pero nag-fail mag-load yung live API records, harangin muna kaysa magpakita ng blank/fake data.
  if (apiEnabled && !connected) return <div className="app-ui system-state"><div className="system-state-panel"><h1 className="text-xl font-semibold">Records could not be loaded</h1><p role="alert" className="my-4 text-sm text-[var(--color-navy-soft)]">Your records are unavailable. Check your connection, then try again.</p><div className="flex flex-wrap gap-3"><button className="rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white" onClick={() => window.location.reload()}>Reload records</button><button className="rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold" onClick={signOut}>Sign out</button></div></div></div>;
  // Kapag authenticated at connected na, i-render yung shared Layout (sidebar + header) at lahat ng app routes.
  return (
    <BrowserRouter>
      {/* Lahat ng staff screens naka-wrap sa Layout para tuloy-tuloy yung sidebar at navigation */}
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="children" element={<ChildrenPage />} />
          <Route path="children/:id" element={<ChildProfilePage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="records" element={<RecordsPage />} />
          <Route path="review" element={<ReviewWorklistPage />} />
          <Route path="sms" element={<SmsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

// Root React component: sine-check kung kumpleto yung production config at naka-wrap yung Shell sa StoreProvider para shared yung state sa lahat ng pages.
export default function App() {
  // Sa production build, bawal mag-fallback sa local demo mode kapag kulang yung API URL o Supabase env vars.
  if (import.meta.env.PROD && (!apiEnabled || !supabase)) return <div className="app-ui system-state"><div className="system-state-panel"><h1 className="text-xl font-semibold">Website configuration incomplete</h1><p role="alert" className="mt-4 text-sm text-[var(--color-navy-soft)]">The staff connection is not configured. Please contact the administrator.</p></div></div>;
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
