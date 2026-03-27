/**
 * GET    /api/kb/documents     — list documents with coverage stats (all authenticated)
 * POST   /api/kb/documents     — upload document async (chief/head)
 * DELETE /api/kb/documents      — bulk delete documents (chief only)
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { ROLE_GROUPS, hasRole } from '@/lib/shared/auth/role-groups';
import { getServerDb } from '@/lib/shared/db-server';
import { processDocument, canAcceptWork, getQueueDepth } from '@/lib/kb';

const RATE_LIMIT_GET = 30;
const RATE_LIMIT_POST = 30;
const RATE_LIMIT_DELETE = 10;
const RATE_WINDOW_MS = 60_000;

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const ALLOWED_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/plain', // browsers often send .md as text/plain
]);

function isAllowedByName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.docx') || lower.endsWith('.md');
}

function isMimeAllowed(mime: string): boolean {
  return ALLOWED_TYPES.has(mime);
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(getRequesterKey(req), RATE_LIMIT_GET, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
    );
  }

  try {
    const db = getServerDb();
    const url = new URL(req.url);
    const categorySlug = url.searchParams.get('category');
    const processId = url.searchParams.get('process_id');

    // Resolve category slug → id if provided
    let categoryId: string | null = null;
    if (categorySlug) {
      const { data: cat } = await db
        .from('kb_categories')
        .select('id')
        .eq('slug', categorySlug)
        .single();
      categoryId = cat?.id ?? null;
    }

    let query = db
      .from('kb_documents')
      .select(`
        id,
        title,
        source_filename,
        category_id,
        process_id,
        chunk_count,
        status,
        error_message,
        created_by,
        created_at,
        kb_categories(name, slug, icon)
      `)
      .order('created_at', { ascending: false });

    if (categoryId) query = query.eq('category_id', categoryId);
    if (processId) query = query.eq('process_id', processId);

    const { data, error } = await query;
    if (error) throw error;

    // Enrich with coverage stats (content_length + chunks_total_length)
    const docs = data ?? [];
    if (docs.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ids = (docs as any[]).map((d: { id: string }) => d.id);
      const { data: stats } = await db.rpc('kb_document_coverage', { doc_ids: ids });
      if (stats) {
        const statsMap = new Map(
          (stats as Array<{ id: string; content_length: number; chunks_total_length: number }>)
            .map(s => [s.id, s]),
        );
        for (const doc of docs as Array<Record<string, unknown>>) {
          const s = statsMap.get(doc.id as string);
          doc.content_length = s?.content_length ?? 0;
          doc.chunks_total_length = s?.chunks_total_length ?? 0;
        }
      }
    }

    return NextResponse.json(docs);
  } catch (error: unknown) {
    logger.error('[kb/documents/GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(getRequesterKey(req), RATE_LIMIT_POST, RATE_WINDOW_MS);
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

  // Role check: only chief or head can upload
  const { data: profile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (!profile || !hasRole(profile.role as string, ROLE_GROUPS.KB_MANAGERS)) {
    return NextResponse.json(
      { error: 'Forbidden: only chief or head can upload documents' },
      { status: 403 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = (formData.get('title') as string | null)?.trim();
    const categoryId = formData.get('category_id') as string | null;
    const processId = (formData.get('process_id') as string | null) || null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 });
    if (!categoryId) return NextResponse.json({ error: 'Missing category_id' }, { status: 400 });

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 413 });
    }

    const mimeType = file.type || 'application/octet-stream';
    if (!isMimeAllowed(mimeType) && !isAllowedByName(file.name)) {
      return NextResponse.json(
        { error: 'Підтримується тільки формат .docx (Microsoft Word) або .md (Markdown)' },
        { status: 400 },
      );
    }

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

    // Back-pressure: reject if processing queue is full (prevent OOM)
    if (!canAcceptWork()) {
      logger.warn(`[kb/documents/POST] Queue full (${getQueueDepth()} queued), rejecting upload`);
      return NextResponse.json(
        { error: 'Сервер зайнятий обробкою документів. Спробуйте через хвилину.' },
        { status: 503, headers: { 'Retry-After': '60' } },
      );
    }

    // Stage 1 — insert document record (status='processing')
    const { data: doc, error: insertError } = await db
      .from('kb_documents')
      .insert({
        title,
        source_filename: file.name,
        mime_type: mimeType,
        category_id: categoryId,
        process_id: processId,
        created_by: userId,
        status: 'processing',
        content: '',
      })
      .select('id')
      .single();

    if (insertError || !doc) {
      logger.error('[kb/documents/POST] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create document record' }, { status: 500 });
    }

    const documentId = doc.id as string;

    // Stage 2 — fire-and-forget processing
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    Promise.resolve()
      .then(() => processDocument(documentId, buffer, mimeType, title, category.name as string, file.name))
      .then(result => {
        logger.info(`[kb/documents/POST] Processed ${documentId}: ${result.chunkCount} chunks`);
      })
      .catch(err => {
        logger.error(`[kb/documents/POST] Processing failed for ${documentId}:`, err);
      });

    return NextResponse.json({ documentId }, { status: 202 });
  } catch (error: unknown) {
    logger.error('[kb/documents/POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE (bulk) ────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(getRequesterKey(req), RATE_LIMIT_DELETE, RATE_WINDOW_MS);
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

  // Chief only
  const { data: profile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (!profile || profile.role !== 'chief') {
    return NextResponse.json({ error: 'Forbidden: chief only' }, { status: 403 });
  }

  try {
    const body = await req.json() as { ids?: string[] };
    const ids = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
      return NextResponse.json({ error: 'ids: array of 1-100 UUIDs required' }, { status: 400 });
    }

    const { error, count } = await db
      .from('kb_documents')
      .delete({ count: 'exact' })
      .in('id', ids);

    if (error) throw error;

    logger.info(`[kb/documents/DELETE] Bulk deleted ${count} documents by ${userId}`);
    return NextResponse.json({ deleted: count });
  } catch (error: unknown) {
    logger.error('[kb/documents/DELETE] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
