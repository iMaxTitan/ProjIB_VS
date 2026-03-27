/**
 * Employee report list service — available reports and periods queries.
 * Extracted from employee-report.service.ts.
 */

import { supabase } from '../../shared/supabase';
import logger from '@/lib/shared/logger';
import { type MonthlyReportListItem } from './types';

/**
 * Получает список доступных отчетов по сотрудникам
 */
export async function getAvailableEmployeeReports(
  year?: number,
  month?: number,
  departmentId?: string
): Promise<MonthlyReportListItem[]> {
  type MonthlyPlanRow = { monthly_plan_id: string; year: number; month: number };
  type ProfileRow = { user_id: string; full_name: string | null; department_id: string | null };
  type DepartmentRow = { department_id: string; department_name: string | null };

  let plansQuery = supabase
    .from('monthly_plans')
    .select('monthly_plan_id, year, month');

  if (year) plansQuery = plansQuery.eq('year', year);
  if (month) plansQuery = plansQuery.eq('month', month);

  const { data: plans, error: plansError } = await plansQuery;
  if (plansError) {
    logger.error('[MonthlyReport] Ошибка получения списка отчетов:', plansError);
    throw plansError;
  }

  const typedPlans = (plans || []) as MonthlyPlanRow[];
  if (typedPlans.length === 0) return [];

  const planMeta = new Map<string, { year: number; month: number }>();
  const planIds = typedPlans.map((p) => {
    planMeta.set(p.monthly_plan_id, { year: p.year, month: p.month });
    return p.monthly_plan_id;
  });

  type ViewRow = { monthly_plan_id: string; user_id: string; total_spent_hours: number; tasks_count: number };
  const { data: taskAggRows, error: taskAggError } = await supabase
    .from('v_task_hours_by_plan_user')
    .select('monthly_plan_id, user_id, total_spent_hours, tasks_count')
    .in('monthly_plan_id', planIds);

  if (taskAggError) {
    logger.error('[MonthlyReport] Ошибка получения агрегации часов:', taskAggError);
    throw taskAggError;
  }

  const typedTasks = (taskAggRows || []) as ViewRow[];
  const userIds = Array.from(new Set(typedTasks.map((t) => t.user_id).filter(Boolean))) as string[];
  if (userIds.length === 0) return [];

  let profilesQuery = supabase
    .from('user_profiles')
    .select('user_id, full_name, department_id')
    .in('user_id', userIds);
  if (departmentId) profilesQuery = profilesQuery.eq('department_id', departmentId);

  const { data: profiles, error: profilesError } = await profilesQuery;
  if (profilesError) {
    logger.error('[MonthlyReport] Ошибка получения списка отчетов:', profilesError);
    throw profilesError;
  }

  const profileMap = new Map<string, ProfileRow>();
  for (const profile of ((profiles || []) as ProfileRow[])) {
    profileMap.set(profile.user_id, profile);
  }

  const departmentIds = Array.from(
    new Set(((profiles || []) as ProfileRow[]).map((p) => p.department_id).filter(Boolean))
  ) as string[];
  const departmentNameMap = new Map<string, string>();
  if (departmentIds.length > 0) {
    const { data: departments, error: departmentsError } = await supabase
      .from('departments')
      .select('department_id, department_name')
      .in('department_id', departmentIds);
    if (departmentsError) {
      logger.error('[MonthlyReport] Ошибка получения списка отчетов:', departmentsError);
      throw departmentsError;
    }
    for (const department of ((departments || []) as DepartmentRow[])) {
      departmentNameMap.set(department.department_id, department.department_name || '');
    }
  }

  const reports = new Map<string, MonthlyReportListItem>();
  for (const task of typedTasks) {
    if (!task.user_id) continue;
    const profile = profileMap.get(task.user_id);
    if (!profile) continue;
    const period = planMeta.get(task.monthly_plan_id);
    if (!period) continue;
    const key = `${task.user_id}-${period.year}-${period.month}`;
    const existing = reports.get(key);
    if (existing) {
      existing.tasks_count += Number(task.tasks_count) || 0;
      existing.total_hours += Number(task.total_spent_hours) || 0;
      continue;
    }
    reports.set(key, {
      user_id: task.user_id,
      full_name: profile.full_name || 'Неизвестно',
      department_name: profile.department_id ? (departmentNameMap.get(profile.department_id) || '') : '',
      period_year: period.year,
      period_month: period.month,
      tasks_count: Number(task.tasks_count) || 0,
      total_hours: Number(task.total_spent_hours) || 0,
    });
  }

  return Array.from(reports.values()).sort((a, b) => {
    if (a.period_year !== b.period_year) return b.period_year - a.period_year;
    if (a.period_month !== b.period_month) return b.period_month - a.period_month;
    return (a.full_name || '').localeCompare(b.full_name || '');
  });
}

/**
 * Получает список уникальных периодов (год-месяц) с доступными отчетами
 */
export async function getAvailablePeriods(): Promise<{ year: number; month: number }[]> {
  const { data, error } = await supabase
    .from('v_available_periods')
    .select('year, month');

  if (error) {
    logger.error('[MonthlyReport] Ошибка получения периодов:', error);
    return [];
  }

  return (data || []) as { year: number; month: number }[];
}
