/**
 * Shared types, client factory and helpers for monthly report services.
 */

import { supabase } from '../../shared/db-client';
import { createClient } from '@/lib/shared/postgrest-client';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';

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

export interface ProcedureInCompanyReport {
  procedure_id: string;
  procedure_name: string;
  service_name?: string;
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
  procedures: ProcedureInCompanyReport[];
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
// Shared client
// =============================================

let serverReportClient: ReturnType<typeof createClient> | null = null;

export function getReportClient() {
  if (typeof window !== 'undefined') return supabase;

  const url = config.db.serverUrl;
  const serviceRoleKey = config.db.serviceRoleKey;
  if (!url || !serviceRoleKey) return supabase;

  if (!serverReportClient) {
    serverReportClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  return serverReportClient;
}

// =============================================
// Batch task-company link fetcher
// =============================================

/**
 * Батчированный запрос daily_task_companies.
 * PostgREST DB Cloud ограничивает max_rows=1000.
 * Разбиваем taskIds на батчи по ~150, чтобы каждый ответ ≤1000 строк
 * (150 tasks × ~6 companies = ~900 строк).
 */
export type TaskCompanyLink = { daily_task_id: string; company_id: string };
export type TaskCompanyLinkJoin = TaskCompanyLink & {
  companies?: { company_name?: string | null } | { company_name?: string | null }[] | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPostgrestClient = { from: (...args: any[]) => any };

export async function fetchTaskCompanyLinks(
  db: AnyPostgrestClient,
  taskIds: string[],
  options?: { joinCompanyName?: boolean },
): Promise<TaskCompanyLink[] | TaskCompanyLinkJoin[]> {
  if (taskIds.length === 0) return [];
  const BATCH = 150;
  const results: (TaskCompanyLink | TaskCompanyLinkJoin)[] = [];
  const selectCols = options?.joinCompanyName
    ? 'daily_task_id, company_id, companies (company_name)'
    : 'daily_task_id, company_id';
  for (let i = 0; i < taskIds.length; i += BATCH) {
    const batch = taskIds.slice(i, i + BATCH);
    const { data, error } = await db
      .from('daily_task_companies')
      .select(selectCols)
      .in('daily_task_id', batch);
    if (error) {
      logger.error('[MonthlyReport] Batch fetch daily_task_companies error:', error);
      throw error;
    }
    if (data) results.push(...(data as unknown as (TaskCompanyLink | TaskCompanyLinkJoin)[]));
  }
  return results;
}

// =============================================
// Форматирующие хелперы
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

// =============================================
// Quarterly report data types (shared with UI)
// =============================================

export type MonthProcessItem = {
  key: string;
  processId: string;
  processName: string;
  scopeId: string;
  scopeName: string;
  activeCount: number;
  completedCount: number;
  tasksCount: number;
  totalHours: number;
  employeesCount?: number;
  capacityHours?: number;
  plannedHours?: number;
  procedureId?: string;
  procedureName?: string;
};

export type MonthPeriodItem = {
  key: string;
  year: number;
  month: number;
  tasksCount: number;
  totalHours: number;
};

export type QuarterlyReportItem = {
  quarterly_id: string;
  annual_plan_id: string;
  quarter: number;
  year: number | null;
  department_id: string;
  department_name: string;
  goal: string;
  expected_result: string;
  status: string;
  process_name: string;
  note: string;
  completion_percentage: number;
  planned_hours_total: number;
  spent_hours_total: number;
};

export type QuarterlyReportGroup = {
  key: string;
  quarter: number;
  year: number;
  plans: QuarterlyReportItem[];
  departments: string[];
  plannedHours: number;
  spentHours: number;
  completionPercentage: number;
};
