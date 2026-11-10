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

function Shell() {
  const { demoUser, dataReady } = useStore();
  if (!dataReady)
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p role="status" className="text-sm font-medium text-[var(--color-navy-soft)]">
          Connecting to the server…
        </p>
      </div>
    );
  if (!demoUser) return <LoginPage />;
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
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
