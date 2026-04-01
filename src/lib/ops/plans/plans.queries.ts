/**
 * Plans V2 — data access queries (client-side).
 * Each function wraps a single PostgREST query with typed return.
 */
import { supabase as db } from '@/lib/shared/db-client';
import type { MonthlyPlan } from '@/types/planning';
import type {
  AnnualPlanRow, QuarterlyPlanRow, AnnualBudgetRow,
  QuarterlyInitiativeRow,
} from './plans.types';

// ─── Reference / Static ────────────────────────────────────────

export async function fetchBudgetItems() {
  const { data, error } = await db
    .from('budget_items')
    .select('id, name, process_id, budget_categories(name)')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data || []) as { id: string; name: string; process_id: string; budget_categories: { name: string } | null }[];
}

export async function fetchTaskTemplates() {
  const { data, error } = await db
    .from('procedure_task_templates')
    .select('id, procedure_id, title, content')
    .eq('is_active', true)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

export async function fetchActiveEmployees(role?: string, departmentId?: string, userId?: string) {
  let query = db
    .from('user_profiles')
    .select('user_id, work_rate, department_id')
    .eq('status', 'active');
  if (role === 'head') query = query.eq('department_id', departmentId!);
  else if (role === 'employee') query = query.eq('user_id', userId!);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as { user_id: string; work_rate: number; department_id: string }[];
}

// ─── Monthly Plans ─────────────────────────────────────────────

export async function fetchMonthlyPlans(year: number) {
  const { data, error } = await db
    .from('monthly_plans')
    .select('monthly_plan_id, quarterly_id, procedure_id, year, month, status, planned_hours, distribution_type')
    .eq('year', year)
    .order('month');
  if (error) throw error;
  return (data || []) as MonthlyPlan[];
}

export async function fetchMonthlyPlanHours(planIds: string[]) {
  if (planIds.length === 0) return [];
  const { data, error } = await db
    .from('v_monthly_plan_hours')
    .select('monthly_plan_id, total_spent_hours, tasks_count')
    .in('monthly_plan_id', planIds);
  if (error) throw error;
  return data || [];
}

// ─── Annual Plans ──────────────────────────────────────────────

export async function fetchAnnualPlans(year: number) {
  const { data, error } = await db
    .from('annual_plans')
    .select('annual_id, year, process_id, expected_result, goal, budget, status')
    .eq('year', year);
  if (error) throw error;
  return (data || []) as AnnualPlanRow[];
}

export async function fetchAnnualBudgets(annualIds: string[]) {
  if (annualIds.length === 0) return [];
  const { data, error } = await db
    .from('annual_plan_budget')
    .select('annual_plan_id, amount, payment_date, budget_items(name)')
    .in('annual_plan_id', annualIds);
  if (error) throw error;
  return (data || []) as { annual_plan_id: string; amount: number; payment_date: string | null; budget_items: { name: string } | null }[];
}

export async function fetchAnnualBudgetItems(annualId: string) {
  const { data, error } = await db
    .from('annual_plan_budget')
    .select('id, annual_plan_id, budget_item_id, amount, payment_date, reminder_date, budget_items(name, budget_categories(name))')
    .eq('annual_plan_id', annualId);
  if (error) throw error;
  return (data || []) as AnnualBudgetRow[];
}

// ─── Quarterly Plans ───────────────────────────────────────────

export async function fetchQuarterlyPlans(year: number) {
  const { data, error } = await db
    .from('quarterly_plans')
    .select('quarterly_id, year, quarter, process_id, expected_result, goal, note, status')
    .eq('year', year);
  if (error) throw error;
  return (data || []) as QuarterlyPlanRow[];
}

export async function fetchQuarterlyInitiatives(quarterlyIds: string[]) {
  if (quarterlyIds.length === 0) return [];
  const { data, error } = await db
    .from('quarterly_plan_initiatives')
    .select('id, quarterly_plan_id, title, description, status')
    .in('quarterly_plan_id', quarterlyIds);
  if (error) throw error;
  return (data || []) as QuarterlyInitiativeRow[];
}

export async function fetchProcessGoals(processId: string, year: number) {
  const { data, error } = await db
    .from('quarterly_plans')
    .select('quarterly_id, quarter, goal, note, status, annual_plan_id')
    .eq('process_id', processId)
    .eq('year', year)
    .order('quarter');
  if (error) throw error;
  const rows = (data || []) as { quarterly_id: string; quarter: number; goal: string; note: string | null; status: string; annual_plan_id: string }[];
  const annIds = [...new Set(rows.map(r => r.annual_plan_id).filter(Boolean))];
  let annualMap = new Map<string, { goal: string; budget: number }>();
  if (annIds.length > 0) {
    const { data: annuals } = await db
      .from('annual_plans')
      .select('annual_id, goal, budget')
      .in('annual_id', annIds)
      .eq('year', year);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    annualMap = new Map((annuals || []).map((a: any) => [a.annual_id, { goal: a.goal, budget: Number(a.budget) || 0 }]));
  }
  return rows.map(r => ({
    ...r,
    annualGoal: annualMap.get(r.annual_plan_id)?.goal ?? null,
    annualBudget: annualMap.get(r.annual_plan_id)?.budget ?? 0,
  }));
}

// ─── Monthly Overview (single query, split on client) ─────────

export interface MonthlyOverviewRow {
  user_id: string;
  company_id: string;
  procedure_id: string;
  distributed_hours: number;
}

export async function fetchMonthlyOverviewRaw(year: number, month: number): Promise<MonthlyOverviewRow[]> {
  const { data, error } = await db
    .from('v_plan_user_company_hours')
    .select('user_id, company_id, procedure_id, distributed_hours')
    .eq('year', year)
    .eq('month', month);
  if (error) throw error;
  return (data || []) as MonthlyOverviewRow[];
}

export async function fetchCompanyNames(companyIds: string[]) {
  if (companyIds.length === 0) return new Map<string, string>();
  const { data } = await db
    .from('companies')
    .select('company_id, company_name')
    .in('company_id', companyIds);
  return new Map((data || []).map(c => [c.company_id, c.company_name as string]));
}

// ─── Detail: single RPC call replaces 5 separate queries ──────

export interface PlanDetailsResult {
  assignees: { monthly_plan_id: string; user_id: string; assigned_at?: string; full_name?: string; email?: string; photo_url?: string; role?: string; user_status?: string; department_id?: string }[];
  companies: { plan_id: string; company_id: string; company_name: string }[];
  projects: { plan_id: string; project_id: string; project_name: string }[];
  kb_docs: { plan_id: string; kb_document_id: string; title: string }[];
  tasks: { daily_task_id: string; monthly_plan_id: string; user_id: string; task_date: string; title?: string; description?: string; spent_hours: number; source?: string; distribution_type?: string; user_name?: string; user_email?: string; user_photo?: string }[];
}

const EMPTY_DETAILS: PlanDetailsResult = { assignees: [], companies: [], projects: [], kb_docs: [], tasks: [] };

export async function fetchPlanDetails(planIds: string[]): Promise<PlanDetailsResult> {
  if (planIds.length === 0) return EMPTY_DETAILS;
  const { data, error } = await db.rpc('get_plan_details', { p_plan_ids: planIds });
  if (error) throw error;
  return (data as unknown as PlanDetailsResult) || EMPTY_DETAILS;
}
