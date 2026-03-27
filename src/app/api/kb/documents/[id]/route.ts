/**
 * GET    /api/kb/documents/[id]  — get document status (polling, all authenticated)
 * DELETE /api/kb/documents/[id]  — delete document + chunks (chief only)
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

type Params = Promise<{ id: string }>;

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Params }) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
    );
  }

  try {
    const { id } = await params;
    const db = getServerDb();

    const { data, error } = await db
      .from('kb_documents')
      .select('id, title, status, chunk_count, error_message, updated_at')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    logger.error('[kb/documents/[id]/GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
    );
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const db = getServerDb();

  // Role check: only chief can delete
  const { data: profile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (!profile || profile.role !== 'chief') {
    return NextResponse.json(
      { error: 'Forbidden: only chief can delete documents' },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;

    // CASCADE to kb_chunks handled by DB foreign key (ON DELETE CASCADE)
    const { error } = await db.from('kb_documents').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logger.error('[kb/documents/[id]/DELETE] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
