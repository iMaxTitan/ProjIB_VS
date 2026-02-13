/**
 * Сервис для работы с ежемесячными отчетами
 */

import { supabase } from '../supabase';
import { createClient } from '@supabase/supabase-js';
import logger from '@/lib/logger';
import { getInfrastructureForPeriod } from './infrastructure.service';
import { getCompanyShare } from '@/lib/utils/hour-distribution';
import type { HourDistributionType } from '@/types/infrastructure';

// =============================================
// Типи
// =============================================

export interface CompanyReportSummary {
  tasks_count: number;
  total_hours: number;
  employees_count: number;
  plans_count: number;
}

export interface EmployeeInReport {
  user_id: string;
  full_name: string;
  hours: number;
  department_id?: string;
  department_name?: string;
  position?: string;
}

export interface ProcessInReport {
  process_id: string;
  process_name: string;
  hours: number;
}

export interface TaskInReport {
  task_id: string;
  description: string;
  spent_hours: number;
  completed_at: string;
  employee_name?: string;
  plan_name?: string;
  process_name?: string;
  company_names?: string[];
}

export interface MeasureInCompanyReport {
  measure_id: string;
  measure_name: string;
  responsible_executors: string;
  employees_count: number;
  hours: number;
  note?: string;
}

export interface CompanyReportData {
  company: {
    company_id: string;
    company_name: string;
    contract_number?: string | null;
    contract_date?: string | null;
    rate_per_hour?: number | null;
    director?: string | null;
    company_full_name?: string | null;
  };
  period: {
    year: number;
    month: number;
  };
  summary: CompanyReportSummary;
  measures: MeasureInCompanyReport[];
  employees: EmployeeInReport[];
  processes: ProcessInReport[];
  tasks: TaskInReport[];
}

export interface EmployeeReportSummary {
  tasks_count: number;
  total_hours: number;
  plans_count: number;
}

export interface CompanyInEmployeeReport {
  company_id: string;
  company_name: string;
  hours: number;
  tasks_count: number;
}

export interface EmployeeReportData {
  employee: {
    user_id: string;
    full_name: string;
    email: string;
    department_id: string;
    department_name: string;
  };
  period: {
    year: number;
    month: number;
  };
  summary: EmployeeReportSummary;
  companies: CompanyInEmployeeReport[];
  processes: ProcessInReport[];
  tasks: TaskInReport[];
}

export interface MonthlyReportListItem {
  company_id?: string;
  company_name?: string;
  user_id?: string;
  full_name?: string;
  department_name?: string;
  period_year: number;
  period_month: number;
  tasks_count: number;
  total_hours: number;
}

let serverReportClient: ReturnType<typeof createClient> | null = null;

export function getReportClient() {
  if (typeof window !== 'undefined') return supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return supabase;

  if (!serverReportClient) {
    serverReportClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  return serverReportClient;
}

// =============================================
// API функции
// =============================================

/**
 * Получает данные для ежемесячного отчета по предприятию
 */
export async function getCompanyReportData(
  companyId: string,
  year: number,
  month: number
): Promise<CompanyReportData | null> {
  const db = getReportClient();
  type MeasureJoin = {
    measure_id?: string | null;
    name?: string | null;
    process_id?: string | null;
    processes?: { process_name?: string | null } | { process_name?: string | null }[] | null;
  };
  type MonthlyPlanRow = {
    monthly_plan_id: string;
    measure_id: string | null;
    description: string | null;
    distribution_type: string | null;
    measures?: MeasureJoin | MeasureJoin[] | null;
  };
  type PlanCompanyRow = { monthly_plan_id: string; company_id: string };
  type TaskRow = {
    daily_task_id: string;
    monthly_plan_id: string;
    user_id: string | null;
    description: string | null;
    spent_hours: number | null;
    task_date: string | null;
  };
  type UserProfileRow = {
    user_id: string;
    full_name: string | null;
    department_id: string | null;
  };
  type DepartmentRow = { department_id: string; department_name: string | null };
  type NoteRow = { measure_id: string; note: string | null };

  const { data: company, error: companyError } = await db
    .from('companies')
    .select('company_id, company_name, company_full_name, director, contract_number, contract_date, rate_per_hour')
    .eq('company_id', companyId)
    .single();
  if (companyError) {
    logger.error('[MonthlyReport] Error fetching company report data:', companyError);
    throw companyError;
  }
  if (!company) return null;

  // Снапшот реквизитов из company_infrastructure за период (приоритетнее companies)
  const { data: infraSnap } = await db
    .from('company_infrastructure')
    .select('contract_number, rate_per_hour, director, company_full_name')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const contractNumber = infraSnap?.contract_number || company.contract_number || null;
  const contractDate = company.contract_date || null;
  const ratePerHour = infraSnap?.rate_per_hour ?? company.rate_per_hour ?? null;
  const director = infraSnap?.director || company.director || null;
  const companyFullName = infraSnap?.company_full_name || company.company_full_name || null;

  // Загружаем планы с measure_id + join measures(name)
  const { data: plans, error: plansError } = await db
    .from('monthly_plans')
    .select(`
      monthly_plan_id,
      measure_id,
      description,
      distribution_type,
      measures (
        measure_id,
        name,
        process_id,
        processes (
          process_name
        )
      )
    `)
    .eq('year', year)
    .eq('month', month);
  if (plansError) {
    logger.error('[MonthlyReport] Error fetching company report data:', plansError);
    throw plansError;
  }
  const typedPlans = (plans || []) as MonthlyPlanRow[];
  if (typedPlans.length === 0) return null;
  const planIds = typedPlans.map((p) => p.monthly_plan_id);

  // Загружаем ВСЕ компании для этих планов
  const { data: allPlanCompanies, error: planCompaniesError } = await db
    .from('monthly_plan_companies')
    .select('monthly_plan_id, company_id')
    .in('monthly_plan_id', planIds);
  if (planCompaniesError) {
    logger.error('[MonthlyReport] Error fetching company report data:', planCompaniesError);
    throw planCompaniesError;
  }
  const typedAllPlanCompanies = (allPlanCompanies || []) as PlanCompanyRow[];

  // Определяем планы, к которым привязана целевая компания
  const companyPlanIds = Array.from(new Set(
    typedAllPlanCompanies
      .filter(r => r.company_id === companyId)
      .map(r => r.monthly_plan_id)
  ));
  if (companyPlanIds.length === 0) return null;

  // Группируем компании по планам
  const companiesByPlan = new Map<string, string[]>();
  for (const row of typedAllPlanCompanies) {
    const list = companiesByPlan.get(row.monthly_plan_id) || [];
    list.push(row.company_id);
    companiesByPlan.set(row.monthly_plan_id, list);
  }

  // Загружаем инфраструктуру за период для пропорций (service-role)
  const infraMap = await getInfrastructureForPeriod(year, month, db);

  // Рассчитываем долю целевой компании в каждом плане + маппинг plan→measure
  const planMap = new Map<string, MonthlyPlanRow>();
  const shareByPlan = new Map<string, number>();
  for (const plan of typedPlans) {
    planMap.set(plan.monthly_plan_id, plan);
    if (!companyPlanIds.includes(plan.monthly_plan_id)) continue;

    const planCompanyIds = companiesByPlan.get(plan.monthly_plan_id) || [companyId];
    const distType = (plan.distribution_type as HourDistributionType) || 'even';
    const share = getCompanyShare(companyId, planCompanyIds, infraMap, distType);
    shareByPlan.set(plan.monthly_plan_id, share);
  }

  // Загружаем задачи
  const { data: tasks, error: tasksError } = await db
    .from('daily_tasks')
    .select('daily_task_id, monthly_plan_id, user_id, description, spent_hours, task_date')
    .in('monthly_plan_id', companyPlanIds);
  if (tasksError) {
    logger.error('[MonthlyReport] Error fetching company report data:', tasksError);
    throw tasksError;
  }
  const typedTasks = (tasks || []) as TaskRow[];

  // Загружаем профили сотрудников с department_id
  const userIds = Array.from(new Set(typedTasks.map((t) => t.user_id).filter(Boolean))) as string[];
  const userProfileMap = new Map<string, UserProfileRow>();
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await db
      .from('user_profiles')
      .select('user_id, full_name, department_id')
      .in('user_id', userIds);
    if (profilesError) {
      logger.error('[MonthlyReport] Error fetching user profiles:', profilesError);
      throw profilesError;
    }
    for (const p of ((profiles || []) as UserProfileRow[])) {
      userProfileMap.set(p.user_id, p);
    }
  }

  // Загружаем названия отделов
  const deptIds = Array.from(new Set(
    Array.from(userProfileMap.values()).map(p => p.department_id).filter(Boolean)
  )) as string[];
  const deptNameMap = new Map<string, string>();
  if (deptIds.length > 0) {
    const { data: departments, error: deptError } = await db
      .from('departments')
      .select('department_id, department_name')
      .in('department_id', deptIds);
    if (deptError) {
      logger.error('[MonthlyReport] Error fetching departments:', deptError);
      throw deptError;
    }
    for (const d of ((departments || []) as DepartmentRow[])) {
      deptNameMap.set(d.department_id, d.department_name || '');
    }
  }

  // Загружаем существующие AI-примечания из company_report_notes
  const { data: savedNotes } = await db
    .from('company_report_notes')
    .select('measure_id, note')
    .eq('company_id', companyId)
    .eq('year', year)
    .eq('month', month);
  const notesMap = new Map<string, string>();
  for (const n of ((savedNotes || []) as NoteRow[])) {
    if (n.note) notesMap.set(n.measure_id, n.note);
  }

  // Агрегация по мероприятиям (measure_id)
  interface MeasureAgg {
    measure_id: string;
    measure_name: string;
    hours: number;
    userIds: Set<string>;
    deptNames: Set<string>;
  }
  const measureAgg = new Map<string, MeasureAgg>();
  const processAgg = new Map<string, { process_id: string; process_name: string; hours: number }>();
  const mappedTasks: TaskInReport[] = [];
  let totalHours = 0;

  for (const task of typedTasks) {
    const plan = planMap.get(task.monthly_plan_id);
    const measureJoin = Array.isArray(plan?.measures) ? plan?.measures[0] : plan?.measures;
    const processRel = Array.isArray(measureJoin?.processes) ? measureJoin?.processes[0] : measureJoin?.processes;
    const measureId = plan?.measure_id || measureJoin?.measure_id || '';
    const measureName = measureJoin?.name || plan?.description || '';
    const processId = measureJoin?.process_id || '';
    const processName = processRel?.process_name || '';

    const taskHours = Number(task.spent_hours) || 0;
    const share = shareByPlan.get(task.monthly_plan_id) ?? 1;
    const adjustedHours = Math.round(taskHours * share * 100) / 100;

    totalHours += adjustedHours;

    // Агрегация по measure
    if (measureId) {
      const current = measureAgg.get(measureId) || {
        measure_id: measureId,
        measure_name: measureName,
        hours: 0,
        userIds: new Set<string>(),
        deptNames: new Set<string>(),
      };
      current.hours += adjustedHours;
      if (task.user_id) {
        current.userIds.add(task.user_id);
        const profile = userProfileMap.get(task.user_id);
        if (profile?.department_id) {
          const deptName = deptNameMap.get(profile.department_id);
          if (deptName) current.deptNames.add(deptName);
        }
      }
      measureAgg.set(measureId, current);
    }

    // Агрегация по процессу (для обратной совместимости)
    if (processId && processName) {
      const current = processAgg.get(processId) || { process_id: processId, process_name: processName, hours: 0 };
      current.hours += adjustedHours;
      processAgg.set(processId, current);
    }

    mappedTasks.push({
      task_id: task.daily_task_id,
      description: task.description || '',
      spent_hours: adjustedHours,
      completed_at: task.task_date || '',
      employee_name: task.user_id
        ? (userProfileMap.get(task.user_id)?.full_name || 'Неизвестно')
        : 'Неизвестно',
      plan_name: plan?.description || '',
      process_name: processName || undefined,
      company_names: [company.company_name],
    });
  }

  // Собираем measures[] с notes
  const measures: MeasureInCompanyReport[] = [];
  measureAgg.forEach((agg) => {
    measures.push({
      measure_id: agg.measure_id,
      measure_name: agg.measure_name,
      responsible_executors: Array.from(agg.deptNames).join(', ') || '—',
      employees_count: agg.userIds.size,
      hours: Math.round(agg.hours * 100) / 100,
      note: notesMap.get(agg.measure_id),
    });
  });

  return {
    company: {
      company_id: company.company_id,
      company_name: company.company_name,
      contract_number: contractNumber,
      contract_date: contractDate,
      rate_per_hour: ratePerHour,
      director,
      company_full_name: companyFullName,
    },
    period: { year, month },
    summary: {
      tasks_count: mappedTasks.length,
      total_hours: Math.round(totalHours * 100) / 100,
      employees_count: new Set(typedTasks.map((t) => t.user_id).filter(Boolean)).size,
      plans_count: companyPlanIds.length,
    },
    measures,
    employees: [],
    processes: Array.from(processAgg.values()).map((p) => ({
      process_id: p.process_id,
      process_name: p.process_name,
      hours: Math.round(p.hours * 100) / 100,
    })),
    tasks: mappedTasks,
  };
}

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
  type PlanMeasureJoin = {
    process_id?: string | null;
    processes?: { process_name?: string | null } | { process_name?: string | null }[] | null;
  };
  type MonthlyPlanRow = {
    monthly_plan_id: string;
    description: string | null;
    distribution_type: string | null;
    measures?: PlanMeasureJoin | PlanMeasureJoin[] | null;
  };
  type TaskRow = {
    daily_task_id: string;
    monthly_plan_id: string;
    description: string | null;
    spent_hours: number | null;
    task_date: string | null;
    user_id: string | null;
  };
  type PlanCompanyRow = {
    monthly_plan_id: string;
    company_id: string;
    companies?: { company_name?: string | null } | { company_name?: string | null }[] | null;
  };

  const { data: profile, error: profileError } = await db
    .from('user_profiles')
    .select('user_id, full_name, email, department_id')
    .eq('user_id', userId)
    .single();
  if (profileError) {
    logger.error('[MonthlyReport] Error fetching employee report data:', profileError);
    throw profileError;
  }
  if (!profile) return null;

  let departmentName = '';
  if (profile.department_id) {
    const { data: department, error: departmentError } = await db
      .from('departments')
      .select('department_id, department_name')
      .eq('department_id', profile.department_id)
      .single();
    if (departmentError) {
      logger.error('[MonthlyReport] Error fetching employee report data:', departmentError);
      throw departmentError;
    }
    departmentName = ((department || null) as DepartmentRow | null)?.department_name || '';
  }

  // Загружаем планы с distribution_type
  const { data: plans, error: plansError } = await db
    .from('monthly_plans')
    .select(`
      monthly_plan_id,
      description,
      distribution_type,
      measures (
        process_id,
        processes (
          process_name
        )
      )
    `)
    .eq('year', year)
    .eq('month', month);
  if (plansError) {
    logger.error('[MonthlyReport] Error fetching employee report data:', plansError);
    throw plansError;
  }
  const typedPlans = (plans || []) as MonthlyPlanRow[];
  if (typedPlans.length === 0) return null;

  const planMap = new Map<string, MonthlyPlanRow>();
  const planIds = typedPlans.map((p) => {
    planMap.set(p.monthly_plan_id, p);
    return p.monthly_plan_id;
  });

  const { data: tasks, error: tasksError } = await db
    .from('daily_tasks')
    .select('daily_task_id, monthly_plan_id, description, spent_hours, task_date, user_id')
    .eq('user_id', userId)
    .in('monthly_plan_id', planIds);
  if (tasksError) {
    logger.error('[MonthlyReport] Error fetching employee report data:', tasksError);
    throw tasksError;
  }
  const typedTasks = (tasks || []) as TaskRow[];
  if (typedTasks.length === 0) return null;

  const usedPlanIds = Array.from(new Set(typedTasks.map((t) => t.monthly_plan_id)));

  const { data: planCompanies, error: planCompaniesError } = await db
    .from('monthly_plan_companies')
    .select('monthly_plan_id, company_id, companies (company_name)')
    .in('monthly_plan_id', usedPlanIds);
  if (planCompaniesError) {
    logger.error('[MonthlyReport] Error fetching employee report data:', planCompaniesError);
    throw planCompaniesError;
  }

  const planCompaniesMap = new Map<string, { company_id: string; company_name: string }[]>();
  for (const row of ((planCompanies || []) as PlanCompanyRow[])) {
    const companyRel = Array.isArray(row.companies) ? row.companies[0] : row.companies;
    const list = planCompaniesMap.get(row.monthly_plan_id) || [];
    list.push({
      company_id: row.company_id,
      company_name: companyRel?.company_name || 'Без названия',
    });
    planCompaniesMap.set(row.monthly_plan_id, list);
  }

  // Загружаем инфраструктуру за период для пропорциональных долей (service-role)
  const infraMap = await getInfrastructureForPeriod(year, month, db);

  // Рассчитываем доли для каждого плана → Map<planId, Map<companyId, share>>
  const sharesByPlan = new Map<string, Map<string, number>>();
  for (const planId of usedPlanIds) {
    const plan = planMap.get(planId);
    const planCompanyList = planCompaniesMap.get(planId) || [];
    const companyIds = planCompanyList.map(c => c.company_id);
    const distType = (plan?.distribution_type as HourDistributionType) || 'even';

    const sharesMap = new Map<string, number>();
    if (companyIds.length > 0) {
      // Используем getCompanyShare для каждой компании плана
      for (const cId of companyIds) {
        sharesMap.set(cId, getCompanyShare(cId, companyIds, infraMap, distType));
      }
    }
    sharesByPlan.set(planId, sharesMap);
  }

  const companiesAgg = new Map<string, CompanyInEmployeeReport>();
  const processAgg = new Map<string, ProcessInReport>();
  const taskItems: TaskInReport[] = [];
  let totalHours = 0;

  for (const task of typedTasks) {
    const plan = planMap.get(task.monthly_plan_id);
    const companies = planCompaniesMap.get(task.monthly_plan_id) || [];
    const measure = Array.isArray(plan?.measures) ? plan?.measures[0] : plan?.measures;
    const processRel = Array.isArray(measure?.processes) ? measure?.processes[0] : measure?.processes;
    const processId = measure?.process_id || '';
    const processName = processRel?.process_name || '';
    const taskHours = Number(task.spent_hours) || 0;
    totalHours += taskHours;

    const shares = sharesByPlan.get(task.monthly_plan_id);

    // Пропорциональное распределение часов по компаниям
    for (const company of companies) {
      const companyShare = shares?.get(company.company_id) ?? (companies.length > 0 ? 1 / companies.length : 1);
      const adjustedHours = Math.round(taskHours * companyShare * 100) / 100;

      const current = companiesAgg.get(company.company_id) || {
        company_id: company.company_id,
        company_name: company.company_name,
        hours: 0,
        tasks_count: 0,
      };
      current.hours += adjustedHours;
      current.tasks_count += 1;
      companiesAgg.set(company.company_id, current);
    }

    if (processId && processName) {
      const current = processAgg.get(processId) || {
        process_id: processId,
        process_name: processName,
        hours: 0,
      };
      current.hours += taskHours;
      processAgg.set(processId, current);
    }

    taskItems.push({
      task_id: task.daily_task_id,
      description: task.description || '',
      spent_hours: taskHours,
      completed_at: task.task_date || '',
      employee_name: profile.full_name || 'Неизвестно',
      plan_name: plan?.description || '',
      process_name: processName || undefined,
      company_names: companies.map((c) => c.company_name),
    });
  }

  // Округляем часы в агрегациях
  companiesAgg.forEach((val) => {
    val.hours = Math.round(val.hours * 100) / 100;
  });

  return {
    employee: {
      user_id: profile.user_id,
      full_name: profile.full_name || 'Неизвестно',
      email: profile.email || '',
      department_id: profile.department_id || '',
      department_name: departmentName,
    },
    period: { year, month },
    summary: {
      tasks_count: taskItems.length,
      total_hours: totalHours,
      plans_count: usedPlanIds.length,
    },
    companies: Array.from(companiesAgg.values()),
    processes: Array.from(processAgg.values()),
    tasks: taskItems,
  };
}

/**
 * Получает список доступных отчетов по предприятиям
 */
export async function getAvailableCompanyReports(
  year?: number,
  month?: number
): Promise<MonthlyReportListItem[]> {
  type MonthlyPlanRow = { monthly_plan_id: string; year: number; month: number; distribution_type: string | null };
  type CompanyJoin = { company_name?: string | null };
  type PlanCompanyRow = {
    monthly_plan_id: string;
    company_id: string;
    companies?: CompanyJoin | CompanyJoin[] | null;
  };
  type TaskRow = { monthly_plan_id: string; spent_hours: number | null };

  let plansQuery = supabase
    .from('monthly_plans')
    .select('monthly_plan_id, year, month, distribution_type');

  if (year) plansQuery = plansQuery.eq('year', year);
  if (month) plansQuery = plansQuery.eq('month', month);

  const { data: plans, error: plansError } = await plansQuery;
  if (plansError) {
    logger.error('[MonthlyReport] Ошибка получения списка отчетов:', plansError);
    throw plansError;
  }

  const typedPlans = (plans || []) as MonthlyPlanRow[];
  if (typedPlans.length === 0) return [];

  const planMeta = new Map<string, MonthlyPlanRow>();
  const planIds = typedPlans.map((p) => {
    planMeta.set(p.monthly_plan_id, p);
    return p.monthly_plan_id;
  });

  const { data: planCompanies, error: companiesError } = await supabase
    .from('monthly_plan_companies')
    .select('monthly_plan_id, company_id, companies (company_name)')
    .in('monthly_plan_id', planIds);

  if (companiesError) {
    logger.error('[MonthlyReport] Ошибка получения списка отчетов:', companiesError);
    throw companiesError;
  }

  // Paginate to bypass Supabase max_rows=1000 limit
  const tasksByPlan = new Map<string, { tasks: number; hours: number }>();
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data: tasks, error: tasksError } = await supabase
      .from('daily_tasks')
      .select('monthly_plan_id, spent_hours')
      .in('monthly_plan_id', planIds)
      .range(offset, offset + PAGE - 1);

    if (tasksError) {
      logger.error('[MonthlyReport] Ошибка получения списка отчетов:', tasksError);
      throw tasksError;
    }

    if (!tasks || tasks.length === 0) break;

    for (const row of (tasks as TaskRow[])) {
      const current = tasksByPlan.get(row.monthly_plan_id) || { tasks: 0, hours: 0 };
      current.tasks += 1;
      current.hours += Number(row.spent_hours) || 0;
      tasksByPlan.set(row.monthly_plan_id, current);
    }

    if (tasks.length < PAGE) break;
    offset += PAGE;
  }

  // Группируем компании по планам (для расчёта долей)
  const companiesByPlan = new Map<string, PlanCompanyRow[]>();
  for (const row of ((planCompanies || []) as PlanCompanyRow[])) {
    const list = companiesByPlan.get(row.monthly_plan_id) || [];
    list.push(row);
    companiesByPlan.set(row.monthly_plan_id, list);
  }

  // Загружаем инфраструктуру для уникальных периодов
  const periods = new Set<string>();
  typedPlans.forEach((p) => periods.add(`${p.year}-${p.month}`));
  const infraByPeriod = new Map<string, Awaited<ReturnType<typeof getInfrastructureForPeriod>>>();
  for (const periodKey of Array.from(periods)) {
    const [y, m] = periodKey.split('-').map(Number);
    infraByPeriod.set(periodKey, await getInfrastructureForPeriod(y, m));
  }

  const reports = new Map<string, MonthlyReportListItem>();

  // Для каждого плана считаем долю каждой компании
  for (const [planId, rows] of Array.from(companiesByPlan.entries())) {
    const plan = planMeta.get(planId);
    if (!plan) continue;

    const stats = tasksByPlan.get(planId) || { tasks: 0, hours: 0 };
    const distType = (plan.distribution_type as HourDistributionType) || 'even';
    const infraMap = infraByPeriod.get(`${plan.year}-${plan.month}`);
    const companyIds = rows.map(r => r.company_id);

    for (const row of rows) {
      const companyRel = Array.isArray(row.companies) ? row.companies[0] : row.companies;
      const companyName = companyRel?.company_name || 'Без названия';
      const share = infraMap
        ? getCompanyShare(row.company_id, companyIds, infraMap, distType)
        : (companyIds.length > 0 ? 1 / companyIds.length : 1);

      const adjustedHours = Math.round(stats.hours * share * 100) / 100;
      const key = `${row.company_id}-${plan.year}-${plan.month}`;
      const existing = reports.get(key);

      if (existing) {
        existing.tasks_count += stats.tasks;
        existing.total_hours += adjustedHours;
        continue;
      }

      reports.set(key, {
        company_id: row.company_id,
        company_name: companyName,
        period_year: plan.year,
        period_month: plan.month,
        tasks_count: stats.tasks,
        total_hours: adjustedHours,
      });
    }
  }

  // Округляем итоговые часы
  reports.forEach((r) => {
    r.total_hours = Math.round(r.total_hours * 100) / 100;
  });

  return Array.from(reports.values()).sort((a, b) => {
    if (a.period_year !== b.period_year) return b.period_year - a.period_year;
    if (a.period_month !== b.period_month) return b.period_month - a.period_month;
    return (a.company_name || '').localeCompare(b.company_name || '');
  });
}

/**
 * Получает список доступных отчетов по сотрудникам
 */
export async function getAvailableEmployeeReports(
  year?: number,
  month?: number,
  departmentId?: string
): Promise<MonthlyReportListItem[]> {
  type MonthlyPlanRow = { monthly_plan_id: string; year: number; month: number };
  type TaskRow = { monthly_plan_id: string; user_id: string | null; spent_hours: number | null };
  type ProfileRow = {
    user_id: string;
    full_name: string | null;
    department_id: string | null;
  };
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

  // Paginate to bypass Supabase max_rows=1000 limit
  const typedTasks: TaskRow[] = [];
  {
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data: tasks, error: tasksError } = await supabase
        .from('daily_tasks')
        .select('monthly_plan_id, user_id, spent_hours')
        .in('monthly_plan_id', planIds)
        .range(offset, offset + PAGE - 1);

      if (tasksError) {
        logger.error('[MonthlyReport] Ошибка получения списка отчетов:', tasksError);
        throw tasksError;
      }

      if (!tasks || tasks.length === 0) break;
      typedTasks.push(...(tasks as TaskRow[]));
      if (tasks.length < PAGE) break;
      offset += PAGE;
    }
  }
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
      existing.tasks_count += 1;
      existing.total_hours += Number(task.spent_hours) || 0;
      continue;
    }

    reports.set(key, {
      user_id: task.user_id,
      full_name: profile.full_name || 'Неизвестно',
      department_name: profile.department_id ? (departmentNameMap.get(profile.department_id) || '') : '',
      period_year: period.year,
      period_month: period.month,
      tasks_count: 1,
      total_hours: Number(task.spent_hours) || 0,
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
    .from('monthly_plans')
    .select('year, month')
    .order('year', { ascending: false })
    .order('month', { ascending: false });

  if (error) {
    logger.error('[MonthlyReport] Ошибка получения периодов:', error);
    return [];
  }

  // Уникальные периоды
  const uniquePeriods = new Map<string, { year: number; month: number }>();
  for (const row of data || []) {
    const key = `${row.year}-${row.month}`;
    if (!uniquePeriods.has(key)) {
      uniquePeriods.set(key, { year: row.year, month: row.month });
    }
  }

  return Array.from(uniquePeriods.values());
}

// =============================================
// Квартальный план PDF
// =============================================

export interface QuarterlyPlanPDFRow {
  goal: string;
  expected_result: string;
  department_name: string;
  department_code: string | null;
}

export interface QuarterlyPlanPDFData {
  year: number;
  quarter: number;
  plans: QuarterlyPlanPDFRow[];
}

type QuarterlyPlanReportRow = {
  goal: string | null;
  expected_result: string | null;
  department_id: string | null;
  departments?: { department_name?: string | null } | { department_name?: string | null }[] | null;
};

/**
 * Получает данные для генерации PDF квартального плана.
 * Объединяет ВСЕ квартальные планы за указанный год и квартал
 * (из всех годовых планов этого года).
 * Включает только планы со статусом approved или active.
 */
export async function getQuarterlyPlanReportData(
  year: number,
  quarter: number
): Promise<QuarterlyPlanPDFData | null> {
  const db = getReportClient();
  // 1. Находим все годовые планы за указанный год
  const { data: annualPlans, error: annualError } = await db
    .from('annual_plans')
    .select('annual_id')
    .eq('year', year);

  if (annualError) {
    logger.error('[QuarterlyPlanReport] Ошибка загрузки годовых планов:', annualError);
    return null;
  }

  if (!annualPlans || annualPlans.length === 0) {
    logger.error('[QuarterlyPlanReport] Годовые планы за', year, 'не найдены');
    return null;
  }

  const annualIds = annualPlans.map(a => a.annual_id);

  // 2. Загружаем ВСЕ квартальные планы за этот квартал из всех годовых планов
  const { data: plans, error: plansError } = await db
    .from('quarterly_plans')
    .select(`
      quarterly_id,
      goal,
      expected_result,
      department_id,
      status,
      departments (department_name)
    `)
    .in('annual_plan_id', annualIds)
    .eq('quarter', quarter)
    .in('status', ['approved', 'active'])
    .order('quarterly_id', { ascending: true });

  if (plansError) {
    logger.error('[QuarterlyPlanReport] Ошибка загрузки планов:', plansError);
    throw plansError;
  }

  if (!plans || plans.length === 0) {
    return null;
  }

  const typedPlans = (plans || []) as QuarterlyPlanReportRow[];

  // 3. Получаем коды отделов (СМУР, ОКБ, СВК)
  const deptIds = Array.from(new Set(typedPlans.map(p => p.department_id).filter(Boolean)));
  let deptCodeMap = new Map<string, string>();

  if (deptIds.length > 0) {
    const { data: departments } = await db
      .from('departments')
      .select('department_id, department_code')
      .in('department_id', deptIds);

    deptCodeMap = new Map(
      (departments || [])
        .filter(d => d.department_code)
        .map(d => [d.department_id, d.department_code])
    );
  }

  return {
    year,
    quarter,
    plans: typedPlans.map(p => ({
      goal: p.goal || '',
      expected_result: p.expected_result || '',
      department_name: (Array.isArray(p.departments) ? p.departments[0]?.department_name : p.departments?.department_name) || '',
      department_code: (p.department_id && deptCodeMap.get(p.department_id)) || null,
    })),
  };
}

// =============================================
// Квартальный ОТЧЁТ PDF
// =============================================

export interface QuarterlyReportPDFRow {
  quarterly_id: string;
  goal: string;
  expected_result: string;
  department_name: string;
  department_code: string | null;
  deadline: string;
  status: string;
  ai_note?: string;
}

export interface QuarterlyReportPDFData {
  year: number;
  quarter: number;
  plans: QuarterlyReportPDFRow[];
}

/** Маппинг статусов на украинский */
const STATUS_UA: Record<string, string> = {
  completed: 'Виконано',
  active: 'В роботі',
  approved: 'Затверджено',
  failed: 'Не виконано',
  returned: 'Повернено',
  draft: 'Чернетка',
  submitted: 'На розгляді',
};

type QuarterlyReportQueryRow = {
  quarterly_id: string;
  goal: string | null;
  expected_result: string | null;
  department_id: string | null;
  status: string | null;
  note: string | null;
  departments?: { department_name?: string | null } | { department_name?: string | null }[] | null;
};

/**
 * Получает данные для генерации PDF квартального ОТЧЁТА.
 * Включает планы со статусом completed, active, approved, failed.
 */
export async function getQuarterlyReportData(
  year: number,
  quarter: number
): Promise<QuarterlyReportPDFData | null> {
  const db = getReportClient();

  const { data: annualPlans, error: annualError } = await db
    .from('annual_plans')
    .select('annual_id')
    .eq('year', year);

  if (annualError) {
    logger.error('[QuarterlyReport] Ошибка загрузки годовых планов:', annualError);
    return null;
  }

  if (!annualPlans || annualPlans.length === 0) {
    logger.error('[QuarterlyReport] Годовые планы за', year, 'не найдены');
    return null;
  }

  const annualIds = annualPlans.map(a => a.annual_id);

  const { data: plans, error: plansError } = await db
    .from('quarterly_plans')
    .select(`
      quarterly_id,
      goal,
      expected_result,
      department_id,
      status,
      note,
      departments (department_name)
    `)
    .in('annual_plan_id', annualIds)
    .eq('quarter', quarter)
    .in('status', ['completed', 'active', 'approved', 'failed'])
    .order('quarterly_id', { ascending: true });

  if (plansError) {
    logger.error('[QuarterlyReport] Ошибка загрузки планов:', plansError);
    throw plansError;
  }

  if (!plans || plans.length === 0) {
    return null;
  }

  const typedPlans = (plans || []) as QuarterlyReportQueryRow[];

  // Получаем коды отделов
  const deptIds = Array.from(new Set(typedPlans.map(p => p.department_id).filter(Boolean)));
  let deptCodeMap = new Map<string, string>();

  if (deptIds.length > 0) {
    const { data: departments } = await db
      .from('departments')
      .select('department_id, department_code')
      .in('department_id', deptIds);

    deptCodeMap = new Map(
      (departments || [])
        .filter(d => d.department_code)
        .map(d => [d.department_id, d.department_code])
    );
  }

  // Плановый срок: 19-е число последнего месяца квартала
  const lastMonth = quarter * 3;
  const deadline = `19.${String(lastMonth).padStart(2, '0')}.${year}`;

  return {
    year,
    quarter,
    plans: typedPlans.map(p => ({
      quarterly_id: p.quarterly_id,
      goal: p.goal || '',
      expected_result: p.expected_result || '',
      department_name: (Array.isArray(p.departments) ? p.departments[0]?.department_name : p.departments?.department_name) || '',
      department_code: (p.department_id && deptCodeMap.get(p.department_id)) || null,
      deadline,
      status: STATUS_UA[p.status || ''] || p.status || '',
      ai_note: p.note || undefined,
    })),
  };
}

// =============================================
// Вспомогательные функции
// =============================================

/**
 * Русские названия месяцев (имя константы оставлено для совместимости)
 */
export const MONTH_NAMES_UK = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

/**
 * Форматирует период как строку
 */
export function formatPeriod(year: number, month: number): string {
  return `${MONTH_NAMES_UK[month - 1]} ${year}`;
}

/**
 * Форматирует часы с правильным склонением
 */
export function formatHours(hours: number): string {
  const h = Math.round(hours * 10) / 10;
  if (h === 1) return `${h} година`;
  if (h >= 2 && h <= 4) return `${h} години`;
  return `${h} годин`;
}

