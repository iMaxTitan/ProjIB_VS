/**
 * Сервис для работы с ежемесячными отчетами
 */

import { supabase } from '../supabase';
import logger from '@/lib/logger';

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

export interface CompanyReportData {
  company: {
    company_id: string;
    company_name: string;
  };
  period: {
    year: number;
    month: number;
  };
  summary: CompanyReportSummary;
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
  const { data, error } = await supabase
    .rpc('get_company_report_data', {
      p_company_id: companyId,
      p_year: year,
      p_month: month
    });

  if (error) {
    logger.error('[MonthlyReport] Ошибка получения данных по предприятию:', error);
    throw error;
  }

  return data as CompanyReportData;
}

/**
 * Получает данные для ежемесячного отчета по сотруднику
 */
export async function getEmployeeReportData(
  userId: string,
  year: number,
  month: number
): Promise<EmployeeReportData | null> {
  const { data, error } = await supabase
    .rpc('get_employee_report_data', {
      p_user_id: userId,
      p_year: year,
      p_month: month
    });

  if (error) {
    logger.error('[MonthlyReport] Ошибка получения данных по сотруднику:', error);
    throw error;
  }

  return data as EmployeeReportData;
}

/**
 * Получает список доступных отчетов по предприятиям
 */
export async function getAvailableCompanyReports(
  year?: number,
  month?: number
): Promise<MonthlyReportListItem[]> {
  let query = supabase
    .from('v_monthly_company_report')
    .select('company_id, company_name, period_year, period_month, tasks_count, total_hours')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .order('company_name');

  if (year) {
    query = query.eq('period_year', year);
  }
  if (month) {
    query = query.eq('period_month', month);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[MonthlyReport] Ошибка получения списка отчетов:', error);
    throw error;
  }

  return data || [];
}

/**
 * Получает список доступных отчетов по сотрудникам
 */
export async function getAvailableEmployeeReports(
  year?: number,
  month?: number,
  departmentId?: string
): Promise<MonthlyReportListItem[]> {
  let query = supabase
    .from('v_monthly_employee_report')
    .select('user_id, full_name, department_name, period_year, period_month, tasks_count, total_hours')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .order('full_name');

  if (year) {
    query = query.eq('period_year', year);
  }
  if (month) {
    query = query.eq('period_month', month);
  }
  if (departmentId) {
    query = query.eq('department_id', departmentId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[MonthlyReport] Ошибка получения списка отчетов:', error);
    throw error;
  }

  return data || [];
}

/**
 * Получает список уникальных периодов (год-месяц) с доступными отчетами
 */
export async function getAvailablePeriods(): Promise<{ year: number; month: number }[]> {
  const { data, error } = await supabase
    .from('v_monthly_company_report')
    .select('period_year, period_month')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });

  if (error) {
    logger.error('[MonthlyReport] Ошибка получения периодов:', error);
    return [];
  }

  // Уникальные периоды
  const uniquePeriods = new Map<string, { year: number; month: number }>();
  for (const row of data || []) {
    const key = `${row.period_year}-${row.period_month}`;
    if (!uniquePeriods.has(key)) {
      uniquePeriods.set(key, { year: row.period_year, month: row.period_month });
    }
  }

  return Array.from(uniquePeriods.values());
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

