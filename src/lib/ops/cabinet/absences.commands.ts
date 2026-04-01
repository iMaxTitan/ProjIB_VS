/**
 * Absences — write operations (create, update, delete, approve, reject).
 */
import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import type { AbsenceRow, AbsenceType } from './absences.types';
import { SELECT_COLS } from './absences.types';
import { getYearlyQuota } from './absences.queries';
import {
  addCalendarDays, getCalendarDaysInRange, getMonthsInRange, fmt,
  stripJoin, checkOverlap, checkSameMonth,
  applyVacationToTimesheet, revertVacationFromTimesheet,
} from './absences.helpers';
import logger from '@/lib/shared/logger';

export async function createAbsence(
  db: SupabaseClient, userId: string,
  params: { absence_type: AbsenceType; start_date: string; comment?: string },
): Promise<AbsenceRow> {
  const { absence_type, start_date: startStr, comment } = params;
  const calendarDays = absence_type === '14d' ? 14 : absence_type === '10d' ? 10 : 5;
  const startDate = new Date(startStr);
  if (isNaN(startDate.getTime())) throw new Error('Некоректна дата');

  const year = startDate.getFullYear();
  const endDate = addCalendarDays(startDate, calendarDays - 1);
  const month = startDate.getMonth() + 1;

  const quota = await getYearlyQuota(db, userId, year);
  if (absence_type === '14d' && quota.used14d >= 1) throw new Error('Вже є заявка на 14 днів за цей рік');
  if (absence_type === '10d') {
    if (quota.used10d >= 1) throw new Error('Вже є заявка на 10 днів за цей рік');
    if (quota.used5d > 0) throw new Error('Вже є заявка на 5 днів — не можна додати 10д');
  }
  if (absence_type === '5d') {
    if (quota.used5d >= 2) throw new Error('Вже є 2 заявки по 5 днів за цей рік');
    if (quota.used10d > 0) throw new Error('Вже є заявка на 10 днів — не можна додати 5д');
  }

  await checkOverlap(db, userId, year, startDate, endDate);
  await checkSameMonth(db, userId, startDate, endDate);

  const days = getCalendarDaysInRange(startDate, endDate, month);

  const { data: profile } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  const isChief = profile?.role === 'chief';

  const { data, error } = await db.from('planned_absences')
    .insert({
      user_id: userId, year, month, days, absence_type,
      start_date: fmt(startDate), end_date: fmt(endDate), calendar_days: calendarDays,
      comment: comment || null,
      ...(isChief ? { status: 'approved', approved_by: userId, approved_at: new Date().toISOString() } : {}),
    })
    .select(SELECT_COLS).single();
  if (error) throw error;

  if (isChief) {
    for (const { year: y, month: m } of getMonthsInRange(startDate, endDate)) {
      const calDays = getCalendarDaysInRange(startDate, endDate, m, y);
      if (calDays.length > 0) await applyVacationToTimesheet(db, userId, y, m, calDays, userId);
    }
    logger.info(`[Absences] Chief auto-approved absence for ${userId}`);
  }

  return data as unknown as AbsenceRow;
}

export async function deleteAbsence(
  db: SupabaseClient, userId: string, absenceId: string,
): Promise<void> {
  const { data: absence, error: fetchErr } = await db.from('planned_absences')
    .select(SELECT_COLS).eq('id', absenceId).eq('user_id', userId)
    .in('status', ['pending', 'approved']).single();
  if (fetchErr || !absence) throw new Error('Заявку не знайдено або її не можна скасувати');

  if (absence.status === 'approved' && absence.start_date && absence.end_date) {
    const start = new Date(absence.start_date as string);
    const end = new Date(absence.end_date as string);
    for (const { year, month } of getMonthsInRange(start, end)) {
      await revertVacationFromTimesheet(db, userId, year, month, start, end);
    }
  }

  const { error } = await db.from('planned_absences').delete().eq('id', absenceId).eq('user_id', userId);
  if (error) throw error;
  logger.info(`[Absences] Deleted absence ${absenceId} by ${userId}`);
}

export async function updateAbsence(
  db: SupabaseClient, userId: string, absenceId: string,
  params: { start_date: string },
): Promise<AbsenceRow> {
  const { data: existing, error: fetchErr } = await db.from('planned_absences')
    .select(SELECT_COLS).eq('id', absenceId).eq('user_id', userId)
    .in('status', ['pending', 'approved']).single();
  if (fetchErr || !existing) throw new Error('Заявку не знайдено або її не можна змінити');
  const absence = existing as unknown as AbsenceRow;

  const startDate = new Date(params.start_date);
  if (isNaN(startDate.getTime())) throw new Error('Некоректна дата');

  const calendarDays = absence.absence_type === '14d' ? 14 : absence.absence_type === '10d' ? 10 : 5;
  const endDate = addCalendarDays(startDate, calendarDays - 1);
  const newYear = startDate.getFullYear();
  const newMonth = startDate.getMonth() + 1;

  await checkOverlap(db, userId, newYear, startDate, endDate, absenceId);
  await checkSameMonth(db, userId, startDate, endDate, absenceId);

  const days = getCalendarDaysInRange(startDate, endDate, newMonth);

  const { data, error } = await db.from('planned_absences')
    .update({
      start_date: fmt(startDate), end_date: fmt(endDate),
      year: newYear, month: newMonth, days, calendar_days: calendarDays,
      status: 'pending', approved_by: null, approved_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', absenceId).select(SELECT_COLS).single();
  if (error) throw error;

  logger.info(`[Absences] Updated absence ${absenceId} by ${userId}: new start ${params.start_date}`);
  return data as unknown as AbsenceRow;
}

export async function approveAbsence(
  db: SupabaseClient, approverId: string, absenceId: string,
): Promise<void> {
  const absence = await getAbsenceForApproval(db, approverId, absenceId);

  const { error: updErr } = await db.from('planned_absences')
    .update({ status: 'approved', approved_by: approverId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', absenceId);
  if (updErr) throw updErr;

  if (absence.start_date && absence.end_date) {
    const start = new Date(absence.start_date);
    const end = new Date(absence.end_date);
    for (const { year, month } of getMonthsInRange(start, end)) {
      const calDays = getCalendarDaysInRange(start, end, month, year);
      if (calDays.length > 0) await applyVacationToTimesheet(db, absence.user_id, year, month, calDays, approverId);
    }
  } else {
    await applyVacationToTimesheet(db, absence.user_id, absence.year, absence.month, absence.days, approverId);
  }
  logger.info(`[Absences] Approved ${absenceId} by ${approverId}`);
}

export async function rejectAbsence(
  db: SupabaseClient, approverId: string, absenceId: string, reason: string,
): Promise<void> {
  await getAbsenceForApproval(db, approverId, absenceId);
  const { error } = await db.from('planned_absences')
    .update({ status: 'rejected', reject_reason: reason, approved_by: approverId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', absenceId);
  if (error) throw error;
  logger.info(`[Absences] Rejected ${absenceId} by ${approverId}`);
}

// ─── Internal ──────────────────────────────────────────────────

async function getAbsenceForApproval(
  db: SupabaseClient, approverId: string, absenceId: string,
): Promise<AbsenceRow> {
  const { data: absence } = await db.from('planned_absences')
    .select(`${SELECT_COLS}, user_profiles!planned_absences_user_id_fkey(department_id, role)`)
    .eq('id', absenceId).eq('status', 'pending').single();
  if (!absence) throw new Error('Заявку не знайдено');

  const profile = (absence as Record<string, unknown>).user_profiles as { department_id: string | null; role: string } | null;
  const targetDeptId = profile?.department_id ?? null;
  const targetRole = profile?.role ?? '';

  const { data: approver } = await db.from('user_profiles').select('role, department_id').eq('user_id', approverId).single();
  if (!approver) throw new Error('Не вдалось визначити права');

  const isChief = approver.role === 'chief';
  const isHeadOwnDept = approver.role === 'head' && approver.department_id === targetDeptId && targetRole !== 'head' && targetRole !== 'chief';
  if (!isChief && !isHeadOwnDept) throw new Error('Недостатньо прав для затвердження');

  return stripJoin(absence as Record<string, unknown>) as unknown as AbsenceRow;
}
