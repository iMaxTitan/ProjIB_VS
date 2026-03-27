'use client';

import React from 'react';
import { Clock, CheckSquare, BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { DashboardStatCard } from '@/components/dashboard/shared';
import type { CabinetStats } from '@/lib/ops/cabinet/stats';

interface CabinetSummaryCardsProps {
  stats: CabinetStats;
}

const TREND_ICON = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
} as const;

const KPI_COLOR: Record<string, string> = {
  amber: 'text-amber-600',
  emerald: 'text-emerald-600',
  purple: 'text-purple-600',
  blue: 'text-blue-600',
};

function getKpiTone(kpi: number): string {
  if (kpi >= 130) return 'amber';
  if (kpi >= 100) return 'emerald';
  if (kpi >= 70) return 'purple';
  return 'blue';
}

export default function CabinetSummaryCards({ stats }: CabinetSummaryCardsProps) {
  const { hours, tasks, kpi } = stats;
  const TrendIcon = TREND_ICON[kpi.trend];
  const kpiColor = KPI_COLOR[getKpiTone(kpi.current)] || 'text-blue-600';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <DashboardStatCard
        title="Години"
        value={`${hours.actual} / ${hours.planned}`}
        icon={Clock}
        tone="blue"
      />
      <DashboardStatCard
        title="Задачі"
        value={`${tasks.total} (${tasks.daysWorked} днів)`}
        icon={CheckSquare}
        tone="emerald"
      />
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-700">KPI</h2>
          <BarChart3 className={`w-5 h-5 ${kpiColor}`} />
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className={`text-2xl font-bold ${kpiColor}`}>
            {kpi.current}%
          </span>
          <TrendIcon
            className={`w-4 h-4 ${
              kpi.trend === 'up' ? 'text-emerald-500' :
              kpi.trend === 'down' ? 'text-red-500' : 'text-slate-400'
            }`}
            aria-label={kpi.trend === 'up' ? 'Зростання' : kpi.trend === 'down' ? 'Спад' : 'Стабільно'}
          />
          {kpi.previous > 0 && (
            <span className="text-xs text-slate-400">
              (було {kpi.previous}%)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
