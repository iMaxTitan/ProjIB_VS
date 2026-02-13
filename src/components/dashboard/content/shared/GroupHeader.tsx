'use client';

import React from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type GroupHeaderTone = 'purple' | 'amber' | 'emerald' | 'indigo' | 'blue';

const toneStyles: Record<GroupHeaderTone, {
  container: string;
  chevron: string;
  title: string;
  count: string;
  addButton: string;
}> = {
  purple: {
    container: 'bg-gradient-to-r from-purple-100/80 to-violet-50/80 border border-purple-200/50 hover:from-purple-200/80 hover:to-violet-100/80 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors',
    chevron: 'text-purple-400',
    title: 'text-purple-700',
    count: 'text-purple-500 bg-white/70',
    addButton: 'border-purple-200 bg-purple-50 text-purple-600 hover:bg-purple-100',
  },
  amber: {
    container: 'bg-gradient-to-r from-amber-100/80 to-orange-50/80 border border-amber-200/50 hover:from-amber-200/80 hover:to-orange-100/80 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors',
    chevron: 'text-amber-400',
    title: 'text-amber-700',
    count: 'text-amber-500 bg-white/70',
    addButton: 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100',
  },
  emerald: {
    container: 'bg-gradient-to-r from-emerald-100/80 to-emerald-50/80 border border-emerald-200/50 hover:from-emerald-200/80 hover:to-emerald-100/80 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors',
    chevron: 'text-emerald-400',
    title: 'text-emerald-700',
    count: 'text-emerald-500 bg-white/70',
    addButton: 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100',
  },
  indigo: {
    container: 'bg-gradient-to-r from-indigo-100/80 to-blue-50/80 border border-indigo-200/50 hover:from-indigo-200/80 hover:to-blue-100/80 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors',
    chevron: 'text-indigo-400',
    title: 'text-indigo-700',
    count: 'text-indigo-500 bg-white/70',
    addButton: 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100',
  },
  blue: {
    container: 'bg-gradient-to-r from-blue-100/80 to-cyan-50/80 border border-blue-200/50 hover:from-blue-200/80 hover:to-cyan-100/80 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors',
    chevron: 'text-blue-400',
    title: 'text-blue-700',
    count: 'text-blue-500 bg-white/70',
    addButton: 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100',
  },
};

interface GroupHeaderProps {
  title: string;
  count: number;
  showCount?: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  toggleAriaLabel: string;
  addAriaLabel?: string;
  tone: GroupHeaderTone;
}

export default function GroupHeader({
  title,
  count,
  showCount = true,
  expanded,
  onToggle,
  onAdd,
  toggleAriaLabel,
  addAriaLabel,
  tone,
}: GroupHeaderProps) {
  const t = toneStyles[tone];

  return (
    <div className="flex items-center gap-2 min-w-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={toggleAriaLabel}
        className={cn('flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-lg text-left overflow-hidden', t.container)}
      >
        {expanded ? (
          <ChevronDown className={cn('h-4 w-4 flex-shrink-0', t.chevron)} aria-hidden="true" />
        ) : (
          <ChevronRight className={cn('h-4 w-4 flex-shrink-0', t.chevron)} aria-hidden="true" />
        )}
        <span className="flex-1 min-w-0 overflow-hidden" title={title}>
          <span className={cn('block truncate whitespace-nowrap text-sm font-semibold', t.title)}>{title}</span>
        </span>
        {showCount && (
          <span className={cn('text-xs px-2 py-0.5 rounded-full shrink-0', t.count)}>{count}</span>
        )}
      </button>

      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={addAriaLabel}
          className={cn(
            'h-8 w-8 min-w-8 shrink-0 flex items-center justify-center rounded-lg border transition-colors',
            t.addButton
          )}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
