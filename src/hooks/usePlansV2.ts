'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  processesQueryOptions,
  proceduresQueryOptions,
  type ProcedureKpiRow,
} from '@/lib/ops/reference-queries';
import { supabase } from '@/lib/shared/db-client';
import type { MonthlyPlan, PlanStatus } from '@/types/planning';
import type { UserInfo } from '@/types/azure';
import { countNaiveWorkingDays } from '@/lib/ops/working-days';

// ── Types ───────────────────────────────────────────────────

export type ViewLevel = 'year' | 'quarter' | 'month';

export interface AnnualPlanRow {
  annual_id: string;
  year: number;
  process_id: string | null;
  expected_result: string;
  goal: string | null;
  budget: number | null;
  status: string;
}

export interface QuarterlyPlanRow {
  quarterly_id: string;
  year: number | null;
  quarter: number;
  process_id: string | null;
  expected_result: string;
  goal: string | null;
  note: string | null;
  status: string;
}

export interface AnnualBudgetRow {
  id: string;
  annual_plan_id: string;
  budget_item_id: string;
  amount: number;
  payment_date: string | null;
  reminder_date: string | null;
  budget_items: { name: string; budget_categories: { name: string } | null } | null;
}

export interface QuarterlyInitiativeRow {
  id: string;
  quarterly_plan_id: string;
  title: string;
  description: string | null;
  status: string;
}

export interface TaskTemplate {
  id: string;
  title: string;
  content?: string;
}

export interface ProcedureNode {
  procedureId: string;
  name: string;
  processId: string;
  description?: string | null;
  serviceName?: string | null;
  category?: string | null;
  targetValue?: number | null;
  targetPeriod?: string | null;
  taskTemplates: TaskTemplate[];
  plannedHours: number;
  spentHours: number;
  plans: MonthlyPlan[];
}

export interface ProcessNode {
  processId: string;
  name: string;
  description?: string | null;
  mission?: string | null;
  expectedResult?: string | null;
  departmentName?: string | null;
  procedures: ProcedureNode[];
  totalPlanned: number;
  totalSpent: number;
}

export type PlanStatusV2 = 'pending' | 'active' | 'done';

// ── Hook ────────────────────────────────────────────────────
export function usePlansV2(user?: UserInfo) {
  const queryClient = useQueryClient();

  // Navigation state
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState<number | null>(
    Math.ceil((new Date().getMonth() + 1) / 3),
  );
  const [month, setMonth] = useState<number | null>(new Date().getMonth() + 1);

  // Selection state
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [selectedProcedureId, setSelectedProcedureId] = useState<string | null>(null);

  // Reference data
  const { data: processes = [] } = useQuery(processesQueryOptions);
  const { data: procedures = [] } = useQuery(proceduresQueryOptions);

  // Budget items for dropdown (all active, filtered by selected process)
  const { data: allBudgetItems = [] } = useQuery({
    queryKey: ['plans-v2-budget-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budget_items')
        .select('id, name, process_id, budget_categories(name)')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data || []) as { id: string; name: string; process_id: string; budget_categories: { name: string } | null }[];
    },
    staleTime: Infinity,
  });

  // Task templates for all procedures (79 rows, staleTime: Infinity)
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['plans-v2-task-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('procedure_task_templates')
        .select('id, procedure_id, title, content')
        .eq('is_active', true)
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
    staleTime: Infinity,
  });

  // Monthly plans for the current year — fetch all at once, filter client-side
  const { data: monthlyPlans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['plans-v2-monthly', year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_plans')
        .select('*')
        .eq('year', year)
        .order('month');
      if (error) throw error;
      return (data || []) as MonthlyPlan[];
    },
    staleTime: 2 * 60_000,
  });

  // Hours from view
  const planIds = useMemo(() => monthlyPlans.map(p => p.monthly_plan_id), [monthlyPlans]);
  const { data: hoursData = [] } = useQuery({
    queryKey: ['plans-v2-hours', planIds],
    queryFn: async () => {
      if (planIds.length === 0) return [];
      const { data, error } = await supabase
        .from('v_monthly_plan_hours')
        .select('monthly_plan_id, total_spent_hours, tasks_count')
        .in('monthly_plan_id', planIds);
      if (error) throw error;
      return data || [];
    },
    enabled: planIds.length > 0,
    staleTime: 2 * 60_000,
  });

  // Hours map
  const hoursMap = useMemo(() => {
    const m = new Map<string, { spent: number; tasks: number }>();
    for (const h of hoursData) {
      m.set(h.monthly_plan_id, {
        spent: h.total_spent_hours ?? 0,
        tasks: h.tasks_count ?? 0,
      });
    }
    return m;
  }, [hoursData]);

  // Scope months for current filter
  const scopeMonths = useMemo(() => {
    if (month) return [month];
    if (quarter) return [(quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2, (quarter - 1) * 3 + 3];
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, [month, quarter]);

  // Filter plans by scope
  const scopedPlans = useMemo(() => {
    return monthlyPlans.filter(p => scopeMonths.includes(p.month));
  }, [monthlyPlans, scopeMonths]);

  // Build process → procedure tree with hours
  const processTree = useMemo(() => {
    const procMap = new Map<string, ProcedureKpiRow[]>();
    for (const pr of procedures) {
      if (!pr.process_id) continue;
      const list = procMap.get(pr.process_id) || [];
      list.push(pr);
      procMap.set(pr.process_id, list);
    }

    // Group task templates by procedure_id
    const templatesMap = new Map<string, TaskTemplate[]>();
    for (const t of taskTemplates) {
      const list = templatesMap.get(t.procedure_id) || [];
      list.push({ id: t.id, title: t.title, content: t.content });
      templatesMap.set(t.procedure_id, list);
    }

    const tree: ProcessNode[] = [];
    for (const proc of processes) {
      const procProcedures = procMap.get(proc.process_id) || [];
      const nodes: ProcedureNode[] = [];

      for (const pr of procProcedures) {
        const plans = scopedPlans.filter(p => p.procedure_id === pr.entity_id);
        // Always include procedures — processes are static
        const planned = plans.reduce((s, p) => s + (p.planned_hours || 0), 0);
        const spent = plans.reduce((s, p) => s + (hoursMap.get(p.monthly_plan_id)?.spent || 0), 0);
        nodes.push({
          procedureId: pr.entity_id,
          name: pr.entity_name,
          processId: proc.process_id,
          description: pr.description,
          serviceName: pr.service_name,
          category: pr.category,
          targetValue: pr.target_value,
          targetPeriod: pr.target_period,
          taskTemplates: templatesMap.get(pr.entity_id) || [],
          plannedHours: planned,
          spentHours: spent,
          plans,
        });
      }

      if (procProcedures.length === 0) continue; // skip processes without procedures in reference
      const totalPlanned = nodes.reduce((s, n) => s + n.plannedHours, 0);
      const totalSpent = nodes.reduce((s, n) => s + n.spentHours, 0);
      tree.push({
        processId: proc.process_id,
        name: proc.process_name,
        description: proc.description,
        mission: proc.mission,
        expectedResult: proc.expected_result,
        departmentName: proc.department_name,
        procedures: nodes,
        totalPlanned,
        totalSpent,
      });
    }

    return tree.sort((a, b) => b.totalPlanned - a.totalPlanned);
  }, [processes, procedures, taskTemplates, scopedPlans, hoursMap]);

  // Available years: current ± 1
  const availableYears = useMemo(() => {
    const now = new Date().getFullYear();
    return [now - 1, now, now + 1];
  }, []);

  // Available quarters
  const availableQuarters = useMemo(() => {
    const qs = new Set(monthlyPlans.filter(p => p.year === year).map(p => Math.ceil(p.month / 3)));
    return Array.from(qs).sort();
  }, [monthlyPlans, year]);

  // Selected nodes
  const selectedProcess = useMemo(
    () => processTree.find(p => p.processId === selectedProcessId) ?? null,
    [processTree, selectedProcessId],
  );
  const selectedProcedure = useMemo(
    () => selectedProcess?.procedures.find(p => p.procedureId === selectedProcedureId) ?? null,
    [selectedProcess, selectedProcedureId],
  );

  // Plans for detail hook: procedure plans if procedure selected, all process plans if only process
  const detailPlans = useMemo(() => {
    if (selectedProcedure) return selectedProcedure.plans;
    if (selectedProcess) return selectedProcess.procedures.flatMap(p => p.plans);
    return [];
  }, [selectedProcess, selectedProcedure]);

  // Keep selection on scope change — only update filters
  const handleYearChange = useCallback((y: number) => {
    setYear(y);
    setQuarter(null);
    setMonth(null);
  }, []);

  const handleQuarterChange = useCallback((q: number | null) => {
    setQuarter(q);
    setMonth(null);
  }, []);

  const handleMonthChange = useCallback((m: number | null) => {
    setMonth(m);
  }, []);

  const handleSelectProcess = useCallback((id: string) => {
    setSelectedProcessId(id || null);
    setSelectedProcedureId(null);
  }, []);

  const handleSelectProcedure = useCallback((processId: string, procedureId: string) => {
    setSelectedProcessId(processId);
    setSelectedProcedureId(procedureId);
  }, []);

  // Active employees with work_rate — for resource calculation
  const { data: activeEmployees = [] } = useQuery({
    queryKey: ['plans-v2-employees', user?.role, user?.department_id],
    queryFn: async () => {
      let query = supabase
        .from('user_profiles')
        .select('user_id, work_rate, department_id')
        .eq('status', 'active');
      if (user?.role === 'head') {
        query = query.eq('department_id', user.department_id);
      } else if (user?.role === 'employee') {
        query = query.eq('user_id', user.user_id);
      }
      const { data, error } = await query;
      if (error) return [];
      return (data || []) as { user_id: string; work_rate: number; department_id: string }[];
    },
    enabled: !!user,
    staleTime: Infinity,
  });

  // Resource hours = sum(working_days × 8 × work_rate) for each employee in scope
  const resourceHours = useMemo(() => {
    if (activeEmployees.length === 0) return 0;
    let totalDays = 0;
    for (const m of scopeMonths) {
      totalDays += countNaiveWorkingDays(year, m);
    }
    const totalRate = activeEmployees.reduce((s, e) => s + (Number(e.work_rate) || 1), 0);
    return Math.round(totalDays * 8 * totalRate);
  }, [activeEmployees, scopeMonths, year]);

  // View level: year / quarter / month
  const viewLevel: ViewLevel = month ? 'month' : quarter ? 'quarter' : 'year';

  // Annual plans for the year
  const { data: annualPlans = [] } = useQuery({
    queryKey: ['plans-v2-annual', year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('annual_plans')
        .select('annual_id, year, process_id, expected_result, goal, budget, status')
        .eq('year', year);
      if (error) throw error;
      return (data || []) as AnnualPlanRow[];
    },
    staleTime: 2 * 60_000,
  });

  // All budget entries for annual plans of this year (for list view totals)
  const annualIds = useMemo(() => annualPlans.map(a => a.annual_id), [annualPlans]);
  const { data: allAnnualBudgets = [] } = useQuery({
    queryKey: ['plans-v2-annual-budgets-all', annualIds],
    queryFn: async () => {
      if (annualIds.length === 0) return [];
      const { data, error } = await supabase
        .from('annual_plan_budget')
        .select('annual_plan_id, amount, payment_date, budget_items(name)')
        .in('annual_plan_id', annualIds);
      if (error) throw error;
      return (data || []) as { annual_plan_id: string; amount: number; payment_date: string | null; budget_items: { name: string } | null }[];
    },
    enabled: annualIds.length > 0,
    staleTime: 2 * 60_000,
  });

  // Budget sum per annual plan (full year)
  const annualBudgetSumMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of allAnnualBudgets) {
      m.set(b.annual_plan_id, (m.get(b.annual_plan_id) || 0) + Number(b.amount));
    }
    return m;
  }, [allAnnualBudgets]);

  // Budget item names per annual plan (for list view cards)
  const annualBudgetNamesMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const b of allAnnualBudgets) {
      if (!b.budget_items?.name) continue;
      let list = m.get(b.annual_plan_id);
      if (!list) { list = []; m.set(b.annual_plan_id, list); }
      if (!list.includes(b.budget_items.name)) list.push(b.budget_items.name);
    }
    return m;
  }, [allAnnualBudgets]);

  // Budget sum per annual plan filtered by quarter
  const quarterlyBudgetSumMap = useMemo(() => {
    if (!quarter) return new Map<string, number>();
    const qStart = new Date(year, (quarter - 1) * 3, 1);
    const qEnd = new Date(year, quarter * 3, 0); // last day of quarter
    const m = new Map<string, number>();
    for (const b of allAnnualBudgets) {
      if (!b.payment_date) continue;
      const d = new Date(b.payment_date);
      if (d >= qStart && d <= qEnd) {
        m.set(b.annual_plan_id, (m.get(b.annual_plan_id) || 0) + Number(b.amount));
      }
    }
    return m;
  }, [allAnnualBudgets, quarter, year]);

  // Budget items per annual plan filtered by quarter (with names)
  const quarterlyBudgetItemsMap = useMemo(() => {
    if (!quarter) return new Map<string, { name: string; amount: number }[]>();
    const qStart = new Date(year, (quarter - 1) * 3, 1);
    const qEnd = new Date(year, quarter * 3, 0);
    const m = new Map<string, { name: string; amount: number }[]>();
    for (const b of allAnnualBudgets) {
      if (!b.payment_date) continue;
      const d = new Date(b.payment_date);
      if (d >= qStart && d <= qEnd) {
        let list = m.get(b.annual_plan_id);
        if (!list) { list = []; m.set(b.annual_plan_id, list); }
        list.push({ name: b.budget_items?.name || 'Бюджет', amount: Number(b.amount) });
      }
    }
    return m;
  }, [allAnnualBudgets, quarter, year]);

  // Quarterly plans for the year
  const { data: quarterlyPlans = [] } = useQuery({
    queryKey: ['plans-v2-quarterly', year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quarterly_plans')
        .select('quarterly_id, year, quarter, process_id, expected_result, goal, note, status')
        .eq('year', year);
      if (error) throw error;
      return (data || []) as QuarterlyPlanRow[];
    },
    staleTime: 2 * 60_000,
  });

  // Budget items for selected annual plan
  const selectedAnnualPlan = useMemo(
    () => annualPlans.find(a => a.process_id === selectedProcessId) ?? null,
    [annualPlans, selectedProcessId],
  );

  const { data: annualBudgetItems = [] } = useQuery({
    queryKey: ['plans-v2-annual-budget', selectedAnnualPlan?.annual_id],
    queryFn: async () => {
      if (!selectedAnnualPlan) return [];
      const { data, error } = await supabase
        .from('annual_plan_budget')
        .select('id, annual_plan_id, budget_item_id, amount, payment_date, reminder_date, budget_items(name, budget_categories(name))')
        .eq('annual_plan_id', selectedAnnualPlan.annual_id);
      if (error) throw error;
      return (data || []) as AnnualBudgetRow[];
    },
    enabled: !!selectedAnnualPlan,
    staleTime: 2 * 60_000,
  });

  // All initiatives for all quarterly plans of the year (for list view)
  const quarterlyIds = useMemo(() => quarterlyPlans.map(q => q.quarterly_id), [quarterlyPlans]);
  const { data: allQuarterlyInitiatives = [] } = useQuery({
    queryKey: ['plans-v2-quarterly-initiatives-all', quarterlyIds],
    queryFn: async () => {
      if (quarterlyIds.length === 0) return [];
      const { data, error } = await supabase
        .from('quarterly_plan_initiatives')
        .select('id, quarterly_plan_id, title, description, status')
        .in('quarterly_plan_id', quarterlyIds);
      if (error) throw error;
      return (data || []) as QuarterlyInitiativeRow[];
    },
    enabled: quarterlyIds.length > 0,
    staleTime: 2 * 60_000,
  });

  // Map: quarterly_plan_id → initiatives[]
  const quarterlyInitiativesMap = useMemo(() => {
    const m = new Map<string, QuarterlyInitiativeRow[]>();
    for (const init of allQuarterlyInitiatives) {
      const list = m.get(init.quarterly_plan_id) || [];
      list.push(init);
      m.set(init.quarterly_plan_id, list);
    }
    return m;
  }, [allQuarterlyInitiatives]);

  // Initiatives for selected quarterly plan
  const selectedQuarterlyPlan = useMemo(
    () => quarter ? quarterlyPlans.find(q => q.process_id === selectedProcessId && q.quarter === quarter) ?? null : null,
    [quarterlyPlans, selectedProcessId, quarter],
  );

  const quarterlyInitiatives = useMemo(
    () => selectedQuarterlyPlan ? (quarterlyInitiativesMap.get(selectedQuarterlyPlan.quarterly_id) || []) : [],
    [selectedQuarterlyPlan, quarterlyInitiativesMap],
  );

  // Quarterly goals for selected process (informational — legacy, kept for ProcessView)
  const { data: processGoals = [] } = useQuery({
    queryKey: ['plans-v2-process-goals', selectedProcessId, year],
    queryFn: async () => {
      if (!selectedProcessId) return [];
      const { data, error } = await supabase
        .from('quarterly_plans')
        .select('quarterly_id, quarter, goal, note, status, annual_plan_id')
        .eq('process_id', selectedProcessId)
        .order('quarter');
      if (error) return [];
      const rows = (data || []) as { quarterly_id: string; quarter: number; goal: string; note: string | null; status: string; annual_plan_id: string }[];
      const annualIds = [...new Set(rows.map(r => r.annual_plan_id).filter(Boolean))];
      let annualMap = new Map<string, { goal: string; budget: number }>();
      if (annualIds.length > 0) {
        const { data: annuals } = await supabase
          .from('annual_plans')
          .select('annual_id, goal, budget')
          .in('annual_id', annualIds)
          .eq('year', year);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        annualMap = new Map((annuals || []).map((a: any) => [a.annual_id, { goal: a.goal, budget: Number(a.budget) || 0 }]));
      }
      return rows.map(r => ({
        ...r,
        annualGoal: annualMap.get(r.annual_plan_id)?.goal ?? null,
        annualBudget: annualMap.get(r.annual_plan_id)?.budget ?? 0,
      }));
    },
    enabled: !!selectedProcessId,
    staleTime: 2 * 60_000,
  });

  // Monthly overview: company hours + user-procedure hours (when month selected, no process)
  const { data: monthlyCompanyHours = [] } = useQuery({
    queryKey: ['plans-v2-monthly-companies', year, month],
    queryFn: async () => {
      if (!month) return [];
      const { data, error } = await supabase
        .from('v_plan_user_company_hours')
        .select('company_id, procedure_id, distributed_hours')
        .eq('year', year)
        .eq('month', month);
      if (error) throw error;
      // Group by company, and by company+procedure
      const companyMap = new Map<string, number>();
      const companyProcMap = new Map<string, Map<string, number>>();
      for (const r of data || []) {
        const h = Number(r.distributed_hours || 0);
        companyMap.set(r.company_id, (companyMap.get(r.company_id) || 0) + h);
        let procs = companyProcMap.get(r.company_id);
        if (!procs) { procs = new Map(); companyProcMap.set(r.company_id, procs); }
        procs.set(r.procedure_id, (procs.get(r.procedure_id) || 0) + h);
      }
      // Fetch company names
      const companyIds = [...companyMap.keys()];
      if (companyIds.length === 0) return [];
      const { data: companies } = await supabase
        .from('companies')
        .select('company_id, company_name')
        .in('company_id', companyIds);
      const nameMap = new Map((companies || []).map(c => [c.company_id, c.company_name]));
      return companyIds
        .map(id => ({
          companyId: id,
          companyName: nameMap.get(id) || id,
          hours: Math.round((companyMap.get(id) || 0) * 10) / 10,
          procedures: Array.from(companyProcMap.get(id)?.entries() || [])
            .map(([procId, h]) => ({ procedureId: procId, hours: Math.round(h * 10) / 10 }))
            .sort((a, b) => b.hours - a.hours),
        }))
        .sort((a, b) => b.hours - a.hours);
    },
    enabled: !!month,
    staleTime: 2 * 60_000,
  });

  const { data: monthlyUserProcHours = [] } = useQuery({
    queryKey: ['plans-v2-monthly-user-procs', year, month],
    queryFn: async () => {
      if (!month) return [];
      const { data, error } = await supabase
        .from('v_plan_user_company_hours')
        .select('user_id, procedure_id, distributed_hours')
        .eq('year', year)
        .eq('month', month);
      if (error) throw error;
      // Group by user+procedure
      const map = new Map<string, { userId: string; procedureId: string; hours: number }>();
      for (const r of data || []) {
        const key = `${r.user_id}::${r.procedure_id}`;
        const existing = map.get(key);
        if (existing) existing.hours += Number(r.distributed_hours || 0);
        else map.set(key, { userId: r.user_id, procedureId: r.procedure_id, hours: Number(r.distributed_hours || 0) });
      }
      return Array.from(map.values()).map(r => ({ ...r, hours: Math.round(r.hours * 10) / 10 }));
    },
    enabled: !!month,
    staleTime: 2 * 60_000,
  });

  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['plans-v2-monthly'] });
    queryClient.invalidateQueries({ queryKey: ['plans-v2-hours'] });
    queryClient.invalidateQueries({ queryKey: ['plans-v2-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['plans-v2-assignees'] });
    queryClient.invalidateQueries({ queryKey: ['plans-v2-companies'] });
    queryClient.invalidateQueries({ queryKey: ['plans-v2-projects'] });
    queryClient.invalidateQueries({ queryKey: ['plans-v2-kbdocs'] });
    queryClient.invalidateQueries({ queryKey: ['plans-v2-annual'] });
    queryClient.invalidateQueries({ queryKey: ['plans-v2-annual-budgets-all'] });
    queryClient.invalidateQueries({ queryKey: ['plans-v2-quarterly'] });
    queryClient.invalidateQueries({ queryKey: ['plans-v2-annual-budget'] });
    queryClient.invalidateQueries({ queryKey: ['plans-v2-quarterly-initiatives-all'] });
    queryClient.invalidateQueries({ queryKey: ['plans-v2-process-goals'] });
  }, [queryClient]);

  return {
    // Data
    processTree,
    selectedProcess,
    selectedProcedure,
    detailPlans,
    scopeMonths,
    hoursMap,
    resourceHours,
    processGoals,
    // V2 data
    viewLevel,
    annualPlans,
    quarterlyPlans,
    selectedAnnualPlan,
    selectedQuarterlyPlan,
    annualBudgetItems,
    annualBudgetSumMap,
    annualBudgetNamesMap,
    quarterlyBudgetItemsMap,
    quarterlyBudgetSumMap,
    quarterlyInitiatives,
    quarterlyInitiativesMap,
    monthlyPlans,
    monthlyCompanyHours,
    monthlyUserProcHours,
    availableBudgetItems: allBudgetItems
      .filter(bi => bi.process_id === selectedProcessId)
      .map(bi => ({ id: bi.id, name: bi.name, category_name: bi.budget_categories?.name || null })),
    // State
    year, quarter, month,
    selectedProcessId, selectedProcedureId,
    availableYears, availableQuarters,
    // Loading
    loading: plansLoading,
    // Handlers
    setYear: handleYearChange,
    setQuarter: handleQuarterChange,
    setMonth: handleMonthChange,
    selectProcess: handleSelectProcess,
    selectProcedure: handleSelectProcedure,
    refreshData,
  };
}
