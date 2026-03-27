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
  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  try {
    const db = getServerDb();

    // Get all documents that have doc_type in metadata (= law documents)
    const { data: docs, error } = await db
      .from('kb_documents')
      .select('id, title, status, chunk_count, created_at, metadata')
      .not('metadata->doc_type', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[kb/laws/GET] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch laws' }, { status: 500 });
    }

    // Group into tree: parent laws → child постанови/зміни
    interface LawDoc {
      id: string;
      title: string;
      status: string;
      chunk_count: number;
      created_at: string;
      metadata: {
        doc_type?: string;
        doc_number?: string;
        source_url?: string;
        related_docs?: string[];
        parent_doc_id?: string | null;
        fetched_at?: string;
      };
    }

    const allDocs = (docs || []) as LawDoc[];
    const parentDocs = allDocs.filter(d => !d.metadata?.parent_doc_id);
    const childDocs = allDocs.filter(d => d.metadata?.parent_doc_id);

    const tree = parentDocs.map(parent => ({
      ...parent,
      children: childDocs.filter(c => c.metadata?.parent_doc_id === parent.id),
    }));

    // Orphan children (parent not in KB)
    const parentIds = new Set(parentDocs.map(p => p.id));
    const orphans = childDocs.filter(c => !parentIds.has(c.metadata?.parent_doc_id || ''));
    orphans.forEach(o => tree.push({ ...o, children: [] }));

    return NextResponse.json({ laws: tree });
  } catch (error: unknown) {
    logger.error('[kb/laws/GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
