/**
 * Plan creation factory functions.
 * Extracted from PlansContent.tsx handleCreatePlan.
 */

import type { AnnualPlan, QuarterlyPlan, MonthlyPlan } from '@/types/planning';
import type { UserInfo } from '@/types/azure';

export function createNewAnnualPlan(user: UserInfo, year: number): AnnualPlan {
  return {
    annual_id: 'new',
    year,
    goal: '',
    expected_result: '',
    budget: 0,
    status: 'draft',
    user_id: user.user_id,
    author_name: user.displayName || user.name || '',
  };
}

export function createNewQuarterlyPlan(
  parentId: string | undefined | null,
  quarter: number,
): QuarterlyPlan {
  return {
    quarterly_id: 'new',
    annual_plan_id: parentId || null,
    department_id: null,
    department_name: '',
    quarter,
    goal: '',
    expected_result: '',
    status: 'draft',
  };
}

export interface NewMonthlyPlanParams {
  parentId?: string | null;
  selectedYear: number;
  defaultMonth: number;
  parentQuarterly?: QuarterlyPlan;
  user: UserInfo;
}

export function createNewMonthlyPlan({
  parentId,
  selectedYear,
  defaultMonth,
  parentQuarterly,
  user,
}: NewMonthlyPlanParams): MonthlyPlan {
  return {
    monthly_plan_id: 'new',
    quarterly_id: parentId || null,
    procedure_id: null,
    year: selectedYear,
    month: defaultMonth,
    description: '',
    status: 'draft',
    planned_hours: 160,
    department_id: parentQuarterly?.department_id || user.department_id || undefined,
    department_name: parentQuarterly?.department_name || '',
    process_id: parentQuarterly?.process_id || undefined,
    process_name: parentQuarterly?.process_name,
  };
}
