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

/** Initiative from справочник `initiatives` */
export interface InitiativeRow {
  id: string;
  title: string;
  description: string | null;
  source: string; // 'planned' | 'unplanned'
  is_active: boolean;
}

/** Joined plan_initiatives + initiatives — used by UI */
export interface PlanInitiativeRow {
  plan_initiative_id: string; // plan_initiatives.id
  initiative_id: string;      // initiatives.id
  annual_plan_id: string | null;
  quarterly_plan_id: string | null;
  monthly_plan_id: string | null;
  title: string;
  description: string | null;
  source: string;
  is_active: boolean;
  status: string; // 'planned' | 'in_progress' | 'completed'
}

/** @deprecated Use PlanInitiativeRow instead */
export type QuarterlyInitiativeRow = PlanInitiativeRow;

export interface TaskTemplate {
  id: string;
  title: string;
  content?: string;
}

export interface PlanNode {
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
  /** True if this node represents an initiative, not a procedure */
  isInitiative?: boolean;
  /** Initiative ID (when isInitiative=true) */
  initiativeId?: string;
  /** Initiative source: 'planned' | 'unplanned' */
  initiativeSource?: string;
}

export interface ProcessNode {
  processId: string;
  name: string;
  description?: string | null;
  mission?: string | null;
  expectedResult?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  procedures: PlanNode[];
  totalPlanned: number;
  totalSpent: number;
}
