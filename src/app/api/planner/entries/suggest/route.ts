/**
 * /api/planner/entries/suggest — generate suggested slots for the week.
 * GET ?weekStart=YYYY-MM-DD -> { suggestions: SuggestedSlot[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { suggestWeekSlots } from '@/lib/ops/planner/weekly-suggest';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(`suggest:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  try {
    const { searchParams } = req.nextUrl;
    const weekStart = searchParams.get('weekStart');

    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: 'Invalid weekStart (YYYY-MM-DD)' }, { status: 400 });
    }

    const db = getDb();

    // Fetch user's lunch preference
    const { data: profile } = await db
      .from('user_profiles')
      .select('lunch_start')
      .eq('user_id', userId)
      .single();
    const lunchStr = (profile?.lunch_start as string)?.slice(0, 5) ?? '13:00';
    const [lh, lm] = lunchStr.split(':').map(Number);
    const lunchStartMin = lh * 60 + lm;

    const suggestions = await suggestWeekSlots(db, userId, weekStart, lunchStartMin);
    return NextResponse.json({ suggestions });
  } catch (err) {
    logger.error('[planner/entries/suggest] GET error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
