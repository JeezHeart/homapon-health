import type { DoseRecord } from '../data/mockData';
import { dosesPerMonth } from '../data/mockData';

/** Hand-rolled SVG line chart: doses per month. No chart dependency. */
export default function MonthlyTrendChart({
  records,
}: {
  records: DoseRecord[];
}) {
  const buckets = dosesPerMonth(records, 6);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const width = 560;
  const height = 220;
  const padX = 28;
  const padTop = 20;
  const padBottom = 32;

  const x = (i: number) =>
    buckets.length === 1
      ? width / 2
      : padX + (i * (width - padX * 2)) / (buckets.length - 1);
  const y = (v: number) =>
    padTop + (1 - v / max) * (height - padTop - padBottom);

  const points = buckets.map((b, i) => `${x(i)},${y(b.count)}`).join(' ');
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const last = buckets[buckets.length - 1];

  return (
    <div
      role="img"
      aria-label={`Line chart of doses per month for the last 6 months. Total ${total} doses.`}
    >
      <p className="text-xs text-[var(--color-navy-soft)]">Last 6 months</p>
      <p className="text-3xl font-bold text-[var(--color-navy)]">
        {last.count}
        <span className="ml-2 align-middle text-xs font-medium text-[var(--color-navy-soft)]">
          doses in {last.label}
        </span>
      </p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 w-full"
        aria-hidden="true"
      >
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-highlight)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className="chart-anim-line"
          style={{
            strokeDasharray: 1,
            animation: 'chart-draw 900ms ease-out both',
          }}
        />
        {buckets.map((b, i) => (
          <g key={b.label}>
            <circle
              cx={x(i)}
              cy={y(b.count)}
              r={4}
              fill="var(--color-highlight)"
              className="chart-anim-fade"
              style={{
                transformBox: 'fill-box',
                transformOrigin: 'center',
                animation: 'chart-fade 400ms ease-out both',
                animationDelay: `${500 + i * 80}ms`,
              }}
            />
            <text
              x={x(i)}
              y={height - 10}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-navy-soft)"
            >
              {b.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
