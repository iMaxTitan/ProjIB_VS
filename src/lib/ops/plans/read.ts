import { supabase } from '@/lib/shared/supabase';
import type { DailyTask, Procedure, MonthlyPlan } from '@/types/planning';
import {
  type MonthlyPlansFilter,
  type PlansCounts,
  type ProcedureRow,
  type MonthlyPlanRow,
  type MonthlyPlanAssigneeRow,
  type DailyTaskRow,
  normalizeRelation,
  mapMonthlyPlanRow,
  mapAssigneeRow,
  mapDailyTaskRow,
} from './plan-mappers';

export type { MonthlyPlansFilter, PlansCounts } from './plan-mappers';

export async function getProcedures(processId?: string): Promise<Procedure[]> {
  let query = supabase
    .from('procedures')
    .select(`
      procedure_id,
      process_id,
      name,
      description,
      category,
      target_value,
      target_period,
      is_active,
      created_at,
      processes (
        process_name
      )
    `)
    .eq('is_active', true)
    .order('name');

  if (processId) {
    query = query.eq('process_id', processId);
  }

  const { data, error } = await query;
  if (!error && data && data.length > 0) {
    return (data as ProcedureRow[]).map((row) => {
      const process = normalizeRelation(row.processes);
      return {
        ...row,
        process_name: process?.process_name ?? undefined,
      };
    });
  }

  // Fallback: в ряде окружений процедуры для планов доступны через view v_kpi_operational.
  let kpiQuery = supabase
    .from('v_kpi_operational')
    .select('entity_id, entity_name, process_id, process_name, target_value, target_period')
    .order('entity_name');

  if (processId) {
    kpiQuery = kpiQuery.eq('process_id', processId);
  }

  const { data: kpiData, error: kpiError } = await kpiQuery;
  if (kpiError) {
    throw error || kpiError;
  }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((kpiData || []) as any[]).map((row: {
    entity_id: string;
    entity_name: string;
    process_id: string | null;
    process_name?: string | null;
    target_value?: number | null;
    target_period?: 'year' | 'quarter' | 'month' | null;
  }) => ({
    procedure_id: row.entity_id,
    process_id: row.process_id,
    name: row.entity_name,
    description: '',
    category: 'operational',
    target_value: Number(row.target_value) || 0,
    target_period: row.target_period || 'year',
    is_active: true,
    process_name: row.process_name ?? undefined,
  }));
}

export async function getMonthlyPlans(filters: MonthlyPlansFilter = {}): Promise<MonthlyPlan[]> {
  const { quarterlyId, year, month, procedureId, userId } = filters;

  let allowedMonthlyIds: Set<string> | null = null;
  if (userId) {
    const [{ data: assignedRows, error: assignedError }, { data: createdRows, error: createdError }] = await Promise.all([
      supabase.from('monthly_plan_assignees').select('monthly_plan_id').eq('user_id', userId),
      supabase.from('monthly_plans').select('monthly_plan_id').eq('created_by', userId),
    ]);

    if (assignedError) throw assignedError;
    if (createdError) throw createdError;

    allowedMonthlyIds = new Set<string>([
      ...(assignedRows || []).map((r) => r.monthly_plan_id),
      ...(createdRows || []).map((r) => r.monthly_plan_id),
    ]);

    if (allowedMonthlyIds.size === 0) {
      return [];
    }
  }

  let query = supabase
    .from('monthly_plans')
    .select(`
      *,
      procedures (
        name,
        process_id,
        processes (
          process_name
        )
      ),
      quarterly_plans (
        quarter,
        department_id,
        departments (
          department_name
        )
      )
    `)
    .order('month', { ascending: true });

  if (quarterlyId) query = query.eq('quarterly_id', quarterlyId);
  if (year !== undefined) query = query.eq('year', year);
  if (month !== undefined) query = query.eq('month', month);
  if (procedureId) query = query.eq('procedure_id', procedureId);
  if (allowedMonthlyIds) query = query.in('monthly_plan_id', Array.from(allowedMonthlyIds));

  const { data: monthlyRows, error: monthlyError } = await query;
  if (monthlyError) throw monthlyError;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planIds = ((monthlyRows || []) as any[]).map((r: { monthly_plan_id: string }) => r.monthly_plan_id);
  const hoursByPlanId: Record<string, { spent: number; count: number }> = {};

  if (planIds.length > 0) {
    const { data: hoursRows, error: hoursError } = await supabase
      .from('v_monthly_plan_hours')
      .select('monthly_plan_id, total_spent_hours, tasks_count')
      .in('monthly_plan_id', planIds);

    if (hoursError) throw hoursError;

    for (const row of hoursRows || []) {
      hoursByPlanId[row.monthly_plan_id] = {
        spent: Number(row.total_spent_hours) || 0,
        count: Number(row.tasks_count) || 0,
      };
    }
  }

  return ((monthlyRows || []) as MonthlyPlanRow[]).map((row) =>
    mapMonthlyPlanRow(row, hoursByPlanId[row.monthly_plan_id] || { spent: 0, count: 0 })
  );
}

export async function getMonthlyPlanById(monthlyPlanId: string): Promise<MonthlyPlan | null> {
  const [planResult, tasksResult] = await Promise.all([
    supabase
      .from('monthly_plans')
      .select(`
        *,
        procedures (
          name,
          process_id,
          processes (
            process_name
          )
        ),
        quarterly_plans (
          quarter,
          department_id,
          departments (
            department_name
          )
        )
      `)
      .eq('monthly_plan_id', monthlyPlanId)
      .single(),
    supabase
      .from('v_monthly_plan_hours')
      .select('total_spent_hours, tasks_count')
      .eq('monthly_plan_id', monthlyPlanId)
      .maybeSingle(),
  ]);

  if (planResult.error) throw planResult.error;
  if (!planResult.data) return null;

  const hoursRow = tasksResult.data;
  const totalSpentHours = Number(hoursRow?.total_spent_hours) || 0;
  const tasksCount = Number(hoursRow?.tasks_count) || 0;

  return mapMonthlyPlanRow(
    planResult.data as unknown as MonthlyPlanRow,
    { spent: totalSpentHours, count: tasksCount },
  );
}

export async function getMonthlyPlanAssignees(monthlyPlanId: string): Promise<import('@/types/planning').MonthlyPlanAssignee[]> {
  const { data, error } = await supabase
    .from('monthly_plan_assignees')
    .select(`
      monthly_plan_id,
      user_id,
      assigned_at,
      user_profiles (
        full_name,
        email,
        photo_url,
        role,
        user_status,
        department_id,
        departments (
          department_name
        )
      )
    `)
    .eq('monthly_plan_id', monthlyPlanId);

  if (error) throw error;

  return ((data || []) as MonthlyPlanAssigneeRow[]).map(mapAssigneeRow);
}

export async function getDailyTasksByMonthlyPlan(monthlyPlanId: string): Promise<DailyTask[]> {
  const { data, error } = await supabase
    .from('daily_tasks')
    .select(`
      *,
      user_profiles (
        full_name,
        email,
        photo_url
      )
    `)
    .eq('monthly_plan_id', monthlyPlanId)
    .order('task_date', { ascending: false });

  if (error) throw error;

  return ((data || []) as DailyTaskRow[]).map(mapDailyTaskRow);
}

export async function getPlansCounts(userId: string): Promise<PlansCounts> {
  const [annualIdsViewResult, monthlyAssignedResult, monthlyCreatedResult] = await Promise.all([
    supabase.from('v_annual_plans').select('annual_id').eq('user_id', userId),
    supabase.from('monthly_plan_assignees').select('monthly_plan_id').eq('user_id', userId),
    supabase.from('monthly_plans').select('monthly_plan_id').eq('created_by', userId),
  ]);

  if (monthlyAssignedResult.error) throw monthlyAssignedResult.error;
  if (monthlyCreatedResult.error) throw monthlyCreatedResult.error;

  let annualIds: string[] = [];
  if (annualIdsViewResult.error) {
    const annualIdsBaseResult = await supabase
      .from('annual_plans')
      .select('annual_id')
      .eq('user_id', userId);

    if (annualIdsBaseResult.error) throw annualIdsBaseResult.error;
    annualIds = (annualIdsBaseResult.data || []).map((row) => row.annual_id).filter(Boolean);
  } else {
    annualIds = (annualIdsViewResult.data || []).map((row) => row.annual_id).filter(Boolean);
  }

  let quarterlyCount = 0;

  if (annualIds.length > 0) {
    const { count, error } = await supabase
      .from('quarterly_plans')
      .select('quarterly_id', { count: 'exact', head: true })
      .in('annual_plan_id', annualIds);

    if (error) throw error;
    quarterlyCount = count || 0;
  }

  const monthlyIds = new Set<string>([
    ...((monthlyAssignedResult.data || []).map((row) => row.monthly_plan_id)),
    ...((monthlyCreatedResult.data || []).map((row) => row.monthly_plan_id)),
  ]);

  return {
    annual: annualIds.length,
    quarterly: quarterlyCount,
    monthly: monthlyIds.size,
  };
}
