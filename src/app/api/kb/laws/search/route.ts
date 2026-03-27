import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, checkRateLimit } from '@/lib/shared/api/request-guards';
import { searchLaws } from '@/lib/ops/laws/fetcher-client';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  try {
    const { query } = (await req.json()) as { query?: string };
    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return NextResponse.json({ error: 'query is required (min 3 chars)' }, { status: 400 });
    }

    const results = await searchLaws(query.trim());
    return NextResponse.json({ results });
  } catch (error: unknown) {
    logger.error('[kb/laws/search] Error:', error);
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'Request timeout') {
      return NextResponse.json({ error: 'Gateway timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
