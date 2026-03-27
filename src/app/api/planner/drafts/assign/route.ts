/**
 * POST /api/planner/drafts/assign — assign a draft task to a monthly plan.
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { assignDraft } from '@/lib/ops/planner/drafts';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }
  const rl = checkRateLimit(`drafts-assign:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  try {
    const body = await req.json();
    const { draftId, planId } = body as { draftId?: string; planId?: string };

    if (!draftId || !planId) {
      return NextResponse.json({ error: 'draftId and planId required' }, { status: 400 });
    }

    const db = getDb();
    await assignDraft(db, draftId, planId, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[planner/drafts/assign] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
