/**
 * Type aliases, interfaces, and mapper functions for plan data transformations.
 * Extracted from read.ts to keep query functions under the 300-line limit.
 */

import type { DailyTask, Procedure, MonthlyPlan, MonthlyPlanAssignee } from '@/types/planning';

export type ProcessRelation = {
  process_name?: string | null;
};

export type DepartmentRelation = {
  department_name?: string | null;
};

export type ProcedureRow = Procedure & {
  processes?: ProcessRelation | ProcessRelation[] | null;
};

export type MonthlyPlanProcedureRelation = {
  name?: string | null;
  process_id?: string | null;
  processes?: ProcessRelation | ProcessRelation[] | null;
};

export type MonthlyPlanQuarterlyRelation = {
  quarter?: number | null;
  department_id?: string | null;
  departments?: DepartmentRelation | DepartmentRelation[] | null;
};

export type MonthlyPlanRow = MonthlyPlan & {
  procedures?: MonthlyPlanProcedureRelation | MonthlyPlanProcedureRelation[] | null;
  quarterly_plans?: MonthlyPlanQuarterlyRelation | MonthlyPlanQuarterlyRelation[] | null;
};

export type AssigneeUserProfileRelation = {
  full_name?: string | null;
  email?: string | null;
  photo_url?: string | null;
  role?: MonthlyPlanAssignee['role'] | null;
  user_status?: MonthlyPlanAssignee['user_status'] | null;
  department_id?: string | null;
  departments?: DepartmentRelation | DepartmentRelation[] | null;
};

export type MonthlyPlanAssigneeRow = Pick<MonthlyPlanAssignee, 'monthly_plan_id' | 'user_id' | 'assigned_at'> & {
  user_profiles?: AssigneeUserProfileRelation | AssigneeUserProfileRelation[] | null;
};

export type DailyTaskUserProfileRelation = {
  full_name?: string | null;
  email?: string | null;
  photo_url?: string | null;
};

export type DailyTaskRow = DailyTask & {
  user_profiles?: DailyTaskUserProfileRelation | DailyTaskUserProfileRelation[] | null;
};

export interface MonthlyPlansFilter {
  quarterlyId?: string;
  year?: number;
  month?: number;
  procedureId?: string;
  userId?: string;
}

export interface PlansCounts {
  annual: number;
  quarterly: number;
  monthly: number;
}

export function normalizeRelation<T>(value: T | T[] | null | undefined): T | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export function mapMonthlyPlanRow(
  row: MonthlyPlanRow,
  aggregate: { spent: number; count: number },
): MonthlyPlan {
  const procedure = normalizeRelation(row.procedures);
  const process = normalizeRelation(procedure?.processes);
  const quarterly = normalizeRelation(row.quarterly_plans);
  const department = normalizeRelation(quarterly?.departments);
  const plannedHours = Number(row.planned_hours) || 0;

  return {
    ...row,
    procedure_name: procedure?.name ?? undefined,
    process_id: procedure?.process_id ?? undefined,
    process_name: process?.process_name ?? undefined,
    quarter: quarterly?.quarter ?? undefined,
    department_id: quarterly?.department_id ?? undefined,
    department_name: department?.department_name ?? undefined,
    total_spent_hours: aggregate.spent,
    tasks_count: aggregate.count,
    completion_percentage: plannedHours > 0
      ? Math.min(100, Math.round((aggregate.spent / plannedHours) * 100))
      : 0,
  };
}

export function mapAssigneeRow(row: MonthlyPlanAssigneeRow): MonthlyPlanAssignee {
  const profile = normalizeRelation(row.user_profiles);
  const department = normalizeRelation(profile?.departments);

  return {
    monthly_plan_id: row.monthly_plan_id,
    user_id: row.user_id,
    assigned_at: row.assigned_at,
    full_name: profile?.full_name ?? undefined,
    email: profile?.email ?? undefined,
    photo_url: profile?.photo_url ?? undefined,
    role: profile?.role ?? undefined,
    user_status: profile?.user_status ?? undefined,
    department_id: profile?.department_id ?? undefined,
    department_name: department?.department_name ?? undefined,
  };
}

export function mapDailyTaskRow(row: DailyTaskRow): DailyTask {
  const profile = normalizeRelation(row.user_profiles);
  return {
    ...row,
    user_name: profile?.full_name ?? undefined,
    user_email: profile?.email ?? undefined,
    user_photo: profile?.photo_url ?? undefined,
  };
}
