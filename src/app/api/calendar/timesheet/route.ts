import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { calcWorkHours } from '@/lib/ops/working-days';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import type { TimesheetCode } from '@/types/calendar';
import logger from '@/lib/shared/logger';
import { ROLE_GROUPS, hasRole } from '@/lib/shared/auth/role-groups';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

/**
 * GET /api/calendar/timesheet?year=2026&month=2
 * Возвращает табели сотрудников за месяц (JOIN user_profiles).
 */
export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year'));
  const month = Number(url.searchParams.get('month'));

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Некорректные параметры' }, { status: 400 });
  }

  try {
    const db = getDb();
    const { data, error } = await db
      .from('employee_timesheet')
      .select('id, year, month, user_id, days, work_hours, work_rate, updated_at, user_profiles!employee_timesheet_user_id_fkey(full_name, department_id)')
      .eq('year', year)
      .eq('month', month)
      .order('user_id');

    if (error) throw error;

    // Flatten JOIN
    const result = (data || []).map((row: Record<string, unknown>) => {
      const profile = row.user_profiles as { full_name: string | null; department_id: string | null } | null;
      return {
        id: row.id,
        year: row.year,
        month: row.month,
        user_id: row.user_id,
        days: row.days,
        work_hours: row.work_hours,
        work_rate: (row.work_rate as number) ?? 1.0,
        updated_at: row.updated_at,
        full_name: profile?.full_name ?? null,
        department_id: profile?.department_id ?? null,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error('[calendar/timesheet] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/calendar/timesheet
 * Добавить конкретных сотрудников в месяц (догрузка).
 * Body: { year, month, userIds: string[] }
 */
export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const db = getDb();

  // Role check — only chief/head can add employees
  const { data: callerProfile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (!hasRole(callerProfile?.role as string, ROLE_GROUPS.REPORT_MANAGERS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { year, month, userIds } = body;

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'Некорректные параметры' }, { status: 400 });
    }

    // Получаем шаблон месяца
    const { data: mwd, error: mwdError } = await db
      .from('monthly_working_days')
      .select('day_types, work_hours')
      .eq('year', year)
      .eq('month', month)
      .single();

    if (mwdError || !mwd) {
      return NextResponse.json({ error: 'Месяц не найден' }, { status: 404 });
    }

    const dayTypes = mwd.day_types as TimesheetCode[];

    // Fetch work_rate for each user to snapshot into timesheet
    const { data: profiles } = await db
      .from('user_profiles')
      .select('user_id, work_rate')
      .in('user_id', userIds);

    const rateMap = new Map(
      (profiles || []).map((p) => [p.user_id as string, (p.work_rate as number) ?? 1.0]),
    );

    const rows = userIds.map((uid: string) => {
      const rate = rateMap.get(uid) ?? 1.0;
      return {
        year,
        month,
        user_id: uid,
        days: dayTypes,
        work_hours: calcWorkHours(dayTypes, rate),
        work_rate: rate,
        created_by: userId,
        updated_by: userId,
      };
    });

    const { error: insertError } = await db
      .from('employee_timesheet')
      .upsert(rows, { onConflict: 'year,month,user_id', ignoreDuplicates: true });

    if (insertError) throw insertError;

    logger.info(`[calendar/timesheet] Added ${userIds.length} employees to ${year}-${month}`);
    return NextResponse.json({ ok: true, added: userIds.length });
  } catch (err) {
    logger.error('[calendar/timesheet] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/calendar/timesheet
 * Обновить массив дней сотрудника + пересчитать work_hours.
 * Body: { year, month, userId, days: TimesheetCode[] }
 */
export async function PATCH(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const callerId = getDbUserId(req);
  if (!callerId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  // Role check — only chief/head can edit timesheets
  const db = getDb();
  const { data: callerProfile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', callerId)
    .single();

  if (!hasRole(callerProfile?.role as string, ROLE_GROUPS.REPORT_MANAGERS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { year, month, userId, days } = body;

    if (!Number.isInteger(year) || !Number.isInteger(month) || !userId || !Array.isArray(days)) {
      return NextResponse.json({ error: 'Некорректные параметры' }, { status: 400 });
    }

    // Fetch existing work_rate snapshot for this employee
    const { data: existing } = await db
      .from('employee_timesheet')
      .select('work_rate')
      .eq('year', year)
      .eq('month', month)
      .eq('user_id', userId)
      .single();

    const rate = (existing?.work_rate as number) ?? 1.0;
    const workHours = calcWorkHours(days as TimesheetCode[], rate);

    const { data, error } = await db
      .from('employee_timesheet')
      .update({
        days,
        work_hours: workHours,
        updated_by: callerId,
        updated_at: new Date().toISOString(),
      })
      .eq('year', year)
      .eq('month', month)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (err) {
    logger.error('[calendar/timesheet] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/calendar/timesheet?year=2026&month=2&userId=<uuid>
 * Удалить сотрудника из месяца.
 */
export async function DELETE(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const callerId = getDbUserId(req);
  if (!callerId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  // Role check — only chief/head can delete from timesheets
  const db = getDb();
  const { data: callerProfile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', callerId)
    .single();

  if (!hasRole(callerProfile?.role as string, ROLE_GROUPS.REPORT_MANAGERS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year'));
  const month = Number(url.searchParams.get('month'));
  const targetUserId = url.searchParams.get('userId');

  if (!Number.isInteger(year) || !Number.isInteger(month) || !targetUserId) {
    return NextResponse.json({ error: 'Некорректные параметры' }, { status: 400 });
  }

  try {
    const { error } = await db
      .from('employee_timesheet')
      .delete()
      .eq('year', year)
      .eq('month', month)
      .eq('user_id', targetUserId);

    if (error) throw error;

    logger.info(`[calendar/timesheet] Removed ${targetUserId} from ${year}-${month}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[calendar/timesheet] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
