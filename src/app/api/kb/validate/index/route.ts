/**
 * POST /api/kb/validate/index — create + index a normalized document from Markdown text.
 * Auth: chief or head. Rate limit: 10/min.
 * Body: { normalizedText, title, categoryId, sourceFileName }
 * Response: { documentId } (202 — processing runs async, poll GET /api/kb/documents/[id])
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { getServerDb } from '@/lib/shared/db-server';
import { processFromMarkdown } from '@/lib/kb/processor';
import { requireKbManager } from '../_auth';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  const auth = await requireKbManager(req, RATE_LIMIT, RATE_WINDOW_MS);
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  try {
    const body = await req.json();
    const { normalizedText, title, categoryId, sourceFileName } = body as {
      normalizedText?: string;
      title?: string;
      categoryId?: string;
      sourceFileName?: string;
    };

    if (!normalizedText || typeof normalizedText !== 'string') {
      return NextResponse.json({ error: 'Missing normalizedText' }, { status: 400 });
    }
    if (!title?.trim()) {
      return NextResponse.json({ error: 'Missing title' }, { status: 400 });
    }
    if (!categoryId) {
      return NextResponse.json({ error: 'Missing categoryId' }, { status: 400 });
    }

    const db = getServerDb();

    // Verify category exists and is active
    const { data: category } = await db
      .from('kb_categories')
      .select('name')
      .eq('id', categoryId)
      .eq('is_active', true)
      .single();

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 400 });
    }

    // Create document record (status='processing')
    const { data: doc, error: insertError } = await db
      .from('kb_documents')
      .insert({
        title: title.trim(),
        source_filename: sourceFileName ?? 'normalized.docx',
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        category_id: categoryId,
        created_by: userId,
        status: 'processing',
        content: '',
      })
      .select('id')
      .single();

    if (insertError || !doc) {
      logger.error('[kb/validate/index/POST] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create document record' }, { status: 500 });
    }

    const documentId = doc.id as string;
    const categoryName = category.name as string;

    // Fire-and-forget: chunk → embed → store
    Promise.resolve()
      .then(() => processFromMarkdown(documentId, normalizedText, title.trim(), categoryName))
      .then(result => {
        logger.info(`[kb/validate/index] Indexed ${documentId}: ${result.chunkCount} chunks`);
      })
      .catch(err => {
        logger.error(`[kb/validate/index] Processing failed for ${documentId}:`, err);
      });

    return NextResponse.json({ documentId }, { status: 202 });

  } catch (error: unknown) {
    logger.error('[kb/validate/index/POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
