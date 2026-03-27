import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { generateMonthTemplate, calcWorkHours } from '@/lib/ops/working-days';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import type { TimesheetCode } from '@/types/calendar';
import logger from '@/lib/shared/logger';
import { ROLE_GROUPS, hasRole } from '@/lib/shared/auth/role-groups';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

/**
 * GET /api/calendar/working-days?year=2026
 * Возвращает рабочие часы за все месяцы указанного года.
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

  const yearParam = new URL(req.url).searchParams.get('year');
  const year = yearParam ? Number(yearParam) : new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: 'Некорректный год' }, { status: 400 });
  }

  try {
    const db = getDb();
    const { data, error } = await db
      .from('monthly_working_days')
      .select('year, month, work_hours, day_types, updated_at')
      .eq('year', year)
      .order('month');

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err) {
    logger.error('[calendar/working-days] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/calendar/working-days
 * Создаёт месяц с шаблоном календаря + автоматически добавляет всех active сотрудников.
 * Body: { year, month, dayTypes?: TimesheetCode[] }
 * Если dayTypes не передан — генерируется автоматически (8 на Пн-Пт, В на Сб-Вс).
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

  // Проверка роли — только chief
  const { data: profile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (profile?.role !== 'chief') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { year, month, dayTypes: rawDayTypes } = body;

    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: 'Некорректный год' }, { status: 400 });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Некорректный месяц' }, { status: 400 });
    }

    // Генерируем или валидируем шаблон
    const daysInMonth = new Date(year, month, 0).getDate();
    const dayTypes: TimesheetCode[] = Array.isArray(rawDayTypes) && rawDayTypes.length === daysInMonth
      ? rawDayTypes
      : generateMonthTemplate(year, month);

    const workHours = calcWorkHours(dayTypes);

    // 1. Upsert monthly_working_days
    const { data: mwd, error: mwdError } = await db
      .from('monthly_working_days')
      .upsert(
        {
          year,
          month,
          work_hours: workHours,
          day_types: dayTypes,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'year,month' },
      )
      .select()
      .single();

    if (mwdError) throw mwdError;

    // 2. Автоматически создать timesheet для всех active сотрудников
    const { data: activeEmployees, error: empError } = await db
      .from('user_profiles')
      .select('user_id, work_rate')
      .eq('status', 'active');

    if (empError) throw empError;

    if (activeEmployees && activeEmployees.length > 0) {
      const timesheetRows = activeEmployees.map((emp) => {
        const rate = (emp.work_rate as number) ?? 1.0;
        return {
          year,
          month,
          user_id: emp.user_id as string,
          days: dayTypes,
          work_hours: calcWorkHours(dayTypes, rate),
          work_rate: rate,
          created_by: userId,
          updated_by: userId,
        };
      });

      const { error: tsError } = await db
        .from('employee_timesheet')
        .upsert(timesheetRows, { onConflict: 'year,month,user_id', ignoreDuplicates: true });

      if (tsError) {
        logger.error('[calendar/working-days] Failed to create timesheets:', tsError);
        // Не фейлим весь запрос — месяц создан, timesheets можно добавить позже
      } else {
        logger.info(`[calendar/working-days] Created ${activeEmployees.length} timesheets for ${year}-${month}`);

        // 3. Применить утверждённые відпустки к созданным табелям
        await applyApprovedAbsences(db, year, month, dayTypes, userId);
      }
    }

    logger.info(`[calendar/working-days] Set ${year}-${month} = ${workHours}h by ${userId}`);
    return NextResponse.json(mwd);
  } catch (err) {
    logger.error('[calendar/working-days] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/calendar/working-days
 * Обновить шаблон месяца (day_types) + прокинуть изменения в табели сотрудников.
 * Для каждого сотрудника: если день совпадает со СТАРЫМ шаблоном — заменяется на новый.
 * Если день был изменён вручную (отличается от старого шаблона) — не трогается.
 * Body: { year, month, dayTypes: TimesheetCode[] }
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

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const db = getDb();
  const { data: profile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (!hasRole(profile?.role as string, ROLE_GROUPS.REF_EDITORS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { year, month, dayTypes: newDayTypes } = body;

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Array.isArray(newDayTypes)) {
      return NextResponse.json({ error: 'Некорректные параметры' }, { status: 400 });
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    if (newDayTypes.length !== daysInMonth) {
      return NextResponse.json({ error: 'Неверная длина массива дней' }, { status: 400 });
    }

    // 1. Получаем старый шаблон
    const { data: oldMwd, error: oldErr } = await db
      .from('monthly_working_days')
      .select('day_types')
      .eq('year', year)
      .eq('month', month)
      .single();

    if (oldErr || !oldMwd) {
      return NextResponse.json({ error: 'Месяц не найден' }, { status: 404 });
    }

    const oldDayTypes = (oldMwd.day_types as TimesheetCode[]) || [];
    const newWorkHours = calcWorkHours(newDayTypes);

    // 2. Обновляем monthly_working_days
    const { data: mwd, error: mwdErr } = await db
      .from('monthly_working_days')
      .update({
        day_types: newDayTypes,
        work_hours: newWorkHours,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('year', year)
      .eq('month', month)
      .select()
      .single();

    if (mwdErr) throw mwdErr;

    // 3. Прокинуть изменения в табели сотрудников
    const { data: timesheets, error: tsErr } = await db
      .from('employee_timesheet')
      .select('id, user_id, days, work_rate')
      .eq('year', year)
      .eq('month', month);

    if (tsErr) throw tsErr;

    let updatedCount = 0;
    if (timesheets && timesheets.length > 0) {
      for (const ts of timesheets) {
        const empDays = ts.days as TimesheetCode[];
        let changed = false;
        const newEmpDays = empDays.map((code, i) => {
          if (i < oldDayTypes.length && code === oldDayTypes[i] && oldDayTypes[i] !== newDayTypes[i]) {
            changed = true;
            return newDayTypes[i];
          }
          return code;
        });

        if (changed) {
          updatedCount++;
          const rate = (ts.work_rate as number) ?? 1.0;
          await db.from('employee_timesheet')
            .update({
              days: newEmpDays,
              work_hours: calcWorkHours(newEmpDays, rate),
              updated_by: userId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', ts.id as string);
        }
      }
    }

    logger.info(`[calendar/working-days] PATCH ${year}-${month}: template updated, ${updatedCount} timesheets propagated`);
    return NextResponse.json(mwd);
  } catch (err) {
    logger.error('[calendar/working-days] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/calendar/working-days?year=2026&month=2
 * Удаляет месяц + все его timesheets (только chief).
 */
export async function DELETE(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const db = getDb();
  const { data: profile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (profile?.role !== 'chief') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year'));
  const month = Number(url.searchParams.get('month'));

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return NextResponse.json({ error: 'Некорректные параметры' }, { status: 400 });
  }

  try {
    // Сначала удаляем timesheets за месяц
    await db.from('employee_timesheet').delete().eq('year', year).eq('month', month);

    // Потом удаляем сам месяц
    const { error } = await db
      .from('monthly_working_days')
      .delete()
      .eq('year', year)
      .eq('month', month);

    if (error) throw error;

    logger.info(`[calendar/working-days] Deleted ${year}-${month} by ${userId}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[calendar/working-days] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply approved absences to freshly created timesheets.
 * Finds all approved planned_absences overlapping (year, month),
 * computes workday numbers via getWorkdaysInRange, replaces '8' → 'О'.
 */
async function applyApprovedAbsences(
  db: ReturnType<typeof getDb>,
  year: number,
  month: number,
  dayTypes: TimesheetCode[],
  updatedBy: string,
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

  if (absErr) {
    logger.error('[calendar/working-days] Failed to fetch approved absences:', absErr);
    return;
  }
  if (!absences || absences.length === 0) return;

  // Group ALL calendar days per user (vacation is calendar-based, includes weekends)
  const userVacDays = new Map<string, number[]>();
  for (const abs of absences) {
    const uid = abs.user_id as string;
    const start = new Date(abs.start_date as string);
    const end = new Date(abs.end_date as string);
    const calDays = getCalendarDaysInMonth(start, end, year, month);
    if (calDays.length === 0) continue;
    const existing = userVacDays.get(uid) || [];
    userVacDays.set(uid, [...existing, ...calDays]);
  }

  if (userVacDays.size === 0) return;

  // Fetch timesheets for affected users
  const userIds = [...userVacDays.keys()];
  const { data: timesheets, error: tsErr } = await db
    .from('employee_timesheet')
    .select('id, user_id, days, work_rate')
    .eq('year', year)
    .eq('month', month)
    .in('user_id', userIds);

  if (tsErr || !timesheets) {
    logger.error('[calendar/working-days] Failed to fetch timesheets for absence overlay:', tsErr);
    return;
  }

  let applied = 0;
  for (const ts of timesheets) {
    const vacDays = userVacDays.get(ts.user_id as string);
    if (!vacDays) continue;

    const days = [...(ts.days as TimesheetCode[])];
    let changed = false;
    for (const dayNum of vacDays) {
      const idx = dayNum - 1;
      if (idx >= 0 && idx < days.length && (days[idx] === '8' || days[idx] === 'В')) {
        days[idx] = 'О';
        changed = true;
      }
    }

    if (changed) {
      const rate = (ts.work_rate as number) ?? 1.0;
      await db
        .from('employee_timesheet')
        .update({
          days,
          work_hours: calcWorkHours(days, rate),
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ts.id as string);
      applied++;
    }
  }

  if (applied > 0) {
    logger.info(`[calendar/working-days] Applied approved absences to ${applied} timesheets for ${year}-${month}`);
  }
}

/** Get ALL day numbers (1-based) within a specific month that fall in [start, end] — calendar days including weekends */
function getCalendarDaysInMonth(start: Date, end: Date, year: number, month: number): number[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  // Normalize to local midnight to avoid UTC vs local mismatch
  const startLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endLocal = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const result: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    if (date >= startLocal && date <= endLocal) {
      result.push(d);
    }
  }
  return result;
}
