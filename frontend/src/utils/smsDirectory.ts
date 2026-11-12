import type { Child, EnrichedAppointment, SmsEntry } from '../data/mockData';
import { childName, extractPurok } from '../data/mockData';
import { daysFromNow, todayISO } from './dates';

export type ReminderFilter = 'all' | 'today' | 'tomorrow' | 'overdue';

export function smsDirectory(
  children: Child[], appointments: EnrichedAppointment[], smsLog: SmsEntry[],
  { query = '', purok = 'all', filter = 'all' }: { query?: string; purok?: string; filter?: ReminderFilter },
  today = todayISO(), tomorrow = daysFromNow(1),
) {
  const search = query.trim().toLocaleLowerCase();
  const byId = new Map(children.map((child) => [child.id, child]));
  const matches = (child?: Child) => (!search || Boolean(child && `${childName(child)} ${child.guardian}`.toLocaleLowerCase().includes(search)))
    && (purok === 'all' || Boolean(child && extractPurok(child.purok) === purok));
  const orderedHistory = [...smsLog].sort((a, b) => b.sentAt.localeCompare(a.sentAt) || b.id.localeCompare(a.id));
  const latest = new Map<string, SmsEntry>();
  for (const entry of orderedHistory) if (!latest.has(entry.childId)) latest.set(entry.childId, entry);
  const reminders = appointments.filter((appointment) => appointment.status !== 'completed' && matches(appointment.child) && (
    filter === 'all' || filter === 'overdue' && appointment.status === 'overdue'
    || filter === 'today' && appointment.scheduledDate === today
    || filter === 'tomorrow' && appointment.scheduledDate === tomorrow
  )).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? '') || a.id.localeCompare(b.id));
  return { reminders, history: orderedHistory.filter((entry) => matches(byId.get(entry.childId))), latest };
}
