'use client';

import { cn } from '@/lib/shared/utils';

interface SourceBadgeProps {
  source?: string;
  createdByRole?: string | null;
}

const BADGE_MAP: Record<string, { label: string; color: string }> = {
  chief:    { label: 'ШЕФ',      color: 'bg-red-50 text-red-600 border-red-200/60' },
  head:     { label: 'КЕР',      color: 'bg-amber-50 text-amber-600 border-amber-200/60' },
  calendar: { label: 'КАЛЕНДАР',  color: 'bg-blue-50 text-blue-600 border-blue-200/60' },
};

export function SourceBadge({ source, createdByRole }: SourceBadgeProps) {
  const role = createdByRole || source;
  if (!role || role === 'self') return null;

  const badge = BADGE_MAP[role];
  const label = badge?.label || role.toUpperCase();
  const color = badge?.color || 'bg-slate-100 text-slate-500 border-slate-200/60';

  return (
    <span className={cn('px-1.5 py-0.5 text-[9px] font-bold rounded border flex-shrink-0', color)}>
      {label}
    </span>
  );
}
