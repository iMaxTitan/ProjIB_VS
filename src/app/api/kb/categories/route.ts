/**
 * GET /api/kb/categories — list active KB categories (all authenticated)
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

export async function GET(req: NextRequest) {
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
    const db = getServerDb();
    const { data, error } = await db
      .from('kb_categories')
      .select('id, name, slug, icon, description')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    return NextResponse.json(data ?? [], {
      headers: { 'Cache-Control': 'public, max-age=300' }, // categories rarely change
    });
  } catch (error: unknown) {
    logger.error('[kb/categories/GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
