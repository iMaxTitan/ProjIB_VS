/**
 * Absences — pure helper functions + timesheet integration.
 */
import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import type { TimesheetCode } from '@/types/calendar';
import { calcWorkHours } from '@/lib/ops/working-days';
import logger from '@/lib/shared/logger';

export function addCalendarDays(date: Date, n: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + n);
  return result;
}

export function getCalendarDaysInRange(start: Date, end: Date, targetMonth: number, targetYear?: number): number[] {
  const year = targetYear ?? start.getFullYear();
  const daysInMonth = new Date(year, targetMonth, 0).getDate();
  const startLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endLocal = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const result: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, targetMonth - 1, d);
    if (date >= startLocal && date <= endLocal) result.push(d);
  }
  return result;
}

export function getWorkdaysInRange(start: Date, end: Date, targetMonth: number, targetYear?: number): number[] {
  const year = targetYear ?? start.getFullYear();
  const daysInMonth = new Date(year, targetMonth, 0).getDate();
  const startLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endLocal = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const result: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, targetMonth - 1, d);
    if (date < startLocal || date > endLocal) continue;
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) result.push(d);
  }
  return result;
}

export function getMonthsInRange(start: Date, end: Date): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endMonth) {
    result.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}

export function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function stripJoin(row: Record<string, unknown>): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user_profiles: _join, ...rest } = row;
  return rest;
}

// ─── Timesheet integration ─────────────────────────────────────

export async function applyVacationToTimesheet(
  db: SupabaseClient, userId: string, year: number, month: number,
  vacationDays: number[], approverId: string,
): Promise<void> {
  const { data: ts } = await db
    .from('employee_timesheet')
    .select('id, days, work_rate')
    .eq('user_id', userId).eq('year', year).eq('month', month)
    .single();

  let days: TimesheetCode[];
  let workRate: number;

  if (ts) {
    days = [...(ts.days as TimesheetCode[])];
    workRate = (ts.work_rate as number) ?? 1.0;
  } else {
    const { data: mwd } = await db
      .from('monthly_working_days')
      .select('day_types')
      .eq('year', year).eq('month', month)
      .single();

    if (!mwd?.day_types) {
      logger.info(`[Absences] Calendar ${month}/${year} not ready, skipping timesheet update for ${userId}`);
      return;
    }
    days = [...(mwd.day_types as TimesheetCode[])];
    const { data: profile } = await db.from('user_profiles').select('work_rate').eq('user_id', userId).single();
    workRate = (profile?.work_rate as number) ?? 1.0;
  }

  for (const dayNum of vacationDays) {
    const idx = dayNum - 1;
    if (idx >= 0 && idx < days.length && (days[idx] === '8' || days[idx] === 'В')) {
      days[idx] = 'О';
    }
  }

  const workHours = calcWorkHours(days, workRate);

  if (ts) {
    const { error } = await db.from('employee_timesheet')
      .update({ days, work_hours: workHours, updated_by: approverId, updated_at: new Date().toISOString() })
      .eq('id', ts.id);
    if (error) throw error;
  } else {
    const { error } = await db.from('employee_timesheet')
      .insert({ year, month, user_id: userId, days, work_hours: workHours, work_rate: workRate, created_by: approverId, updated_by: approverId });
    if (error) throw error;
  }
}

export async function revertVacationFromTimesheet(
  db: SupabaseClient, userId: string, year: number, month: number, start: Date, end: Date,
): Promise<void> {
  const { data: ts } = await db
    .from('employee_timesheet')
    .select('id, days, work_rate')
    .eq('user_id', userId).eq('year', year).eq('month', month)
    .single();

  if (!ts) return;

  const days = [...(ts.days as TimesheetCode[])];
  const workRate = (ts.work_rate as number) ?? 1.0;
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    if (date < start || date > end) continue;
    const idx = d - 1;
    if (idx < days.length && days[idx] === 'О') {
      const dow = date.getDay();
      days[idx] = (dow === 0 || dow === 6) ? 'В' : '8';
    }
  }

  const workHours = calcWorkHours(days, workRate);
  const { error } = await db.from('employee_timesheet')
    .update({ days, work_hours: workHours, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', ts.id);
  if (error) throw error;
}

// ─── Validation helpers (async — need DB) ──────────────────────

export async function checkOverlap(
  db: SupabaseClient, userId: string, year: number, start: Date, end: Date, excludeId?: string,
): Promise<void> {
  let query = db.from('planned_absences')
    .select('id, start_date, end_date')
    .eq('user_id', userId).eq('year', year)
    .in('status', ['pending', 'approved'])
    .not('start_date', 'is', null);
  if (excludeId) query = query.neq('id', excludeId);
  const { data } = await query;

  for (const row of data || []) {
    const existStart = new Date(row.start_date as string);
    const existEnd = new Date(row.end_date as string);
    if (start <= existEnd && end >= existStart) throw new Error('Дати перетинаються з існуючою заявкою');
  }
}

export async function checkSameMonth(
  db: SupabaseClient, userId: string, start: Date, end: Date, excludeId?: string,
): Promise<void> {
  const newMonths = getMonthsInRange(start, end);
  let query = db.from('planned_absences')
    .select('id, start_date, end_date')
    .eq('user_id', userId)
    .in('status', ['pending', 'approved'])
    .not('start_date', 'is', null);
  if (excludeId) query = query.neq('id', excludeId);
  const { data } = await query;

  for (const row of data || []) {
    const exMonths = getMonthsInRange(new Date(row.start_date as string), new Date(row.end_date as string));
    for (const nm of newMonths) {
      if (exMonths.some(em => em.year === nm.year && em.month === nm.month)) {
        throw new Error('В цьому місяці вже є відпустка');
      }
    }
  }
}
