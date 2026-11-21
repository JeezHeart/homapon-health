/**
 * React Context definition at `useStore()` hook para sa global state ng buong app.
 *
 * Dito naka-list lahat ng data at actions na pwedeng kunin ng kahit anong page gamit `useStore()`,
 * pati yung `ROLE_LABEL` para sa Midwife at BHW. Nakahiwalay ito sa `store.tsx` para malinis yung Vite fast-refresh.
 * Check mo dito kung gusto mong makita lahat ng available na state at CRUD functions sa store.
 */
import type { GrowthMeasurement } from '../utils/growth';
import { createContext, useContext } from 'react';
import type {
  Appointment,
  Child,
  DoseRecord,
  NewAppointment,
  NewChild,
  NewDoseRecord,
  SmsEntry,
} from '../data/mockData';

export type DemoRole = 'midwife' | 'bhw';

export interface DemoUser {
  name: string;
  role: DemoRole;
}

// Display labels ng staff roles na nakikita sa sidebar at SettingsPage.
export const ROLE_LABEL: Record<DemoRole, string> = {
  midwife: 'Midwife · Admin',
  bhw: 'BHW · Encoder',
};

export type SaveResult<T> = { ok: true; value: T } | { ok: false; error: string };

// Kumpletong listahan ng global React state at API/local actions na binibigay ni `StoreProvider` sa `store.tsx`.
export interface StoreValue {
  demoGrowth: GrowthMeasurement[];
  setDemoGrowth: (update: (previous: GrowthMeasurement[]) => GrowthMeasurement[]) => void;
  children: Child[];
  records: DoseRecord[];
  appointments: Appointment[];
  smsLog: SmsEntry[];
  /** False until the first server load settles (true instantly in demo mode). */
  dataReady: boolean;
  /** True when lists come from the server. False = local demo data. */
  connected: boolean;
  addChild: (data: NewChild) => Promise<Child>;
  updateChild: (id: string, patch: Partial<NewChild>) => Promise<void>;
  deleteChild: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  addDoseRecord: (
    data: NewDoseRecord,
  ) => Promise<{ ok: true; record: DoseRecord } | { ok: false; error: string }>;
  addAppointment: (data: NewAppointment) => Promise<Appointment>;
  updateAppointment: (id: string, patch: Partial<NewAppointment>) => Promise<void>;
  updateDoseRecord: (
    id: string,
    patch: Partial<NewDoseRecord>,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  deleteDoseRecord: (
    id: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  deleteAppointment: (
    id: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  logSms: (
    childId: string,
    message: string,
    status: SmsEntry['status'],
    sentAt: string,
  ) => Promise<SmsEntry>;
  /** Re-read the SMS log from the server (no-op in demo mode). */
  refreshSms: () => Promise<void>;
  demoUser: DemoUser | null;
  /** Demo mode only (no API): name + role, no password. */
  signIn: (user: DemoUser) => void;
  /** Real mode: email + password via Supabase Auth. Throws friendly error. */
  signInReal: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  resetDemo: () => Promise<void>;
}

// React Context object na pinupuno ng `StoreProvider` sa pinakataas ng `App.tsx`.
export const StoreContext = createContext<StoreValue | null>(null);

// Custom hook na tinatawag ng mga pages at dialogs para magbasa ng records/auth at mag-trigger ng save/edit/delete.
export function useStore(): StoreValue {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
