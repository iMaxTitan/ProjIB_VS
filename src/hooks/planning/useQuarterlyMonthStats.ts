/**
 * Hook for loading monthly plan stats within a quarterly plan view.
 * Extracted from QuarterlyPlanDetails.tsx.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/shared/supabase';
import { getErrorMessage } from '@/lib/shared/utils/error-message';
import logger from '@/lib/shared/logger';
import type { MonthlyPlan } from '@/types/planning';

export interface MonthStats {
  monthly_plan_id: string;
  totalTasks: number;
  completedTasks: number;
  spentHours: number;
  plannedHours: number;
}

export function useQuarterlyMonthStats(
  quarterlyId: string,
  relatedMonthly: MonthlyPlan[],
) {
  const [monthStats, setMonthStats] = useState<Map<string, MonthStats>>(new Map());

  useEffect(() => {
    const fetchMonthStats = async () => {
      try {
        const monthIds = relatedMonthly.map(m => m.monthly_plan_id);
        if (monthIds.length === 0) return;

        const { data: viewRows, error } = await supabase
          .from('v_monthly_plan_hours')
          .select('monthly_plan_id, total_spent_hours, tasks_count')
          .in('monthly_plan_id', monthIds);

        if (error) {
          const errorMsg = error?.message || error?.details || error?.hint || JSON.stringify(error);
          throw new Error(errorMsg || 'Unknown error loading tasks');
        }

        const viewMap = new Map<string, { total_spent_hours: number; tasks_count: number }>();
        for (const row of (viewRows || [])) {
          viewMap.set(row.monthly_plan_id, row as unknown as { total_spent_hours: number; tasks_count: number });
        }

        const statsMap = new Map<string, MonthStats>();
        for (const m of relatedMonthly) {
          const agg = viewMap.get(m.monthly_plan_id);
          statsMap.set(m.monthly_plan_id, {
            monthly_plan_id: m.monthly_plan_id,
            totalTasks: agg ? Number(agg.tasks_count) : 0,
            completedTasks: 0,
            spentHours: agg ? Number(agg.total_spent_hours) : 0,
            plannedHours: Number(m.planned_hours) || 0,
          });
        }
        setMonthStats(statsMap);
      } catch (err: unknown) {
        logger.error('Ошибка загрузки статистики месяцев:', getErrorMessage(err), err);
      }
    };

    fetchMonthStats();
  }, [quarterlyId, relatedMonthly]);

  return { monthStats };
}
