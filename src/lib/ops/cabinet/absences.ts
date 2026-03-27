/**
 * Planned absences service — structured vacation requests (KZoT: 24 calendar days).
 * Types: '14d' (max 1/year) + remaining 10 days as '10d' (1×) OR '5d' (2×).
 * Create/cancel/approve/reject + timesheet integration with cross-month support.
 */

import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import type { TimesheetCode } from '@/types/calendar';
import { calcWorkHours } from '@/lib/ops/working-days';
import logger from '@/lib/shared/logger';

export type AbsenceType = '14d' | '10d' | '5d';

export interface AbsenceRow {
  id: string;
  user_id: string;
  year: number;
  month: number;
  days: number[];
  absence_type: AbsenceType;
  start_date: string | null;
  end_date: string | null;
  calendar_days: number | null;
  status: 'pending' | 'approved' | 'rejected';
  comment: string | null;
  reject_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  editable?: boolean;
  // JOIN fields
  full_name?: string;
  department_id?: string | null;
}

export interface YearlyQuota {
  used14d: number;
  used10d: number;
  used5d: number;
  totalDays: number;
}

const SELECT_COLS =
  'id, user_id, year, month, days, absence_type, start_date, end_date, calendar_days, status, comment, reject_reason, approved_by, approved_at, created_at';

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getMyAbsences(
  db: SupabaseClient,
  userId: string,
  year: number,
): Promise<AbsenceRow[]> {
  const [{ data, error }, { data: timesheets }] = await Promise.all([
    db.from('planned_absences').select(SELECT_COLS).eq('user_id', userId).eq('year', year).order('start_date'),
    db.from('employee_timesheet').select('year, month').eq('user_id', userId).eq('year', year),
  ]);

  if (error) throw error;

  const tsSet = new Set((timesheets || []).map(t => `${t.year}-${t.month}`));

  return (data || []).map(row => {
    const r = row as AbsenceRow;
    let editable = r.status === 'pending' || r.status === 'approved';
    if (editable && r.start_date && r.end_date) {
      const months = getMonthsInRange(new Date(r.start_date), new Date(r.end_date));
      if (months.some(m => tsSet.has(`${m.year}-${m.month}`))) editable = false;
    }
    return { ...r, editable };
  });
}

export async function getPendingApprovals(
  db: SupabaseClient,
  approverId: string,
): Promise<AbsenceRow[]> {
  const { data: approver } = await db
    .from('user_profiles')
    .select('role, department_id')
    .eq('user_id', approverId)
    .single();

  if (!approver) return [];
  const { role, department_id } = approver;

  if (role !== 'chief' && role !== 'head') return [];

  const query = db
    .from('planned_absences')
    .select(`${SELECT_COLS}, user_profiles!planned_absences_user_id_fkey(full_name, department_id, role)`)
    .eq('status', 'pending')
    .order('created_at');

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []).map((r: Record<string, unknown>) => {
    const profile = r.user_profiles as { full_name: string; department_id: string | null; role: string } | null;
    return {
      ...stripJoin(r),
      full_name: profile?.full_name ?? '',
      department_id: profile?.department_id ?? null,
      _targetRole: profile?.role ?? '',
    } as AbsenceRow & { _targetRole: string };
  });

  if (role === 'head') {
    // Head approves only employees/analysts in own dept — not other heads
    return rows.filter(r => r.department_id === department_id && r._targetRole !== 'head' && r._targetRole !== 'chief');
  }
  return rows;
}

export async function getYearlyQuota(
  db: SupabaseClient,
  userId: string,
  year: number,
): Promise<YearlyQuota> {
  const { data, error } = await db
    .from('planned_absences')
    .select('absence_type, calendar_days, status')
    .eq('user_id', userId)
    .eq('year', year)
    .in('status', ['pending', 'approved']);

  if (error) throw error;

  let used14d = 0;
  let used10d = 0;
  let used5d = 0;
  let totalDays = 0;

  for (const row of data || []) {
    if (row.absence_type === '14d') used14d++;
    else if (row.absence_type === '10d') used10d++;
    else used5d++;
    totalDays += (row.calendar_days as number) || 0;
  }

  return { used14d, used10d, used5d, totalDays };
}

// ---------------------------------------------------------------------------
// Team calendar (for chief/head) — yearly overview
// ---------------------------------------------------------------------------

/** Minimal absence info for the team calendar popover */
export interface TeamAbsenceInfo {
  id: string;
  absenceType: AbsenceType;
  status: 'pending' | 'approved';
  startDate: string;
  endDate: string;
  calendarDays: number;
  /** True if any month of this absence has a generated timesheet — can't edit/delete */
  locked: boolean;
}

/** Per-employee monthly vacation days with concrete day numbers */
export interface TeamVacationRow {
  userId: string;
  fullName: string;
  /** Employee role (for UI sorting — managers on top) */
  role?: string;
  /** Approved day numbers per month (index 0 = Jan, 11 = Dec) */
  approvedDays: number[][];
  /** Pending day numbers per month */
  pendingDays: number[][];
  totalDays: number;
  /** All absences for this employee in the year */
  absences: TeamAbsenceInfo[];
}

export interface TeamAbsencesResult {
  rows: TeamVacationRow[];
  requesterRole: string;
}

export async function getTeamAbsences(
  db: SupabaseClient,
  requesterId: string,
  year: number,
): Promise<TeamAbsencesResult> {
  // 1. Get requester profile
  const { data: requester } = await db
    .from('user_profiles')
    .select('role, department_id')
    .eq('user_id', requesterId)
    .single();

  if (!requester) throw new Error('Профіль не знайдено');

  const requesterRole = requester.role as string;
  const isManager = requesterRole === 'chief' || requesterRole === 'head';
  const isPastYear = year < new Date().getFullYear();

  // 2. Fetch employees in scope
  //    chief → all; head → own dept + all heads + chief; employee → own dept
  let empQuery = db
    .from('user_profiles')
    .select('user_id, full_name, department_id, role, status')
    .neq('role', 'kb_user')
    .order('full_name');

  if (requesterRole === 'chief') {
    // chief sees everyone — no department filter
  } else if (requesterRole === 'head') {
    // head: own department + all heads + chief (via OR)
    empQuery = empQuery.or(
      `department_id.eq.${requester.department_id},role.eq.head,role.eq.chief`,
    );
  } else {
    // employee/analyst: own department only
    if (requester.department_id) {
      empQuery = empQuery.eq('department_id', requester.department_id);
    }
  }

  const [{ data: employees, error: empErr }, timesheetResult, absencesResult] =
    await Promise.all([
      empQuery,
      // 3. Timesheets — for past year filtering + lock detection
      db.from('employee_timesheet').select('user_id, month').eq('year', year),
      // 4. Fetch absences for the year
      db
        .from('planned_absences')
        .select(SELECT_COLS)
        .in('status', ['approved', 'pending'])
        .lte('start_date', `${year}-12-31`)
        .gte('end_date', `${year}-01-01`),
    ]);

  if (empErr) throw empErr;
  if (absencesResult.error) throw absencesResult.error;

  // Set of users with absences this year
  const usersWithAbsences = new Set<string>();
  for (const r of absencesResult.data || []) {
    usersWithAbsences.add(r.user_id as string);
  }

  // Set of users with timesheets (for past year filtering)
  const timesheetUsers = isPastYear
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? new Set(((timesheetResult.data || []) as any[]).map(t => t.user_id as string))
    : null;

  // Map of user_id → Set<month> for lock detection
  const timesheetMonths = new Map<string, Set<number>>();
  for (const t of timesheetResult.data || []) {
    const uid = (t as { user_id: string }).user_id;
    const m = (t as { month: number }).month;
    if (!timesheetMonths.has(uid)) timesheetMonths.set(uid, new Set());
    timesheetMonths.get(uid)!.add(m);
  }

  // 5. Build rows — filter blocked & past-year employees
  const map = new Map<string, TeamVacationRow>();
  for (const emp of employees || []) {
    const uid = emp.user_id as string;
    const empStatus = emp.status as string;
    const empRole = emp.role as string;

    // Skip blocked employees unless they have absences this year
    if (empStatus === 'blocked' && !usersWithAbsences.has(uid)) continue;

    // Past year: only show employees who had timesheets (or have absences)
    if (timesheetUsers && !timesheetUsers.has(uid) && !usersWithAbsences.has(uid)) continue;

    map.set(uid, {
      userId: uid,
      fullName: (emp.full_name as string) ?? '',
      role: empRole,
      approvedDays: Array.from({ length: 12 }, () => []),
      pendingDays: Array.from({ length: 12 }, () => []),
      totalDays: 0,
      absences: [],
    });
  }

  // 6. Fill in absence days
  for (const r of absencesResult.data || []) {
    const userId = r.user_id as string;
    const row = map.get(userId);
    if (!row) continue;

    const start = new Date(r.start_date as string);
    const end = new Date(r.end_date as string);
    const isPending = r.status === 'pending';

    // Check if any month of this absence has a generated timesheet → locked
    const userTs = timesheetMonths.get(userId);
    const absMonths = getMonthsInRange(start, end);
    const locked = !!userTs && absMonths.some(m => userTs.has(m.month));

    row.absences.push({
      id: r.id as string,
      absenceType: r.absence_type as AbsenceType,
      status: r.status as 'pending' | 'approved',
      startDate: r.start_date as string,
      endDate: r.end_date as string,
      calendarDays: (r.calendar_days as number) || 0,
      locked,
    });

    for (let m = 0; m < 12; m++) {
      const mStart = new Date(year, m, 1);
      const mEnd = new Date(year, m + 1, 0);
      const overlapStart = start > mStart ? start : mStart;
      const overlapEnd = end < mEnd ? end : mEnd;
      if (overlapStart <= overlapEnd) {
        const target = isPending ? row.pendingDays[m] : row.approvedDays[m];
        for (let d = overlapStart.getDate(); d <= overlapEnd.getDate(); d++) {
          target.push(d);
        }
        row.totalDays += overlapEnd.getDate() - overlapStart.getDate() + 1;
      }
    }
  }

  // 7. Sort: requester first, then managers on top, then alphabetically
  const managerRoles = new Set(['chief', 'head']);
  const rows = Array.from(map.values()).sort((a, b) => {
    if (a.userId === requesterId) return -1;
    if (b.userId === requesterId) return 1;
    const aManager = managerRoles.has(a.role || '');
    const bManager = managerRoles.has(b.role || '');
    if (aManager !== bManager) return aManager ? -1 : 1;
    return a.fullName.localeCompare(b.fullName, 'uk');
  });

  return { rows, requesterRole: isManager ? requesterRole : requesterRole };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function createAbsence(
  db: SupabaseClient,
  userId: string,
  params: { absence_type: AbsenceType; start_date: string; comment?: string },
): Promise<AbsenceRow> {
  const { absence_type, start_date: startStr, comment } = params;
  const calendarDays = absence_type === '14d' ? 14 : absence_type === '10d' ? 10 : 5;
  const startDate = new Date(startStr);

  if (isNaN(startDate.getTime())) throw new Error('Некоректна дата');

  const year = startDate.getFullYear();
  const endDate = addCalendarDays(startDate, calendarDays - 1);
  const month = startDate.getMonth() + 1;

  // Check quota: 14d (max 1) + remaining 10 days as either 1×10d or 2×5d (mutually exclusive)
  const quota = await getYearlyQuota(db, userId, year);
  if (absence_type === '14d' && quota.used14d >= 1) {
    throw new Error('Вже є заявка на 14 днів за цей рік');
  }
  if (absence_type === '10d') {
    if (quota.used10d >= 1) throw new Error('Вже є заявка на 10 днів за цей рік');
    if (quota.used5d > 0) throw new Error('Вже є заявка на 5 днів — не можна додати 10д');
  }
  if (absence_type === '5d') {
    if (quota.used5d >= 2) throw new Error('Вже є 2 заявки по 5 днів за цей рік');
    if (quota.used10d > 0) throw new Error('Вже є заявка на 10 днів — не можна додати 5д');
  }

  // Check overlap with existing approved/pending absences
  await checkOverlap(db, userId, year, startDate, endDate);

  // Check: no two absences touching the same calendar month
  await checkSameMonth(db, userId, startDate, endDate);

  // Compute calendar days per month (vacation is calendar-based, includes weekends)
  const days = getCalendarDaysInRange(startDate, endDate, month);

  // Chief: auto-approve
  const { data: profile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();
  const isChief = profile?.role === 'chief';

  const { data, error } = await db
    .from('planned_absences')
    .insert({
      user_id: userId,
      year,
      month,
      days,
      absence_type,
      start_date: fmt(startDate),
      end_date: fmt(endDate),
      calendar_days: calendarDays,
      comment: comment || null,
      ...(isChief ? {
        status: 'approved',
        approved_by: userId,
        approved_at: new Date().toISOString(),
      } : {}),
    })
    .select(SELECT_COLS)
    .single();

  if (error) throw error;

  // Chief: apply to timesheet immediately
  if (isChief) {
    const months = getMonthsInRange(startDate, endDate);
    for (const { year: y, month: m } of months) {
      const calDays = getCalendarDaysInRange(startDate, endDate, m, y);
      if (calDays.length > 0) {
        await applyVacationToTimesheet(db, userId, y, m, calDays, userId);
      }
    }
    logger.info(`[Absences] Chief auto-approved absence for ${userId}`);
  }

  return data as unknown as AbsenceRow;
}

export async function deleteAbsence(
  db: SupabaseClient,
  userId: string,
  absenceId: string,
): Promise<void> {
  // Load absence to check status and revert timesheet if needed
  const { data: absence, error: fetchErr } = await db
    .from('planned_absences')
    .select(SELECT_COLS)
    .eq('id', absenceId)
    .eq('user_id', userId)
    .in('status', ['pending', 'approved'])
    .single();

  if (fetchErr || !absence) {
    throw new Error('Заявку не знайдено або її не можна скасувати');
  }

  // If approved with dates — revert timesheet (remove 'О' codes, restore '8'/'В')
  if (absence.status === 'approved' && absence.start_date && absence.end_date) {
    const start = new Date(absence.start_date as string);
    const end = new Date(absence.end_date as string);
    const months = getMonthsInRange(start, end);

    for (const { year, month } of months) {
      await revertVacationFromTimesheet(db, userId, year, month, start, end);
    }
  }

  const { error } = await db
    .from('planned_absences')
    .delete()
    .eq('id', absenceId)
    .eq('user_id', userId);

  if (error) throw error;
  logger.info(`[Absences] Deleted absence ${absenceId} by ${userId}`);
}

export async function updateAbsence(
  db: SupabaseClient,
  userId: string,
  absenceId: string,
  params: { start_date: string },
): Promise<AbsenceRow> {
  // 1. Load existing absence (only pending/approved, owned by user)
  const { data: existing, error: fetchErr } = await db
    .from('planned_absences')
    .select(SELECT_COLS)
    .eq('id', absenceId)
    .eq('user_id', userId)
    .in('status', ['pending', 'approved'])
    .single();

  if (fetchErr || !existing) {
    throw new Error('Заявку не знайдено або її не можна змінити');
  }
  const absence = existing as unknown as AbsenceRow;

  const startDate = new Date(params.start_date);
  if (isNaN(startDate.getTime())) throw new Error('Некоректна дата');

  const calendarDays = absence.absence_type === '14d' ? 14 : absence.absence_type === '10d' ? 10 : 5;
  const endDate = addCalendarDays(startDate, calendarDays - 1);
  const newYear = startDate.getFullYear();
  const newMonth = startDate.getMonth() + 1;

  // 2. Check overlap (exclude self)
  await checkOverlap(db, userId, newYear, startDate, endDate, absenceId);

  // Check: no two absences in the same month
  await checkSameMonth(db, userId, startDate, endDate, absenceId);

  // 4. Recompute calendar days
  const days = getCalendarDaysInRange(startDate, endDate, newMonth);

  // 5. Update — reset approval
  const { data, error } = await db
    .from('planned_absences')
    .update({
      start_date: fmt(startDate),
      end_date: fmt(endDate),
      year: newYear,
      month: newMonth,
      days,
      calendar_days: calendarDays,
      status: 'pending',
      approved_by: null,
      approved_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', absenceId)
    .select(SELECT_COLS)
    .single();

  if (error) throw error;

  logger.info(`[Absences] Updated absence ${absenceId} by ${userId}: new start ${params.start_date}`);
  return data as unknown as AbsenceRow;
}

// ---------------------------------------------------------------------------
// Approve / Reject
// ---------------------------------------------------------------------------

export async function approveAbsence(
  db: SupabaseClient,
  approverId: string,
  absenceId: string,
): Promise<void> {
  const absence = await getAbsenceForApproval(db, approverId, absenceId);

  // 1. Update status
  const { error: updErr } = await db
    .from('planned_absences')
    .update({
      status: 'approved',
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', absenceId);
  if (updErr) throw updErr;

  // 2. Write 'О' into timesheet — handle cross-month
  if (absence.start_date && absence.end_date) {
    const start = new Date(absence.start_date);
    const end = new Date(absence.end_date);
    const months = getMonthsInRange(start, end);

    for (const { year, month } of months) {
      const calDays = getCalendarDaysInRange(start, end, month, year);
      if (calDays.length > 0) {
        await applyVacationToTimesheet(db, absence.user_id, year, month, calDays, approverId);
      }
    }
  } else {
    // Legacy: fallback for old-format rows without start_date/end_date
    await applyVacationToTimesheet(db, absence.user_id, absence.year, absence.month, absence.days, approverId);
  }

  logger.info(`[Absences] Approved ${absenceId} by ${approverId}`);
}

export async function rejectAbsence(
  db: SupabaseClient,
  approverId: string,
  absenceId: string,
  reason: string,
): Promise<void> {
  await getAbsenceForApproval(db, approverId, absenceId);

  const { error } = await db
    .from('planned_absences')
    .update({
      status: 'rejected',
      reject_reason: reason,
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', absenceId);
  if (error) throw error;

  logger.info(`[Absences] Rejected ${absenceId} by ${approverId}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAbsenceForApproval(
  db: SupabaseClient,
  approverId: string,
  absenceId: string,
): Promise<AbsenceRow> {
  const { data: absence } = await db
    .from('planned_absences')
    .select(`${SELECT_COLS}, user_profiles!planned_absences_user_id_fkey(department_id, role)`)
    .eq('id', absenceId)
    .eq('status', 'pending')
    .single();

  if (!absence) throw new Error('Заявку не знайдено');

  const profile = (absence as Record<string, unknown>).user_profiles as { department_id: string | null; role: string } | null;
  const targetDeptId = profile?.department_id ?? null;
  const targetRole = profile?.role ?? '';

  const { data: approver } = await db
    .from('user_profiles')
    .select('role, department_id')
    .eq('user_id', approverId)
    .single();

  if (!approver) throw new Error('Не вдалось визначити права');

  const isChief = approver.role === 'chief';
  // Head can only approve employees/analysts in own dept — NOT other heads or chief
  const isHeadOwnDept = approver.role === 'head'
    && approver.department_id === targetDeptId
    && targetRole !== 'head' && targetRole !== 'chief';

  if (!isChief && !isHeadOwnDept) {
    throw new Error('Недостатньо прав для затвердження');
  }

  return stripJoin(absence as Record<string, unknown>) as unknown as AbsenceRow;
}

async function applyVacationToTimesheet(
  db: SupabaseClient,
  userId: string,
  year: number,
  month: number,
  vacationDays: number[],
  approverId: string,
): Promise<void> {
  const { data: ts } = await db
    .from('employee_timesheet')
    .select('id, days, work_rate')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month)
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
      .eq('year', year)
      .eq('month', month)
      .single();

    if (!mwd?.day_types) {
      // Calendar not created yet — skip; vacation will be applied when calendar is created
      logger.info(`[Absences] Calendar ${month}/${year} not ready, skipping timesheet update for ${userId}`);
      return;
    }

    days = [...(mwd.day_types as TimesheetCode[])];

    const { data: profile } = await db
      .from('user_profiles')
      .select('work_rate')
      .eq('user_id', userId)
      .single();
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
    const { error } = await db
      .from('employee_timesheet')
      .update({ days, work_hours: workHours, updated_by: approverId, updated_at: new Date().toISOString() })
      .eq('id', ts.id);
    if (error) throw error;
  } else {
    const { error } = await db
      .from('employee_timesheet')
      .insert({
        year, month, user_id: userId,
        days, work_hours: workHours, work_rate: workRate,
        created_by: approverId, updated_by: approverId,
      });
    if (error) throw error;
  }
}

/** Revert vacation codes ('О') in timesheet when deleting an approved absence.
 *  Restores '8' for workdays and 'В' for weekends. */
async function revertVacationFromTimesheet(
  db: SupabaseClient,
  userId: string,
  year: number,
  month: number,
  start: Date,
  end: Date,
): Promise<void> {
  const { data: ts } = await db
    .from('employee_timesheet')
    .select('id, days, work_rate')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month)
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
  const { error } = await db
    .from('employee_timesheet')
    .update({ days, work_hours: workHours, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', ts.id);
  if (error) throw error;
}

async function checkOverlap(
  db: SupabaseClient,
  userId: string,
  year: number,
  start: Date,
  end: Date,
  excludeId?: string,
): Promise<void> {
  let query = db
    .from('planned_absences')
    .select('id, start_date, end_date')
    .eq('user_id', userId)
    .eq('year', year)
    .in('status', ['pending', 'approved'])
    .not('start_date', 'is', null);

  if (excludeId) query = query.neq('id', excludeId);

  const { data } = await query;

  for (const row of data || []) {
    const existStart = new Date(row.start_date as string);
    const existEnd = new Date(row.end_date as string);
    if (start <= existEnd && end >= existStart) {
      throw new Error('Дати перетинаються з існуючою заявкою');
    }
  }
}

/** Prevent two absences whose date ranges touch the same calendar month */
async function checkSameMonth(
  db: SupabaseClient,
  userId: string,
  start: Date,
  end: Date,
  excludeId?: string,
): Promise<void> {
  const newMonths = getMonthsInRange(start, end);

  let query = db
    .from('planned_absences')
    .select('id, start_date, end_date')
    .eq('user_id', userId)
    .in('status', ['pending', 'approved'])
    .not('start_date', 'is', null);

  if (excludeId) query = query.neq('id', excludeId);

  const { data } = await query;

  for (const row of data || []) {
    const exMonths = getMonthsInRange(
      new Date(row.start_date as string),
      new Date(row.end_date as string),
    );
    for (const nm of newMonths) {
      if (exMonths.some(em => em.year === nm.year && em.month === nm.month)) {
        throw new Error('В цьому місяці вже є відпустка');
      }
    }
  }
}

/** Add N calendar days to a date */
function addCalendarDays(date: Date, n: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + n);
  return result;
}

/** Get ALL calendar day numbers (1-based) within a specific month that fall in [start, end] range (includes weekends) */
function getCalendarDaysInRange(start: Date, end: Date, targetMonth: number, targetYear?: number): number[] {
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

/** Get workday numbers (1-based) within a specific month that fall in [start, end] range */
export function getWorkdaysInRange(start: Date, end: Date, targetMonth: number, targetYear?: number): number[] {
  const year = targetYear ?? start.getFullYear();
  const daysInMonth = new Date(year, targetMonth, 0).getDate();
  // Normalize to local midnight to avoid UTC vs local mismatch
  const startLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endLocal = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const result: number[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, targetMonth - 1, d);
    if (date < startLocal || date > endLocal) continue;
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) {
      result.push(d);
    }
  }
  return result;
}

/** Get all year/month pairs touched by a date range */
function getMonthsInRange(start: Date, end: Date): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cur <= endMonth) {
    result.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function stripJoin(row: Record<string, unknown>): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user_profiles: _join, ...rest } = row;
  return rest;
}
