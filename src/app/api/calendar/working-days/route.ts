import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { generateMonthTemplate, calcWorkHours } from '@/lib/ops/working-days';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import type { TimesheetCode } from '@/types/calendar';
import logger from '@/lib/shared/logger';
import { ROLE_GROUPS, hasRole } from '@/lib/shared/auth/role-groups';
import { applyApprovedAbsences, propagateTemplateChange, provisionTimesheets } from '@/lib/ops/calendar-commands';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

// ─── GET ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });

  const year = Number(new URL(req.url).searchParams.get('year')) || new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return NextResponse.json({ error: 'Некорректний рік' }, { status: 400 });

  try {
    const { data, error } = await getDb().from('monthly_working_days').select('year, month, work_hours, day_types, updated_at').eq('year', year).order('month');
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err) {
    logger.error('[calendar/working-days] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });

  const userId = getDbUserId(req);
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const db = getDb();
  const { data: profile } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  if (profile?.role !== 'chief') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { year, month, dayTypes: rawDayTypes } = await req.json();
    if (!Number.isInteger(year) || year < 2020 || year > 2100) return NextResponse.json({ error: 'Некорректний рік' }, { status: 400 });
    if (!Number.isInteger(month) || month < 1 || month > 12) return NextResponse.json({ error: 'Некорректний місяць' }, { status: 400 });

    const daysInMonth = new Date(year, month, 0).getDate();
    const dayTypes: TimesheetCode[] = Array.isArray(rawDayTypes) && rawDayTypes.length === daysInMonth ? rawDayTypes : generateMonthTemplate(year, month);
    const workHours = calcWorkHours(dayTypes);

    const { data: mwd, error: mwdErr } = await db
      .from('monthly_working_days')
      .upsert({ year, month, work_hours: workHours, day_types: dayTypes, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'year,month' })
      .select().single();
    if (mwdErr) throw mwdErr;

    const created = await provisionTimesheets(db, year, month, dayTypes, userId);
    if (created > 0) await applyApprovedAbsences(db, year, month, userId);

    logger.info(`[calendar/working-days] Set ${year}-${month} = ${workHours}h by ${userId}`);
    return NextResponse.json(mwd);
  } catch (err) {
    logger.error('[calendar/working-days] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PATCH ────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  if (!isRequestAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });

  const userId = getDbUserId(req);
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const db = getDb();
  const { data: profile } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  if (!hasRole(profile?.role as string, ROLE_GROUPS.REF_EDITORS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { year, month, dayTypes: newDayTypes } = await req.json();
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Array.isArray(newDayTypes)) return NextResponse.json({ error: 'Некорректні параметри' }, { status: 400 });
    if (newDayTypes.length !== new Date(year, month, 0).getDate()) return NextResponse.json({ error: 'Невірна довжина масиву днів' }, { status: 400 });

    const { data: oldMwd, error: oldErr } = await db.from('monthly_working_days').select('day_types').eq('year', year).eq('month', month).single();
    if (oldErr || !oldMwd) return NextResponse.json({ error: 'Місяць не знайдено' }, { status: 404 });

    const oldDayTypes = (oldMwd.day_types as TimesheetCode[]) || [];
    const newWorkHours = calcWorkHours(newDayTypes);

    const { data: mwd, error: mwdErr } = await db.from('monthly_working_days')
      .update({ day_types: newDayTypes, work_hours: newWorkHours, updated_by: userId, updated_at: new Date().toISOString() })
      .eq('year', year).eq('month', month).select().single();
    if (mwdErr) throw mwdErr;

    const updatedCount = await propagateTemplateChange(db, year, month, oldDayTypes, newDayTypes, userId);
    logger.info(`[calendar/working-days] PATCH ${year}-${month}: template updated, ${updatedCount} timesheets propagated`);
    return NextResponse.json(mwd);
  } catch (err) {
    logger.error('[calendar/working-days] PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE ───────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  if (!isRequestAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = getDbUserId(req);
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const db = getDb();
  const { data: profile } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  if (profile?.role !== 'chief') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year'));
  const month = Number(url.searchParams.get('month'));
  if (!Number.isInteger(year) || !Number.isInteger(month)) return NextResponse.json({ error: 'Некорректні параметри' }, { status: 400 });

  try {
    await db.from('employee_timesheet').delete().eq('year', year).eq('month', month);
    const { error } = await db.from('monthly_working_days').delete().eq('year', year).eq('month', month);
    if (error) throw error;
    logger.info(`[calendar/working-days] Deleted ${year}-${month} by ${userId}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[calendar/working-days] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
