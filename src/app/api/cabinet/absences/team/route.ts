/**
 * GET /api/cabinet/absences/team?year=2026
 * Returns yearly team vacation overview — all authenticated users.
 * chief sees all, others see own department.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { getTeamAbsences } from '@/lib/ops/cabinet/absences';
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
    const result = await getTeamAbsences(db, userId, year);
    return NextResponse.json({
      rows: result.rows,
      currentUserId: userId,
      currentUserRole: result.requesterRole,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    logger.error('[cabinet/absences/team] GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
