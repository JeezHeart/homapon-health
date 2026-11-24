/**
 * Card.tsx
 * Guide: Reusable white card container na may optional title at top-right action slot.
 * Ginagamit sa buong app (Dashboard, Reports, Record Review, Child Profile) para consistent ang layout.
 */
import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  titleIcon?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Standard white card box na pwedeng lagyan ng heading (`title`) at button/tabs (`action`). */
export default function Card({ title, titleIcon, action, className = '', children }: CardProps) {
  return (
    <div className={className ? `health-card ${className}` : 'health-card'}>
      {/* Optional header row para sa card title at right-side action controls */}
      {(title ?? action) && (
        <div className="health-card-header">
          {title && (
            <h2 className={titleIcon ? 'health-card-title flex items-center gap-2' : 'health-card-title'}>
              {titleIcon && <span className="summary-stat-icon" aria-hidden="true">{titleIcon}</span>}
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
