/**
 * KPI row types for database queries.
 */

export type PlanRow = {
  monthly_plan_id: string;
  year: number;
  month: number;
  planned_hours: number | null;
  procedure_id: string | null;
  quarterly_id: string | null;
};

export type QuarterlyRow = {
  quarterly_id: string;
  department_id: string | null;
  process_id: string | null;
  quarter: number;
};

export type TaskAggRow = {
  monthly_plan_id: string;
  user_id: string | null;
  total_spent_hours: number;
  tasks_count: number;
};

export type AssigneeRow = {
  monthly_plan_id: string;
  user_id: string;
};

export type ProcedureRef = { procedure_id: string; name: string; process_id: string | null };
export type ProcessRef = { process_id: string; process_name: string; department_id: string | null };
export type DeptRef = { department_id: string; department_name: string };
export type UserRef = { user_id: string; full_name: string | null; department_id: string | null; work_rate: number | null };
