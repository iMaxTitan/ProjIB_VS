/**
 * Employee report data service.
 *
 * getAvailableEmployeeReports + getAvailablePeriods → employee-report-list.service.ts
 */

import { supabase } from '../../shared/supabase';
import logger from '@/lib/shared/logger';
import { getInfrastructureForPeriod } from '../infrastructure.service';
import { getCompanyShare } from '@/lib/ops/reports/hour-distribution';
import type { HourDistributionType } from '@/types/infrastructure';
import {
  EmployeeReportData,
  CompanyInEmployeeReport,
  ProcessInReport,
  TaskInReport,
  getReportClient,
  fetchTaskCompanyLinks,
  TaskCompanyLinkJoin,
} from './types';

export { getAvailableEmployeeReports, getAvailablePeriods } from './employee-list';

/**
 * Получает данные для ежемесячного отчета по сотруднику
 */
export async function getEmployeeReportData(
  userId: string,
  year: number,
  month: number
): Promise<EmployeeReportData | null> {
  const db = getReportClient();
  type DepartmentRow = { department_id: string; department_name: string | null };
  type PlanProcedureJoin = {
    process_id?: string | null;
    processes?: { process_name?: string | null } | { process_name?: string | null }[] | null;
  };
  type MonthlyPlanRow = {
    monthly_plan_id: string; description: string | null; distribution_type: string | null;
    procedures?: PlanProcedureJoin | PlanProcedureJoin[] | null;
  };
  type TaskRow = {
    daily_task_id: string; monthly_plan_id: string; description: string | null;
    spent_hours: number | null; task_date: string | null; user_id: string | null;
  };

  const { data: profile, error: profileError } = await db
    .from('user_profiles').select('user_id, full_name, email, department_id').eq('user_id', userId).single();
  if (profileError) { logger.error('[MonthlyReport] Error fetching employee report data:', profileError); throw profileError; }
  if (!profile) return null;

  let departmentName = '';
  if (profile.department_id) {
    const { data: department, error: departmentError } = await db
      .from('departments').select('department_id, department_name').eq('department_id', profile.department_id).single();
    if (departmentError) { logger.error('[MonthlyReport] Error fetching employee report data:', departmentError); throw departmentError; }
    departmentName = ((department || null) as DepartmentRow | null)?.department_name || '';
  }

  const { data: plans, error: plansError } = await db
    .from('monthly_plans')
    .select(`monthly_plan_id, description, distribution_type,
      procedures ( process_id, processes ( process_name ) )`)
    .eq('year', year).eq('month', month);
  if (plansError) { logger.error('[MonthlyReport] Error fetching employee report data:', plansError); throw plansError; }
  const typedPlans = (plans || []) as MonthlyPlanRow[];
  if (typedPlans.length === 0) return null;

  const planMap = new Map<string, MonthlyPlanRow>();
  const planIds = typedPlans.map((p) => { planMap.set(p.monthly_plan_id, p); return p.monthly_plan_id; });

  const { data: tasks, error: tasksError } = await db
    .from('daily_tasks')
    .select('daily_task_id, monthly_plan_id, description, spent_hours, task_date, user_id, distribution_type')
    .eq('user_id', userId).in('monthly_plan_id', planIds);
  if (tasksError) { logger.error('[MonthlyReport] Error fetching employee report data:', tasksError); throw tasksError; }
  const typedTasks = (tasks || []) as (TaskRow & { distribution_type: string })[];
  if (typedTasks.length === 0) return null;

  const usedPlanIds = Array.from(new Set(typedTasks.map((t) => t.monthly_plan_id)));
  const taskIds = typedTasks.map(t => t.daily_task_id);
  const taskCompanyRows = await fetchTaskCompanyLinks(db, taskIds, { joinCompanyName: true }) as TaskCompanyLinkJoin[];

  const companiesByTask = new Map<string, { company_id: string; company_name: string }[]>();
  for (const row of taskCompanyRows) {
    const companyRel = Array.isArray(row.companies) ? row.companies[0] : row.companies;
    const list = companiesByTask.get(row.daily_task_id) || [];
    list.push({ company_id: row.company_id, company_name: companyRel?.company_name || 'Без названия' });
    companiesByTask.set(row.daily_task_id, list);
  }

  const infraMap = await getInfrastructureForPeriod(year, month, db);
  const companiesAgg = new Map<string, CompanyInEmployeeReport>();
  const processAgg = new Map<string, ProcessInReport>();
  const taskItems: TaskInReport[] = [];
  let totalHours = 0;

  for (const task of typedTasks) {
    const plan = planMap.get(task.monthly_plan_id);
    const taskCompanies = companiesByTask.get(task.daily_task_id) || [];
    const procedure = Array.isArray(plan?.procedures) ? plan?.procedures[0] : plan?.procedures;
    const processRel = Array.isArray(procedure?.processes) ? procedure?.processes[0] : procedure?.processes;
    const processId = procedure?.process_id || '';
    const processName = processRel?.process_name || '';
    const taskHours = Number(task.spent_hours) || 0;
    totalHours += taskHours;

    const taskCompanyIds = taskCompanies.map(c => c.company_id);
    const distType = ((task as unknown as { distribution_type: string }).distribution_type as HourDistributionType) || 'even';

    for (const company of taskCompanies) {
      const companyShare = getCompanyShare(company.company_id, taskCompanyIds, infraMap, distType);
      const adjustedHours = Math.round(taskHours * companyShare * 100) / 100;
      const current = companiesAgg.get(company.company_id) || { company_id: company.company_id, company_name: company.company_name, hours: 0, tasks_count: 0 };
      current.hours += adjustedHours; current.tasks_count += 1;
      companiesAgg.set(company.company_id, current);
    }

    if (processId && processName) {
      const current = processAgg.get(processId) || { process_id: processId, process_name: processName, hours: 0 };
      current.hours += taskHours; processAgg.set(processId, current);
    }

    taskItems.push({
      task_id: task.daily_task_id, description: task.description || '', spent_hours: taskHours,
      completed_at: task.task_date || '', employee_name: profile.full_name || 'Неизвестно',
      plan_name: plan?.description || '', process_name: processName || undefined,
      company_names: taskCompanies.map((c) => c.company_name),
    });
  }

  companiesAgg.forEach((val) => { val.hours = Math.round(val.hours * 100) / 100; });

  return {
    employee: { user_id: profile.user_id, full_name: profile.full_name || 'Неизвестно', email: profile.email || '', department_id: profile.department_id || '', department_name: departmentName },
    period: { year, month },
    summary: { tasks_count: taskItems.length, total_hours: totalHours, plans_count: usedPlanIds.length },
    companies: Array.from(companiesAgg.values()),
    processes: Array.from(processAgg.values()),
    tasks: taskItems,
  };
}
