'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { processesQueryOptions, proceduresQueryOptions } from '@/lib/ops/reference-queries';
import { queryKeys } from '@/lib/shared/query-keys';
import {
  budgetItemsOptions, taskTemplatesOptions, monthlyPlansOptions,
  monthlyPlanHoursOptions, activeEmployeesOptions, annualPlansOptions,
  annualBudgetsAllOptions, annualBudgetItemsOptions, quarterlyPlansOptions,
  quarterlyInitiativesAllOptions, allInitiativesOptions, processGoalsOptions,
  monthlyAssigneesOptions, monthlyOverviewRawOptions,
} from '@/lib/ops/plans/plans.query-options';
import {
  buildHoursMap, getScopeMonths, buildProcessTree, calcResourceHours,
  buildAnnualBudgetSumMap, buildAnnualBudgetNamesMap,
  buildQuarterlyBudgetSumMap, buildQuarterlyBudgetItemsMap,
  buildQuarterlyInitiativesMap,
  buildCompanyHours, buildUserProcHours,
} from '@/lib/ops/plans/plans.mappers';
import { fetchCompanyNames } from '@/lib/ops/plans/plans.queries';
import type { UserInfo } from '@/types/azure';
import type { ViewLevel } from '@/lib/ops/plans/plans.types';

// Re-export types for consumers
export type {
  ViewLevel, AnnualPlanRow, QuarterlyPlanRow, AnnualBudgetRow,
  QuarterlyInitiativeRow, TaskTemplate, PlanNode, ProcessNode, PlanStatusV2,
} from '@/lib/ops/plans/plans.types';

export function usePlansV2(user?: UserInfo) {
  const queryClient = useQueryClient();

  // Navigation state
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState<number | null>(Math.ceil((new Date().getMonth() + 1) / 3));
  const [month, setMonth] = useState<number | null>(new Date().getMonth() + 1);

  // Selection state
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [selectedProcedureId, setSelectedProcedureId] = useState<string | null>(null);

  // ── Queries ──────────────────────────────────────────────────
  const { data: processes = [] } = useQuery(processesQueryOptions);
  const { data: procedures = [] } = useQuery(proceduresQueryOptions);
  const { data: allBudgetItems = [] } = useQuery(budgetItemsOptions);
  const { data: taskTemplates = [] } = useQuery(taskTemplatesOptions);
  const { data: monthlyPlans = [], isLoading: plansLoading } = useQuery(monthlyPlansOptions(year));

  const planIds = useMemo(() => monthlyPlans.map(p => p.monthly_plan_id), [monthlyPlans]);
  const { data: hoursData = [] } = useQuery(monthlyPlanHoursOptions(planIds));

  const { data: activeEmployees = [] } = useQuery(activeEmployeesOptions(user?.role ?? undefined, user?.department_id ?? undefined, user?.user_id ?? undefined));
  const { data: annualPlans = [] } = useQuery(annualPlansOptions(year));

  const annualIds = useMemo(() => annualPlans.map(a => a.annual_id), [annualPlans]);
  const { data: allAnnualBudgets = [] } = useQuery(annualBudgetsAllOptions(annualIds));

  const { data: quarterlyPlans = [] } = useQuery(quarterlyPlansOptions(year));
  const quarterlyIds = useMemo(() => quarterlyPlans.map(q => q.quarterly_id), [quarterlyPlans]);
  const { data: allQuarterlyInitiatives = [] } = useQuery(quarterlyInitiativesAllOptions(quarterlyIds));
  const { data: initiativesCatalog = [] } = useQuery(allInitiativesOptions);

  const selectedAnnualPlan = useMemo(() => annualPlans.find(a => a.process_id === selectedProcessId) ?? null, [annualPlans, selectedProcessId]);
  const { data: annualBudgetItems = [] } = useQuery(annualBudgetItemsOptions(selectedAnnualPlan?.annual_id));

  const { data: processGoals = [] } = useQuery(processGoalsOptions(selectedProcessId ?? undefined, year));
  const { data: overviewRaw = [] } = useQuery(monthlyOverviewRawOptions(year, month));

  // Assignees for all monthly plans in current month
  const monthPlanIds = useMemo(() => monthlyPlans.filter(p => month && p.month === month).map(p => p.monthly_plan_id), [monthlyPlans, month]);
  const { data: monthlyAssignees = [] } = useQuery(monthlyAssigneesOptions(monthPlanIds));

  // Company names for overview (fetched once, cached via useMemo dep)
  const overviewCompanyIds = useMemo(() => [...new Set(overviewRaw.map(r => r.company_id))].sort(), [overviewRaw]);
  const { data: companyNameMap = new Map<string, string>() } = useQuery({
    queryKey: queryKeys.plans.companyNames(overviewCompanyIds),
    queryFn: () => fetchCompanyNames(overviewCompanyIds),
    enabled: overviewCompanyIds.length > 0,
    staleTime: Infinity,
  });

  // ── Derived data (pure mappers) ──────────────────────────────
  const hoursMap = useMemo(() => buildHoursMap(hoursData as { monthly_plan_id: string; total_spent_hours: number | null; tasks_count: number | null }[]), [hoursData]);
  const scopeMonths = useMemo(() => getScopeMonths(month, quarter), [month, quarter]);
  const scopedPlans = useMemo(() => monthlyPlans.filter(p => scopeMonths.includes(p.month)), [monthlyPlans, scopeMonths]);

  const processTree = useMemo(
    () => buildProcessTree(processes, procedures, taskTemplates as { id: string; procedure_id: string; title: string; content?: string }[], scopedPlans, hoursMap, user?.role ?? undefined, user?.department_id ?? undefined),
    [processes, procedures, taskTemplates, scopedPlans, hoursMap, user?.role, user?.department_id],
  );

  const resourceHours = useMemo(() => calcResourceHours(activeEmployees, scopeMonths, year), [activeEmployees, scopeMonths, year]);
  const annualBudgetSumMap = useMemo(() => buildAnnualBudgetSumMap(allAnnualBudgets), [allAnnualBudgets]);
  const annualBudgetNamesMap = useMemo(() => buildAnnualBudgetNamesMap(allAnnualBudgets), [allAnnualBudgets]);
  const quarterlyBudgetSumMap = useMemo(() => quarter ? buildQuarterlyBudgetSumMap(allAnnualBudgets, quarter, year) : new Map(), [allAnnualBudgets, quarter, year]);
  const quarterlyBudgetItemsMap = useMemo(() => quarter ? buildQuarterlyBudgetItemsMap(allAnnualBudgets, quarter, year) : new Map(), [allAnnualBudgets, quarter, year]);
  const quarterlyInitiativesMap = useMemo(() => buildQuarterlyInitiativesMap(allQuarterlyInitiatives), [allQuarterlyInitiatives]);

  // Monthly overview: one raw query → two derived views
  const monthlyCompanyHours = useMemo(() => buildCompanyHours(overviewRaw, companyNameMap), [overviewRaw, companyNameMap]);
  const monthlyUserProcHours = useMemo(() => buildUserProcHours(overviewRaw), [overviewRaw]);

  // ── Selection helpers ────────────────────────────────────────
  const selectedProcess = useMemo(() => processTree.find(p => p.processId === selectedProcessId) ?? null, [processTree, selectedProcessId]);

  const selectedProcedure = useMemo((): import('@/lib/ops/plans/plans.types').PlanNode | null => {
    if (!selectedProcedureId) return null;
    // 1. Try procedure in selected process
    if (selectedProcess) {
      const pr = selectedProcess.procedures.find(p => p.procedureId === selectedProcedureId);
      if (pr) return pr;
    }
    // 2. Try monthly_plan_id (for initiative plans)
    const plan = monthlyPlans.find(p => p.monthly_plan_id === selectedProcedureId);
    if (plan?.initiative_id) {
      const cat = initiativesCatalog.find(i => i.id === plan.initiative_id);
      return {
        procedureId: selectedProcedureId,
        name: cat?.title || 'Ініціатива',
        processId: selectedProcessId || '',
        description: cat?.description,
        taskTemplates: [],
        plannedHours: plan.planned_hours || 0,
        spentHours: 0,
        plans: [plan],
        isInitiative: true,
        initiativeId: plan.initiative_id,
      };
    }
    return null;
  }, [selectedProcess, selectedProcedureId, selectedProcessId, monthlyPlans, initiativesCatalog]);

  const detailPlans = useMemo(() => {
    if (selectedProcedure) return selectedProcedure.plans;
    if (selectedProcess) return selectedProcess.procedures.flatMap(p => p.plans);
    // No selection → all plans from visible processes (for employee panel)
    return processTree.flatMap(p => p.procedures.flatMap(pr => pr.plans));
  }, [selectedProcess, selectedProcedure, processTree]);

  const selectedQuarterlyPlan = useMemo(() => {
    const q = quarter ?? (month ? Math.ceil(month / 3) : null);
    return q ? quarterlyPlans.find(qp => qp.process_id === selectedProcessId && qp.quarter === q) ?? null : null;
  }, [quarterlyPlans, selectedProcessId, quarter, month]);
  const quarterlyInitiatives = useMemo(
    () => selectedQuarterlyPlan ? (quarterlyInitiativesMap.get(selectedQuarterlyPlan.quarterly_id) || []) : [],
    [selectedQuarterlyPlan, quarterlyInitiativesMap],
  );

  const availableYears = useMemo(() => { const now = new Date().getFullYear(); return [now - 1, now, now + 1]; }, []);
  const availableQuarters = useMemo(() => {
    const qs = new Set(monthlyPlans.filter(p => p.year === year).map(p => Math.ceil(p.month / 3)));
    return Array.from(qs).sort();
  }, [monthlyPlans, year]);

  const viewLevel: ViewLevel = month ? 'month' : quarter ? 'quarter' : 'year';

  // ── Handlers ─────────────────────────────────────────────────
  const handleYearChange = useCallback((y: number) => { setYear(y); setQuarter(null); setMonth(null); }, []);
  const handleQuarterChange = useCallback((q: number | null) => { setQuarter(q); setMonth(null); setSelectedProcedureId(null); }, []);
  const handleMonthChange = useCallback((m: number | null) => { setMonth(m); if (!m) setSelectedProcedureId(null); }, []);
  const handleSelectProcess = useCallback((id: string) => { setSelectedProcessId(id || null); setSelectedProcedureId(null); }, []);
  const handleSelectProcedure = useCallback((processId: string, procedureId: string) => { setSelectedProcessId(processId); setSelectedProcedureId(procedureId); }, []);

  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.plans.all });
  }, [queryClient]);

  return {
    processTree, selectedProcess, selectedProcedure, detailPlans, scopeMonths, hoursMap, resourceHours, processGoals,
    viewLevel, annualPlans, quarterlyPlans, selectedAnnualPlan, selectedQuarterlyPlan,
    annualBudgetItems, annualBudgetSumMap, annualBudgetNamesMap,
    quarterlyBudgetItemsMap, quarterlyBudgetSumMap, quarterlyInitiatives, quarterlyInitiativesMap, initiativesCatalog,
    monthlyPlans, monthlyCompanyHours, monthlyUserProcHours, monthlyAssignees,
    availableBudgetItems: allBudgetItems
      .filter(bi => bi.process_id === selectedProcessId)
      .map(bi => ({ id: bi.id, name: bi.name, category_name: bi.budget_categories?.name || null })),
    year, quarter, month, selectedProcessId, selectedProcedureId, availableYears, availableQuarters,
    loading: plansLoading,
    setYear: handleYearChange, setQuarter: handleQuarterChange, setMonth: handleMonthChange,
    selectProcess: handleSelectProcess, selectProcedure: handleSelectProcedure, refreshData,
  };
}
