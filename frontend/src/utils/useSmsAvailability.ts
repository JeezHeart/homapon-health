import { useEffect, useState } from 'react';
import { api, apiEnabled } from '../data/api';

export function useSmsAvailability() {
  const [enabled, setEnabled] = useState(!apiEnabled);
  const [message, setMessage] = useState(apiEnabled ? 'Checking SMS availability...' : '');
  useEffect(() => {
    if (!apiEnabled) return;
    let cancelled = false;
    api.smsAvailability().then((result) => {
      if (cancelled) return;
      setEnabled(result.enabled);
      setMessage(result.enabled ? '' : 'SMS sending is disabled while sender-name approval is pending.');
    }).catch(() => {
      if (!cancelled) setMessage('SMS availability could not be verified. Sending is blocked.');
    });
    return () => { cancelled = true; };
  }, []);
  return { enabled, message };
}
