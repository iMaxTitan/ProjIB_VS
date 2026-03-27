/**
 * /api/planner/entries/copy — copy slots from previous week.
 * POST { targetWeekStart: 'YYYY-MM-DD' } -> { copied, skipped }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { copyFromLastWeek } from '@/lib/ops/planner/calendar-entries-write';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(`wp-copy:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { targetWeekStart } = body;

    if (!targetWeekStart || !/^\d{4}-\d{2}-\d{2}$/.test(targetWeekStart)) {
      return NextResponse.json({ error: 'Invalid targetWeekStart (YYYY-MM-DD)' }, { status: 400 });
    }

    const db = getDb();
    const result = await copyFromLastWeek(db, userId, targetWeekStart);
    return NextResponse.json(result);
  } catch (err) {
    logger.error('[planner/entries/copy] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
