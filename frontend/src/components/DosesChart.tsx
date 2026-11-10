import type { DoseRecord } from '../data/mockData';
import { dosesPerWeek } from '../data/mockData';

/**
 * Lightweight SVG bar chart: doses recorded per week.
 * Hand-rolled to avoid a chart dependency (prd.md section 13).
 */
export default function DosesChart({ records }: { records: DoseRecord[] }) {
  const buckets = dosesPerWeek(records, 8);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const width = 560;
  const height = 220;
  const pad = 32;
  const gap = 8;
  const barW = (width - pad * 2) / buckets.length - gap;
  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <div
      role="img"
      aria-label={`Bar chart of doses recorded per week for the last 8 weeks. Total ${total} doses.`}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        aria-hidden="true"
      >
        {buckets.map((b, i) => {
          const h = Math.max(4, ((height - pad * 2) * b.count) / max);
          const x = pad + i * (barW + gap);
          const y = height - pad - h;
          return (
            <g key={b.label}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={6}
                fill="var(--color-highlight)"
                opacity={0.85}
                className="chart-anim"
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: 'bottom',
                  animation:
                    'chart-grow 600ms cubic-bezier(0.22, 1, 0.36, 1) both',
                  animationDelay: `${i * 70}ms`,
                }}
              />
              <text
                x={x + barW / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="var(--color-navy)"
                className="chart-anim-fade"
                style={{
                  animation: 'chart-fade 400ms ease-out both',
                  animationDelay: `${i * 70 + 350}ms`,
                }}
              >
                {b.count}
              </text>
              <text
                x={x + barW / 2}
                y={height - pad + 16}
                textAnchor="middle"
                fontSize={10}
                fill="var(--color-navy-soft)"
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-[var(--color-navy-soft)]">
        Doses recorded per week · {total} total in the last 8 weeks
      </p>
    </div>
  );
}
