import React from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { MonthlyPlan, getMonthName } from '@/types/planning';
import { ExpandableListItem } from '@/components/dashboard/shared';
import EmptyState from '@/components/ui/EmptyState';

interface MonthStats {
  monthly_plan_id: string;
  totalTasks: number;
  completedTasks: number;
  spentHours: number;
  plannedHours: number;
}

interface QuarterlyMonthlyPlansListProps {
  relatedMonthly: MonthlyPlan[];
  monthStats: Map<string, MonthStats>;
  expandedMonth: string | null;
  onToggleExpand: (id: string) => void;
}

export default function QuarterlyMonthlyPlansList({
  relatedMonthly,
  monthStats,
  expandedMonth,
  onToggleExpand,
}: QuarterlyMonthlyPlansListProps) {
  if (relatedMonthly.length === 0) {
    return (
      <EmptyState
        icon={<Calendar className="h-8 w-8" aria-hidden="true" />}
        title="Месячных планов пока нет"
        className="py-6"
      />
    );
  }

  return (
    <div className="space-y-2">
      {relatedMonthly
        .sort((a, b) => a.month - b.month)
        .map(m => {
          const isCompleted = m.status === 'completed';
          const stats = monthStats.get(m.monthly_plan_id);
          const spentHours = stats?.spentHours || m.total_spent_hours || 0;
          const isExpanded = expandedMonth === m.monthly_plan_id;

          return (
            <ExpandableListItem
              key={m.monthly_plan_id}
              tone="indigo"
              expanded={isExpanded}
              onToggle={() => onToggleExpand(m.monthly_plan_id)}
              expandedContent={
                <>
                  {m.description && (
                    <div className="flex items-start gap-2 text-xs py-1">
                      <span className="text-2xs font-bold text-slate-500 flex-shrink-0 mt-0.5">Описание</span>
                      <span className="flex-1 break-words text-slate-800 font-medium">{m.description}</span>
                    </div>
                  )}
                  {m.procedure_name && (
                    <div className="flex items-start gap-2 text-xs py-1">
                      <span className="text-2xs font-bold text-slate-500 flex-shrink-0 mt-0.5">Процедура</span>
                      <span className="flex-1 break-words text-slate-800 font-medium">{m.procedure_name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-2xs font-bold text-indigo-600 flex-shrink-0 bg-indigo-50 px-1.5 py-0.5 rounded shadow-sm">
                      Задач: {stats?.totalTasks || m.tasks_count || 0}
                    </span>
                    {m.completion_percentage !== undefined && m.completion_percentage >= 100 && (
                      <span className="text-2xs font-bold text-emerald-600 flex-shrink-0 bg-emerald-50 px-1.5 py-0.5 rounded shadow-sm">
                        Все выполнено
                      </span>
                    )}
                  </div>
                </>
              }
            >
              <div className={cn(
                "w-10 h-8 rounded-xl flex items-center justify-center text-2xs font-bold flex-shrink-0",
                isCompleted ? 'bg-emerald-100 text-emerald-600' : isExpanded ? 'bg-white text-indigo-600 shadow-sm' : 'bg-indigo-100 text-indigo-600'
              )}>
                {getMonthName(m.month, 'ru').slice(0, 3)}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-xs font-medium tracking-tight truncate",
                  isExpanded ? "text-indigo-900" : "text-slate-900"
                )}>
                  {m.procedure_name || 'Без названия'}
                </p>
                {(() => {
                  const plannedHrs = Number(m.planned_hours) || 0;
                  const mProgressPercent = plannedHrs > 0 ? Math.round((spentHours / plannedHrs) * 100) : 0;
                  return (
                    <div className="flex items-center gap-2 mt-1">
                      <div className={cn(
                        "flex-1 h-2 rounded-full overflow-hidden shadow-inner",
                        isExpanded ? "bg-white/10" : "bg-indigo-50"
                      )}>
                        <div
                          className={cn(
                            "h-full transition-colors duration-500",
                            mProgressPercent >= 100 ? "bg-emerald-400" : (isExpanded ? "bg-indigo-300" : "bg-indigo-500")
                          )}
                          style={{ width: `${Math.min(mProgressPercent, 100)}%` }}
                        />
                      </div>
                      <span className={cn(
                        "text-2xs font-black font-mono w-10 text-right flex-shrink-0",
                        isExpanded ? "text-white" : "text-indigo-600"
                      )}>
                        {mProgressPercent}%
                      </span>
                    </div>
                  );
                })()}
              </div>
            </ExpandableListItem>
          );
        })}
    </div>
  );
}
