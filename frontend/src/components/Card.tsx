/**
 * Card.tsx
 * Guide: Reusable white card container na may optional title at top-right action slot.
 * Ginagamit sa buong app (Dashboard, Reports, Record Review, Child Profile) para consistent ang layout.
 */
import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}

/** Standard white card box na pwedeng lagyan ng heading (`title`) at button/tabs (`action`). */
export default function Card({ title, action, children }: CardProps) {
  return (
    <div className="health-card">
      {/* Optional header row para sa card title at right-side action controls */}
      {(title ?? action) && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          {title && (
            <h2 className="text-base font-medium text-[var(--color-navy)]">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {/* Pinaka-content ng card */}
      {children}
    </div>
  );
}
