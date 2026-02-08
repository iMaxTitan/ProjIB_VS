'use client';

import React from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReferenceGroupHeaderProps {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  toggleAriaLabel: string;
  addAriaLabel?: string;
  containerClassName: string;
  chevronClassName: string;
  titleClassName: string;
  countClassName: string;
  addButtonClassName: string;
}

export default function ReferenceGroupHeader({
  title,
  count,
  expanded,
  onToggle,
  onAdd,
  toggleAriaLabel,
  addAriaLabel,
  containerClassName,
  chevronClassName,
  titleClassName,
  countClassName,
  addButtonClassName,
}: ReferenceGroupHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={toggleAriaLabel}
        className={cn('flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-left', containerClassName)}
      >
        {expanded ? (
          <ChevronDown className={cn('h-4 w-4 flex-shrink-0', chevronClassName)} aria-hidden="true" />
        ) : (
          <ChevronRight className={cn('h-4 w-4 flex-shrink-0', chevronClassName)} aria-hidden="true" />
        )}
        <span className="flex-1 min-w-0" title={title}>
          <span className={cn('block truncate whitespace-nowrap text-sm font-semibold', titleClassName)}>{title}</span>
        </span>
        <span className={cn('text-xs px-2 py-0.5 rounded-full shrink-0', countClassName)}>{count}</span>
      </button>

      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={addAriaLabel}
          className={cn(
            'h-8 w-8 min-w-8 shrink-0 flex items-center justify-center rounded-lg border transition-colors',
            addButtonClassName
          )}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

