/**
 * Custom React hook para sa responsive SVG chart width.
 *
 * Gumagamit ito ng `ResizeObserver` para sukatin nang live yung lapad ng chart
 * container, kaya maganda pa rin basahin yung SVG labels sa cellphone at maliit na
 * screen nang hindi sobrang lumiliit yung text.
 *
 * Tinatawag ito ng: `GrowthPanel.tsx`, `MonthlyTrendChart.tsx`.
 */
import { useEffect, useRef, useState } from 'react';

/**
 * Bina-bantayan yung live width ng isang chart wrapper `<div>`, naka-clamp sa `[280px, maximum]`.
 * Binabawasan yung SVG coordinate space sa maliliit na screen para readable pa rin yung chart text.
 *
 * Input: `maximum` desktop width ng chart sa pixels.
 * Output: `{ ref, width }` — ikabit yung `ref` sa container `<div>` at ipasa yung `width` sa SVG.
 *
 * Edge cases na hawak nito:
 * - Nagfa-fallback sa `maximum` kapag walang `ResizeObserver` sa environment (gaya ng jsdom tests).
 * - Linalaktawan yung `width === 0` (hal. kapag pansamantalang naka-hide yung tab/panel).
 * - Nagdi-disconnect ng observer pag unmount o pag nagbago yung `maximum` para walang memory leak.
 */
export function useChartWidth(maximum: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(maximum);
  useEffect(() => {
    const chart = ref.current;
    // Skip kapag hindi pa naka-mount yung container o walang ResizeObserver support.
    if (!chart || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      // I-clamp lang sa [280, maximum] kapag visible talaga yung container (width > 0).
      if (entry.contentRect.width > 0) setWidth(Math.min(maximum, Math.max(280, Math.round(entry.contentRect.width))));
    });
    observer.observe(chart);
    return () => observer.disconnect();
  }, [maximum]);
  return { ref, width };
}
