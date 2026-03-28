import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, checkRateLimit } from '@/lib/shared/api/request-guards';
import { searchLaws, fetchLaw } from '@/lib/ops/laws/fetcher-client';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

/** Check if input is a zakon.rada.gov.ua URL or a doc number like "57-95-п". */
function extractZakonUrl(input: string): string | null {
  if (input.includes('zakon.rada.gov.ua/laws/show/')) return input.trim();
  // Doc number pattern: digits + optional suffix (e.g. "57-95-п", "80731-10", "3857-12")
  const docNumRx = /^[\d][\w/-]*$/;
  if (docNumRx.test(input.trim())) {
    return `https://zakon.rada.gov.ua/laws/show/${encodeURIComponent(input.trim())}`;
  }
  return null;
}

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

    // Direct URL or doc number → fetch the document directly
    const directUrl = extractZakonUrl(query.trim());
    if (directUrl) {
      try {
        const fetched = await fetchLaw(directUrl);
        const docId = directUrl.match(/\/laws\/show\/([^\/#]+)/)?.[1] || query.trim();
        return NextResponse.json({
          results: [{ title: fetched.title, url: directUrl.replace(/#.*$/, ''), docId: decodeURIComponent(docId) }],
        });
      } catch (e) {
        logger.prod('[kb/laws/search] direct fetch failed, falling back to search:', e);
        // Fall through to text search
      }
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
