/**
 * Plans V2 — pure computation functions (no DB, no side effects).
 */
import type { MonthlyPlan } from '@/types/planning';
import type { ProcedureKpiRow } from '@/lib/ops/reference-queries';
import type { ProcessNode, TaskTemplate, QuarterlyInitiativeRow } from './plans.types';
import { countNaiveWorkingDays } from '@/lib/ops/working-days';

// ─── Hours map ─────────────────────────────────────────────────

export function buildHoursMap(hoursData: { monthly_plan_id: string; total_spent_hours: number | null; tasks_count: number | null }[]) {
  const m = new Map<string, { spent: number; tasks: number }>();
  for (const h of hoursData) {
    m.set(h.monthly_plan_id, {
      spent: h.total_spent_hours ?? 0,
      tasks: h.tasks_count ?? 0,
    });
  }
  return m;
}

// ─── Scope months ──────────────────────────────────────────────

export function getScopeMonths(month: number | null, quarter: number | null): number[] {
  if (month) return [month];
  if (quarter) return [(quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2, (quarter - 1) * 3 + 3];
  return Array.from({ length: 12 }, (_, i) => i + 1);
}

// ─── Process tree ──────────────────────────────────────────────

interface ProcessRow {
  process_id: string;
  process_name: string;
  description?: string | null;
  mission?: string | null;
  expected_result?: string | null;
  department_id?: string | null;
  department_name?: string | null;
}

interface TemplateRow {
  id: string;
  procedure_id: string;
  title: string;
  content?: string;
}

export function buildProcessTree(
  processes: ProcessRow[],
  procedures: ProcedureKpiRow[],
  templateRows: TemplateRow[],
  scopedPlans: MonthlyPlan[],
  hoursMap: Map<string, { spent: number; tasks: number }>,
  userRole?: string,
  userDepartmentId?: string,
): ProcessNode[] {
  const procMap = new Map<string, ProcedureKpiRow[]>();
  for (const pr of procedures) {
    if (!pr.process_id) continue;
    const list = procMap.get(pr.process_id) || [];
    list.push(pr);
    procMap.set(pr.process_id, list);
  }

  const templatesMap = new Map<string, TaskTemplate[]>();
  for (const t of templateRows) {
    const list = templatesMap.get(t.procedure_id) || [];
    list.push({ id: t.id, title: t.title, content: t.content });
    templatesMap.set(t.procedure_id, list);
  }

  const visibleProcesses = userRole === 'chief'
    ? processes
    : processes.filter(p => p.department_id === userDepartmentId);

  const tree: ProcessNode[] = [];
  for (const proc of visibleProcesses) {
    const procProcedures = procMap.get(proc.process_id) || [];
    if (procProcedures.length === 0) continue;

    const nodes = procProcedures.map(pr => {
      const plans = scopedPlans.filter(p => p.procedure_id === pr.entity_id);
      const planned = plans.reduce((s, p) => s + (p.planned_hours || 0), 0);
      const spent = plans.reduce((s, p) => s + (hoursMap.get(p.monthly_plan_id)?.spent || 0), 0);
      return {
        procedureId: pr.entity_id,
        name: pr.entity_name,
        processId: proc.process_id,
        description: pr.description,
        serviceName: pr.service_name,
        category: pr.category,
        targetValue: pr.target_value,
        targetPeriod: pr.target_period,
        taskTemplates: templatesMap.get(pr.entity_id) || [],
        plannedHours: planned,
        spentHours: spent,
        plans,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'uk'));

    tree.push({
      processId: proc.process_id,
      name: proc.process_name,
      description: proc.description,
      mission: proc.mission,
      expectedResult: proc.expected_result,
      departmentName: proc.department_name,
      procedures: nodes,
      totalPlanned: nodes.reduce((s, n) => s + n.plannedHours, 0),
      totalSpent: nodes.reduce((s, n) => s + n.spentHours, 0),
    });
  }

  return tree.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}

// ─── Resource hours ────────────────────────────────────────────

export function calcResourceHours(
  employees: { work_rate: number }[],
  scopeMonths: number[],
  year: number,
): number {
  if (employees.length === 0) return 0;
  let totalDays = 0;
  for (const m of scopeMonths) totalDays += countNaiveWorkingDays(year, m);
  const totalRate = employees.reduce((s, e) => s + (Number(e.work_rate) || 1), 0);
  return Math.round(totalDays * 8 * totalRate);
}

// ─── Budget maps ───────────────────────────────────────────────

type BudgetEntry = { annual_plan_id: string; amount: number; payment_date: string | null; budget_items: { name: string } | null };

export function buildAnnualBudgetSumMap(budgets: BudgetEntry[]) {
  const m = new Map<string, number>();
  for (const b of budgets) m.set(b.annual_plan_id, (m.get(b.annual_plan_id) || 0) + Number(b.amount));
  return m;
}

export function buildAnnualBudgetNamesMap(budgets: BudgetEntry[]) {
  const m = new Map<string, string[]>();
  for (const b of budgets) {
    if (!b.budget_items?.name) continue;
    let list = m.get(b.annual_plan_id);
    if (!list) { list = []; m.set(b.annual_plan_id, list); }
    if (!list.includes(b.budget_items.name)) list.push(b.budget_items.name);
  }
  return m;
}

export function buildQuarterlyBudgetSumMap(budgets: BudgetEntry[], quarter: number, year: number) {
  const qStart = new Date(year, (quarter - 1) * 3, 1);
  const qEnd = new Date(year, quarter * 3, 0);
  const m = new Map<string, number>();
  for (const b of budgets) {
    if (!b.payment_date) continue;
    const d = new Date(b.payment_date);
    if (d >= qStart && d <= qEnd) m.set(b.annual_plan_id, (m.get(b.annual_plan_id) || 0) + Number(b.amount));
  }
  return m;
}

export function buildQuarterlyBudgetItemsMap(budgets: BudgetEntry[], quarter: number, year: number) {
  const qStart = new Date(year, (quarter - 1) * 3, 1);
  const qEnd = new Date(year, quarter * 3, 0);
  const m = new Map<string, { name: string; amount: number }[]>();
  for (const b of budgets) {
    if (!b.payment_date) continue;
    const d = new Date(b.payment_date);
    if (d >= qStart && d <= qEnd) {
      let list = m.get(b.annual_plan_id);
      if (!list) { list = []; m.set(b.annual_plan_id, list); }
      list.push({ name: b.budget_items?.name || 'Бюджет', amount: Number(b.amount) });
    }
  }
  return m;
}

// ─── Quarterly initiatives map ─────────────────────────────────

export function buildQuarterlyInitiativesMap(initiatives: QuarterlyInitiativeRow[]) {
  const m = new Map<string, QuarterlyInitiativeRow[]>();
  for (const init of initiatives) {
    const list = m.get(init.quarterly_plan_id) || [];
    list.push(init);
    m.set(init.quarterly_plan_id, list);
  }
  return m;
}

// ─── Monthly overview: split raw data into company & user views ─

import type { MonthlyOverviewRow } from './plans.queries';

interface CompanyProcHours { procedureId: string; hours: number }
export interface CompanyHoursRow { companyId: string; companyName: string; hours: number; procedures: CompanyProcHours[] }
export interface UserProcHoursRow { userId: string; procedureId: string; hours: number }

export function buildCompanyHours(raw: MonthlyOverviewRow[], nameMap: Map<string, string>): CompanyHoursRow[] {
  const companyMap = new Map<string, number>();
  const companyProcMap = new Map<string, Map<string, number>>();
  for (const r of raw) {
    const h = Number(r.distributed_hours || 0);
    companyMap.set(r.company_id, (companyMap.get(r.company_id) || 0) + h);
    let procs = companyProcMap.get(r.company_id);
    if (!procs) { procs = new Map(); companyProcMap.set(r.company_id, procs); }
    procs.set(r.procedure_id, (procs.get(r.procedure_id) || 0) + h);
  }
  return [...companyMap.keys()]
    .map(id => ({
      companyId: id,
      companyName: nameMap.get(id) || id,
      hours: Math.round((companyMap.get(id) || 0) * 10) / 10,
      procedures: Array.from(companyProcMap.get(id)?.entries() || [])
        .map(([procId, h]) => ({ procedureId: procId, hours: Math.round(h * 10) / 10 }))
        .sort((a, b) => b.hours - a.hours),
    }))
    .sort((a, b) => b.hours - a.hours);
}

export function buildUserProcHours(raw: MonthlyOverviewRow[]): UserProcHoursRow[] {
  const map = new Map<string, { userId: string; procedureId: string; hours: number }>();
  for (const r of raw) {
    const key = `${r.user_id}::${r.procedure_id}`;
    const existing = map.get(key);
    if (existing) existing.hours += Number(r.distributed_hours || 0);
    else map.set(key, { userId: r.user_id, procedureId: r.procedure_id, hours: Number(r.distributed_hours || 0) });
  }
  return Array.from(map.values()).map(r => ({ ...r, hours: Math.round(r.hours * 10) / 10 }));
}
