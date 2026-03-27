/**
 * Company report data service.
 *
 * getAvailableCompanyReports → company-report-list.service.ts
 */

import logger from '@/lib/shared/logger';
import { getInfrastructureForPeriod } from '../infrastructure.service';
import { getCompanyShare } from '@/lib/ops/reports/hour-distribution';
import type { HourDistributionType } from '@/types/infrastructure';
import {
  CompanyReportData,
  ProcedureInCompanyReport,
  TaskInReport,
  getReportClient,
  fetchTaskCompanyLinks,
  TaskCompanyLink,
} from './types';

export { getAvailableCompanyReports } from './company-list';

/**
 * Получает данные для ежемесячного отчета по предприятию
 */
export async function getCompanyReportData(
  companyId: string,
  year: number,
  month: number
): Promise<CompanyReportData | null> {
  const db = getReportClient();
  type ProcedureJoin = {
    procedure_id?: string | null; name?: string | null; service_name?: string | null;
    process_id?: string | null;
    processes?: { process_name?: string | null } | { process_name?: string | null }[] | null;
  };
  type MonthlyPlanRow = {
    monthly_plan_id: string; procedure_id: string | null; description: string | null;
    distribution_type: string | null; procedures?: ProcedureJoin | ProcedureJoin[] | null;
  };
  type TaskRow = {
    daily_task_id: string; monthly_plan_id: string; user_id: string | null;
    description: string | null; spent_hours: number | null; task_date: string | null;
  };
  type UserProfileRow = { user_id: string; full_name: string | null; department_id: string | null; position: string | null };
  type NoteRow = { procedure_id: string; note: string | null };

  const { data: company, error: companyError } = await db
    .from('companies')
    .select('company_id, company_name, company_full_name, director, contract_number, contract_date, rate_per_hour')
    .eq('company_id', companyId).single();
  if (companyError) { logger.error('[MonthlyReport] Error fetching company report data:', companyError); throw companyError; }
  if (!company) return null;

  const { data: infraSnap } = await db
    .from('company_infrastructure')
    .select('contract_number, rate_per_hour, director, company_full_name')
    .eq('company_id', companyId).eq('period_year', year).eq('period_month', month)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  const contractNumber = infraSnap?.contract_number || company.contract_number || null;
  const contractDate = company.contract_date || null;
  const ratePerHour = infraSnap?.rate_per_hour ?? company.rate_per_hour ?? null;
  const director = infraSnap?.director || company.director || null;
  const companyFullName = infraSnap?.company_full_name || company.company_full_name || null;

  const { data: plans, error: plansError } = await db
    .from('monthly_plans')
    .select(`monthly_plan_id, procedure_id, description, distribution_type,
      procedures ( procedure_id, name, service_name, process_id, processes ( process_name ) )`)
    .eq('year', year).eq('month', month);
  if (plansError) { logger.error('[MonthlyReport] Error fetching company report data:', plansError); throw plansError; }
  const typedPlans = (plans || []) as MonthlyPlanRow[];
  if (typedPlans.length === 0) return null;
  const planIds = typedPlans.map((p) => p.monthly_plan_id);
  const planMap = new Map<string, MonthlyPlanRow>();
  for (const plan of typedPlans) planMap.set(plan.monthly_plan_id, plan);

  type TaskWithDist = TaskRow & { distribution_type: string };
  const { data: tasks, error: tasksError } = await db
    .from('daily_tasks')
    .select('daily_task_id, monthly_plan_id, user_id, description, spent_hours, task_date, distribution_type, daily_task_companies!inner(company_id)')
    .in('monthly_plan_id', planIds).eq('daily_task_companies.company_id', companyId);
  if (tasksError) { logger.error('[MonthlyReport] Error fetching company report data:', tasksError); throw tasksError; }
  const typedTasks = (tasks || []) as TaskWithDist[];
  if (typedTasks.length === 0) return null;
  const filteredTaskIds = typedTasks.map(t => t.daily_task_id);

  const taskCompanies = await fetchTaskCompanyLinks(db, filteredTaskIds) as TaskCompanyLink[];
  const companiesByTask = new Map<string, string[]>();
  for (const row of taskCompanies) {
    const list = companiesByTask.get(row.daily_task_id) || [];
    list.push(row.company_id);
    companiesByTask.set(row.daily_task_id, list);
  }

  const companyPlanIds = Array.from(new Set(typedTasks.map(t => t.monthly_plan_id)));
  const infraMap = await getInfrastructureForPeriod(year, month, db);

  const userIds = Array.from(new Set(typedTasks.map((t) => t.user_id).filter(Boolean))) as string[];
  const userProfileMap = new Map<string, UserProfileRow>();
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await db
      .from('user_profiles').select('user_id, full_name, department_id, position').in('user_id', userIds);
    if (profilesError) { logger.error('[MonthlyReport] Error fetching user profiles:', profilesError); throw profilesError; }
    for (const p of ((profiles || []) as UserProfileRow[])) userProfileMap.set(p.user_id, p);
  }

  const { data: savedNotes } = await db
    .from('company_report_notes').select('procedure_id, note')
    .eq('company_id', companyId).eq('year', year).eq('month', month);
  const notesMap = new Map<string, string>();
  for (const n of ((savedNotes || []) as NoteRow[])) { if (n.note) notesMap.set(n.procedure_id, n.note); }

  interface ProcedureAgg {
    procedure_id: string; procedure_name: string; service_name: string;
    hours: number; userIds: Set<string>; positions: Set<string>;
  }
  const procedureAgg = new Map<string, ProcedureAgg>();
  const processAgg = new Map<string, { process_id: string; process_name: string; hours: number }>();
  const mappedTasks: TaskInReport[] = [];
  let totalHours = 0;

  for (const task of typedTasks) {
    const plan = planMap.get(task.monthly_plan_id);
    const procedureJoin = Array.isArray(plan?.procedures) ? plan?.procedures[0] : plan?.procedures;
    const processRel = Array.isArray(procedureJoin?.processes) ? procedureJoin?.processes[0] : procedureJoin?.processes;
    const procedureId = plan?.procedure_id || procedureJoin?.procedure_id || '';
    const procedureName = procedureJoin?.name || plan?.description || '';
    const serviceName = procedureJoin?.service_name || '';
    const processId = procedureJoin?.process_id || '';
    const processName = processRel?.process_name || '';
    const taskHours = Number(task.spent_hours) || 0;
    const taskCompanyIds = companiesByTask.get(task.daily_task_id) || [];
    const distType = ((task as TaskWithDist).distribution_type as HourDistributionType) || 'even';
    const share = getCompanyShare(companyId, taskCompanyIds, infraMap, distType);
    const adjustedHours = taskHours * share;
    totalHours += adjustedHours;

    const normalizedService = serviceName.trim().replace(/[;.\s]+$/, '');
    const aggKey = normalizedService || procedureId;
    if (aggKey) {
      const current = procedureAgg.get(aggKey) || { procedure_id: procedureId, procedure_name: procedureName, service_name: serviceName, hours: 0, userIds: new Set<string>(), positions: new Set<string>() };
      current.hours += adjustedHours;
      if (task.user_id) { current.userIds.add(task.user_id); const p = userProfileMap.get(task.user_id); if (p?.position) current.positions.add(p.position); }
      procedureAgg.set(aggKey, current);
    }
    if (processId && processName) {
      const cur = processAgg.get(processId) || { process_id: processId, process_name: processName, hours: 0 };
      cur.hours += adjustedHours; processAgg.set(processId, cur);
    }
    mappedTasks.push({
      task_id: task.daily_task_id, description: task.description || '', spent_hours: adjustedHours,
      completed_at: task.task_date || '',
      employee_name: task.user_id ? (userProfileMap.get(task.user_id)?.full_name || 'Неизвестно') : 'Неизвестно',
      plan_name: plan?.description || '', process_name: processName || undefined, company_names: [company.company_name],
    });
  }

  const procedures: ProcedureInCompanyReport[] = [];
  procedureAgg.forEach((agg) => {
    const roundedHours = Math.round(agg.hours * 2) / 2;
    if (roundedHours < 0.5) return;
    procedures.push({
      procedure_id: agg.procedure_id, procedure_name: agg.procedure_name, service_name: agg.service_name || undefined,
      responsible_executors: Array.from(agg.positions).join(', ') || '—',
      employees_count: agg.userIds.size, hours: roundedHours, note: notesMap.get(agg.procedure_id),
    });
  });

  const visibleTotalHours = procedures.reduce((sum, p) => sum + p.hours, 0);
  return {
    company: { company_id: company.company_id, company_name: company.company_name, contract_number: contractNumber, contract_date: contractDate, rate_per_hour: ratePerHour, director, company_full_name: companyFullName },
    period: { year, month },
    summary: { tasks_count: mappedTasks.length, total_hours: Math.round(visibleTotalHours * 10) / 10, employees_count: new Set(typedTasks.map((t) => t.user_id).filter(Boolean)).size, plans_count: companyPlanIds.length },
    procedures, employees: [],
    processes: Array.from(processAgg.values()).map((p) => ({ process_id: p.process_id, process_name: p.process_name, hours: Math.round(p.hours * 100) / 100 })),
    tasks: mappedTasks,
  };
}
