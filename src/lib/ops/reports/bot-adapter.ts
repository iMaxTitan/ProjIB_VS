/**
 * Reports bot adapter — describes how Reports integrates with the bot.
 * Exports: getEmployeeReportTool, generateReportTool, generateQuarterlyTool
 */

import type { BotTool, ToolContext, FormattedResult, DocumentResult } from '@/lib/bot/core/types';
import { getEmployeeReportData, getCompanyReportData, getQuarterlyPlanReportData, getQuarterlyReportData } from '@/lib/ops';
import { generateCompanyReportDOCX, generateQuarterlyReportDOCX } from '@/lib/ops/reports/docx';
import { generateQuarterlyPlanPDF } from '@/lib/ops/reports/pdf';
import { findBestMatch } from '@/lib/bot/shared/fuzzy-match';

const MONTHS_UA = [
  'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень',
];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatHours(h: number): string {
  return h % 1 === 0 ? String(h) : h.toFixed(1);
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Zа-яА-ЯіІїЇєЄґҐёЁ0-9\s_\-().]/g, '').trim();
}

// ─── get_employee_report ──────────────────────────────────────────────────────

interface EmployeeRow {
  user_id: string;
  full_name: string | null;
  department_id: string | null;
}

function buildFormattedReport(
  data: NonNullable<Awaited<ReturnType<typeof getEmployeeReportData>>>,
  year: number,
  month: number,
): string {
  const monthName = MONTHS_UA[month - 1];
  const { summary, companies, processes, employee } = data;
  const lines: string[] = [];

  lines.push(`📊 <b>${esc(employee.full_name)}</b>`);
  lines.push(`📅 ${monthName} ${year} · ${esc(employee.department_name)}`);
  lines.push('');
  lines.push(`📋 <b>Підсумок</b>`);
  lines.push(`  Задач: <b>${summary.tasks_count}</b>  ·  Годин: <b>${formatHours(summary.total_hours)}</b>  ·  Планів: <b>${summary.plans_count}</b>`);
  lines.push('');

  if (companies.length > 0) {
    lines.push(`🏢 <b>Компанії</b>`);
    for (const c of [...companies].sort((a, b) => b.hours - a.hours)) {
      lines.push(`  ${c.hours > 0 ? '▓' : '░'} ${esc(c.company_name)} — <b>${formatHours(c.hours)}</b> год · ${c.tasks_count} зад.`);
    }
    lines.push('');
  }

  if (processes.length > 0) {
    lines.push(`📂 <b>Процеси</b>`);
    for (const p of [...processes].sort((a, b) => b.hours - a.hours)) {
      lines.push(`  ▸ ${esc(p.process_name)} — <b>${formatHours(p.hours)}</b> год`);
    }
  }

  return lines.join('\n');
}

export const getEmployeeReportTool: BotTool = {
  name: 'get_employee_report',
  label: 'Звіт (текст)',
  description: 'Текстовий звіт по співробітнику за місяць: години, компанії, процеси. Для свого звіту — не вказувати ПІБ.',
  supportedScopes: ['own', 'department', 'all'],
  parameters: {
    type: 'object',
    properties: {
      employeeName: { type: 'string', description: 'ПІБ співробітника (повне або часткове). Для свого звіту можна не вказувати.' },
      year: { type: 'number', description: 'Рік (за замовчуванням — поточний)' },
      month: { type: 'number', description: 'Місяць 1-12 (за замовчуванням — поточний)' },
    },
    required: [],
  },
  directCommand: { buttonLabel: '📄 Мій звіт', args: {} },

  async execute(args, ctx: ToolContext): Promise<FormattedResult | { error: string }> {
    const employeeName = (args.employeeName as string || '').trim();
    const year = (args.year as number) || new Date().getFullYear();
    let month = (args.month as number) || (new Date().getMonth() + 1);
    if (month < 1 || month > 12) month = new Date().getMonth() + 1;

    let targetUserId: string;
    let targetName: string;

    if (ctx.scope === 'own' || !employeeName) {
      targetUserId = ctx.userId;
      targetName = ctx.fullName;
    } else {
      let query = ctx.db.from('user_profiles').select('user_id, full_name, department_id').eq('status', 'active');
      if (ctx.scope === 'department' && ctx.departmentId) query = query.eq('department_id', ctx.departmentId);

      const { data: employees } = await query;
      if (!employees?.length) return { error: 'Не знайдено жодного співробітника' };

      const match = findBestMatch<EmployeeRow>(employees as EmployeeRow[], employeeName, [e => e.full_name]);
      if (!match) {
        return { error: `Співробітника "${employeeName}" не знайдено. Доступні: ${employees.map(e => e.full_name).filter(Boolean).join(', ')}` };
      }

      targetUserId = match.user_id;
      targetName = match.full_name || 'Невідомий';
    }

    const data = await getEmployeeReportData(targetUserId, year, month);
    if (!data) return { error: `Немає даних: ${targetName}, ${month}/${year}` };

    return { __type: 'formatted', text: buildFormattedReport(data, year, month), parseMode: 'HTML' };
  },
};

// ─── generate_report (company DOCX) ──────────────────────────────────────────

interface CompanyRow {
  company_id: string;
  company_name: string;
  company_full_name: string | null;
}

export const generateReportTool: BotTool = {
  name: 'generate_report',
  label: 'Звіт DOCX',
  description: 'Генерує DOCX-звіт по підприємству за місяць. Потрібно вказати назву компанії та місяць.',
  supportedScopes: ['department', 'all'],
  parameters: {
    type: 'object',
    properties: {
      companyName: { type: 'string', description: 'Назва підприємства (повна або часткова)' },
      year: { type: 'number', description: 'Рік (за замовчуванням — поточний)' },
      month: { type: 'number', description: 'Місяць 1-12 (за замовчуванням — поточний)' },
    },
    required: ['companyName'],
  },

  async execute(args, ctx: ToolContext): Promise<DocumentResult | { error: string }> {
    const companyName = (args.companyName as string || '').trim();
    if (!companyName) return { error: 'Не вказано назву підприємства' };

    const year = (args.year as number) || new Date().getFullYear();
    let month = (args.month as number) || (new Date().getMonth() + 1);
    if (month < 1 || month > 12) month = new Date().getMonth() + 1;

    let companyQuery = ctx.db.from('companies').select('company_id, company_name, company_full_name');

    if (ctx.scope === 'department' && ctx.departmentId) {
      const { data: deptPlans } = await ctx.db
        .from('monthly_plans')
        .select('monthly_plan_id, quarterly_plans!inner(department_id)')
        .eq('quarterly_plans.department_id', ctx.departmentId);

      const planIds = (deptPlans || []).map(p => p.monthly_plan_id);
      if (!planIds.length) return { error: 'У вашому відділі немає планів з підприємствами' };

      const { data: mpc } = await ctx.db.from('monthly_plan_companies').select('company_id').in('monthly_plan_id', planIds);
      const allowedIds = Array.from(new Set((mpc || []).map(r => r.company_id)));
      if (!allowedIds.length) return { error: 'Немає підприємств для вашого відділу' };

      companyQuery = companyQuery.in('company_id', allowedIds);
    }

    const { data: companies } = await companyQuery;
    if (!companies?.length) return { error: 'Не знайдено жодного підприємства' };

    const match = findBestMatch<CompanyRow>(companies as CompanyRow[], companyName, [c => c.company_name, c => c.company_full_name]);
    if (!match) return { error: `Підприємство "${companyName}" не знайдено. Доступні: ${companies.map(c => c.company_name).join(', ')}` };

    const reportData = await getCompanyReportData(match.company_id, year, month);
    if (!reportData) return { error: `Немає даних для звіту: ${match.company_name}, ${MONTHS_UA[month - 1]} ${year}` };

    const buffer = await generateCompanyReportDOCX(reportData);
    const filename = `Звіт_${sanitizeFilename(match.company_name)}_${MONTHS_UA[month - 1]}_${year}.docx`;

    return { __type: 'document', buffer, filename, caption: `Звіт: ${match.company_name}, ${MONTHS_UA[month - 1]} ${year}` };
  },
};

// ─── generate_quarterly (PDF plan / DOCX report) ──────────────────────────────

const QUARTER_ROMAN: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

export const generateQuarterlyTool: BotTool = {
  name: 'generate_quarterly',
  label: 'Квартальний документ',
  description: 'Генерує квартальний план (PDF) або квартальний звіт (DOCX). Потрібно вказати тип документа та квартал.',
  supportedScopes: ['department', 'all'],
  parameters: {
    type: 'object',
    properties: {
      docType: { type: 'string', enum: ['plan', 'report'], description: 'Тип документа: plan — квартальний план, report — квартальний звіт' },
      quarter: { type: 'number', description: 'Квартал 1-4 (за замовчуванням — поточний)' },
      year: { type: 'number', description: 'Рік (за замовчуванням — поточний)' },
    },
    required: ['docType'],
  },

  async execute(args, ctx: ToolContext): Promise<DocumentResult | { error: string }> {
    const docType = args.docType as string;
    if (docType !== 'plan' && docType !== 'report') return { error: 'Невірний тип документа. Доступні: plan, report' };

    const year = (args.year as number) || new Date().getFullYear();
    let quarter = (args.quarter as number) || Math.ceil((new Date().getMonth() + 1) / 3);
    if (quarter < 1 || quarter > 4) quarter = Math.ceil((new Date().getMonth() + 1) / 3);

    const qRoman = QUARTER_ROMAN[quarter];
    const deptFilter = (ctx.scope === 'department' && ctx.departmentId) ? ctx.departmentId : undefined;

    if (docType === 'plan') {
      const data = await getQuarterlyPlanReportData(year, quarter, deptFilter);
      if (!data || !data.plans.length) return { error: `Немає даних для квартального плану: ${qRoman} квартал ${year}` };

      const buffer = await generateQuarterlyPlanPDF(data);
      return { __type: 'document', buffer, filename: `План_УІБК_Q${quarter}_${year}.pdf`, caption: `Квартальний план: ${qRoman} квартал ${year}` };
    }

    const data = await getQuarterlyReportData(year, quarter, deptFilter);
    if (!data || !data.plans.length) return { error: `Немає даних для квартального звіту: ${qRoman} квартал ${year}` };

    const buffer = await generateQuarterlyReportDOCX(data);
    return { __type: 'document', buffer, filename: `Звіт_УІБК_Q${quarter}_${year}.docx`, caption: `Квартальний звіт: ${qRoman} квартал ${year}` };
  },
};
