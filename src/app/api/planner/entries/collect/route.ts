/**
 * POST /api/planner/entries/collect
 * Body: { monthlyPlanId, weekStart, entries: [{ id, task_template_id, duration_minutes, date }] }
 *
 * Groups entries by task_template_id, creates daily_tasks per group.
 * No modal — immediate collect.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { collectProcedureTasks } from '@/lib/ops/planner/collect-tasks';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 401 });
  }
  const rl = checkRateLimit(`collect:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  try {
    const body = await req.json();
    const { weekStart, monthlyPlanId, entries, externalEntries, linkedEntries } = body;

    if (!monthlyPlanId || typeof monthlyPlanId !== 'string') {
      return NextResponse.json({ error: 'monthlyPlanId required' }, { status: 400 });
    }
    const hasEntries = Array.isArray(entries) && entries.length > 0;
    const hasExternal = Array.isArray(externalEntries) && externalEntries.length > 0;
    const hasLinked = Array.isArray(linkedEntries) && linkedEntries.length > 0;
    if (!hasEntries && !hasExternal && !hasLinked) {
      return NextResponse.json({ error: 'entries, externalEntries, or linkedEntries required' }, { status: 400 });
    }

    const db = getDb();
    const result = await collectProcedureTasks(db, userId, {
      monthlyPlanId, weekStart,
      entries: entries || [],
      externalEntries: externalEntries || [],
      linkedEntries: linkedEntries || [],
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    const isBusiness = msg.includes('не знайдено') || msg.includes('Немає');
    if (!isBusiness) logger.error('[planner/entries/collect] POST error:', err);
    return NextResponse.json({ error: msg }, { status: isBusiness ? 400 : 500 });
  }
}
