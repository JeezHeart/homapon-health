import { useEffect, useRef, useState } from 'react';

/** Keep SVG text readable by reducing the coordinate space on narrow screens. */
export function useChartWidth(maximum: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(maximum);
  useEffect(() => {
    const chart = ref.current;
    if (!chart || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.min(maximum, Math.max(280, Math.round(entry.contentRect.width))));
    });
    observer.observe(chart);
    return () => observer.disconnect();
  }, [maximum]);
  return { ref, width };
}
