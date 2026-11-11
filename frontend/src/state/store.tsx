import type { GrowthMeasurement } from '../utils/growth';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  APPOINTMENTS,
  CHILDREN,
  RECORDS,
  SMS_HISTORY,
} from '../data/mockData';
import type { Appointment, Child, DoseRecord, SmsEntry } from '../data/mockData';
import { api, apiEnabled, apiError } from '../data/api';
import { supabase } from '../data/supabaseClient';
import type { DemoUser, StoreValue } from './store-context';
import { StoreContext } from './store-context';

const DEMO_USER_KEY = 'homapon-demo-user';

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

function loadDemoUser(): DemoUser | null {
  try {
    const raw = localStorage.getItem(DEMO_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoUser;
    if (
      typeof parsed.name !== 'string' ||
      (parsed.role !== 'midwife' && parsed.role !== 'bhw')
    ) {
      return null;
    }
    return { name: parsed.name, role: parsed.role };
  } catch {
    return null;
  }
}

type Fail = { ok: false; error: string };

function fail(e: unknown): Fail {
  return { ok: false, error: apiError(e) };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [demoGrowth, setDemoGrowth] = useState<GrowthMeasurement[]>([]);
  const [childList, setChildList] = useState<Child[]>(() =>
    apiEnabled ? [] : CHILDREN,
  );
  const [recordList, setRecordList] = useState<DoseRecord[]>(() =>
    apiEnabled ? [] : RECORDS,
  );
  const [appointmentList, setAppointmentList] = useState<Appointment[]>(() =>
    apiEnabled ? [] : APPOINTMENTS,
  );
  const [smsLog, setSmsLog] = useState<SmsEntry[]>(() =>
    apiEnabled ? [] : SMS_HISTORY,
  );
  const [demoUser, setDemoUser] = useState<DemoUser | null>(() =>
    apiEnabled ? null : loadDemoUser(),
  );
  // Demo mode (no API URL) is ready instantly with seed data.
  const [dataReady, setDataReady] = useState(!apiEnabled);
  const [connected, setConnected] = useState(!apiEnabled);

  // First load in live API mode: restore the Supabase session first,
  // validate the staff user via /api/me, and only then load operational
  // data. Never fall back to fictional demo records in live API mode.
  useEffect(() => {
    if (!apiEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        if (cancelled || !data.session) return;

        let me: { name: string; role: 'midwife' | 'bhw' };
        try {
          me = await api.me();
        } catch {
          // Signed in but role lookup failed: stay signed out.
          if (!cancelled) setDemoUser(null);
          return;
        }
        if (cancelled) return;
        setDemoUser({ name: me.name, role: me.role });

        try {
          const [c, r, a, s] = await Promise.all([
            api.children(),
            api.records(),
            api.appointments(),
            api.smsLog(),
          ]);
          if (cancelled) return;
          setChildList(c);
          setRecordList(r);
          setAppointmentList(a);
          setSmsLog(s);
          setConnected(true);
        } catch {
          if (!cancelled) {
            setChildList([]);
            setRecordList([]);
            setAppointmentList([]);
            setSmsLog([]);
            setConnected(false);
          }
        }
      } finally {
        if (!cancelled) setDataReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      demoGrowth, setDemoGrowth,
      children: childList,
      records: recordList,
      appointments: appointmentList,
      smsLog,
      dataReady,
      connected,
      addChild: async (data) => {
        if (apiEnabled) {
          try {
            const child = await api.createChild(data);
            setChildList((prev) => [...prev, child]);
            return child;
          } catch (e) {
            throw new Error(apiError(e));
          }
        }
        if (!data.initialMeasurement) throw new Error('First growth measurement is required.');
        const { initialMeasurement, ...childData } = data;
        const child: Child = { ...childData, id: crypto.randomUUID() };
        setDemoGrowth((prev) => [...prev, { ...initialMeasurement, id: crypto.randomUUID(), childId: child.id }]);
        setChildList((prev) => [...prev, child]);
        return child;
      },
      updateChild: async (id, patch) => {
        if (apiEnabled) {
          try {
            const child = await api.updateChild(id, patch);
            setChildList((prev) => prev.map((c) => (c.id === id ? child : c)));
            return;
          } catch (e) {
            throw new Error(apiError(e));
          }
        }
        setChildList((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        );
      },
      deleteChild: async (id) => {
        if (apiEnabled) {
          try {
            await api.deleteChild(id);
          } catch (e) {
            return fail(e);
          }
        }
        setDemoGrowth((prev) => prev.filter((r) => r.childId !== id));
        setChildList((prev) => prev.filter((c) => c.id !== id));
        setRecordList((prev) => prev.filter((r) => r.childId !== id));
        setAppointmentList((prev) => prev.filter((a) => a.childId !== id));
        setSmsLog((prev) => prev.filter((s) => s.childId !== id));
        return { ok: true };
      },
      updateDoseRecord: async (id, patch) => {
        if (apiEnabled) {
          try {
            const res = await api.updateDose(id, patch);
            if (!res.ok) return res;
            setRecordList((prev) =>
              prev.map((r) => (r.id === id ? res.record : r)),
            );
            return { ok: true };
          } catch (e) {
            return fail(e);
          }
        }
        const current = recordList.find((r) => r.id === id);
        if (!current) return { ok: false, error: 'Record not found.' };
        const next = { ...current, ...patch };
        const clash = recordList.some(
          (r) =>
            r.id !== id &&
            r.childId === next.childId &&
            r.vaccineId === next.vaccineId &&
            r.doseNumber === next.doseNumber,
        );
        if (clash) {
          return {
            ok: false,
            error:
              'Another record already covers this child, vaccine, and dose.',
          };
        }
        setRecordList((prev) => prev.map((r) => (r.id === id ? next : r)));
        return { ok: true };
      },
      deleteDoseRecord: async (id) => {
        if (apiEnabled) {
          try {
            await api.deleteDose(id);
            setRecordList((prev) => prev.filter((r) => r.id !== id));
            return { ok: true };
          } catch (e) {
            return fail(e);
          }
        }
        setRecordList((prev) => prev.filter((r) => r.id !== id));
        return { ok: true };
      },
      deleteAppointment: async (id) => {
        if (apiEnabled) {
          try {
            await api.deleteAppointment(id);
            setAppointmentList((prev) => prev.filter((a) => a.id !== id));
            return { ok: true };
          } catch (e) {
            return fail(e);
          }
        }
        setAppointmentList((prev) => prev.filter((a) => a.id !== id));
        return { ok: true };
      },
      addDoseRecord: async (data) => {
        if (apiEnabled) {
          try {
            const res = await api.createDose(data);
            setRecordList((prev) => [...prev, res.record]);
            return { ok: true, record: res.record };
          } catch (e) {
            return fail(e);
          }
        }
        const isDuplicate = (list: DoseRecord[]) =>
          list.some(
            (r) =>
              r.childId === data.childId &&
              r.vaccineId === data.vaccineId &&
              r.doseNumber === data.doseNumber,
          );
        if (isDuplicate(recordList)) {
          return {
            ok: false,
            error:
              'This dose is already recorded as completed for this child.',
          };
        }
        const record: DoseRecord = { ...data, id: nextId('r') };
        setRecordList((prev) =>
          isDuplicate(prev) ? prev : [...prev, record],
        );
        return { ok: true, record };
      },
      addAppointment: async (data) => {
        if (apiEnabled) {
          try {
            const appt = await api.createAppointment(data);
            setAppointmentList((prev) => [...prev, appt]);
            return appt;
          } catch (e) {
            throw new Error(apiError(e));
          }
        }
        const appt: Appointment = { ...data, id: nextId('a') };
        setAppointmentList((prev) => [...prev, appt]);
        return appt;
      },
      updateAppointment: async (id, patch) => {
        if (apiEnabled) {
          try {
            const appt = await api.updateAppointment(id, patch);
            setAppointmentList((prev) =>
              prev.map((a) => (a.id === id ? appt : a)),
            );
            return;
          } catch (e) {
            throw new Error(apiError(e));
          }
        }
        setAppointmentList((prev) =>
          prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        );
      },
      logSms: async (childId, message, status, sentAt) => {
        if (apiEnabled) {
          try {
            const entry = await api.logSms(childId, message, status, sentAt);
            setSmsLog((prev) => [entry, ...prev]);
            return entry;
          } catch (e) {
            throw new Error(apiError(e));
          }
        }
        const entry: SmsEntry = {
          id: nextId('s'),
          childId,
          message,
          sentAt,
          status,
        };
        setSmsLog((prev) => [entry, ...prev]);
        return entry;
      },
      refreshSms: async () => {
        if (!apiEnabled) return;
        try {
          setSmsLog(await api.smsLog());
        } catch {
          // History simply stays as-is; next load resyncs.
        }
      },
      demoUser,
      signIn: (user) => {
        if (apiEnabled) return;
        setDemoUser(user);
        try {
          localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
        } catch {
          // Demo session simply won't persist; the app still works.
        }
      },
      signInReal: async (email, password) => {
        if (!supabase) throw new Error('Server login is not configured.');
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw new Error('Wrong email or password. Try again.');
        let me: { name: string; role: 'midwife' | 'bhw' };
        try {
          me = await api.me();
        } catch (e) {
          await supabase.auth.signOut().catch(() => {});
          throw new Error(apiError(e));
        }
        try {
          const [c, r, a, s] = await Promise.all([
            api.children(),
            api.records(),
            api.appointments(),
            api.smsLog(),
          ]);
          setChildList(c);
          setRecordList(r);
          setAppointmentList(a);
          setSmsLog(s);
          setConnected(true);
        } catch {
          setChildList([]);
          setRecordList([]);
          setAppointmentList([]);
          setSmsLog([]);
          setConnected(false);
        }
        setDemoUser({ name: me.name, role: me.role });
        setDataReady(true);
      },
      signOut: () => {
        setDemoGrowth([]);
        if (supabase) void supabase.auth.signOut();
        setDemoUser(null);
        if (apiEnabled) {
          setChildList([]);
          setRecordList([]);
          setAppointmentList([]);
          setSmsLog([]);
          setConnected(false);
        }
        try {
          localStorage.removeItem(DEMO_USER_KEY);
        } catch {
          // Nothing to clean up.
        }
      },
      resetDemo: async () => {
        if (apiEnabled) {
          try {
            const [c, r, a, s] = await Promise.all([
              api.children(),
              api.records(),
              api.appointments(),
              api.smsLog(),
            ]);
            setChildList(c);
            setRecordList(r);
            setAppointmentList(a);
            setSmsLog(s);
            setConnected(true);
          } catch {
            setConnected(false);
          }
          return;
        }
        setDemoGrowth([]);
        setChildList([...CHILDREN]);
        setRecordList([...RECORDS]);
        setAppointmentList([...APPOINTMENTS]);
        setSmsLog([...SMS_HISTORY]);
      },
    }),
    [childList, recordList, appointmentList, smsLog, demoUser, dataReady, connected, demoGrowth],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
