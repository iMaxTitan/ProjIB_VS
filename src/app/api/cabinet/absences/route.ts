/**
 * /api/cabinet/absences — CRUD for planned absences (vacation requests).
 * GET  ?year=2026 → { own: AbsenceRow[], pending: AbsenceRow[], quota: YearlyQuota }
 * POST { absence_type: '14d'|'5d', start_date: 'YYYY-MM-DD', comment? } → create request
 * DELETE ?id=uuid → cancel pending request
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import {
  getMyAbsences,
  getPendingApprovals,
  getYearlyQuota,
  createAbsence,
  deleteAbsence,
  updateAbsence,
} from '@/lib/ops/cabinet/absences';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
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
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
  }

  try {
    const db = getDb();
    const [own, pending, quota] = await Promise.all([
      getMyAbsences(db, userId, year),
      getPendingApprovals(db, userId),
      getYearlyQuota(db, userId, year),
    ]);
    return NextResponse.json({ own, pending, quota });
  } catch (err) {
    logger.error('[cabinet/absences] GET error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  try {
    const body = await req.json();
    const { absence_type, start_date, comment } = body;

    if (!['14d', '10d', '5d'].includes(absence_type)) {
      return NextResponse.json({ error: 'Invalid absence_type' }, { status: 400 });
    }
    if (!start_date || !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      return NextResponse.json({ error: 'Invalid start_date (YYYY-MM-DD)' }, { status: 400 });
    }

    const db = getDb();
    const result = await createAbsence(db, userId, { absence_type, start_date, comment });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    const status = msg.includes('вже є') || msg.includes('Вже є') || msg.includes('перетинаються') || msg.includes('Некоректна') ? 400 : 500;
    if (status === 500) logger.error('[cabinet/absences] POST error:', err);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  try {
    const body = await req.json();
    const { id, start_date } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    if (!start_date || !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      return NextResponse.json({ error: 'Invalid start_date (YYYY-MM-DD)' }, { status: 400 });
    }

    const db = getDb();
    const result = await updateAbsence(db, userId, id, { start_date });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    const isBusiness = msg.includes('не знайдено') || msg.includes('перетинаються') || msg.includes('Некоректна');
    if (!isBusiness) logger.error('[cabinet/absences] PATCH error:', err);
    return NextResponse.json({ error: msg }, { status: isBusiness ? 400 : 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    const db = getDb();
    await deleteAbsence(db, userId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
