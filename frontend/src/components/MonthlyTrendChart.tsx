import type { DoseRecord } from '../data/mockData';
import { dosesPerMonth } from '../data/mockData';

/** Hand-rolled SVG line chart: doses per month. No chart dependency. */
export default function MonthlyTrendChart({
  records,
  compact = false,
}: {
  records: DoseRecord[];
  compact?: boolean;
}) {
  const buckets = dosesPerMonth(records, 6);
  const step = Math.max(1, Math.ceil(Math.max(1, ...buckets.map((b) => b.count)) / 4));
  const max = step * 4;
  const width = 720;
  const height = 300;
  const padX = 38;
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
      <p className="mb-3 text-xs text-[var(--color-navy-soft)]">Last 6 months</p>
      {!compact && <p className="text-3xl font-bold text-[var(--color-navy)]">
        {last.count}
        <span className="ml-2 align-middle text-xs font-medium text-[var(--color-navy-soft)]">
          doses in {last.label}
        </span>
      </p>}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        aria-hidden="true"
      >
        {Array.from({ length: 5 }, (_, i) => i * step).map((value) => <g key={value}>
          <line x1={padX} y1={y(value)} x2={width - padX} y2={y(value)} stroke="#e8edf0" />
          <text x={padX - 12} y={y(value) + 4} textAnchor="end" fontSize={12} fill="var(--color-navy-soft)">{value}</text>
        </g>)}
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-chart-teal)"
          strokeWidth={3}
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
              r={5}
              fill="var(--color-card)"
              stroke="var(--color-chart-teal)"
              strokeWidth={2.5}
              className="chart-anim-fade"
              style={{
                transformBox: 'fill-box',
                transformOrigin: 'center',
                animation: 'chart-fade 400ms ease-out both',
                animationDelay: `${500 + i * 80}ms`,
              }}
            ><title>{b.label}: {b.count} doses</title></circle>
            <text
              x={x(i)}
              y={height - 10}
              textAnchor="middle"
              fontSize={12}
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
