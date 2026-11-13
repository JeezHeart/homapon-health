import { useEffect, useRef, type ReactNode } from 'react';
import './MagicBento.css';

// Effects-only adaptation of React Bits Magic Bento by David Haz.
// Source: https://reactbits.dev/components/magic-bento
// License and attribution: ./MagicBento.LICENSE.md
// Existing dashboard cards retain their own layout, content, and controls.
interface MagicBentoProps {
  children: ReactNode;
  className?: string;
  enableBorderGlow?: boolean;
  enableSpotlight?: boolean;
  spotlightRadius?: number;
  summaryOnly?: boolean;
}

const CARD_SELECTOR = '.summary-stat, .health-card';
const VARIABLES = ['--mb-x', '--mb-y', '--mb-edge-opacity', '--mb-spot-opacity'];

export default function MagicBento({ children, className = '', enableBorderGlow = true, enableSpotlight = true, spotlightRadius = 300, summaryOnly = false }: MagicBentoProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const print = window.matchMedia('print');
    const radius = Math.max(40, spotlightRadius);
    const selector = summaryOnly ? '.summary-stat' : CARD_SELECTOR;
    const touched = new Set<HTMLElement>();
    let enabled = false;
    let frame = 0;
    let pointer: { x: number; y: number; target: EventTarget | null } | null = null;
    root.style.setProperty('--mb-radius', `${radius}px`);

    function clear() {
      cancelAnimationFrame(frame);
      frame = 0;
      pointer = null;
      for (const card of touched) for (const variable of VARIABLES) card.style.removeProperty(variable);
      touched.clear();
    }
    function sync() {
      clear();
      enabled = finePointer.matches && !reducedMotion.matches && !print.matches && (enableBorderGlow || enableSpotlight);
      root!.toggleAttribute('data-mb-active', enabled);
    }
    function draw() {
      frame = 0;
      if (!enabled || !pointer) return;
      const { x, y, target } = pointer;
      const hovered = target instanceof Element ? target.closest(selector) : null;
      // Read all bounds before writing styles; newly mounted growth cards are included.
      const cards = [...root!.querySelectorAll<HTMLElement>(selector)].map((card) => ({ card, rect: card.getBoundingClientRect() }));
      for (const { card, rect } of cards) {
        const dx = Math.max(rect.left - x, 0, x - rect.right);
        const dy = Math.max(rect.top - y, 0, y - rect.bottom);
        const proximity = Math.max(0, 1 - Math.hypot(dx, dy) / radius);
        if (!proximity || !rect.width || !rect.height) {
          for (const variable of VARIABLES) card.style.removeProperty(variable);
          touched.delete(card);
          continue;
        }
        touched.add(card);
        card.style.setProperty('--mb-x', `${x - rect.left}px`);
        card.style.setProperty('--mb-y', `${y - rect.top}px`);
        card.style.setProperty('--mb-edge-opacity', enableBorderGlow ? String(proximity * 0.85) : '0');
        card.style.setProperty('--mb-spot-opacity', enableSpotlight && card === hovered ? '1' : '0');
      }
    }
    function move(event: PointerEvent) {
      if (!enabled || document.hidden || event.pointerType === 'touch') { clear(); return; }
      pointer = { x: event.clientX, y: event.clientY, target: event.target };
      if (!frame) frame = requestAnimationFrame(draw);
    }
    sync();
    root.addEventListener('pointermove', move, { passive: true });
    root.addEventListener('pointerleave', clear);
    root.addEventListener('pointercancel', clear);
    root.addEventListener('pointerdown', clear, { passive: true });
    root.addEventListener('keydown', clear);
    window.addEventListener('scroll', clear, { passive: true, capture: true });
    window.addEventListener('resize', clear);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    for (const media of [finePointer, reducedMotion, print]) media.addEventListener('change', sync);
    return () => {
      clear();
      root.removeAttribute('data-mb-active');
      root.style.removeProperty('--mb-radius');
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', clear);
      root.removeEventListener('pointercancel', clear);
      root.removeEventListener('pointerdown', clear);
      root.removeEventListener('keydown', clear);
      window.removeEventListener('scroll', clear, { capture: true });
      window.removeEventListener('resize', clear);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
      for (const media of [finePointer, reducedMotion, print]) media.removeEventListener('change', sync);
    };
  }, [enableBorderGlow, enableSpotlight, spotlightRadius, summaryOnly]);

  return <div ref={rootRef} data-mb-summary-only={summaryOnly ? '' : undefined} className={`magic-bento-preview ${className}`}>{children}</div>;
}
