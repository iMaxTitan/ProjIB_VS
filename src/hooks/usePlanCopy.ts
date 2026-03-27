'use client';

import { useState, useCallback } from 'react';
import { manageMonthlyPlan, type MonthlyPlanParams } from '@/lib/ops/plans';
import { supabase } from '@/lib/shared/supabase';

async function setMonthlyPlanCompanies(planId: string, companyIds: string[]) {
  await supabase.from('monthly_plan_companies').delete().eq('monthly_plan_id', planId);
  if (companyIds.length > 0) {
    await supabase.from('monthly_plan_companies').insert(
      companyIds.map((id) => ({ monthly_plan_id: planId, company_id: id })),
    );
  }
}

async function setMonthlyPlanProjects(planId: string, projectIds: string[]) {
  await supabase.from('monthly_plan_projects').delete().eq('monthly_plan_id', planId);
  if (projectIds.length > 0) {
    await supabase.from('monthly_plan_projects').insert(
      projectIds.map((id) => ({ monthly_plan_id: planId, project_id: id })),
    );
  }
}

export interface CopyPlanInput {
  plan: MonthlyPlanParams;
  companyIds: string[];
  projectIds: string[];
}

export function usePlanCopy() {
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyPlan = useCallback(async (input: CopyPlanInput): Promise<string> => {
    setCopying(true);
    setError(null);
    try {
      const result = await manageMonthlyPlan(input.plan);
      const newId = typeof result === 'string' ? result : (result as { monthly_plan_id?: string })?.monthly_plan_id;
      if (!newId) throw new Error('Не удалось получить ID нового плана');

      await setMonthlyPlanCompanies(newId, input.companyIds);
      await setMonthlyPlanProjects(newId, input.projectIds);

      return newId;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setCopying(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { copying, error, copyPlan, clearError };
}
