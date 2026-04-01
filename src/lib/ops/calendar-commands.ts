/**
 * Calendar working-days — business logic for timesheet provisioning.
 * Extracted from app/api/calendar/working-days/route.ts
 */
import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import type { TimesheetCode } from '@/types/calendar';
import { calcWorkHours } from '@/lib/ops/working-days';
import logger from '@/lib/shared/logger';

/** Get ALL calendar day numbers (1-based) within a specific month in [start, end] range */
function getCalendarDaysInMonth(start: Date, end: Date, year: number, month: number): number[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const startLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endLocal = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const result: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    if (date >= startLocal && date <= endLocal) result.push(d);
  }
  return result;
}

/**
 * Apply approved absences to freshly created timesheets.
 * Replaces '8'/'В' → 'О' for vacation days.
 */
export async function applyApprovedAbsences(
  db: SupabaseClient, year: number, month: number, updatedBy: string,
): Promise<void> {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const { data: absences, error: absErr } = await db
    .from('planned_absences')
    .select('user_id, start_date, end_date')
    .eq('status', 'approved')
    .lte('start_date', monthEnd)
    .gte('end_date', monthStart);

  if (absErr) { logger.error('[calendar] Failed to fetch approved absences:', absErr); return; }
  if (!absences || absences.length === 0) return;

  const userVacDays = new Map<string, number[]>();
  for (const abs of absences) {
    const uid = abs.user_id as string;
    const calDays = getCalendarDaysInMonth(new Date(abs.start_date as string), new Date(abs.end_date as string), year, month);
    if (calDays.length === 0) continue;
    userVacDays.set(uid, [...(userVacDays.get(uid) || []), ...calDays]);
  }
  if (userVacDays.size === 0) return;

  const { data: timesheets, error: tsErr } = await db
    .from('employee_timesheet')
    .select('id, user_id, days, work_rate')
    .eq('year', year).eq('month', month)
    .in('user_id', [...userVacDays.keys()]);

  if (tsErr || !timesheets) { logger.error('[calendar] Failed to fetch timesheets:', tsErr); return; }

  let applied = 0;
  for (const ts of timesheets) {
    const vacDays = userVacDays.get(ts.user_id as string);
    if (!vacDays) continue;
    const days = [...(ts.days as TimesheetCode[])];
    let changed = false;
    for (const dayNum of vacDays) {
      const idx = dayNum - 1;
      if (idx >= 0 && idx < days.length && (days[idx] === '8' || days[idx] === 'В')) { days[idx] = 'О'; changed = true; }
    }
    if (changed) {
      const rate = (ts.work_rate as number) ?? 1.0;
      await db.from('employee_timesheet')
        .update({ days, work_hours: calcWorkHours(days, rate), updated_by: updatedBy, updated_at: new Date().toISOString() })
        .eq('id', ts.id as string);
      applied++;
    }
  }
  if (applied > 0) logger.info(`[calendar] Applied absences to ${applied} timesheets for ${year}-${month}`);
}

/**
 * Propagate template changes to employee timesheets.
 * Only updates days that match the OLD template — manually changed days are preserved.
 */
export async function propagateTemplateChange(
  db: SupabaseClient, year: number, month: number,
  oldDayTypes: TimesheetCode[], newDayTypes: TimesheetCode[], updatedBy: string,
): Promise<number> {
  const { data: timesheets, error: tsErr } = await db
    .from('employee_timesheet')
    .select('id, user_id, days, work_rate')
    .eq('year', year).eq('month', month);

  if (tsErr) throw tsErr;

  let updatedCount = 0;
  for (const ts of timesheets || []) {
    const empDays = ts.days as TimesheetCode[];
    let changed = false;
    const newEmpDays = empDays.map((code, i) => {
      if (i < oldDayTypes.length && code === oldDayTypes[i] && oldDayTypes[i] !== newDayTypes[i]) { changed = true; return newDayTypes[i]; }
      return code;
    });
    if (changed) {
      updatedCount++;
      const rate = (ts.work_rate as number) ?? 1.0;
      await db.from('employee_timesheet')
        .update({ days: newEmpDays, work_hours: calcWorkHours(newEmpDays, rate), updated_by: updatedBy, updated_at: new Date().toISOString() })
        .eq('id', ts.id as string);
    }
  }
  return updatedCount;
}

/**
 * Create timesheets for all active employees based on a month template.
 */
export async function provisionTimesheets(
  db: SupabaseClient, year: number, month: number,
  dayTypes: TimesheetCode[], createdBy: string,
): Promise<number> {
  const { data: employees, error: empErr } = await db
    .from('user_profiles')
    .select('user_id, work_rate')
    .eq('status', 'active');

  if (empErr) throw empErr;
  if (!employees || employees.length === 0) return 0;

  const rows = employees.map(emp => {
    const rate = (emp.work_rate as number) ?? 1.0;
    return { year, month, user_id: emp.user_id as string, days: dayTypes, work_hours: calcWorkHours(dayTypes, rate), work_rate: rate, created_by: createdBy, updated_by: createdBy };
  });

  const { error: tsErr } = await db
    .from('employee_timesheet')
    .upsert(rows, { onConflict: 'year,month,user_id', ignoreDuplicates: true });

  if (tsErr) { logger.error('[calendar] Failed to create timesheets:', tsErr); return 0; }
  logger.info(`[calendar] Created ${employees.length} timesheets for ${year}-${month}`);
  return employees.length;
}
