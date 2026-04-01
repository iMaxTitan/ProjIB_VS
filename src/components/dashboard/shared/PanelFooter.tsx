'use client';

import { cn } from '@/lib/shared/utils';

// ── SummaryBox — single metric cell used in panel footers ──

interface SummaryBoxProps {
  label: string;
  value: string;
  colorClass?: string;
}

export function SummaryBox({ label, value, colorClass }: SummaryBoxProps) {
  return (
    <div className="px-2 py-1.5 rounded-lg bg-white border border-slate-200/60 text-center">
      <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">{label}</div>
      <div className={cn('text-sm font-extrabold mt-0.5 leading-tight', colorClass || 'text-slate-800')}>{value}</div>
    </div>
  );
}

// ── PanelFooter — standard grid footer for 3-panel layouts ──

interface PanelFooterProps {
  children: React.ReactNode;
  columns?: 3 | 4;
}

export function PanelFooter({ children, columns = 3 }: PanelFooterProps) {
  return (
    <div className={cn(
      'flex-shrink-0 grid gap-1.5 p-2.5 bg-slate-50 border-t border-slate-200',
      columns === 4 ? 'grid-cols-4' : 'grid-cols-3',
    )}>
      {children}
    </div>
  );
}

// ── pctColor — percentage threshold to color class ──

export function pctColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 40) return 'text-indigo-600';
  return 'text-amber-600';
}

// ── barBg — progress bar background color by percentage ──

export function barBg(pct: number): string {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 40) return 'bg-indigo-500';
  return 'bg-amber-500';
}

// ── Constants ──

export const WEEKLY_CAPACITY = 32;
