/**
 * KB Search helpers — diversity, neighbor/cross-ref expansion.
 * Extracted from search.ts to respect 300-line limit.
 */

import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import { embedBatchQueries } from './embedder';
import logger from '@/lib/shared/logger';
import type { KBChunk } from './query-translator';

// ── IDF penalty — soft score reduction for huge documents (Tax Code = 3099 chunks) ─

const IDF_CHUNK_THRESHOLD = 500;

export async function applyIdfPenalty(chunks: KBChunk[], db: SupabaseClient): Promise<KBChunk[]> {
  if (!chunks.length) return chunks;
  const docIds = [...new Set(chunks.map(c => c.document_id))];
  const { data } = await db.from('kb_documents').select('id, chunk_count').in('id', docIds);
  if (!data?.length) return chunks;

  const chunkCounts = new Map<string, number>();
  for (const d of data as { id: string; chunk_count: number }[]) {
    chunkCounts.set(d.id, d.chunk_count ?? 0);
  }

  return chunks.map(chunk => {
    const count = chunkCounts.get(chunk.document_id) ?? 0;
    if (count <= IDF_CHUNK_THRESHOLD) return chunk;
    const penalty = 0.02 * Math.log2(count / IDF_CHUNK_THRESHOLD);
    return { ...chunk, similarity: chunk.similarity - penalty };
  }).sort((a, b) => b.similarity - a.similarity);
}

// ── Document diversity — dynamic cap per document ────────────────────────────

/**
 * Dynamic MAX_PER_DOC: base=maxPerDoc, but allow +1 if the next chunk from the
 * same doc has a competitive rerank score (within SCORE_GAP of the previous one).
 * This prevents cutting a highly relevant 3rd chunk from a dominant document.
 */
const DYNAMIC_SCORE_GAP = 0.02;

export function diversifyByDocument(chunks: KBChunk[], maxPerDoc: number): KBChunk[] {
  const docCounts = new Map<string, number>();
  const docLastScore = new Map<string, number>();
  return chunks.filter(chunk => {
    const score = (chunk as KBChunk & { _rerank_score?: number })._rerank_score ?? chunk.similarity;
    const count = docCounts.get(chunk.document_id) ?? 0;
    const lastScore = docLastScore.get(chunk.document_id) ?? 0;

    if (count < maxPerDoc) {
      docCounts.set(chunk.document_id, count + 1);
      docLastScore.set(chunk.document_id, score);
      return true;
    }
    // Allow one extra chunk if score is competitive (close to previous)
    if (count === maxPerDoc && lastScore - score <= DYNAMIC_SCORE_GAP) {
      docCounts.set(chunk.document_id, count + 1);
      logger.prod('[kb/search] diversity: allowed extra chunk from doc, score gap', (lastScore - score).toFixed(3));
      return true;
    }
    return false;
  });
}

// ── Cross-reference expansion (pull chunks from parent/related documents) ──────

const MAX_CROSS_REF_CHUNKS = 4;

export async function expandWithRelatedDocs(
  chunks: KBChunk[], query: string, db: SupabaseClient,
): Promise<KBChunk[]> {
  if (chunks.length === 0) return chunks;

  // 1. Collect unique document IDs from found chunks
  const docIds = [...new Set(chunks.map(c => c.document_id))];

  // 2. Load metadata for these documents
  const { data: docs } = await db.from('kb_documents').select('id, metadata').in('id', docIds);
  if (!docs || !Array.isArray(docs)) return chunks;

  // 3. Collect related document IDs — both directions:
  //    a) child → parent (parent_doc_id)
  //    b) parent → children (other docs whose parent_doc_id = this doc)
  //    c) siblings via related_docs array
  const relatedDocIds = new Set<string>();
  for (const doc of docs as { id: string; metadata?: Record<string, unknown> }[]) {
    const meta = doc.metadata;
    if (!meta) continue;
    // a) Up: child → parent
    if (meta.parent_doc_id && typeof meta.parent_doc_id === 'string' && !docIds.includes(meta.parent_doc_id)) {
      relatedDocIds.add(meta.parent_doc_id);
    }
    // c) Siblings via related_docs
    const related = meta.related_docs;
    if (Array.isArray(related)) {
      for (const rid of related) {
        if (typeof rid === 'string' && !docIds.includes(rid)) relatedDocIds.add(rid);
      }
    }
  }

  // b) Down: parent → children (find docs whose parent_doc_id is one of our docs)
  const { data: children } = await db
    .from('kb_documents')
    .select('id')
    .in('metadata->>parent_doc_id', docIds)
    .eq('status', 'ready');
  if (children && Array.isArray(children)) {
    for (const child of children as { id: string }[]) {
      if (!docIds.includes(child.id)) relatedDocIds.add(child.id);
    }
  }

  if (relatedDocIds.size === 0) return chunks;

  // 4. Vector search in related documents — top chunks by similarity to query
  const queryEmbeddings = await embedBatchQueries([query]);
  const queryVec = queryEmbeddings[0];
  if (!queryVec) return chunks;

  const { data: relChunks } = await db.rpc('match_kb_documents', {
    query_embedding: JSON.stringify(queryVec),
    match_threshold: 0.25,
    match_count: MAX_CROSS_REF_CHUNKS * 2,
  });

  if (!relChunks || !Array.isArray(relChunks)) return chunks;

  // 5. Filter to only related document chunks, take top N
  const relDocIdSet = relatedDocIds;
  const existingChunkIds = new Set(chunks.map(c => c.chunk_id));
  const filtered = (relChunks as KBChunk[])
    .filter(c => relDocIdSet.has(c.document_id) && !existingChunkIds.has(c.chunk_id))
    .slice(0, MAX_CROSS_REF_CHUNKS);

  if (filtered.length === 0) return chunks;
  logger.prod('[kb/search] cross-ref added', filtered.length, 'chunks from', [...relatedDocIds].length, 'related docs');

  return [...chunks, ...filtered];
}

// ── Context window expansion (±1 neighbors from same section) ────────────────

export async function expandWithNeighbors(
  reranked: KBChunk[],
  db: SupabaseClient,
): Promise<KBChunk[]> {
  const rerankedIds = new Set(reranked.map(c => c.chunk_id));
  const neighborKeys: Array<{ docId: string; idx: number }> = [];
  for (const chunk of reranked) {
    if (chunk.chunk_index == null) continue;
    for (const offset of [-1, 1]) {
      const idx = chunk.chunk_index + offset;
      if (idx >= 0) neighborKeys.push({ docId: chunk.document_id, idx });
    }
  }
  if (!neighborKeys.length) return reranked;

  const docIds = [...new Set(neighborKeys.map(k => k.docId))];
  const idxValues = [...new Set(neighborKeys.map(k => k.idx))];
  const { data: neighbors } = await db
    .from('kb_chunks')
    .select('id, document_id, chunk_index, content, heading, contextual_prefix')
    .in('document_id', docIds)
    .in('chunk_index', idxValues);
  if (!neighbors?.length) return reranked;

  const neighborMap = new Map<string, { content: string; heading: string | null; id: string }>();
  for (const n of neighbors) {
    neighborMap.set(`${n.document_id}:${n.chunk_index}`, { content: n.content, heading: n.heading, id: n.id });
  }

  // Synthesizer truncates content at 2000 chars — if a chunk is already large,
  // prepending neighbor content would push the matched text past the limit.
  const EXPANSION_SIZE_LIMIT = 1200;

  return reranked.map(chunk => {
    if (chunk.chunk_index == null) return chunk;
    if (chunk.content.length >= EXPANSION_SIZE_LIMIT) return chunk;

    const parts: string[] = [];
    const prev = neighborMap.get(`${chunk.document_id}:${chunk.chunk_index - 1}`);
    if (prev && !rerankedIds.has(prev.id) && prev.heading === chunk.heading) parts.push(prev.content);
    parts.push(chunk.content);
    const next = neighborMap.get(`${chunk.document_id}:${chunk.chunk_index + 1}`);
    if (next && !rerankedIds.has(next.id) && next.heading === chunk.heading) parts.push(next.content);
    if (parts.length === 1) return chunk;
    return { ...chunk, content: parts.join('\n---\n') };
  });
}
