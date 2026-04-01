/**
 * Plans bot adapter — describes how the Plans module integrates with the bot.
 * Exports: getPlansTool, getHoursTool
 */

import type { BotTool, ToolContext, FormattedResult } from '@/lib/bot/core/types';
import { esc, fmtHours, monthName, shortName, miniBar } from '@/lib/bot/shared/format-helpers';

// ─── get_plans ───────────────────────────────────────────────────────────────

const STATUS_ICONS: Record<string, string> = {
  active: '🟢',
  completed: '✅',
  draft: '📝',
};

export const getPlansTool: BotTool = {
  name: 'get_plans',
  label: 'Плани',
  description: 'Зведення місячних планів: список планів з плановими годинами, статусом, процедурою.',
  supportedScopes: ['own', 'department', 'all'],
  parameters: {
    type: 'object',
    properties: {
      year: { type: 'number', description: 'Рік (за замовчуванням — поточний)' },
      month: { type: 'number', description: 'Місяць 1-12 (за замовчуванням — поточний)' },
    },
  },
  directCommand: { buttonLabel: '📋 Плани', args: {} },

  async execute(args, ctx: ToolContext): Promise<FormattedResult | { error: string }> {
    const year = (args.year as number) || new Date().getFullYear();
    const month = (args.month as number) || (new Date().getMonth() + 1);

    const { data: plansRaw, error: plansError } = await ctx.db
      .from('monthly_plans')
      .select(`
        monthly_plan_id,
        description,
        planned_hours,
        status,
        procedures(name, processes(process_name)),
        quarterly_plans(department_id, departments(department_name))
      `)
      .eq('year', year)
      .eq('month', month)
      .in('status', ['active', 'done']);

    if (plansError) throw plansError;
    if (!plansRaw?.length) {
      return { __type: 'formatted', text: `📋 <b>Плани за ${esc(monthName(month))} ${year}</b>\n\nПланів не знайдено.`, parseMode: 'HTML' };
    }

    const planIds = plansRaw.map(p => p.monthly_plan_id);

    const { data: assignees } = await ctx.db
      .from('monthly_plan_assignees')
      .select('monthly_plan_id, user_id')
      .in('monthly_plan_id', planIds);

    const assigneeCountMap = new Map<string, number>();
    for (const a of assignees || []) {
      assigneeCountMap.set(a.monthly_plan_id, (assigneeCountMap.get(a.monthly_plan_id) || 0) + 1);
    }

    const { data: hoursData } = await ctx.db
      .from('v_monthly_plan_hours')
      .select('monthly_plan_id, total_spent_hours, tasks_count')
      .in('monthly_plan_id', planIds);

    const hoursMap = new Map<string, { spent: number; tasks: number }>();
    for (const h of hoursData || []) {
      hoursMap.set(h.monthly_plan_id, {
        spent: Number(h.total_spent_hours) || 0,
        tasks: Number(h.tasks_count) || 0,
      });
    }

    type PlanJoined = (typeof plansRaw)[number];
    let plans: PlanJoined[] = plansRaw;

    if (ctx.scope === 'own') {
      const myPlanIds = new Set(
        (assignees || []).filter(a => a.user_id === ctx.userId).map(a => a.monthly_plan_id),
      );
      plans = plans.filter(p => myPlanIds.has(p.monthly_plan_id));
    } else if (ctx.scope === 'department') {
      plans = plans.filter(p => {
        const qp = p.quarterly_plans as unknown as { department_id: string } | null;
        return qp?.department_id === ctx.departmentId;
      });
    }

    const totalPlanned = plans.reduce((s, p) => s + (p.planned_hours || 0), 0);
    const totalSpent = plans.reduce((s, p) => s + (hoursMap.get(p.monthly_plan_id)?.spent || 0), 0);

    const lines: string[] = [];
    lines.push(`📋 <b>Плани за ${esc(monthName(month))} ${year}</b>`);
    lines.push(`📊 Усього: <b>${plans.length}</b> планів · <b>${fmtHours(totalPlanned)}</b> заплан. · <b>${fmtHours(totalSpent)}</b> витрач.`);
    lines.push('');

    for (let i = 0; i < plans.length; i++) {
      const p = plans[i];
      const hours = hoursMap.get(p.monthly_plan_id);
      const proc = p.procedures as unknown as { name: string; processes: { process_name: string } | null } | null;
      const qp = p.quarterly_plans as unknown as { departments: { department_name: string } | null } | null;
      const icon = STATUS_ICONS[p.status] || '⚪';

      lines.push(`${icon} <b>${i + 1}. ${esc(p.description || 'Без опису')}</b>`);
      if (proc?.name) {
        const processStr = proc.processes?.process_name ? ` · ${esc(proc.processes.process_name)}` : '';
        lines.push(`   📂 ${esc(proc.name)}${processStr}`);
      }
      if (qp?.departments?.department_name) {
        lines.push(`   🏢 ${esc(qp.departments.department_name)}`);
      }
      const taskCount = hours?.tasks || 0;
      const spentH = hours?.spent || 0;
      const assigneeCount = assigneeCountMap.get(p.monthly_plan_id) || 0;
      lines.push(`   ⏰ ${fmtHours(p.planned_hours || 0)} заплан. · ${fmtHours(spentH)} витрач. · ${taskCount} задач · 👥 ${assigneeCount}`);
    }

    return { __type: 'formatted', text: lines.join('\n'), parseMode: 'HTML' };
  },
};

// ─── get_hours ────────────────────────────────────────────────────────────────

export const getHoursTool: BotTool = {
  name: 'get_hours',
  label: 'Години',
  description: 'Години роботи за місяць — скільки годин витрачено на задачі по планах, розбивка по співробітниках та процесах.',
  supportedScopes: ['own', 'department', 'all'],
  parameters: {
    type: 'object',
    properties: {
      year: { type: 'number', description: 'Рік (за замовчуванням — поточний)' },
      month: { type: 'number', description: 'Місяць 1-12 (за замовчуванням — поточний)' },
    },
  },
  directCommand: { buttonLabel: '⏰ Години', args: {} },

  async execute(args, ctx: ToolContext): Promise<FormattedResult | { error: string }> {
    const year = (args.year as number) || new Date().getFullYear();
    let month = (args.month as number) || (new Date().getMonth() + 1);
    if (month < 1 || month > 12) month = new Date().getMonth() + 1;

    const { data: plans } = await ctx.db
      .from('monthly_plans')
      .select(`monthly_plan_id, procedures(process_id, processes(process_name))`)
      .eq('year', year)
      .eq('month', month)
      .in('status', ['active', 'done']);

    const planIds = (plans || []).map(p => p.monthly_plan_id);
    if (planIds.length === 0) {
      return { __type: 'formatted', text: `⏰ <b>Години за ${esc(monthName(month))} ${year}</b>\n\nДаних не знайдено.`, parseMode: 'HTML' };
    }

    type PlanRow = { monthly_plan_id: string; procedures?: { process_id?: string; processes?: { process_name?: string } | { process_name?: string }[] | null } | { process_id?: string; processes?: { process_name?: string } | { process_name?: string }[] | null }[] | null };
    const planProcessMap = new Map<string, string>();
    for (const p of (plans || []) as PlanRow[]) {
      const proc = Array.isArray(p.procedures) ? p.procedures[0] : p.procedures;
      const process = Array.isArray(proc?.processes) ? proc?.processes[0] : proc?.processes;
      if (process?.process_name) planProcessMap.set(p.monthly_plan_id, process.process_name);
    }

    const { data: taskAgg } = await ctx.db.rpc('get_task_hours_by_plan_user', { p_plan_ids: planIds });
    const rows = (taskAgg || []) as Array<{ monthly_plan_id: string; user_id: string | null; total_spent_hours: number }>;

    const userHours = new Map<string, number>();
    for (const r of rows) {
      if (!r.user_id) continue;
      userHours.set(r.user_id, (userHours.get(r.user_id) || 0) + r.total_spent_hours);
    }

    function buildByProcess(filteredUserIds: Set<string>) {
      const processHours = new Map<string, number>();
      for (const r of rows) {
        if (!r.user_id || !filteredUserIds.has(r.user_id)) continue;
        const processName = planProcessMap.get(r.monthly_plan_id);
        if (!processName) continue;
        processHours.set(processName, (processHours.get(processName) || 0) + r.total_spent_hours);
      }
      return Array.from(processHours.entries())
        .map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
        .sort((a, b) => b.hours - a.hours);
    }

    const lines: string[] = [];
    lines.push(`⏰ <b>Години за ${esc(monthName(month))} ${year}</b>`);
    lines.push('');

    if (ctx.scope === 'own') {
      const myHours = Math.round((userHours.get(ctx.userId) || 0) * 10) / 10;
      const byProcess = buildByProcess(new Set([ctx.userId]));
      const maxH = Math.max(myHours, 1);

      lines.push(`📊 <b>${esc(ctx.fullName)}</b>`);
      lines.push(`  Усього: <b>${fmtHours(myHours)}</b> годин`);
      lines.push('');

      if (byProcess.length) {
        lines.push(`📂 <b>По процесах</b>`);
        for (const p of byProcess) {
          lines.push(`  ${miniBar(p.hours / maxH, 8)} ${esc(p.name)} — <b>${fmtHours(p.hours)}</b> год`);
        }
      }

      return { __type: 'formatted', text: lines.join('\n'), parseMode: 'HTML' };
    }

    const userIds = Array.from(userHours.keys());
    const { data: profiles } = await ctx.db
      .from('user_profiles')
      .select('user_id, full_name, department_id')
      .in('user_id', userIds);

    const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
    let byUser = userIds.map(uid => {
      const p = profileMap.get(uid);
      return { userId: uid, fullName: p?.full_name || 'Невідомий', departmentId: p?.department_id, hours: Math.round((userHours.get(uid) || 0) * 10) / 10 };
    });

    if (ctx.scope === 'department') byUser = byUser.filter(u => u.departmentId === ctx.departmentId);

    byUser.sort((a, b) => b.hours - a.hours);
    const totalHours = Math.round(byUser.reduce((s, u) => s + u.hours, 0) * 10) / 10;
    const scopedUserIds = new Set(byUser.map(u => u.userId));
    const byProcess = buildByProcess(scopedUserIds);
    const maxUserH = byUser[0]?.hours || 1;

    lines.push(`📊 Усього: <b>${fmtHours(totalHours)}</b> годин · <b>${byUser.length}</b> співробітників`);
    lines.push('');
    lines.push(`👥 <b>По співробітниках</b>`);
    for (const u of byUser.slice(0, 15)) {
      lines.push(`  ${miniBar(u.hours / maxUserH, 8)} ${esc(shortName(u.fullName))} — <b>${fmtHours(u.hours)}</b> год`);
    }
    if (byUser.length > 15) lines.push(`  <i>... ще ${byUser.length - 15}</i>`);
    lines.push('');

    if (byProcess.length) {
      const maxProcH = byProcess[0]?.hours || 1;
      lines.push(`📂 <b>По процесах</b>`);
      for (const p of byProcess) {
        lines.push(`  ${miniBar(p.hours / maxProcH, 8)} ${esc(p.name)} — <b>${fmtHours(p.hours)}</b> год`);
      }
    }

    return { __type: 'formatted', text: lines.join('\n'), parseMode: 'HTML' };
  },
};
