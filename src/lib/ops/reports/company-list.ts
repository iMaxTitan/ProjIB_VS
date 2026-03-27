/**
 * Company report list service — available reports query.
 * Extracted from company-report.service.ts.
 */

import logger from '@/lib/shared/logger';
import { type MonthlyReportListItem, getReportClient } from './types';

/**
 * Получает список доступных отчетов по предприятиям
 */
export async function getAvailableCompanyReports(
  year?: number,
  month?: number
): Promise<MonthlyReportListItem[]> {
  type ViewRow = {
    company_id: string;
    year: number;
    month: number;
    procedure_id: string | null;
    distributed_hours: number;
    tasks_count: number;
  };

  const db = getReportClient();

  let viewQuery = db
    .from('v_plan_user_company_hours')
    .select('company_id, year, month, procedure_id, distributed_hours, tasks_count');

  if (year) viewQuery = viewQuery.eq('year', year);
  if (month) viewQuery = viewQuery.eq('month', month);

  const { data: viewRows, error: viewError } = await viewQuery;
  if (viewError) {
    logger.error('[MonthlyReport] Ошибка получения списка отчетов:', viewError);
    throw viewError;
  }

  const typedRows = (viewRows || []) as ViewRow[];
  if (typedRows.length === 0) return [];

  const uniqueCompanyIds = Array.from(new Set(typedRows.map(r => r.company_id)));
  const companyNameMap = new Map<string, string>();
  if (uniqueCompanyIds.length > 0) {
    const { data: companies } = await db
      .from('companies')
      .select('company_id, company_name')
      .in('company_id', uniqueCompanyIds);
    for (const c of (companies || [])) {
      companyNameMap.set(c.company_id as string, (c.company_name as string) || 'Без названия');
    }
  }

  type ProcAgg = { hours: number; tasks: number };
  type CompanyAgg = {
    company_id: string;
    company_name: string;
    period_year: number;
    period_month: number;
    tasks_count: number;
    procedures: Map<string, ProcAgg>;
  };
  const companyAgg = new Map<string, CompanyAgg>();

  for (const row of typedRows) {
    const key = `${row.company_id}-${row.year}-${row.month}`;
    const procedureId = row.procedure_id || 'unknown';
    if (!companyAgg.has(key)) {
      companyAgg.set(key, {
        company_id: row.company_id,
        company_name: companyNameMap.get(row.company_id) || 'Без названия',
        period_year: row.year,
        period_month: row.month,
        tasks_count: 0,
        procedures: new Map(),
      });
    }
    const agg = companyAgg.get(key)!;
    agg.tasks_count += Number(row.tasks_count) || 0;
    const existing = agg.procedures.get(procedureId) || { hours: 0, tasks: 0 };
    existing.hours += Number(row.distributed_hours) || 0;
    existing.tasks += Number(row.tasks_count) || 0;
    agg.procedures.set(procedureId, existing);
  }

  const reports: MonthlyReportListItem[] = [];
  companyAgg.forEach((agg) => {
    let visibleHours = 0;
    agg.procedures.forEach((proc) => {
      const rounded = Math.round(proc.hours * 2) / 2;
      if (rounded >= 0.5) visibleHours += rounded;
    });
    reports.push({
      company_id: agg.company_id,
      company_name: agg.company_name,
      period_year: agg.period_year,
      period_month: agg.period_month,
      tasks_count: agg.tasks_count,
      total_hours: Math.round(visibleHours * 10) / 10,
    });
  });

  return reports.sort((a, b) => {
    if (a.period_year !== b.period_year) return b.period_year - a.period_year;
    if (a.period_month !== b.period_month) return b.period_month - a.period_month;
    return (a.company_name || '').localeCompare(b.company_name || '');
  });
}
