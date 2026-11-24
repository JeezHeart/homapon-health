/**
 * PageSkeleton.tsx
 * Subtle pulsing placeholder layout shown while lazy-loaded routes or async panels fetch data.
 */
export default function PageSkeleton({
  compact = false,
  label = 'Loading…',
}: {
  compact?: boolean;
  label?: string;
}) {
  if (compact) {
    return (
      <div role="status" aria-live="polite" aria-label={label} className="space-y-3 py-1">
        <span className="sr-only">{label}</span>
        <div className="skeleton-block h-4 w-44 rounded-md" />
        <div className="grid grid-cols-2 gap-2.5">
          <div className="skeleton-block h-12 rounded-xl" />
          <div className="skeleton-block h-12 rounded-xl" />
          <div className="skeleton-block h-12 rounded-xl" />
          <div className="skeleton-block h-12 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" aria-label={label} className="flex flex-col gap-3.5">
      <span className="sr-only">{label}</span>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <div className="flex items-center gap-2.5">
              <div className="skeleton-block h-7 w-7 rounded-full" />
              <div className="skeleton-block h-3.5 w-24 rounded-md" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="skeleton-block h-7 w-12 rounded-md" />
              <div className="skeleton-block h-7 w-16 rounded-md" />
            </div>
            <div className="skeleton-block h-3 w-32 rounded-md" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap gap-2.5">
          <div className="skeleton-block h-10 flex-1 min-w-[12rem] rounded-xl" />
          <div className="skeleton-block h-10 w-32 rounded-xl" />
          <div className="skeleton-block h-10 w-32 rounded-xl" />
        </div>
      </div>
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
        <div className="skeleton-block h-4 w-40 rounded-md" />
        <div className="skeleton-block h-14 w-full rounded-xl" />
        <div className="skeleton-block h-14 w-full rounded-xl" />
        <div className="skeleton-block h-14 w-full rounded-xl" />
      </div>
    </div>
  );
}
