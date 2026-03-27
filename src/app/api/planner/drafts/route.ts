/**
 * GET  /api/planner/drafts — drafts + recent tasks + active plans
 * POST /api/planner/drafts — create a new draft task
 * DELETE /api/planner/drafts?id=X — delete a draft task
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { getDraftsData, createDraft, deleteDraft } from '@/lib/ops/planner/drafts';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function guardAuth(req: NextRequest) {
  if (!isRequestAuthorized(req)) return { error: 'Unauthorized', status: 401 };
  const userId = getDbUserId(req);
  if (!userId) return { error: 'Missing user ID', status: 401 };
  const rl = checkRateLimit(`drafts:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) return { error: 'Too Many Requests', status: 429, retryAfterSec: rl.retryAfterSec };
  return { userId };
}

export async function GET(req: NextRequest) {
  const auth = guardAuth(req);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, {
      status: auth.status,
      ...(auth.status === 429 ? { headers: { 'Retry-After': String(auth.retryAfterSec) } } : {}),
    });
  }

  try {
    const db = getDb();
    const data = await getDraftsData(db, auth.userId);
    return NextResponse.json(data);
  } catch (err) {
    logger.error('[planner/drafts] GET error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = guardAuth(req);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, {
      status: auth.status,
      ...(auth.status === 429 ? { headers: { 'Retry-After': String(auth.retryAfterSec) } } : {}),
    });
  }

  try {
    const body = await req.json();
    const { description, hours, date, meetingId, planId } = body as {
      description?: string;
      hours?: number;
      date?: string;
      meetingId?: string;
      planId?: string;
    };

    if (!description || typeof description !== 'string' || description.trim().length < 3) {
      return NextResponse.json({ error: 'Description required (min 3 chars)' }, { status: 400 });
    }
    if (!hours || typeof hours !== 'number' || hours <= 0 || hours > 24) {
      return NextResponse.json({ error: 'Hours required (0.1 - 24)' }, { status: 400 });
    }

    const db = getDb();
    const id = await createDraft(db, auth.userId, description.trim(), hours, date, meetingId, planId);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    logger.error('[planner/drafts] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = guardAuth(req);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, {
      status: auth.status,
      ...(auth.status === 429 ? { headers: { 'Retry-After': String(auth.retryAfterSec) } } : {}),
    });
  }

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing draft id' }, { status: 400 });
    }

    const db = getDb();
    await deleteDraft(db, id, auth.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[planner/drafts] DELETE error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
