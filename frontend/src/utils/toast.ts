/**
 * Lightweight client-side toast notification emitter.
 * Zero extra React context overhead; safe no-op in SSR/Node tests.
 */
export type ToastTone = 'success' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

type Listener = (toast: ToastItem) => void;

const listeners = new Set<Listener>();
let nextToastId = 1;

export function showToast(message: string, tone: ToastTone = 'success'): void {
  if (typeof window === 'undefined' || !message.trim()) return;
  const item: ToastItem = { id: nextToastId++, message: message.trim(), tone };
  for (const listener of listeners) listener(item);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
