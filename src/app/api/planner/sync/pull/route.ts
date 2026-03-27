/**
 * POST /api/planner/sync/pull — delta sync (PULL) from Outlook for the current user.
 * Body: { weekStart: string, weekEnd: string, mode?: 'full' | 'delta' }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { pullCalendarEvents, type PullMode } from '@/lib/ops/planner/calendar-sync';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function guardAuth(req: NextRequest) {
  if (!isRequestAuthorized(req)) return { error: 'Unauthorized', status: 401 };
  const userId = getDbUserId(req);
  if (!userId) return { error: 'Missing user ID', status: 401 };
  const rl = checkRateLimit(`cal-pull:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) return { error: 'Too Many Requests', status: 429 };
  return { userId };
}

export async function POST(req: NextRequest) {
  const auth = guardAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { weekStart, weekEnd, mode } = await req.json();

    if (!weekStart || !DATE_RE.test(weekStart) || !weekEnd || !DATE_RE.test(weekEnd)) {
      return NextResponse.json(
        { error: 'Invalid weekStart/weekEnd (YYYY-MM-DD)' },
        { status: 400 },
      );
    }

    const pullMode: PullMode = mode === 'delta' ? 'delta' : 'full';

    const db = getDb();

    // Get Azure AD OID for Graph API calls
    const { data: profile } = await db
      .from('user_profiles')
      .select('teams_aad_oid')
      .eq('user_id', auth.userId)
      .single();

    const oid = profile?.teams_aad_oid;
    if (!oid) {
      return NextResponse.json(
        { error: "Немає прив'язки до Teams" },
        { status: 400 },
      );
    }

    const result = await pullCalendarEvents(db, auth.userId, oid, weekStart, weekEnd, pullMode);
    return NextResponse.json(result);
  } catch (err) {
    logger.error('[planner/sync/pull] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
