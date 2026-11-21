/**
 * EmptyState.tsx
 * Guide: Reusable dashed placeholder box kapag walang laman ang table, listahan, o search result.
 * May optional `action` prop para sa button (hal. "Register child").
 */
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  message: string;
  action?: ReactNode;
}

/** Nagdi-display ng centered empty-state message at optional action button. */
export default function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-8 text-center">
      {/* Empty state title, short explanation, at optional CTA button */}
      <p className="text-sm font-semibold text-[var(--color-navy)]">{title}</p>
      <p className="max-w-sm text-sm text-[var(--color-navy-soft)]">{message}</p>
      {action}
    </div>
  );
}
