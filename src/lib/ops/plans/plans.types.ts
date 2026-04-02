/**
 * Plans V2 — shared types for queries, mappers, and hooks.
 */
import type { MonthlyPlan } from '@/types/planning';

export type ViewLevel = 'year' | 'quarter' | 'month';
export type PlanStatusV2 = 'pending' | 'active' | 'done';

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
  departmentId?: string | null;
  departmentName?: string | null;
  procedures: ProcedureNode[];
  totalPlanned: number;
  totalSpent: number;
}
