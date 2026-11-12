import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ChildProfilePage from './pages/ChildProfilePage';
import ChildrenPage from './pages/ChildrenPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import RecordsPage from './pages/RecordsPage';
import { lazy, Suspense } from 'react';
const RecordReviewPage = lazy(() => import('./pages/RecordReviewPage'));
import ReportsPage from './pages/ReportsPage';
import SchedulePage from './pages/SchedulePage';
import SettingsPage from './pages/SettingsPage';
import SmsPage from './pages/SmsPage';
import { StoreProvider } from './state/store';
import { useStore } from './state/store-context';
import { apiEnabled } from './data/api';
import { supabase } from './data/supabaseClient';

function Shell() {
  const { demoUser, dataReady, connected, signOut } = useStore();
  if (!dataReady)
    return (
      <div className="app-ui system-state">
        <div className="system-state-panel" role="status" aria-live="polite"><p className="text-lg font-semibold">Opening Homapon Health</p><p className="mt-2 text-sm text-[var(--color-navy-soft)]">Connecting to the server…</p><div aria-hidden="true" className="mt-5 space-y-3 motion-safe:animate-pulse"><div className="h-3 w-3/4 rounded bg-[var(--color-accent-soft)]" /><div className="h-3 w-1/2 rounded bg-[var(--color-page)]" /></div></div>
      </div>
    );
  if (!demoUser) return <LoginPage />;
  if (apiEnabled && !connected) return <div className="app-ui system-state"><div className="system-state-panel"><h1 className="text-xl font-semibold">Records could not be loaded</h1><p role="alert" className="my-4 text-sm text-[var(--color-navy-soft)]">Your records are unavailable. Check your connection, then try again.</p><div className="flex flex-wrap gap-3"><button className="rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white" onClick={() => window.location.reload()}>Reload records</button><button className="rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold" onClick={signOut}>Sign out</button></div></div></div>;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="children" element={<ChildrenPage />} />
          <Route path="children/:id" element={<ChildProfilePage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="records" element={<RecordsPage />} />
          <Route path="record-review" element={<Suspense fallback={<p role="status">Loading experimental review…</p>}><RecordReviewPage /></Suspense>} />
          <Route path="sms" element={<SmsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  if (import.meta.env.PROD && (!apiEnabled || !supabase)) return <div className="app-ui system-state"><div className="system-state-panel"><h1 className="text-xl font-semibold">Website configuration incomplete</h1><p role="alert" className="mt-4 text-sm text-[var(--color-navy-soft)]">The staff connection is not configured. Please contact the administrator.</p></div></div>;
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
