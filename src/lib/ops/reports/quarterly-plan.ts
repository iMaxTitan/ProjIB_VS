/**
 * Quarterly plan and report PDF data service.
 */

import logger from '@/lib/shared/logger';
import { getReportClient } from './types';

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
  departments?: { department_name?: string | null; department_code?: string | null } | { department_name?: string | null; department_code?: string | null }[] | null;
};

/**
 * Получает данные для генерации PDF квартального плана.
 * Объединяет ВСЕ квартальные планы за указанный год и квартал
 * (из всех годовых планов этого года).
 * Включает только планы со статусом approved или active.
 */
export async function getQuarterlyPlanReportData(
  year: number,
  quarter: number,
  departmentId?: string
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

  // 2. Загружаем квартальные планы за этот квартал (с опциональной фильтрацией по отделу)
  let plansQuery = db
    .from('quarterly_plans')
    .select(`
      quarterly_id,
      goal,
      expected_result,
      department_id,
      status,
      departments (department_name, department_code)
    `)
    .in('annual_plan_id', annualIds)
    .eq('quarter', quarter)
    .in('status', ['approved', 'active'])
    .order('quarterly_id', { ascending: true });

  if (departmentId) {
    plansQuery = plansQuery.eq('department_id', departmentId);
  }

  const { data: plans, error: plansError } = await plansQuery;

  if (plansError) {
    logger.error('[QuarterlyPlanReport] Ошибка загрузки планов:', plansError);
    throw plansError;
  }

  if (!plans || plans.length === 0) {
    return null;
  }

  const typedPlans = (plans || []) as QuarterlyPlanReportRow[];

  return {
    year,
    quarter,
    plans: typedPlans.map(p => {
      const dept = Array.isArray(p.departments) ? p.departments[0] : p.departments;
      return {
        goal: p.goal || '',
        expected_result: p.expected_result || '',
        department_name: dept?.department_name || '',
        department_code: dept?.department_code || null,
      };
    }),
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
  quarter: number,
  departmentId?: string
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

  let plansQuery = db
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

  if (departmentId) {
    plansQuery = plansQuery.eq('department_id', departmentId);
  }

  const { data: plans, error: plansError } = await plansQuery;

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
