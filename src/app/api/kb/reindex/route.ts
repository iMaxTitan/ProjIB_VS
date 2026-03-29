/**
 * POST /api/kb/reindex — regenerate contextual prefixes and re-embed all chunks.
 * Chief only. Long-running (~1-2 min for 450 chunks).
 * Streams progress as JSON lines.
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { hasRole } from '@/lib/shared/auth/role-groups';
import { getServerDb } from '@/lib/shared/db-server';
import { buildContextualContent } from '@/lib/kb/chunker';
import { embedBatch } from '@/lib/kb/embedder';
import { generateChunkPrefix, buildTocSummary } from '@/lib/kb/contextual-prefix';

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 3600_000;

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const db = getServerDb();
  const userId = getDbUserId(req);

  // Check role — chief only
  const { data: profile } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  if (!profile || !hasRole(profile.role as string, ['chief'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get all documents with their chunks
  const { data: documents, error: docError } = await db
    .from('kb_documents')
    .select('id, title, content, category_id')
    .eq('status', 'ready')
    .order('title');

  if (docError) {
    logger.error('[kb/reindex] doc fetch error:', docError.message);
    return NextResponse.json({ error: docError.message }, { status: 500 });
  }
  if (!documents?.length) {
    return NextResponse.json({ message: 'No documents to reindex', documents: 0 });
  }

  // Get category names
  const { data: categories } = await db.from('kb_categories').select('id, name');
  const catMap = new Map((categories ?? []).map(c => [c.id, c.name]));

  logger.prod('[kb/reindex] started by', userId, '— documents:', documents.length);

  let totalChunks = 0;
  let totalPrefixes = 0;
  const errors: string[] = [];

  for (const doc of documents) {
    try {
      // Load chunks for this document
      const { data: chunks, error: chunkError } = await db
        .from('kb_chunks')
        .select('id, chunk_index, content, heading, token_count, contextual_prefix')
        .eq('document_id', doc.id)
        .order('chunk_index');

      if (chunkError || !chunks?.length) {
        errors.push(`${doc.title}: ${chunkError?.message || 'no chunks'}`);
        continue;
      }

      // Skip documents where all chunks already have prefixes
      const missingPrefixes = chunks.filter(c => !c.contextual_prefix);
      if (missingPrefixes.length === 0) {
        totalChunks += chunks.length;
        totalPrefixes += chunks.length;
        logger.prod('[kb/reindex]', doc.title, ': all', chunks.length, 'chunks already have prefixes, skipping');
        continue;
      }

      const categoryName = catMap.get(doc.category_id) || 'Загальне';
      const tocSummary = buildTocSummary(chunks.map(c => ({ heading: c.heading || '', content: c.content })));

      // Generate contextual prefixes only for chunks missing them
      const prefixes: Array<{ prefixText: string; scope: string; searchTerms: string[]; semanticSummary: string }> = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk.contextual_prefix) {
          prefixes.push({ prefixText: chunk.contextual_prefix, scope: 'general', searchTerms: [], semanticSummary: '' });
        } else {
          const result = await generateChunkPrefix(
            doc.title, tocSummary, chunk.heading || '', chunk.content,
          );
          prefixes.push(result);
          if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 150));
        }
      }

      // Build contextual content for embedding
      const contextualContents = chunks.map((chunk, i) =>
        buildContextualContent(categoryName, doc.title, chunk.heading || '', chunk.content, prefixes[i]?.prefixText || undefined)
      );

      // Re-embed in batches
      const EMBED_BATCH = 100;
      for (let batchStart = 0; batchStart < chunks.length; batchStart += EMBED_BATCH) {
        const batchContents = contextualContents.slice(batchStart, batchStart + EMBED_BATCH);
        const batchChunks = chunks.slice(batchStart, batchStart + EMBED_BATCH);
        const batchPrefixes = prefixes.slice(batchStart, batchStart + EMBED_BATCH);

        const embeddings = await embedBatch(batchContents);

        // Update each chunk with new embedding + prefix + scope
        for (let i = 0; i < batchChunks.length; i++) {
          const p = batchPrefixes[i];
          const { error: updateError } = await db
            .from('kb_chunks')
            .update({
              embedding: JSON.stringify(embeddings[i]),
              contextual_prefix: p?.prefixText || null,
              scope: p?.scope || 'general',
              search_terms: p?.searchTerms || [],
              semantic_summary: p?.semanticSummary || null,
            })
            .eq('id', batchChunks[i].id);

          if (updateError) {
            errors.push(`chunk ${batchChunks[i].id}: ${updateError.message}`);
          }
        }
      }

      const prefixCount = prefixes.filter(p => p.prefixText).length;
      totalChunks += chunks.length;
      totalPrefixes += prefixCount;
      logger.prod('[kb/reindex]', doc.title, ':', chunks.length, 'chunks,', prefixCount, 'prefixes');

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${doc.title}: ${msg}`);
      logger.error('[kb/reindex] error for', doc.title, ':', msg);
    }
  }

  logger.prod('[kb/reindex] done:', totalChunks, 'chunks,', totalPrefixes, 'prefixes,', errors.length, 'errors');

  return NextResponse.json({
    message: 'Reindex complete',
    documents: documents.length,
    totalChunks,
    totalPrefixes,
    errors: errors.length > 0 ? errors : undefined,
  });
}
