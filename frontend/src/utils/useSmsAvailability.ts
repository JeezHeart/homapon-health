/**
 * Custom React hook na nagche-check kung naka-enable ba yung live SMS sending sa backend.
 *
 * Naka-fail-closed ito by default: naka-block muna yung SMS buttons at dialogs hangga't
 * hindi kinukumpirma ng server na active yung SMS (o kung offline practice/demo mode,
 * pinapayagan yung local simulation).
 *
 * Tinatawag ito ng: `DashboardPage.tsx`, `SettingsPage.tsx`, `SmsPage.tsx`,
 * `SmsDialog.tsx`, `BatchSmsDialog.tsx`.
 */
import { useEffect, useState } from 'react';
import { api, apiEnabled } from '../data/api';

/**
 * Tumatawag sa `/api/sms/availability` pag mount (kapag naka-on yung backend API) at
 * nagbabalik ng SMS availability state para sa UI banners at send buttons.
 *
 * Inputs: wala (binabasa yung `apiEnabled` flag at tumatawag sa `api.smsAvailability()`).
 * Output: `{ enabled, message, status }` kung saan yung `status` ay isa sa:
 * - `'practice'`: offline/demo mode (`apiEnabled === false`); pwede yung local simulated SMS (`enabled: true`).
 * - `'checking'`: hinihintay pa yung sagot ng server (`enabled: false`, fail-closed).
 * - `'enabled'`: confirmed ng server na active yung SMS sending (`enabled: true`).
 * - `'disabled'`: sadyang naka-off sa backend (hal. pending pa yung sender-name approval).
 * - `'unavailable'`: nag-error yung check sa network/server; mananatiling naka-block (`enabled: false`).
 *
 * Edge case: may `cancelled` flag sa cleanup para hindi mag-setState kapag na-unmount na yung
 * component bago pa dumating yung response ng server.
 */
export function useSmsAvailability() {
  // Fail-closed (`enabled = false`) habang nagche-check sa live API; allowed sa practice mode kapag off ang API.
  const [enabled, setEnabled] = useState(!apiEnabled);
  const [message, setMessage] = useState(apiEnabled ? 'Checking SMS availability...' : '');
  const [status, setStatus] = useState<'checking' | 'enabled' | 'disabled' | 'unavailable' | 'practice'>(apiEnabled ? 'checking' : 'practice');
  // true = server naka-dry-run (walang totoong text), false = LIVE iProg send, undefined = hindi pa alam.
  const [dryRun, setDryRun] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!apiEnabled) return;
    let cancelled = false;
    api.smsAvailability().then((result) => {
      if (cancelled) return;
      setDryRun(result.dryRun);
      setEnabled(result.enabled);
      setStatus(result.enabled ? 'enabled' : 'disabled');
      setMessage(result.enabled ? '' : 'SMS sending is disabled while sender-name approval is pending.');
    }).catch(() => {
      // Kapag nagka-error sa verification, panatilihing naka-block yung sending at sabihan yung staff.
      if (!cancelled) {
        setStatus('unavailable');
        setMessage('SMS availability could not be verified. Sending is blocked.');
      }
    });
    return () => { cancelled = true; };
  }, []);
  return { enabled, message, status, dryRun };
}
