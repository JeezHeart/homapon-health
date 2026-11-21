/**
 * CountUp.tsx
 * Guide: Animated number counter para sa mga Dashboard KPI summary cards.
 * Nagka-count up mula 0 hanggang target total nang isang beses, at auto-skip sa reduced-motion,
 * print mode, o kapag naka-background yung browser tab.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import './DashboardMotion.css';

// Lightweight React Bits Count Up adaptation (David Haz).
// https://reactbits.dev/text-animations/count-up — see MagicBento.LICENSE.md.
// The parent summary link exposes the actual total to assistive technology.
// Gumagamit ng useLayoutEffect sa browser para walang flicker bago mag-paint, at useEffect sa SSR.
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Nag-a-animate ng number count up papuntang `to` gamit ang requestAnimationFrame at ease-out curve. */
export default function CountUp({ to, startWhen = true, duration = 0.4 }: { to: number; startWhen?: boolean; duration?: number }) {
  const display = useRef<HTMLSpanElement>(null);
  const completed = useRef(false);
  const initialTarget = useRef<number | null>(null);
  const formatted = to.toLocaleString('en-PH');
  // Pinapatakbo yung count-up animation bago mag-paint, at diretso sa final number kapag print/reduced-motion/hidden.
  useBeforePaint(() => {
    const node = display.current;
    if (!node) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const print = window.matchMedia('print');
    let frame = 0;
    // Tinitigil ang animation loop at sinusulat agad yung exact final formatted number.
    const finish = () => { cancelAnimationFrame(frame); completed.current = true; node.textContent = formatted; };
    if (!startWhen) { node.textContent = formatted; return; }
    if (completed.current || initialTarget.current !== null && initialTarget.current !== to || reduced.matches || print.matches || document.hidden || duration <= 0 || to === 0) { finish(); return; }
    initialTarget.current = to;
    node.textContent = '0';
    const start = performance.now();
    // Nag-a-advance ng isang animation frame gamit ang ease-out formula hanggang matapos ang duration.
    function draw(now: number) {
      const progress = Math.min(1, (now - start) / (duration * 1000));
      if (progress >= 1) { finish(); return; }
      node!.textContent = Math.round(to * (1 - 2 ** (-10 * progress))).toLocaleString('en-PH');
      frame = requestAnimationFrame(draw);
    }
    // Tatalon agad sa final count kapag biglang nag-on ang reduced motion o print mode.
    const preferenceChanged = () => { if (reduced.matches || print.matches) finish(); };
    // Tatalon agad sa final count kapag lumipat ng ibang browser tab ang user.
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
  // Visual-only span (aria-hidden) kasi naka-expose na yung exact total sa parent summary link.
  return <span className="dashboard-count" aria-hidden="true" data-count-final={formatted} style={{ minWidth: `${formatted.length}ch` }}><span ref={display}>{formatted}</span></span>;
}
