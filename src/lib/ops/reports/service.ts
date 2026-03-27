import { supabase } from '../../shared/supabase';

type QuarterlyRow = {
  quarterly_id: string;
  annual_plan_id: string;
  quarter: number;
  goal: string | null;
  expected_result: string | null;
  status: string;
  department_id: string | null;
  process_id: string | null;
  note: string | null;
  departments?: { department_name?: string | null } | { department_name?: string | null }[] | null;
  processes?: { process_name?: string | null } | { process_name?: string | null }[] | null;
};

type AnnualRow = { annual_id: string; year: number };
type MonthlyRow = { monthly_plan_id: string; quarterly_id: string; planned_hours: number | null; status: string };

export async function getAvailableQuarterlyYears(): Promise<number[]> {
  const { data: qData, error: qErr } = await supabase
    .from('quarterly_plans')
    .select('annual_plan_id')
    .in('status', ['active', 'completed']);
  if (qErr) throw qErr;

  const annualIds = Array.from(new Set(
    (qData || []).map((r) => (r as { annual_plan_id: string }).annual_plan_id).filter(Boolean)
  ));
  if (annualIds.length === 0) return [];

  const { data: aData, error: aErr } = await supabase
    .from('annual_plans')
    .select('year')
    .in('annual_id', annualIds)
    .order('year', { ascending: false });
  if (aErr) throw aErr;

  return Array.from(new Set<number>((aData || []).map((r) => (r as { year: number }).year)));
}

export async function getQuarterlyReports(year?: number) {
  const yearMap = new Map<string, number>();
  let annualIdsFilter: string[] | undefined;

  if (year !== undefined) {
    const { data: annualData, error: annualErr } = await supabase
      .from('annual_plans')
      .select('annual_id, year')
      .eq('year', year);
    if (annualErr) throw annualErr;
    for (const a of (annualData || []) as AnnualRow[]) {
      yearMap.set(a.annual_id, a.year);
    }
    annualIdsFilter = Array.from(yearMap.keys());
    if (annualIdsFilter.length === 0) return [];
  }

  let query = supabase
    .from('quarterly_plans')
    .select(`
      quarterly_id,
      annual_plan_id,
      quarter,
      goal,
      expected_result,
      status,
      department_id,
      process_id,
      note,
      departments (department_name),
      processes (process_name)
    `)
    .in('status', ['active', 'completed']);

  if (annualIdsFilter) {
    query = query.in('annual_plan_id', annualIdsFilter);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []) as QuarterlyRow[];

  if (year === undefined) {
    const annualIds = Array.from(new Set(rows.map((r) => r.annual_plan_id).filter(Boolean)));
    if (annualIds.length > 0) {
      const { data: annuals, error: annualError } = await supabase
        .from('annual_plans')
        .select('annual_id, year')
        .in('annual_id', annualIds);
      if (annualError) throw annualError;
      for (const annual of (annuals || []) as AnnualRow[]) {
        yearMap.set(annual.annual_id, annual.year);
      }
    }
  }

  const quarterlyIds = rows.map((r) => r.quarterly_id);
  const completionMap = new Map<string, number>();
  const quarterHoursMap = new Map<string, { planned: number; spent: number }>();

  if (quarterlyIds.length > 0) {
    const { data: monthlyRows, error: monthlyError } = await supabase
      .from('monthly_plans')
      .select('monthly_plan_id, quarterly_id, planned_hours, status')
      .in('quarterly_id', quarterlyIds)
      .in('status', ['active', 'completed']);

    if (monthlyError) throw monthlyError;

    const typedMonthly = (monthlyRows || []) as MonthlyRow[];
    const monthlyIds = typedMonthly.map((m) => m.monthly_plan_id);
    const spentByMonthly = new Map<string, number>();

    if (monthlyIds.length > 0) {
      // Use pre-aggregated view instead of raw daily_tasks (132 rows vs 21K)
      const { data: viewRows, error: viewError } = await supabase
        .from('v_monthly_plan_hours')
        .select('monthly_plan_id, total_spent_hours')
        .in('monthly_plan_id', monthlyIds);

      if (viewError) throw viewError;

      for (const row of (viewRows || []) as { monthly_plan_id: string; total_spent_hours: number }[]) {
        spentByMonthly.set(row.monthly_plan_id, Number(row.total_spent_hours) || 0);
      }
    }

    const quarterAgg = new Map<string, { planned: number; spent: number }>();

    for (const monthly of typedMonthly) {
      const current = quarterAgg.get(monthly.quarterly_id) || { planned: 0, spent: 0 };
      current.planned += Number(monthly.planned_hours) || 0;
      current.spent += spentByMonthly.get(monthly.monthly_plan_id) || 0;
      quarterAgg.set(monthly.quarterly_id, current);
    }

    quarterAgg.forEach((agg, quarterlyId) => {
      quarterHoursMap.set(quarterlyId, agg);
      const completion = agg.planned > 0 ? Math.min(100, Math.round((agg.spent / agg.planned) * 100)) : 0;
      completionMap.set(quarterlyId, completion);
    });
  }

  return rows.map((row) => ({
    quarterly_id: row.quarterly_id,
    annual_plan_id: row.annual_plan_id,
    quarter: row.quarter,
    year: yearMap.get(row.annual_plan_id) ?? null,
    department_id: row.department_id || '',
    department_name: (Array.isArray(row.departments) ? row.departments[0]?.department_name : row.departments?.department_name) || '',
    goal: row.goal || '',
    expected_result: row.expected_result || '',
    status: row.status,
    process_id: row.process_id || '',
    process_name: (Array.isArray(row.processes) ? row.processes[0]?.process_name : row.processes?.process_name) || '',
    note: row.note || '',
    completion_percentage: completionMap.get(row.quarterly_id) || 0,
    planned_hours_total: quarterHoursMap.get(row.quarterly_id)?.planned || 0,
    spent_hours_total: quarterHoursMap.get(row.quarterly_id)?.spent || 0,
  }));
}
