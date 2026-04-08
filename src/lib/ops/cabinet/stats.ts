/**
 * Cabinet stats service — aggregated data for the employee dashboard.
 * Queries: hours, tasks, KPI, recent work, profile.
 */

import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import { countNaiveWorkingDays } from '@/lib/ops/working-days';
import { KPI_NORM, calcKPI, getMonthsForPeriod } from '@/lib/ops/kpi/helpers';
import logger from '@/lib/shared/logger';

export interface CabinetStats {
  hours: { planned: number; actual: number; percent: number };
  tasks: { total: number; daysWorked: number; totalHours: number };
  kpi: { current: number; previous: number; trend: 'up' | 'down' | 'stable' };
  recentTasks: Array<{
    daily_task_id: string;
    description: string;
    task_date: string;
    spent_hours: number;
    monthly_plan_id: string;
  }>;
  profile: {
    full_name: string;
    email: string;
    position: string | null;
    work_rate: number | null;
    department_name: string | null;
    photo_base64: string | null;
    role: string;
  };
}

const HOURS_PER_DAY = 8;

export async function getCabinetStats(
  db: PostgrestClient,
  userId: string,
): Promise<CabinetStats> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

  // Parallel queries — no 'status' column in daily_tasks
  const [profileRes, tasksRes, recentRes, wdRes, tsRes] = await Promise.all([
    db.from('user_profiles')
      .select('full_name, email, position, work_rate, role, photo_base64, department_id')
      .eq('user_id', userId)
      .single(),

    // All tasks this month
    db.from('daily_tasks')
      .select('daily_task_id, task_date, spent_hours')
      .eq('user_id', userId)
      .gte('task_date', monthStart)
      .lte('task_date', monthEnd),

    // Recent tasks (last 7 entries)
    db.from('daily_tasks')
      .select('daily_task_id, description, task_date, spent_hours, monthly_plan_id')
      .eq('user_id', userId)
      .order('task_date', { ascending: false })
      .limit(7),

    db.from('monthly_working_days')
      .select('month, work_hours')
      .eq('year', year),

    db.from('employee_timesheet')
      .select('month, work_hours')
      .eq('user_id', userId)
      .eq('year', year)
      .in('month', [month, month > 1 ? month - 1 : 12]),
  ]);

  // Profile + department
  const profile = profileRes.data;
  let departmentName: string | null = null;
  if (profile?.department_id) {
    const { data: dept } = await db.from('departments')
      .select('department_name')
      .eq('department_id', profile.department_id)
      .single();
    departmentName = dept?.department_name ?? null;
  }

  // Hours
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTasks = (tasksRes.data ?? []) as any[];
  const actualHours = allTasks.reduce(
    (sum: number, r: { spent_hours: number }) => sum + (Number(r.spent_hours) || 0), 0,
  );

  const plannedHours = getPlannedHoursForMonth(
    year, month, profile?.work_rate ?? 1,
    (wdRes.data ?? []) as { month: number; work_hours: number }[],
    (tsRes.data ?? []) as { month: number; work_hours: number }[],
  );
  const hoursPercent = plannedHours > 0 ? Math.round((actualHours / plannedHours) * 100) : 0;

  // Tasks summary
  const uniqueDays = new Set(allTasks.map(t => t.task_date as string));

  // KPI
  const kpiCurrent = await computeSimpleKPI(db, userId, year, month);
  const prevMonth = month > 1 ? month - 1 : 12;
  const prevYear = month > 1 ? year : year - 1;
  const kpiPrevious = await computeSimpleKPI(db, userId, prevYear, prevMonth);

  const trend: 'up' | 'down' | 'stable' =
    kpiCurrent > kpiPrevious + 2 ? 'up' :
    kpiCurrent < kpiPrevious - 2 ? 'down' : 'stable';

  // Recent tasks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentTasks = ((recentRes.data ?? []) as any[]).map((d: {
    daily_task_id: string; description: string; task_date: string;
    spent_hours: number; monthly_plan_id: string;
  }) => ({
    daily_task_id: d.daily_task_id,
    description: d.description || '',
    task_date: d.task_date,
    spent_hours: Number(d.spent_hours) || 0,
    monthly_plan_id: d.monthly_plan_id,
  }));

  return {
    hours: {
      planned: Math.round(plannedHours * 10) / 10,
      actual: Math.round(actualHours * 10) / 10,
      percent: hoursPercent,
    },
    tasks: {
      total: allTasks.length,
      daysWorked: uniqueDays.size,
      totalHours: Math.round(actualHours * 10) / 10,
    },
    kpi: { current: kpiCurrent, previous: kpiPrevious, trend },
    recentTasks,
    profile: {
      full_name: profile?.full_name || '',
      email: profile?.email || '',
      position: profile?.position ?? null,
      work_rate: profile?.work_rate ?? null,
      department_name: departmentName,
      photo_base64: profile?.photo_base64 ?? null,
      role: profile?.role || 'employee',
    },
  };
}

function getPlannedHoursForMonth(
  year: number,
  month: number,
  workRate: number,
  wdData: { month: number; work_hours: number }[],
  tsData: { month: number; work_hours: number }[],
): number {
  const ts = tsData.find(r => r.month === month);
  if (ts) return ts.work_hours;

  const wd = wdData.find(r => r.month === month);
  if (wd) return wd.work_hours * workRate;

  return countNaiveWorkingDays(year, month) * HOURS_PER_DAY * workRate;
}

/** Simplified KPI for a single employee for a single month */
async function computeSimpleKPI(
  db: PostgrestClient,
  userId: string,
  year: number,
  month: number,
): Promise<number> {
  try {
    const months = getMonthsForPeriod('month', month);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

    const { data: plans } = await db.from('monthly_plans')
      .select('monthly_plan_id, planned_hours')
      .eq('year', year)
      .in('month', months)
      .in('status', ['active', 'done']);

    if (!plans || plans.length === 0) return 0;

    const planIds = plans.map(p => p.monthly_plan_id);
    const { data: assignees } = await db.from('monthly_plan_assignees')
      .select('monthly_plan_id')
      .eq('user_id', userId)
      .in('monthly_plan_id', planIds);

    if (!assignees || assignees.length === 0) return 0;

    const { data: tasks } = await db.from('daily_tasks')
      .select('spent_hours')
      .eq('user_id', userId)
      .gte('task_date', monthStart)
      .lte('task_date', monthEnd);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actualHours = ((tasks ?? []) as any[]).reduce(
      (sum: number, t: { spent_hours: number }) => sum + (Number(t.spent_hours) || 0), 0,
    );

    const { data: wdData } = await db.from('monthly_working_days')
      .select('month, work_hours').eq('year', year);
    const customHoursMap = new Map<number, number>();
    ((wdData || []) as { month: number; work_hours: number }[]).forEach(r =>
      customHoursMap.set(r.month, r.work_hours),
    );

    const { data: userProfile } = await db.from('user_profiles')
      .select('work_rate').eq('user_id', userId).single();
    const workRate = userProfile?.work_rate ?? 1.0;

    const { data: tsData } = await db.from('employee_timesheet')
      .select('month, work_hours')
      .eq('user_id', userId).eq('year', year).in('month', months);

    const tsArr = (tsData ?? []) as { month: number; work_hours: number }[];
    const ts = tsArr.find(r => r.month === month);
    let normHours: number;
    if (ts) {
      normHours = ts.work_hours;
    } else {
      const customH = customHoursMap.get(month);
      normHours = customH != null
        ? customH * Number(workRate)
        : countNaiveWorkingDays(year, month) * HOURS_PER_DAY * Number(workRate);
    }
    const planned = Math.round(normHours * KPI_NORM / 100 * 10) / 10;

    return calcKPI(actualHours, planned);
  } catch (err) {
    logger.error('[Cabinet] KPI computation error:', err);
    return 0;
  }
}
