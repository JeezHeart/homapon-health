import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  message: string;
  action?: ReactNode;
}

export default function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-8 text-center">
      <p className="text-sm font-semibold text-[var(--color-navy)]">{title}</p>
      <p className="max-w-sm text-sm text-[var(--color-navy-soft)]">{message}</p>
      {action}
    </div>
  );
}
