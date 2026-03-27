/**
 * /api/planner/entries/lunch — update employee's lunch start time.
 * PATCH { lunchStart: 'HH:MM' } -> { ok: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const VALID_TIMES = ['12:00', '12:30', '13:00', '13:30'];

export async function PATCH(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(`wp-lunch:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  try {
    const { lunchStart } = await req.json();

    if (!lunchStart || !VALID_TIMES.includes(lunchStart)) {
      return NextResponse.json(
        { error: `Invalid lunchStart. Must be one of: ${VALID_TIMES.join(', ')}` },
        { status: 400 },
      );
    }

    const db = getDb();
    const { error } = await db
      .from('user_profiles')
      .update({ lunch_start: lunchStart })
      .eq('user_id', userId);

    if (error) throw error;

    logger.info(`[planner/entries/lunch] Updated lunch_start to ${lunchStart} for ${userId}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[planner/entries/lunch] PATCH error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
