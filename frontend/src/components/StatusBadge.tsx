import type { AppointmentStatus } from '../data/mockData';

const STATUS_META: Record<
  AppointmentStatus,
  { label: string; classes: string; dot: string }
> = {
  upcoming: {
    label: 'Upcoming',
    classes: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/20',
    dot: 'bg-sky-500',
  },
  'due-today': {
    label: 'Due today',
    classes: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20',
    dot: 'bg-amber-500',
  },
  overdue: {
    label: 'Overdue',
    classes: 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20',
    dot: 'bg-rose-500',
  },
  completed: {
    label: 'Completed',
    classes: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
    dot: 'bg-emerald-500',
  },
};

export default function StatusBadge({ status }: { status: AppointmentStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.classes}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
