import type { AnnualPlan, MonthlyPlan, PlanStatus, QuarterlyPlan } from '@/types/planning';

export type ProcedureLookup = {
  name: string;
  process_id: string;
  process_name: string;
};

type ProcedureRow = {
  entity_id: string;
  entity_name: string;
  process_id: string;
  process_name: string;
};

type ViewHoursRow = {
  monthly_plan_id: string;
  total_spent_hours: number;
  tasks_count: number;
};

type MonthlyRow = {
  monthly_plan_id: string;
  quarterly_id: string | null;
  procedure_id: string | null;
  status: PlanStatus;
  planned_hours: number;
  month: number;
  year: number;
} & Partial<MonthlyPlan>;

export function buildProceduresMap(rows: ProcedureRow[]): Map<string, ProcedureLookup> {
  const proceduresMap = new Map<string, ProcedureLookup>();

  for (const row of rows) {
    if (!proceduresMap.has(row.entity_id)) {
      proceduresMap.set(row.entity_id, {
        name: row.entity_name,
        process_id: row.process_id,
        process_name: row.process_name,
      });
    }
  }

  return proceduresMap;
}

/** Build hours map from v_monthly_plan_hours view (pre-aggregated by DB) */
export function buildHoursMapFromView(
  rows: ViewHoursRow[]
): Map<string, { total_spent_hours: number; tasks_count: number }> {
  const map = new Map<string, { total_spent_hours: number; tasks_count: number }>();
  for (const row of rows) {
    map.set(row.monthly_plan_id, {
      total_spent_hours: Number(row.total_spent_hours) || 0,
      tasks_count: Number(row.tasks_count) || 0,
    });
  }
  return map;
}

export function mapMonthlyPlansWithHierarchy(params: {
  monthlyRows: MonthlyRow[];
  quarterlyPlans: QuarterlyPlan[];
  annualPlans: AnnualPlan[];
  proceduresMap: Map<string, ProcedureLookup>;
  hoursMap: Map<string, { total_spent_hours: number; tasks_count: number }>;
}): MonthlyPlan[] {
  const { monthlyRows, quarterlyPlans, annualPlans, proceduresMap, hoursMap } = params;

  return monthlyRows.map((row) => {
    const quarterly = quarterlyPlans.find((q) => q.quarterly_id === row.quarterly_id);
    const annual = quarterly
      ? annualPlans.find((a) => a.annual_id === quarterly.annual_plan_id)
      : undefined;
    const agg = hoursMap.get(row.monthly_plan_id);
    const procedure = row.procedure_id ? proceduresMap.get(row.procedure_id) : undefined;
    const plannedHours = Number(row.planned_hours) || 0;
    const totalSpentHours = agg?.total_spent_hours || 0;

    return {
      ...row,
      month_number: row.month,
      procedure_name: procedure?.name,
      process_id: procedure?.process_id || quarterly?.process_id || undefined,
      process_name: procedure?.process_name || quarterly?.process_name,
      department_id: quarterly?.department_id || undefined,
      department_name: quarterly?.department_name,
      quarter: quarterly?.quarter,
      total_spent_hours: totalSpentHours,
      tasks_count: agg?.tasks_count || 0,
      completion_percentage: plannedHours > 0
        ? Math.round((totalSpentHours / plannedHours) * 100)
        : 0,
      annual_plan: annual
        ? {
            goal: annual.goal,
            expected_result: annual.expected_result,
            year: annual.year,
          }
        : undefined,
      quarterly_plan: quarterly
        ? {
            goal: quarterly.goal,
            expected_result: quarterly.expected_result,
            quarter: quarterly.quarter,
          }
        : undefined,
    };
  });
}
