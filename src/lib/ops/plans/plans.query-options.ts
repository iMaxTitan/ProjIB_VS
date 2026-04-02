/**
 * Plans V2 — TanStack Query options wrapping queries.
 */
import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/lib/shared/query-keys';
import * as q from './plans.queries';

const FRESH = 2 * 60_000; // 2 min

export const budgetItemsOptions = queryOptions({
  queryKey: queryKeys.plans.budgetItems,
  queryFn: q.fetchBudgetItems,
  staleTime: Infinity,
});

export const taskTemplatesOptions = queryOptions({
  queryKey: queryKeys.plans.taskTemplates,
  queryFn: q.fetchTaskTemplates,
  staleTime: Infinity,
});

export const monthlyPlansOptions = (year: number) => queryOptions({
  queryKey: queryKeys.plans.monthly(year),
  queryFn: () => q.fetchMonthlyPlans(year),
  staleTime: FRESH,
});

export const monthlyPlanHoursOptions = (planIds: string[]) => queryOptions({
  queryKey: queryKeys.plans.hours(planIds),
  queryFn: () => q.fetchMonthlyPlanHours(planIds),
  enabled: planIds.length > 0,
  staleTime: FRESH,
});

export const activeEmployeesOptions = (role?: string, deptId?: string, userId?: string) => queryOptions({
  queryKey: queryKeys.plans.employees(role, deptId),
  queryFn: () => q.fetchActiveEmployees(role, deptId, userId),
  enabled: !!role,
  staleTime: Infinity,
});

export const annualPlansOptions = (year: number) => queryOptions({
  queryKey: queryKeys.plans.annual(year),
  queryFn: () => q.fetchAnnualPlans(year),
  staleTime: FRESH,
});

export const annualBudgetsAllOptions = (annualIds: string[]) => queryOptions({
  queryKey: queryKeys.plans.annualBudgetsAll(annualIds),
  queryFn: () => q.fetchAnnualBudgets(annualIds),
  enabled: annualIds.length > 0,
  staleTime: FRESH,
});

export const annualBudgetItemsOptions = (annualId?: string) => queryOptions({
  queryKey: queryKeys.plans.annualBudget(annualId),
  queryFn: () => annualId ? q.fetchAnnualBudgetItems(annualId) : [],
  enabled: !!annualId,
  staleTime: FRESH,
});

export const quarterlyPlansOptions = (year: number) => queryOptions({
  queryKey: queryKeys.plans.quarterly(year),
  queryFn: () => q.fetchQuarterlyPlans(year),
  staleTime: FRESH,
});

export const quarterlyInitiativesAllOptions = (quarterlyIds: string[]) => queryOptions({
  queryKey: queryKeys.plans.quarterlyInitiativesAll(quarterlyIds),
  queryFn: () => q.fetchQuarterlyInitiatives(quarterlyIds),
  enabled: quarterlyIds.length > 0,
  staleTime: FRESH,
});

export const allInitiativesOptions = queryOptions({
  queryKey: queryKeys.plans.initiativesCatalog,
  queryFn: q.fetchAllInitiatives,
  staleTime: FRESH,
});

export const processGoalsOptions = (processId?: string, year?: number) => queryOptions({
  queryKey: queryKeys.plans.processGoals(processId, year),
  queryFn: () => processId && year ? q.fetchProcessGoals(processId, year) : [],
  enabled: !!processId,
  staleTime: FRESH,
});

export const monthlyAssigneesOptions = (planIds: string[]) => queryOptions({
  queryKey: queryKeys.plans.monthlyAssignees(planIds),
  queryFn: () => q.fetchMonthlyAssignees(planIds),
  enabled: planIds.length > 0,
  staleTime: FRESH,
});

export const monthlyOverviewRawOptions = (year: number, month: number | null) => queryOptions({
  queryKey: queryKeys.plans.monthlyOverview(year, month || 0),
  queryFn: () => month ? q.fetchMonthlyOverviewRaw(year, month) : [],
  enabled: !!month,
  staleTime: FRESH,
});
