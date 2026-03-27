/**
 * POST /api/cabinet/absences/approve
 * Body: { absenceId, action: 'approve' | 'reject', reason? }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { approveAbsence, rejectAbsence } from '@/lib/ops/cabinet/absences';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

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
    const { absenceId, action, reason } = body;

    if (!absenceId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
    }

    if (action === 'reject' && !reason?.trim()) {
      return NextResponse.json({ error: 'Вкажіть причину відхилення' }, { status: 400 });
    }

    const db = getDb();

    if (action === 'approve') {
      await approveAbsence(db, userId, absenceId);
    } else {
      await rejectAbsence(db, userId, absenceId, reason.trim());
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    const status = msg.includes('не знайдено') || msg.includes('прав') ? 403 : 500;
    if (status === 500) logger.error('[cabinet/absences/approve] error:', err);
    return NextResponse.json({ error: msg }, { status });
  }
}
