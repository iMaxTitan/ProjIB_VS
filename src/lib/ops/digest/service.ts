/**
 * Weekly digest — builds personalized HTML message per user.
 * Called by POST /api/digest/weekly every Monday 09:00 (via pm2 cron).
 *
 * Roles:
 *   employee → personal KPI + plan status + tasks last week
 *   head     → same + team KPI summary + pending approvals
 *   chief    → same as head + company-wide stats
 */

import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import { computeKPI } from '@/lib/ops/kpi/service';
import { esc, fmtHours, kpiIcon, shortName } from '@/lib/bot/shared/format-helpers';

const SHORT_MONTHS_UA = [
  'січ.', 'лют.', 'берез.', 'квіт.', 'трав.', 'черв.',
  'лип.', 'серп.', 'вер.', 'жовт.', 'лист.', 'груд.',
];

export interface DigestUser {
  user_id: string;
  full_name: string | null;
  role: 'chief' | 'head' | 'employee';
  department_id: string | null;
}

const PLAN_STATUS_LABEL: Record<string, string> = {
  draft:     'Чернетка',
  submitted: 'На затвердженні ⏳',
  approved:  'Затверджено ✅',
  active:    'Активний ✅',
  completed: 'Виконано ✅',
  returned:  'Повернуто ❌',
};

/** Returns past-week date range (7 days ending yesterday, YYYY-MM-DD). */
function getWeekBounds(now: Date): { start: string; end: string; label: string } {
  const end = new Date(now);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);

  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  const label = `${start.getDate()}–${end.getDate()} ${SHORT_MONTHS_UA[end.getMonth()]}`;

  return { start: toISO(start), end: toISO(end), label };
}

/** Count remaining working days in the current month (Mon–Fri naive, from today excl.). */
function remainingWorkingDays(now: Date): number {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = now.getDate() + 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

async function buildPersonalSection(
  db: SupabaseClient,
  user: DigestUser,
  year: number,
  month: number,
  week: { start: string; end: string },
): Promise<string> {
  const lines: string[] = ['👤 <b>Особисто</b>'];

  // KPI current month (employee and head only; chief KPI is company-wide, shown in company section)
  if (user.role !== 'chief') {
    try {
      const kpiData = await computeKPI(db, user.user_id, year, 'month', month);
      if (kpiData.overall.planned > 0) {
        const kpi = kpiData.overall.kpi;
        lines.push(`• KPI ${SHORT_MONTHS_UA[month - 1]}: ${kpiIcon(kpi)} ${kpi.toFixed(0)}%`);
      }
    } catch { /* no KPI data — skip */ }
  }

  // Monthly plan status
  const { data: assigneeRows } = await db
    .from('monthly_plan_assignees')
    .select('monthly_plan_id')
    .eq('user_id', user.user_id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planIds = ((assigneeRows ?? []) as any[]).map((r: { monthly_plan_id: string }) => r.monthly_plan_id);
  let planLine = '• План: відсутній';

  if (planIds.length > 0) {
    const { data: plans } = await db
      .from('monthly_plans')
      .select('status, planned_hours')
      .in('monthly_plan_id', planIds)
      .eq('year', year)
      .eq('month', month)
      .limit(1);

    const plan = plans?.[0] as { status: string; planned_hours: number } | undefined;
    if (plan) {
      const statusLabel = PLAN_STATUS_LABEL[plan.status] ?? plan.status;
      const hours = fmtHours(Number(plan.planned_hours || 0));
      planLine = `• План: ${statusLabel} (${hours} год)`;
    }
  }
  lines.push(planLine);

  // Tasks last 7 days
  const { data: tasks } = await db
    .from('daily_tasks')
    .select('date, description, spent_hours')
    .eq('user_id', user.user_id)
    .gte('date', week.start)
    .lte('date', week.end)
    .order('date', { ascending: false });

  if (tasks?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalH = (tasks as any[]).reduce((s: number, t: { spent_hours: number }) => s + Number(t.spent_hours || 0), 0);
    lines.push(`• Задач за тиждень: ${tasks.length} (${fmtHours(totalH)} год)`);
    for (const t of (tasks as Array<{ date: string; description: string; spent_hours: number }>).slice(0, 3)) {
      const d = String(t.date).slice(5).replace('-', '.');
      const desc = esc(String(t.description || '—').slice(0, 45));
      lines.push(`  · ${d} — ${desc} (${fmtHours(Number(t.spent_hours || 0))} год)`);
    }
  } else {
    lines.push('• Задач за тиждень: 0');
  }

  return lines.join('\n');
}

async function buildTeamSection(
  db: SupabaseClient,
  deptId: string,
  year: number,
  month: number,
  week: { start: string; end: string },
): Promise<string> {
  const lines: string[] = ['', '👥 <b>Відділ</b>'];

  const { data: members } = await db
    .from('user_profiles')
    .select('user_id, full_name')
    .eq('department_id', deptId)
    .eq('status', 'active')
    .neq('role', 'chief') as { data: Array<{ user_id: string; full_name: string }> | null };

  if (!members?.length) {
    lines.push('• Даних немає');
    return lines.join('\n');
  }

  const memberIds = members.map(m => m.user_id);

  // Pending plan count for team members
  const { data: assigneeRows } = await db
    .from('monthly_plan_assignees')
    .select('monthly_plan_id')
    .in('user_id', memberIds) as { data: Array<{ monthly_plan_id: string }> | null };

  const teamPlanIds = [...new Set(assigneeRows?.map(r => r.monthly_plan_id) ?? [])];
  let pendingCount = 0;

  if (teamPlanIds.length > 0) {
    const { count } = await db
      .from('monthly_plans')
      .select('monthly_plan_id', { count: 'exact', head: true })
      .in('monthly_plan_id', teamPlanIds)
      .eq('status', 'submitted')
      .eq('year', year)
      .eq('month', month);
    pendingCount = count ?? 0;
  }

  if (pendingCount > 0) {
    lines.push(`• Планів на затвердження: ${pendingCount} ⏳`);
  } else {
    lines.push('• Всі плани затверджено ✅');
  }

  // Below-norm members
  const below: string[] = [];
  for (const m of members) {
    try {
      const kpiData = await computeKPI(db, m.user_id, year, 'month', month);
      if (kpiData.overall.planned > 0 && kpiData.overall.kpi < 70) {
        below.push(`${shortName(m.full_name || '')} (${kpiData.overall.kpi.toFixed(0)}%)`);
      }
    } catch { /* skip */ }
  }
  if (below.length > 0) {
    lines.push(`• Нижче норми: ${below.join(', ')}`);
  }

  // Team tasks this week
  const { data: weekTasks } = await db
    .from('daily_tasks')
    .select('spent_hours')
    .in('user_id', memberIds)
    .gte('date', week.start)
    .lte('date', week.end) as { data: Array<{ spent_hours: number }> | null };

  const teamH = (weekTasks ?? []).reduce((s, t) => s + Number(t.spent_hours || 0), 0);
  lines.push(`• Задач команди: ${weekTasks?.length ?? 0} (${fmtHours(teamH)} год)`);

  return lines.join('\n');
}

async function buildCompanySection(
  db: SupabaseClient,
  year: number,
  month: number,
  week: { start: string; end: string },
): Promise<string> {
  const lines: string[] = ['', '🏢 <b>Компанія</b>'];

  const { count: pendingCount } = await db
    .from('monthly_plans')
    .select('monthly_plan_id', { count: 'exact', head: true })
    .eq('status', 'submitted')
    .eq('year', year)
    .eq('month', month);

  if (pendingCount && pendingCount > 0) {
    lines.push(`• Планів на затвердження: ${pendingCount} ⏳`);
  } else {
    lines.push('• Всі плани затверджено ✅');
  }

  const { data: allTasks } = await db
    .from('daily_tasks')
    .select('spent_hours')
    .gte('date', week.start)
    .lte('date', week.end) as { data: Array<{ spent_hours: number }> | null };

  const companyH = (allTasks ?? []).reduce((s, t) => s + Number(t.spent_hours || 0), 0);
  lines.push(`• Задач за тиждень: ${allTasks?.length ?? 0} (${fmtHours(companyH)} год)`);

  return lines.join('\n');
}

/**
 * Builds the full digest HTML message for one user.
 * Returns null if there's nothing to show (no notifications connected).
 */
export async function buildDigestMessage(
  db: SupabaseClient,
  user: DigestUser,
  now: Date,
): Promise<string | null> {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const week = getWeekBounds(now);
  const remainDays = remainingWorkingDays(now);

  const parts: string[] = [
    `📊 <b>Дайджест — тиждень ${week.label}</b>`,
    '',
  ];

  const personal = await buildPersonalSection(db, user, year, month, week);
  parts.push(personal);

  if ((user.role === 'head' || user.role === 'chief') && user.department_id) {
    const team = await buildTeamSection(db, user.department_id, year, month, week);
    parts.push(team);
  }

  if (user.role === 'chief') {
    const company = await buildCompanySection(db, year, month, week);
    parts.push(company);
  }

  if (remainDays > 0) {
    parts.push('');
    parts.push(`До кінця місяця: ${remainDays} роб. днів`);
  }

  return parts.join('\n');
}
