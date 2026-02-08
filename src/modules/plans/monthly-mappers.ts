import type { AnnualPlan, MonthlyPlan, PlanStatus, QuarterlyPlan } from '@/types/planning';

export type MeasureLookup = {
  name: string;
  process_id: string;
  process_name: string;
};

type MeasureRow = {
  entity_id: string;
  entity_name: string;
  process_id: string;
  process_name: string;
};

type DailyTaskHoursRow = {
  monthly_plan_id: string;
  spent_hours: number | null;
};

type MonthlyRow = {
  monthly_plan_id: string;
  quarterly_id: string | null;
  measure_id: string | null;
  status: PlanStatus;
  planned_hours: number;
  month: number;
  year: number;
} & Partial<MonthlyPlan>;

export function buildMeasuresMap(rows: MeasureRow[]): Map<string, MeasureLookup> {
  const measuresMap = new Map<string, MeasureLookup>();

  for (const row of rows) {
    if (!measuresMap.has(row.entity_id)) {
      measuresMap.set(row.entity_id, {
        name: row.entity_name,
        process_id: row.process_id,
        process_name: row.process_name,
      });
    }
  }

  return measuresMap;
}

export function aggregateHoursByMonthlyPlan(
  rows: DailyTaskHoursRow[]
): Map<string, { total_spent_hours: number; tasks_count: number }> {
  const hoursMap = new Map<string, { total_spent_hours: number; tasks_count: number }>();

  for (const row of rows) {
    const planId = row.monthly_plan_id;
    const hours = Number(row.spent_hours) || 0;
    const current = hoursMap.get(planId) || { total_spent_hours: 0, tasks_count: 0 };
    current.total_spent_hours += hours;
    current.tasks_count += 1;
    hoursMap.set(planId, current);
  }

  return hoursMap;
}

export function mapMonthlyPlansWithHierarchy(params: {
  monthlyRows: MonthlyRow[];
  quarterlyPlans: QuarterlyPlan[];
  annualPlans: AnnualPlan[];
  measuresMap: Map<string, MeasureLookup>;
  hoursMap: Map<string, { total_spent_hours: number; tasks_count: number }>;
}): MonthlyPlan[] {
  const { monthlyRows, quarterlyPlans, annualPlans, measuresMap, hoursMap } = params;

  return monthlyRows.map((row) => {
    const quarterly = quarterlyPlans.find((q) => q.quarterly_id === row.quarterly_id);
    const annual = quarterly
      ? annualPlans.find((a) => a.annual_id === quarterly.annual_plan_id)
      : undefined;
    const agg = hoursMap.get(row.monthly_plan_id);
    const measure = row.measure_id ? measuresMap.get(row.measure_id) : undefined;
    const plannedHours = Number(row.planned_hours) || 0;
    const totalSpentHours = agg?.total_spent_hours || 0;

    return {
      ...row,
      month_number: row.month,
      measure_name: measure?.name,
      process_id: measure?.process_id || quarterly?.process_id || undefined,
      process_name: measure?.process_name || quarterly?.process_name,
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
