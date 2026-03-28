import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getRelatedLaws } from '@/lib/ops/laws/fetcher-client';

const RATE_LIMIT = 30;
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
    const { url } = (await req.json()) as { url?: string };
    if (!url || typeof url !== 'string' || !url.includes('zakon.rada.gov.ua')) {
      return NextResponse.json({ error: 'Valid zakon.rada.gov.ua URL is required' }, { status: 400 });
    }

    const results = await getRelatedLaws(url);
    return NextResponse.json({ results });
  } catch (error: unknown) {
    logger.error('[kb/laws/related] Error:', error);
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'Request timeout') {
      return NextResponse.json({ error: 'Gateway timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
