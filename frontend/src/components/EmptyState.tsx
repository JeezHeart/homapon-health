import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  message: string;
  action?: ReactNode;
}

export default function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-[var(--color-navy)]">{title}</p>
      <p className="max-w-sm text-sm text-[var(--color-navy-soft)]">{message}</p>
      {action}
    </div>
  );
}
