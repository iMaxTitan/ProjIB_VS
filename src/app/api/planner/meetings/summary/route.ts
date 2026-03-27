/**
 * POST /api/planner/meetings/summary
 * Body: { entryId: string }
 * Returns cached summary or generates a new one via Graph + AI.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { generateMeetingSummary } from '@/lib/ops/planner/meeting-summary';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(`cal-summary:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  try {
    const { entryId } = await req.json();

    if (!entryId || !UUID_RE.test(entryId)) {
      return NextResponse.json({ error: 'Invalid entryId' }, { status: 400 });
    }

    const db = getDb();

    // Verify ownership
    const { data: entry } = await db.from('weekly_calendar_entries')
      .select('employee_id')
      .eq('id', entryId)
      .single();

    if (!entry || entry.employee_id !== userId) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    // Get AAD OID
    const { data: profile } = await db.from('user_profiles')
      .select('teams_aad_oid')
      .eq('user_id', userId)
      .single();

    const oid = profile?.teams_aad_oid;
    if (!oid) {
      return NextResponse.json({ error: "Немає прив'язки до Teams" }, { status: 400 });
    }

    const result = await generateMeetingSummary(db, entryId, oid);

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ summary: result.summary });
  } catch (err) {
    logger.error('[planner/meetings/summary] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
