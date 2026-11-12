import { useEffect, useState } from 'react';
import { api, apiEnabled } from '../data/api';

export function useSmsAvailability() {
  const [enabled, setEnabled] = useState(!apiEnabled);
  const [message, setMessage] = useState(apiEnabled ? 'Checking SMS availability...' : '');
  const [status, setStatus] = useState<'checking' | 'enabled' | 'disabled' | 'unavailable' | 'practice'>(apiEnabled ? 'checking' : 'practice');
  useEffect(() => {
    if (!apiEnabled) return;
    let cancelled = false;
    api.smsAvailability().then((result) => {
      if (cancelled) return;
      setEnabled(result.enabled);
      setStatus(result.enabled ? 'enabled' : 'disabled');
      setMessage(result.enabled ? '' : 'SMS sending is disabled while sender-name approval is pending.');
    }).catch(() => {
      if (!cancelled) {
        setStatus('unavailable');
        setMessage('SMS availability could not be verified. Sending is blocked.');
      }
    });
    return () => { cancelled = true; };
  }, []);
  return { enabled, message, status };
}
