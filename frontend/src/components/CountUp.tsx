import { useEffect, useLayoutEffect, useRef } from 'react';
import './DashboardMotion.css';

// Lightweight React Bits Count Up adaptation (David Haz).
// https://reactbits.dev/text-animations/count-up — see MagicBento.LICENSE.md.
// The parent summary link exposes the actual total to assistive technology.
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function CountUp({ to, startWhen = true, duration = 0.4 }: { to: number; startWhen?: boolean; duration?: number }) {
  const display = useRef<HTMLSpanElement>(null);
  const completed = useRef(false);
  const initialTarget = useRef<number | null>(null);
  const formatted = to.toLocaleString('en-PH');
  useBeforePaint(() => {
    const node = display.current;
    if (!node) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const print = window.matchMedia('print');
    let frame = 0;
    const finish = () => { cancelAnimationFrame(frame); completed.current = true; node.textContent = formatted; };
    if (!startWhen) { node.textContent = formatted; return; }
    if (completed.current || initialTarget.current !== null && initialTarget.current !== to || reduced.matches || print.matches || document.hidden || duration <= 0 || to === 0) { finish(); return; }
    initialTarget.current = to;
    node.textContent = '0';
    const start = performance.now();
    function draw(now: number) {
      const progress = Math.min(1, (now - start) / (duration * 1000));
      if (progress >= 1) { finish(); return; }
      node!.textContent = Math.round(to * (1 - 2 ** (-10 * progress))).toLocaleString('en-PH');
      frame = requestAnimationFrame(draw);
    }
    const preferenceChanged = () => { if (reduced.matches || print.matches) finish(); };
    const visibilityChanged = () => { if (document.hidden) finish(); };
    frame = requestAnimationFrame(draw);
    reduced.addEventListener('change', preferenceChanged);
    print.addEventListener('change', preferenceChanged);
    window.addEventListener('beforeprint', finish);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      cancelAnimationFrame(frame); node.textContent = formatted;
      reduced.removeEventListener('change', preferenceChanged);
      print.removeEventListener('change', preferenceChanged);
      window.removeEventListener('beforeprint', finish);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [to, formatted, startWhen, duration]);
  return <span className="dashboard-count" aria-hidden="true" data-count-final={formatted} style={{ minWidth: `${formatted.length}ch` }}><span ref={display}>{formatted}</span></span>;
}
