/**
 * Dialog.tsx
 * Guide: Reusable accessible popup modal at mobile slide-over drawer wrapper.
 * Nilo-lock nito yung background scroll, tina-trap yung Tab keyboard focus sa loob ng modal,
 * sumasara sa Escape o backdrop click, at binabalik ang focus kapag isinara.
 */
import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  variant?: 'dialog' | 'drawer';
  size?: 'default' | 'wide';
  returnFocusRef?: RefObject<HTMLElement | null>;
}

// Selector ng mga interactive elements sa loob ng modal na pwedeng ma-focus gamit ang Tab key.
const focusableSelector = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

/** Nagre-render ng centered modal (`variant="dialog"`) o mobile side drawer (`variant="drawer"`). */
export default function Dialog({ title, onClose, children, variant = 'dialog', size = 'default', returnFocusRef }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Nilo-lock ang body scroll habang bukas ang modal, fina-focus ang unang input/button, at binabalik ang focus pagkasara.
  useEffect(() => {
    const previousFocus = returnFocusRef?.current ?? document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [returnFocusRef]);

  const content = <div className={`app-ui dialog-backdrop no-print ${variant === 'drawer' ? 'drawer-backdrop' : ''}`}
    onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    onKeyDown={(e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter((node) => node.getClientRects().length > 0);
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (!first) { e.preventDefault(); panelRef.current?.focus(); }
      else if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }}>
    {/* Main dialog/drawer box na may title header, close (X) button, at body content */}
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      className={`dialog-pop dialog-panel ${variant === 'drawer' ? 'drawer-panel' : ''} ${size === 'wide' ? 'dialog-panel-wide' : ''}`}>
      {/* Header row ng dialog na may title at close button */}
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close dialog" className="icon-button"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
      </div>
      {/* Pinaka-laman ng dialog (form, message, o menu) */}
      {children}
    </div>
  </div>;
  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
