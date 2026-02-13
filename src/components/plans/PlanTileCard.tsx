'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlanStatus } from '@/types/planning';
import { getStatusBgClass } from '@/lib/utils/planning-utils';
import { getPlanStatusText } from '@/types/planning';

// --- Types ---

export type PlanTileVariant = 'monthly' | 'quarterly' | 'annual';

export interface PlanTileCardProps {
  variant: PlanTileVariant;
  isSelected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  status: PlanStatus;
  spentHours: number;
  plannedHours: number;
  completionPct: number;
  actionButton?: {
    label: string;
    onClick: (e: React.MouseEvent) => void;
  };
  ariaLabel: string;
}

// --- Color Schemes ---

interface VariantStyle {
  selected: {
    gradient: string;
    subtitleText: string;
    hoursText: string;
  };
  default: {
    hoverBorder: string;
    subtitleText: string;
    hoursText: string;
    hoursBorder: string;
  };
  action: {
    selected: string;
    default: string;
  };
}

const VARIANT_STYLES: Record<PlanTileVariant, VariantStyle> = {
  monthly: {
    selected: {
      gradient: 'from-indigo-400/80 to-blue-400/80',
      subtitleText: 'text-indigo-100',
      hoursText: 'text-white border-white/20',
    },
    default: {
      hoverBorder: 'hover:border-indigo-300',
      subtitleText: 'text-slate-500',
      hoursText: 'text-indigo-600',
      hoursBorder: 'border-indigo-100',
    },
    action: {
      selected: 'text-indigo-200 hover:text-white hover:bg-white/20',
      default: 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-100',
    },
  },
  quarterly: {
    selected: {
      gradient: 'from-purple-400/80 to-violet-400/80',
      subtitleText: 'text-purple-100',
      hoursText: 'text-white border-white/20',
    },
    default: {
      hoverBorder: 'hover:border-purple-300',
      subtitleText: 'text-slate-500',
      hoursText: 'text-purple-600',
      hoursBorder: 'border-purple-100',
    },
    action: {
      selected: 'text-purple-200 hover:text-white hover:bg-white/20',
      default: 'text-slate-400 hover:text-purple-600 hover:bg-purple-100',
    },
  },
  annual: {
    selected: {
      gradient: 'from-amber-400/80 to-orange-400/80',
      subtitleText: 'text-amber-100',
      hoursText: 'text-white border-white/20',
    },
    default: {
      hoverBorder: 'hover:border-amber-300',
      subtitleText: 'text-slate-500',
      hoursText: 'text-amber-600',
      hoursBorder: 'border-amber-100',
    },
    action: {
      selected: 'text-amber-200 hover:text-white hover:bg-white/20',
      default: 'text-slate-400 hover:text-amber-600 hover:bg-amber-100',
    },
  },
};

// --- Helpers ---

function getProgressBarColor(pct: number) {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-blue-500';
}

function getProgressTextColor(pct: number) {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-blue-600';
}

// --- Component ---

export default function PlanTileCard({
  variant,
  isSelected,
  onClick,
  title,
  subtitle,
  status,
  spentHours,
  plannedHours,
  completionPct,
  actionButton,
  ariaLabel,
}: PlanTileCardProps) {
  const s = VARIANT_STYLES[variant];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel}
      className={cn(
        "px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl cursor-pointer border shadow-sm",
        "transition-[transform,background-color,border-color,box-shadow] duration-base",
        "focus:outline-none focus:ring-2 focus:ring-offset-2",
        "active:scale-[0.97]",
        isSelected
          ? [
              "bg-gradient-to-r",
              s.selected.gradient,
              "text-white shadow-md border-white/20 backdrop-blur-md",
              "focus:ring-white/70",
            ]
          : [
              "glass-card text-slate-800 bg-white/70",
              "hover:bg-white/90",
              s.default.hoverBorder,
              "focus:ring-indigo-500",
            ]
      )}
    >
      {/* Header: status dot + subtitle + hours + action */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
        <span
          className={cn(
            "w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0",
            getStatusBgClass(status),
            isSelected && "ring-2 ring-white"
          )}
          title={getPlanStatusText(status)}
          aria-label={getPlanStatusText(status)}
        />

        {subtitle && (
          <span
            className={cn(
              "text-2xs sm:text-xs font-bold truncate flex-1 min-w-0",
              isSelected ? s.selected.subtitleText : s.default.subtitleText
            )}
          >
            {subtitle}
          </span>
        )}

        <span
          className={cn(
            "text-2xs sm:text-xs font-mono font-black border-l pl-1.5 sm:pl-2 flex-shrink-0",
            isSelected ? s.selected.hoursText : [s.default.hoursText, s.default.hoursBorder]
          )}
        >
          {Math.round(spentHours)}h / {plannedHours}h
        </span>

        {actionButton && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              actionButton.onClick(e);
            }}
            aria-label={actionButton.label}
            className={cn(
              "p-0.5 sm:p-1 rounded",
              "transition-[color,background-color] duration-base",
              "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1",
              isSelected ? s.action.selected : s.action.default
            )}
          >
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Title */}
      <p
        className={cn(
          "text-sm leading-tight line-clamp-2 mb-1",
          isSelected && "font-semibold"
        )}
      >
        {title}
      </p>

      {/* Progress bar */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div
          className={cn(
            "flex-1 h-1.5 sm:h-2 rounded-full overflow-hidden",
            isSelected ? "bg-white/30" : "bg-gray-200"
          )}
          role="progressbar"
          aria-valuenow={completionPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Прогресс: ${completionPct}%`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-base",
              getProgressBarColor(completionPct)
            )}
            style={{ width: `${Math.min(100, completionPct)}%` }}
          />
        </div>
        <span
          className={cn(
            "text-2xs sm:text-xs font-bold tabular-nums min-w-[28px] sm:min-w-[32px] text-right",
            isSelected ? "text-white" : getProgressTextColor(completionPct)
          )}
        >
          {completionPct}%
        </span>
      </div>
    </div>
  );
}
