import { useEffect, useRef, type ReactNode } from 'react';
import './DashboardMotion.css';

// Plain React Bits Fade Content adaptation (David Haz), without GSAP.
// https://reactbits.dev/animations/fade-content — see MagicBento.LICENSE.md.
export default function FadeContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const played = useRef(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || played.current || typeof IntersectionObserver === 'undefined' || !node.animate) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const print = window.matchMedia('print');
    let animation: Animation | null = null;
    let observer: IntersectionObserver | null = null;
    const finish = () => { played.current = true; observer?.disconnect(); animation?.cancel(); animation = null; };
    if (reduced.matches || print.matches || document.hidden) { finish(); return; }
    observer = new IntersectionObserver((entries) => {
      if (played.current || !entries.some((entry) => entry.isIntersecting)) return;
      played.current = true; observer?.disconnect();
      animation = node.animate([{ opacity: 0.65 }, { opacity: 1 }], { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }, { threshold: 0.08 });
    observer.observe(node);
    const preferenceChanged = () => { if (reduced.matches || print.matches) finish(); };
    const visibilityChanged = () => { if (document.hidden) finish(); };
    reduced.addEventListener('change', preferenceChanged);
    print.addEventListener('change', preferenceChanged);
    window.addEventListener('beforeprint', finish);
    document.addEventListener('visibilitychange', visibilityChanged);
    node.addEventListener('focusin', finish);
    node.addEventListener('pointerdown', finish, { passive: true });
    return () => {
      observer?.disconnect(); animation?.cancel();
      reduced.removeEventListener('change', preferenceChanged);
      print.removeEventListener('change', preferenceChanged);
      window.removeEventListener('beforeprint', finish);
      document.removeEventListener('visibilitychange', visibilityChanged);
      node.removeEventListener('focusin', finish);
      node.removeEventListener('pointerdown', finish);
    };
  }, []);
  return <div ref={ref} className={`dashboard-fade ${className}`}>{children}</div>;
}
