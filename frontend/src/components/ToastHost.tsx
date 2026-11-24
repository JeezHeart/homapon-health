/**
 * ToastHost.tsx
 * Renders brief, non-intrusive confirmation pills in the bottom-right corner
 * whenever staff register, save, update, remove, or export records.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { subscribeToasts, type ToastItem } from '../utils/toast';

const AUTO_DISMISS_MS = 3200;

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const timers = new Map<number, number>();
    const unsubscribe = subscribeToasts((toast) => {
      setItems((prev) => [...prev.slice(-2), toast]);
      const timer = window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== toast.id));
        timers.delete(toast.id);
      }, AUTO_DISMISS_MS);
      timers.set(toast.id, timer);
    });
    return () => {
      unsubscribe();
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  if (!items.length || typeof document === 'undefined') return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="false"
      className="app-ui no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2"
    >
      {items.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="toast-pop pointer-events-auto flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-2.5 text-sm font-medium text-[var(--color-navy)] shadow-lg"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-dark)]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 13 4 4L19 7" />
            </svg>
          </span>
          <span>{toast.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setItems((prev) => prev.filter((item) => item.id !== toast.id))}
            className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-xs text-[var(--color-navy-soft)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-navy)]"
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
