'use client';

import { cn } from '@/lib/utils';

export const reportTableStyles = {
  frame: 'rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm',
  scroll: 'overflow-x-auto',
  table: 'w-full text-xs table-fixed',
  thead: 'sticky top-0 z-10',
  headerRow: 'border-b border-slate-200 bg-slate-50/50 text-slate-600',
  rowBase: 'border-b border-slate-100 transition-colors hover:bg-indigo-50/30',
  rowZebra: 'bg-slate-50/30',
  rowPlain: 'bg-white',
  headerCellLeft: 'text-left px-1.5 py-1.5 font-semibold',
  headerCellCenter: 'text-center px-1.5 py-1.5 font-semibold',
  headerDivider: 'border-r border-slate-200/80',
  cellDivider: 'border-r border-slate-100',
  segmentedGroup: 'inline-flex rounded-lg bg-slate-200/60 p-0.5',
  segmentedButtonBase: 'inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-[background-color,color,box-shadow] duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
  segmentedButtonActive: 'bg-white text-indigo-700 shadow-sm',
  segmentedButtonIdle: 'text-slate-500 hover:text-slate-700',
  actionButtonBase: 'px-2.5 py-1 text-sm font-medium rounded-lg border disabled:cursor-wait transition-colors inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
  actionButtonAi: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:bg-violet-50 disabled:text-violet-400 disabled:border-violet-100',
  actionButtonPdf: 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:bg-indigo-50 disabled:text-indigo-400 disabled:border-indigo-100',
} as const;

type RowAlign = 'top' | 'middle';

export function reportTableRowClass(index: number, align: RowAlign = 'top', extra?: string): string {
  return cn(
    reportTableStyles.rowBase,
    index % 2 === 1 ? reportTableStyles.rowZebra : reportTableStyles.rowPlain,
    align === 'top' ? 'align-top' : 'align-middle',
    extra
  );
}

export function reportSegmentedButtonClass(isActive: boolean, extra?: string): string {
  return cn(
    reportTableStyles.segmentedButtonBase,
    isActive ? reportTableStyles.segmentedButtonActive : reportTableStyles.segmentedButtonIdle,
    extra
  );
}

type ReportActionVariant = 'ai' | 'pdf';

export function reportActionButtonClass(variant: ReportActionVariant, extra?: string): string {
  return cn(
    reportTableStyles.actionButtonBase,
    variant === 'ai' ? reportTableStyles.actionButtonAi : reportTableStyles.actionButtonPdf,
    extra
  );
}
