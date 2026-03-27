/**
 * KPI bot adapter — describes how the KPI service integrates with the bot.
 */

import type { BotTool, ToolContext, FormattedResult } from '@/lib/bot/core/types';
import { computeKPI } from '@/lib/ops';
import { esc, fmtHours, fmtPct, kpiIcon, periodLabel, shortName, miniBar } from '@/lib/bot/shared/format-helpers';

function formatKPI(result: Awaited<ReturnType<typeof computeKPI>>): string {
  const { period, overall, byProcess, byEmployee, byDepartment, byQuarter, myPlans } = result;
  const lines: string[] = [];
  const label = periodLabel(period.type, period.value, period.year);

  // Header
  lines.push(`📈 <b>KPI за ${esc(label)}</b>`);
  lines.push('');

  // Overall
  lines.push(`📊 <b>Загальний</b>`);
  lines.push(`  ${miniBar(overall.kpi / 100)} ${kpiIcon(overall.kpi)} <b>${fmtPct(overall.kpi)}</b>`);
  lines.push(`  Заплановано: <b>${fmtHours(overall.planned)}</b> год · Фактично: <b>${fmtHours(overall.actual)}</b> год`);
  lines.push('');

  // By process
  if (byProcess?.length) {
    lines.push(`📂 <b>По процесах</b>`);
    const sorted = [...byProcess].sort((a, b) => b.kpi - a.kpi);
    for (const p of sorted) {
      lines.push(`  ${kpiIcon(p.kpi)} ${esc(p.name)} — <b>${fmtPct(p.kpi)}</b>`);
      lines.push(`     ${fmtHours(p.planned)} заплан. · ${fmtHours(p.actual)} факт.`);
    }
    lines.push('');
  }

  // By employee (head/chief)
  if (byEmployee?.length) {
    lines.push(`👥 <b>По співробітниках</b>`);
    const sorted = [...byEmployee].sort((a, b) => b.kpi - a.kpi);
    for (const e of sorted.slice(0, 15)) {
      lines.push(`  ${kpiIcon(e.kpi)} ${esc(shortName(e.name))} — <b>${fmtPct(e.kpi)}</b> (${fmtHours(e.actual)}/${fmtHours(e.planned)} год)`);
    }
    if (sorted.length > 15) lines.push(`  <i>... ще ${sorted.length - 15}</i>`);
    lines.push('');
  }

  // By department (chief)
  if (byDepartment?.length) {
    lines.push(`🏢 <b>По відділах</b>`);
    const sorted = [...byDepartment].sort((a, b) => b.kpi - a.kpi);
    for (const d of sorted) {
      lines.push(`  ${kpiIcon(d.kpi)} ${esc(d.name)} — <b>${fmtPct(d.kpi)}</b>`);
    }
    lines.push('');
  }

  // By quarter trend (chief/year)
  if (byQuarter?.length) {
    lines.push(`📅 <b>По кварталах</b>`);
    for (const q of byQuarter) {
      if (q.planned === 0 && q.actual === 0) continue;
      lines.push(`  ${kpiIcon(q.kpi)} Q${q.period} — <b>${fmtPct(q.kpi)}</b> (${fmtHours(q.actual)}/${fmtHours(q.planned)} год)`);
    }
    lines.push('');
  }

  // My plans (employee)
  if (myPlans?.length) {
    lines.push(`📋 <b>Мої плани</b>`);
    const sorted = [...myPlans].sort((a, b) => b.actual - a.actual);
    for (const p of sorted.slice(0, 10)) {
      lines.push(`  ${kpiIcon(p.kpi)} ${esc(p.procedureName)} — <b>${fmtPct(p.kpi)}</b>`);
      lines.push(`     ${fmtHours(p.planned)} заплан. · ${fmtHours(p.actual)} факт.`);
    }
    if (sorted.length > 10) lines.push(`  <i>... ще ${sorted.length - 10}</i>`);
  }

  return lines.join('\n').trimEnd();
}

export const getKpiTool: BotTool = {
  name: 'get_kpi',
  label: 'KPI',
  description: 'Отримати KPI за період (місяць, квартал, рік). Повертає загальний KPI, KPI по процесах, по співробітниках.',
  supportedScopes: ['own', 'department', 'all'],
  parameters: {
    type: 'object',
    properties: {
      year: { type: 'number', description: 'Рік (за замовчуванням — поточний)' },
      periodType: { type: 'string', enum: ['month', 'quarter', 'year'], description: 'Тип періоду' },
      periodValue: { type: 'number', description: 'Номер місяця (1-12) або кварталу (1-4)' },
    },
    required: ['periodType'],
  },
  directCommand: { buttonLabel: '📈 KPI', args: { periodType: 'month' } },

  async execute(args, ctx: ToolContext): Promise<FormattedResult | { error: string }> {
    const year = (args.year as number) || new Date().getFullYear();
    const periodType = args.periodType as string;
    const periodValue = args.periodValue as number | undefined;

    const result = await computeKPI(ctx.db, ctx.userId, year, periodType, periodValue);

    if (ctx.scope === 'own') {
      result.byEmployee = result.byEmployee?.filter(e => e.id === ctx.userId);
      result.byDepartment = undefined;
    } else if (ctx.scope === 'department') {
      result.byDepartment = undefined;
    }

    return { __type: 'formatted', text: formatKPI(result), parseMode: 'HTML' };
  },
};

