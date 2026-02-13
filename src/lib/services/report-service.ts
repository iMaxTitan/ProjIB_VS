import { supabase } from '../supabase';

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
type TaskRow = { monthly_plan_id: string; spent_hours: number | null };

export async function getQuarterlyReports() {
  const { data, error } = await supabase
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

  if (error) throw error;
  const rows = (data || []) as QuarterlyRow[];

  const annualIds = Array.from(new Set(rows.map((r) => r.annual_plan_id).filter(Boolean)));
  const yearMap = new Map<string, number>();

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
      // Paginate to bypass Supabase max_rows=1000 limit
      const PAGE = 1000;
      let offset = 0;
      while (true) {
        const { data: tasks, error: tasksError } = await supabase
          .from('daily_tasks')
          .select('monthly_plan_id, spent_hours')
          .in('monthly_plan_id', monthlyIds)
          .range(offset, offset + PAGE - 1);

        if (tasksError) throw tasksError;
        if (!tasks || tasks.length === 0) break;

        for (const task of (tasks as TaskRow[])) {
          const current = spentByMonthly.get(task.monthly_plan_id) || 0;
          spentByMonthly.set(task.monthly_plan_id, current + (Number(task.spent_hours) || 0));
        }

        if (tasks.length < PAGE) break;
        offset += PAGE;
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
