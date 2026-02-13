'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ExpandableListItemTone = 'purple' | 'indigo';

const toneStyles: Record<ExpandableListItemTone, {
  headerExpanded: string;
  headerCollapsed: string;
  chevronExpanded: string;
  chevronCollapsed: string;
  borderLeft: string;
}> = {
  purple: {
    headerExpanded: 'bg-gradient-to-r from-purple-50 to-violet-50 text-slate-900 ring-1 ring-purple-200/50 border-purple-200',
    headerCollapsed: 'glass-card text-slate-800 bg-white/70 hover:bg-white/90 hover:border-purple-200',
    chevronExpanded: 'bg-purple-200 text-purple-700',
    chevronCollapsed: 'bg-purple-100 text-purple-600',
    borderLeft: 'border-purple-200',
  },
  indigo: {
    headerExpanded: 'bg-gradient-to-r from-indigo-50 to-blue-50 text-slate-900 ring-1 ring-indigo-200/50 border-indigo-200',
    headerCollapsed: 'glass-card text-slate-800 bg-white/70 hover:bg-white/90 hover:border-indigo-200',
    chevronExpanded: 'bg-indigo-200 text-indigo-700',
    chevronCollapsed: 'bg-indigo-100 text-indigo-600',
    borderLeft: 'border-indigo-200',
  },
};

interface ExpandableListItemProps {
  expanded: boolean;
  onToggle: () => void;
  tone: ExpandableListItemTone;
  /** sm = w-5 h-5 (Monthly employees), md = w-7 h-7 (Annual/Quarterly) */
  chevronSize?: 'sm' | 'md';
  /** Контент в строке заголовка (справа от шеврона) */
  children: React.ReactNode;
  /** Контент при раскрытии (автоматически обёрнут в border-l wrapper) */
  expandedContent?: React.ReactNode;
}

export default function ExpandableListItem({
  expanded,
  onToggle,
  tone,
  chevronSize = 'md',
  children,
  expandedContent,
}: ExpandableListItemProps) {
  const t = toneStyles[tone];
  const isSm = chevronSize === 'sm';

  return (
    <div>
      <div
        className={cn(
          'p-3 flex items-center gap-3 rounded-2xl cursor-pointer transition-colors border shadow-md',
          expanded ? t.headerExpanded : t.headerCollapsed
        )}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        aria-expanded={expanded}
      >
        {/* Шеврон в круге */}
        <div className={cn(
          'rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
          isSm ? 'w-5 h-5' : 'w-7 h-7',
          expanded ? t.chevronExpanded : t.chevronCollapsed,
          isSm && expanded && 'rotate-90'
        )}>
          {isSm ? (
            <ChevronRight className="w-3 h-3" aria-hidden="true" />
          ) : (
            <span className={cn('text-xs transition-transform duration-200', expanded && 'rotate-90')}>
              <ChevronRight className="w-3 h-3" aria-hidden="true" />
            </span>
          )}
        </div>

        {children}
      </div>

      {expanded && expandedContent && (
        <div className={cn('ml-9 mt-1 mb-2 space-y-1 border-l-2 pl-2', t.borderLeft)}>
          {expandedContent}
        </div>
      )}
    </div>
  );
}
