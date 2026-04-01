import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getRelatedLaws } from '@/lib/ops/laws/fetcher-client';
import { getServerDb } from '@/lib/shared/db-server';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

/**
 * POST /api/kb/laws/completeness
 * Check which related documents from zakon.rada.gov.ua are missing in KB.
 * Body: { docId: string } — root law document ID
 */
export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  try {
    const { docId } = (await req.json()) as { docId?: string };
    if (!docId) {
      return NextResponse.json({ error: 'docId is required' }, { status: 400 });
    }

    const db = getServerDb();

    // Get the root document
    const { data: doc } = await db
      .from('kb_documents')
      .select('id, title, metadata')
      .eq('id', docId)
      .single();

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const sourceUrl = (doc.metadata as Record<string, string>)?.source_url;
    if (!sourceUrl) {
      return NextResponse.json({ error: 'Document has no source_url' }, { status: 400 });
    }

    // Fetch related from zakon.rada.gov.ua
    const related = await getRelatedLaws(sourceUrl);

    // Get all existing law docs in KB (by source_url)
    const { data: existingDocs } = await db
      .from('kb_documents')
      .select('metadata')
      .not('metadata->source_url', 'is', null)
      .neq('status', 'deleted');

    const existingUrls = new Set<string>();
    if (existingDocs) {
      for (const d of existingDocs) {
        const url = (d.metadata as Record<string, string>)?.source_url;
        if (url) existingUrls.add(url.replace(/#.*$/, ''));
      }
    }

    // Compare: which related docs are missing
    const missing = related
      .filter(r => !existingUrls.has(r.url.replace(/#.*$/, '')))
      .map(r => ({
        title: r.title,
        url: r.url,
        docType: r.docType,
        docNumber: r.docNumber,
      }));

    const present = related.length - missing.length;

    return NextResponse.json({
      total: related.length,
      present,
      missing,
    });
  } catch (error: unknown) {
    logger.error('[kb/laws/completeness] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
