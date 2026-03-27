/**
 * Activity bot adapter — describes how the Activity service integrates with the bot.
 */

import type { BotTool, ToolContext, FormattedResult } from '@/lib/bot/core/types';
import { getActivityStats } from '@/lib/ops';
import { fmtHours } from '@/lib/bot/shared/format-helpers';

const PERIOD_LABELS: Record<number, string> = {
  7: 'тиждень',
  30: 'місяць',
  90: 'квартал',
};

export const getActivityTool: BotTool = {
  name: 'get_activity',
  label: 'Активність',
  description: 'Статистика активності: години, задачі, активні користувачі за період (тиждень/місяць/квартал).',
  supportedScopes: ['own', 'department', 'all'],
  directCommand: { buttonLabel: '📊 Активність', args: { daysBack: 30 } },
  parameters: {
    type: 'object',
    properties: {
      daysBack: { type: 'number', description: 'Кількість днів назад (7 = тиждень, 30 = місяць, 90 = квартал). За замовчуванням 7.' },
    },
  },

  async execute(args, ctx: ToolContext): Promise<FormattedResult> {
    const daysBack = (args.daysBack as number) || 7;
    const departmentId = ctx.scope === 'department' ? (ctx.departmentId || undefined) : undefined;
    const effectiveRole = ctx.scope === 'own' ? 'employee' : ctx.scope === 'department' ? 'head' : 'chief';

    const stats = await getActivityStats(ctx.userId, effectiveRole, ctx.departmentId, departmentId, daysBack, ctx.db);

    const periodLabel = PERIOD_LABELS[daysBack] || `${daysBack} днів`;
    const lines: string[] = [];

    lines.push(`📊 <b>Активність за ${periodLabel}</b>`);
    lines.push('');
    lines.push(`📋 <b>Підсумок</b>`);
    lines.push(`  ⏰ Годин: <b>${fmtHours(stats.totalHours)}</b>`);
    lines.push(`  📝 Задач: <b>${stats.totalTasks}</b>`);
    lines.push(`  👥 Активних: <b>${stats.activeUsers}</b> з <b>${stats.totalUsers}</b>`);
    lines.push('');
    lines.push(`📅 <b>Сьогодні</b>`);
    lines.push(`  ⏰ Годин: <b>${fmtHours(stats.todayHours)}</b>`);
    lines.push(`  📝 Задач: <b>${stats.todayTasks}</b>`);

    return { __type: 'formatted', text: lines.join('\n'), parseMode: 'HTML' };
  },
};

