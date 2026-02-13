'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type ListItemTone = 'amber' | 'purple' | 'emerald' | 'indigo' | 'blue';

interface ReferenceListItemProps {
  tone: ListItemTone;
  isSelected: boolean;
  onClick: () => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

interface ToneStyle {
  selected: string;
  default: string;
  focusRing: string;
}

const TONE_STYLES: Record<ListItemTone, ToneStyle> = {
  amber: {
    selected: 'bg-amber-50 border-amber-300 shadow-sm',
    default: 'bg-white border-slate-200 hover:border-amber-300 hover:shadow-sm',
    focusRing: 'focus:ring-amber-500',
  },
  purple: {
    selected: 'bg-purple-50 border-purple-300 shadow-sm',
    default: 'bg-white border-slate-200 hover:border-purple-300 hover:shadow-sm',
    focusRing: 'focus:ring-purple-500',
  },
  emerald: {
    selected: 'bg-emerald-50 border-emerald-300 shadow-sm',
    default: 'bg-white/70 border-white/50 hover:bg-white/90 hover:border-emerald-300 hover:shadow-sm',
    focusRing: 'focus:ring-emerald-500',
  },
  indigo: {
    selected: 'bg-indigo-50 border-indigo-300 shadow-sm',
    default: 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm',
    focusRing: 'focus:ring-indigo-500',
  },
  blue: {
    selected: 'bg-blue-50 border-blue-300 shadow-sm',
    default: 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm',
    focusRing: 'focus:ring-blue-500',
  },
};

export default function ReferenceListItem({
  tone,
  isSelected,
  onClick,
  ariaLabel,
  disabled = false,
  className,
  children,
}: ReferenceListItemProps) {
  const s = TONE_STYLES[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'w-full p-2.5 sm:p-3 rounded-xl border text-left cursor-pointer',
        'transition-[transform,background-color,border-color,box-shadow] duration-base',
        'focus:outline-none focus:ring-2 focus:ring-offset-2',
        s.focusRing,
        'active:scale-[0.98]',
        isSelected ? s.selected : s.default,
        disabled && 'opacity-80',
        className
      )}
    >
      {children}
    </button>
  );
}
