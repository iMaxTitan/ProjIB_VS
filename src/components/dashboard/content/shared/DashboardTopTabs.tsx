'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type TabTone = 'blue' | 'emerald' | 'purple' | 'amber' | 'slate' | 'indigo';

export interface DashboardTopTabItem<T extends string> {
  id: T;
  label: string;
  shortLabel?: string;
  icon?: LucideIcon;
  tone?: TabTone;
}

interface DashboardTopTabsProps<T extends string> {
  selected: T;
  items: DashboardTopTabItem<T>[];
  onSelect: (value: T) => void;
  ariaLabel: string;
}

const toneClasses: Record<TabTone, { active: string; inactive: string; ring: string }> = {
  blue: {
    active: 'bg-blue-500 border-blue-500 text-white',
    inactive: 'bg-blue-50/70 border-blue-200/50 text-blue-600 hover:bg-blue-100/70',
    ring: 'focus:ring-blue-500',
  },
  emerald: {
    active: 'bg-emerald-500 border-emerald-500 text-white',
    inactive: 'bg-emerald-50/70 border-emerald-200/50 text-emerald-600 hover:bg-emerald-100/70',
    ring: 'focus:ring-emerald-500',
  },
  purple: {
    active: 'bg-purple-500 border-purple-500 text-white',
    inactive: 'bg-purple-50/70 border-purple-200/50 text-purple-600 hover:bg-purple-100/70',
    ring: 'focus:ring-purple-500',
  },
  amber: {
    active: 'bg-amber-500 border-amber-500 text-white',
    inactive: 'bg-amber-50/70 border-amber-200/50 text-amber-600 hover:bg-amber-100/70',
    ring: 'focus:ring-amber-500',
  },
  slate: {
    active: 'bg-slate-500 border-slate-500 text-white',
    inactive: 'bg-slate-50/70 border-slate-200/50 text-slate-600 hover:bg-slate-100/70',
    ring: 'focus:ring-slate-500',
  },
  indigo: {
    active: 'bg-indigo-500 border-indigo-500 text-white',
    inactive: 'bg-indigo-50/70 border-indigo-200/50 text-indigo-600 hover:bg-indigo-100/70',
    ring: 'focus:ring-indigo-500',
  },
};

export default function DashboardTopTabs<T extends string>({
  selected,
  items,
  onSelect,
  ariaLabel,
}: DashboardTopTabsProps<T>) {
  return (
    <nav className="flex-shrink-0 bg-gradient-to-b from-slate-50/50 to-transparent border-b border-slate-200" role="navigation" aria-label={ariaLabel}>
      <div className="px-2 sm:px-4 pt-2">
        <div className="flex gap-0.5 items-end overflow-x-auto overflow-y-hidden scrollbar-hide">
          {items.map((item) => {
            const isSelected = selected === item.id;
            const tone = toneClasses[item.tone ?? 'slate'];
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isSelected ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors border-t border-l border-r whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-offset-2',
                  tone.ring,
                  isSelected ? `${tone.active} shadow-sm z-10 -mb-px` : tone.inactive
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                <span className="hidden xs:inline">{item.label}</span>
                <span className="xs:hidden">{item.shortLabel ?? item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

