/**
 * Helper para sa pag-filter at pag-sort ng SMS Reminders queue at SMS History log.
 *
 * Dito sinasala yung mga pending appointments na kailangan i-text (by search, purok,
 * at due window gaya ng today/tomorrow/overdue), sinasala rin yung SMS history gamit
 * yung parehong search/purok, at kumukuha ng latest sent SMS per child.
 *
 * Tinatawag ito ng: `SmsPage.tsx`.
 */
import type { Child, EnrichedAppointment, SmsEntry } from '../data/mockData';
import { childName, extractPurok } from '../data/mockData';
import { daysFromNow, todayISO } from './dates';

/** Mga timeframe filter tabs para sa pending SMS reminders list. */
export type ReminderFilter = 'all' | 'today' | 'tomorrow' | 'overdue';

/**
 * Binubuo yung filtered reminders queue, filtered SMS history, at `latest` SMS map per child.
 *
 * Inputs:
 * - `children`: buong listahan ng mga bata (gamit sa pag-match ng SMS log entries sa search/purok).
 * - `appointments`: enriched appointments na pagkukunan ng pending reminders.
 * - `smsLog`: mga na-record na SMS entries (sent o simulated).
 * - `{ query = '', purok = 'all', filter = 'all' }`: UI search, purok, at reminder tab filters.
 * - `today` / `tomorrow`: reference ISO dates (default ay today at +1 day; pwedeng i-inject sa tests).
 *
 * Output:
 * - `reminders`: mga pending appointments na tugma sa filter, naka-sort chronologically (date -> time -> ID).
 * - `history`: mga SMS log entries na tugma sa `query` at `purok`, pinakabago muna (`sentAt` descending).
 * - `latest`: `Map<childId, SmsEntry>` ng pinakahuling SMS na naipadala kay baby (mula sa buong history,
 *   para kita pa rin sa reminder row kung kailan huling na-text yung guardian).
 *
 * Edge cases na hawak nito:
 * - Kino-copy muna yung `smsLog` (`[...smsLog]`) bago i-sort para hindi mabago yung original state array.
 * - Tinatanggal sa reminders queue yung mga `completed` appointments.
 */
export function smsDirectory(
  children: Child[], appointments: EnrichedAppointment[], smsLog: SmsEntry[],
  { query = '', purok = 'all', filter = 'all' }: { query?: string; purok?: string; filter?: ReminderFilter },
  today = todayISO(), tomorrow = daysFromNow(1),
) {
  const search = query.trim().toLocaleLowerCase();
  const byId = new Map(children.map((child) => [child.id, child]));
  // Parehong search + purok matcher para sa reminders queue at sa SMS history table.
  const matches = (child?: Child) => (!search || Boolean(child && `${childName(child)} ${child.guardian}`.toLocaleLowerCase().includes(search)))
    && (purok === 'all' || Boolean(child && extractPurok(child.purok) === purok));

  // I-sort yung buong SMS history mula pinakabago, tapos kunin yung pinakaunang (latest) entry bawat bata.
  const orderedHistory = [...smsLog].sort((a, b) => b.sentAt.localeCompare(a.sentAt) || b.id.localeCompare(a.id));
  const latest = new Map<string, SmsEntry>();
  for (const entry of orderedHistory) if (!latest.has(entry.childId)) latest.set(entry.childId, entry);

  // I-filter yung mga hindi pa completed na appointments base sa napiling tab, tapos i-sort chronologically.
  const reminders = appointments.filter((appointment) => appointment.status !== 'completed' && matches(appointment.child) && (
    filter === 'all' || filter === 'overdue' && appointment.status === 'overdue'
    || filter === 'today' && appointment.scheduledDate === today
    || filter === 'tomorrow' && appointment.scheduledDate === tomorrow
  )).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? '') || a.id.localeCompare(b.id));
  return { reminders, history: orderedHistory.filter((entry) => matches(byId.get(entry.childId))), latest };
}
