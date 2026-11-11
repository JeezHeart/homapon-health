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

export const ROLE_LABEL: Record<DemoRole, string> = {
  midwife: 'Midwife · Admin',
  bhw: 'BHW · Encoder',
};

export type SaveResult<T> = { ok: true; value: T } | { ok: false; error: string };

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

export const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
