import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}

export default function Card({ title, action, children }: CardProps) {
  return (
    <div className="health-card">
      {(title ?? action) && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          {title && (
            <h2 className="text-base font-semibold tracking-tight text-[var(--color-navy)]">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
