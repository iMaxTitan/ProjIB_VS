/**
 * Сервис генерации DOCX-отчетов из шаблонов
 * Использует docxtemplater + pizzip
 */

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import path from 'path';
import fs from 'fs';
import type { CompanyReportData, QuarterlyReportPDFData } from './index';
import { DEFAULT_EXECUTOR, DEFAULT_CONTRACT } from '../contracts';
import logger from '@/lib/shared/logger';

const TEMPLATES_DIR = path.join(process.cwd(), 'templates');

// Українські назви місяців (називний та родовий відмінки)
const MONTHS_UA = [
  'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень',
];
const MONTHS_UA_GEN = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
];

const QUARTER_ROMAN: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

// Template cache with mtime check — auto-reloads when file changes on disk
const templateCache = new Map<string, { buf: Buffer; mtimeMs: number }>();

function loadTemplate(filename: string): Buffer {
  const templatePath = path.join(TEMPLATES_DIR, filename);
  const stat = fs.statSync(templatePath, { throwIfNoEntry: false });
  if (!stat) {
    throw new Error(`Шаблон не знайдено: ${templatePath}`);
  }

  const cached = templateCache.get(filename);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.buf;

  const buf = fs.readFileSync(templatePath);
  templateCache.set(filename, { buf, mtimeMs: stat.mtimeMs });
  return buf;
}

function renderDocx(templateBuffer: Buffer, data: Record<string, unknown>): Buffer {
  try {
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    });
    doc.render(data);
    return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer;
  } catch (error: unknown) {
    logger.error('[DOCX] Template rendering error:', error);
    throw new Error(`Помилка рендерингу шаблону DOCX: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fmtSum(v: number): string {
  return v > 0
    ? v.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '___';
}

/**
 * Генерирует DOCX-отчет по предприятию (Додаток до Акту)
 */
export async function generateCompanyReportDOCX(data: CompanyReportData): Promise<Buffer> {
  const templateBuffer = loadTemplate('company-monthly-report.docx');

  const month = data.period.month;
  const year = data.period.year;
  const monthUA = MONTHS_UA[month - 1];
  const monthGen = MONTHS_UA_GEN[month - 1];
  const lastDay = new Date(year, month, 0).getDate();

  const contractNum = data.company.contract_number || DEFAULT_CONTRACT.number;
  const contractDate = data.company.contract_date || DEFAULT_CONTRACT.date;
  const rate = Number(data.company.rate_per_hour) || 0;
  const totalHours = data.summary.total_hours || 0;
  const sumWithoutVAT = Math.round(totalHours * rate * 100) / 100;
  const vat = Math.round(sumWithoutVAT * 0.2 * 100) / 100;
  const sumWithVAT = Math.round((sumWithoutVAT + vat) * 100) / 100;

  const procedures = (data.procedures || []).map((proc, idx) => ({
    idx: idx + 1,
    procedure_name: proc.service_name || proc.procedure_name || '—',
    responsible_executors: proc.responsible_executors || '—',
    employees_count: proc.employees_count,
    hours: proc.hours.toFixed(2),
    note: proc.note || '—',
  }));

  const templateData = {
    // Header
    act_number: '___',
    act_date: `${lastDay}.${String(month).padStart(2, '0')}.${year}`,
    // Title
    month_ua: monthUA,
    year,
    // Location and date
    last_day: lastDay,
    month_genitive: monthGen,
    // Contract details
    contract_number: contractNum,
    contract_date: contractDate,
    request_day: '01',
    // Sums
    sum_no_vat: fmtSum(sumWithoutVAT),
    vat: fmtSum(vat),
    sum_with_vat: fmtSum(sumWithVAT),
    // Company
    company_name: data.company.company_name,
    company_full_name: data.company.company_full_name || data.company.company_name,
    // Signatures
    customer_director: data.company.director || '___',
    executor_company: DEFAULT_EXECUTOR.name,
    executor_director: '',
    // Table
    procedures,
  };

  logger.log(`[DOCX] Company report: ${data.company.company_name}, procedures: ${procedures.length}`);
  return renderDocx(templateBuffer, templateData);
}

/**
 * Генерирует DOCX квартального отчёта
 */
export async function generateQuarterlyReportDOCX(data: QuarterlyReportPDFData): Promise<Buffer> {
  const templateBuffer = loadTemplate('quarterly-report.docx');

  const plans = data.plans.map((plan, idx) => ({
    idx: idx + 1,
    goal: plan.goal || '',
    department: plan.department_code || plan.department_name || '',
    deadline: plan.deadline || '',
    status: plan.status || '',
    note: plan.ai_note || plan.expected_result || '',
  }));

  const templateData = {
    quarter_roman: QUARTER_ROMAN[data.quarter] || String(data.quarter),
    year: data.year,
    plans,
  };

  logger.log(`[DOCX] Quarterly report: Q${data.quarter} ${data.year}, plans: ${plans.length}`);
  return renderDocx(templateBuffer, templateData);
}
