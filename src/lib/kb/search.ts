/**
 * KB Search — hybrid search + AI synthesis orchestration.
 * Public API: searchAndAnswer(query, options) → KBSearchResult
 *
 * Consumers: bot-core/tools/kb-search.ts, app/api/kb/* (future direct access)
 * Does NOT know about bot-core, Telegram, Teams, or HTTP transport.
 */

import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import { embedBatchQueries } from './embedder';
import { rerankChunks } from './reranker';
import { getServerDb } from '@/lib/shared/db-server';
import logger from '@/lib/shared/logger';
import {
  generateMultiQueries,
  fuzzyMatchSlug,
  dominantCategorySlug,
  type KBChunk,
} from './query-translator';
import { synthesizeAnswer } from './synthesizer';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface KBSearchOptions {
  userId: string;
  role: string;
  /** Platform source for analytics (telegram | teams). Omit to skip logging. */
  source?: string;
  db: SupabaseClient;
  /** Category hint from caller (ib | hr | it | legal). Optional. */
  category?: string;
  /** Previous conversation turns for follow-up clarification. */
  history?: ConversationTurn[];
  /** Display name for anonymous (AD-only) users — stored in kb_query_log.anonymous_name. */
  anonymousName?: string;
}

export interface KBChunkPreview {
  document_title: string;
  heading: string | null;
  content: string;
}

export interface KBSearchResult {
  text: string;
  parseMode: 'HTML';
  /** Source chunks used for synthesis. Only returned when source='web'. */
  chunks?: KBChunkPreview[];
}

// ── Analytics ─────────────────────────────────────────────────────────────────

const AI_REFUSAL_MARKER = 'немає інформації про';

function logKBQuery(data: {
  user_id: string | null; user_role: string; source: string;
  query_original: string; query_translated: string | null;
  category_hint: string | null; category_detected: string | null;
  top_score: number | null; chunks_found: number;
  search_attempt: string | null; ai_refused: boolean; synthesis_cost: number;
  rerank_top_score?: number | null; answer_text?: string | null;
  anonymous_name?: string | null;
}): void {
  Promise.resolve(getServerDb().from('kb_query_log').insert([data]))
    .then(({ error }) => { if (error) logger.error('[kb/search] log error:', error.message); })
    .catch((err: unknown) => { logger.error('[kb/search] log failed:', err); });
}

// ── Document diversity — cap per-document chunks to avoid single-doc domination ─

function diversifyByDocument(chunks: KBChunk[], maxPerDoc: number): KBChunk[] {
  const docCounts = new Map<string, number>();
  return chunks.filter(chunk => {
    const count = docCounts.get(chunk.document_id) ?? 0;
    if (count >= maxPerDoc) return false;
    docCounts.set(chunk.document_id, count + 1);
    return true;
  });
}

// ── Cross-reference expansion (pull chunks from parent/related documents) ──────

const MAX_CROSS_REF_CHUNKS = 4;

async function expandWithRelatedDocs(
  chunks: KBChunk[], query: string, db: SupabaseClient,
): Promise<KBChunk[]> {
  if (chunks.length === 0) return chunks;

  // 1. Collect unique document IDs from found chunks
  const docIds = [...new Set(chunks.map(c => c.document_id))];

  // 2. Load metadata for these documents
  const { data: docs } = await db.from('kb_documents').select('id, metadata').in('id', docIds);
  if (!docs || !Array.isArray(docs)) return chunks;

  // 3. Collect related document IDs (parent + related_docs) not already in results
  const relatedDocIds = new Set<string>();
  for (const doc of docs as { id: string; metadata?: Record<string, unknown> }[]) {
    const meta = doc.metadata;
    if (!meta) continue;
    if (meta.parent_doc_id && typeof meta.parent_doc_id === 'string' && !docIds.includes(meta.parent_doc_id)) {
      relatedDocIds.add(meta.parent_doc_id);
    }
    const related = meta.related_docs;
    if (Array.isArray(related)) {
      for (const rid of related) {
        if (typeof rid === 'string' && !docIds.includes(rid)) relatedDocIds.add(rid);
      }
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
  const existingChunkIds = new Set(chunks.map(c => c.id));
  const filtered = (relChunks as KBChunk[])
    .filter(c => relDocIdSet.has(c.document_id) && !existingChunkIds.has(c.id))
    .slice(0, MAX_CROSS_REF_CHUNKS);

  if (filtered.length === 0) return chunks;
  logger.prod('[kb/search] cross-ref added', filtered.length, 'chunks from', [...relatedDocIds].length, 'related docs');

  return [...chunks, ...filtered];
}

// ── Context window expansion (±1 neighbors from same section) ────────────────

async function expandWithNeighbors(
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

// ── Multi-query search ────────────────────────────────────────────────────────

const SEARCH_THRESHOLD = 0.30;
const FALLBACK_THRESHOLD = 0.20;
const NO_RESULTS_TEXT = 'В базі знань не знайдено інформації за цим запитом.\n\nСпробуйте уточнити тему: <b>ІБ</b>, <b>HR</b>, <b>IT</b> або <b>юридичні</b> питання.';

/** Parallel hybrid search for each sub-query → merge & deduplicate by chunk_id. */
async function runMultiSearch(
  subQueries: string[],
  embeddings: number[][],
  db: SupabaseClient,
  categorySlug: string | null,
): Promise<{ chunks: KBChunk[]; attempt: string | null; isFallback: boolean }> {
  const searchPromises = subQueries.map((qText, i) =>
    db.rpc('match_kb_documents', {
      query_embedding: `[${embeddings[i].join(',')}]`,
      query_text: qText,
      match_count: 12,
      match_threshold: SEARCH_THRESHOLD,
      filter_category_slug: categorySlug,
      filter_process_id: null,
    }),
  );
  const results = await Promise.all(searchPromises);

  const rpcError = results.find(r => r.error);
  if (rpcError?.error) {
    const msg = (rpcError.error as { message?: string }).message;
    logger.error('[kb/search] RPC error:', msg);
    return { chunks: [], attempt: null, isFallback: false };
  }

  const chunkMap = new Map<string, KBChunk>();
  let attempt: string | null = null;

  for (let i = 0; i < results.length; i++) {
    const rows = (results[i].data as KBChunk[]) ?? [];
    logger.prod('[kb/search] sub-query', i, JSON.stringify(subQueries[i].slice(0, 60)),
      'count=', rows.length, 'top=', rows[0]?.similarity?.toFixed(4) ?? 'n/a');
    if (rows.length && !attempt) attempt = `mq_${i}`;
    for (const chunk of rows) {
      const existing = chunkMap.get(chunk.chunk_id);
      if (!existing || chunk.similarity > existing.similarity) {
        chunkMap.set(chunk.chunk_id, chunk);
      }
    }
  }

  const merged = [...chunkMap.values()].sort((a, b) => b.similarity - a.similarity);

  if (!merged.length && embeddings.length > 0) {
    const fallback = await db.rpc('match_kb_documents', {
      query_embedding: `[${embeddings[0].join(',')}]`,
      query_text: subQueries[0],
      match_count: 12,
      match_threshold: FALLBACK_THRESHOLD,
      filter_category_slug: categorySlug,
      filter_process_id: null,
    });
    const rows = (fallback.data as KBChunk[]) ?? [];
    if (rows.length) {
      logger.prod('[kb/search] fallback 0.20 count=', rows.length, 'top=', rows[0]?.similarity?.toFixed(4));
      return { chunks: rows, attempt: 'mq_fallback', isFallback: true };
    }
  }

  return { chunks: merged, attempt, isFallback: false };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function searchAndAnswer(query: string, options: KBSearchOptions): Promise<KBSearchResult> {
  const { userId, role, source, db, category: categoryHint, history, anonymousName } = options;

  // 1. Generate multi-queries + detect domain (single LLM call)
  const mqResult = await generateMultiQueries(query);
  const { queries: subQueries, primaryQuery, domain } = mqResult;
  logger.prod('[kb/search] multi-query:', JSON.stringify(subQueries), 'domain:', domain);

  // 1.1. Ambiguous domain — ask user to clarify with LLM-generated question
  if (domain === 'ambiguous') {
    const clarification = mqResult.clarification
      || 'Уточніть, будь ласка, що саме ви маєте на увазі?';
    return { text: clarification, parseMode: 'HTML' };
  }

  // 2. Batch-embed all sub-queries in one API call
  let embeddings: number[][];
  try {
    embeddings = await embedBatchQueries(subQueries);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[kb/search] embed error:', msg);
    return { text: `Помилка пошуку: ${msg}`, parseMode: 'HTML' };
  }

  // 3. Category slug: explicit hint > domain-based > none
  let categorySlug: string | null = null;
  if (categoryHint) {
    const { data: cats } = await db.from('kb_categories').select('slug, name').eq('is_active', true);
    categorySlug = fuzzyMatchSlug(categoryHint, (cats ?? []) as Array<{ slug: string; name: string }>);
  } else if (domain !== 'general') {
    // Use domain as soft category filter (domain values match category slugs)
    categorySlug = domain as string;
  }

  // 4. Parallel hybrid search + merge/dedup
  //    If domain-based filter yields nothing, retry without filter (soft filter)
  let { chunks: mergedChunks, attempt: successAttempt, isFallback } =
    await runMultiSearch(subQueries, embeddings, db, categorySlug);

  const domainFilterUsed = !categoryHint && categorySlug !== null;
  const domainTopScore = mergedChunks[0]?.similarity ?? 0;
  if (domainFilterUsed && (!mergedChunks.length || domainTopScore < 0.45)) {
    logger.prod('[kb/search] domain filter weak (top=', domainTopScore.toFixed(3), '), retrying without filter');
    const retry = await runMultiSearch(subQueries, embeddings, db, null);
    if (retry.chunks.length && (retry.chunks[0]?.similarity ?? 0) > domainTopScore) {
      mergedChunks = retry.chunks;
      successAttempt = retry.attempt;
      isFallback = retry.isFallback;
    }
  }

  const queryTranslatedLog = subQueries.length > 1
    ? subQueries.join(' | ')
    : (primaryQuery !== query ? primaryQuery : null);

  // 5. No results
  if (!mergedChunks.length) {
    if (source) logKBQuery({
      user_id: userId || null, user_role: role, source,
      query_original: query, query_translated: queryTranslatedLog,
      category_hint: categorySlug, category_detected: null,
      top_score: null, chunks_found: 0, search_attempt: null,
      ai_refused: false, synthesis_cost: 0,
      anonymous_name: anonymousName || null,
    });

    let kbReadyCount: number | null = null;
    try {
      const { count } = await db.from('kb_documents').select('id', { count: 'exact', head: true }).eq('status', 'ready');
      kbReadyCount = count ?? null;
    } catch { kbReadyCount = null; }

    return {
      text: kbReadyCount === 0 ? 'База знань порожня. Документи ще не завантажено.' : NO_RESULTS_TEXT,
      parseMode: 'HTML',
    };
  }

  // 6. Quality gate (skip for fallback — reranker will filter noise)
  const topScore = mergedChunks[0]?.similarity ?? 0;
  if (!isFallback && topScore < SEARCH_THRESHOLD) {
    logger.prod('[kb/search] top_score', topScore.toFixed(4), '< 0.30 — skipping synthesis');
    if (source) logKBQuery({
      user_id: userId || null, user_role: role, source,
      query_original: query, query_translated: queryTranslatedLog,
      category_hint: categorySlug, category_detected: null,
      top_score: topScore, chunks_found: mergedChunks.length, search_attempt: successAttempt,
      ai_refused: true, synthesis_cost: 0,
      anonymous_name: anonymousName || null,
    });
    return { text: NO_RESULTS_TEXT, parseMode: 'HTML' };
  }

  // 7. Pre-rerank diversity — cap per doc so reranker sees candidates from multiple documents
  const candidates = diversifyByDocument(mergedChunks, 4);

  // 7.1. Rerank — use original query only (sub-queries dilute intent for cross-encoder)
  const reranked = await rerankChunks(query, candidates, 8);
  const rerankTopScore = (reranked[0] as KBChunk & { _rerank_score?: number })?._rerank_score ?? null;

  // 7.2. Post-rerank diversity — max 2 per doc in final set for balanced synthesis
  const diversified = diversifyByDocument(reranked, 2);
  logger.prod('[kb/search] diversity:', mergedChunks.length, '→', candidates.length, '→', reranked.length, '→', diversified.length);

  // 7.6. Context window expansion — load ±1 neighbors for diversified chunks
  const expanded = await expandWithNeighbors(diversified, db);

  // 7.7. Cross-reference expansion — pull chunks from related documents (parent/children)
  const crossExpanded = await expandWithRelatedDocs(expanded, primaryQuery, db);
  logger.prod('[kb/search] cross-ref:', expanded.length, '→', crossExpanded.length);

  // 8. AI synthesis (use primary translated query for Ukrainian context)
  const synthesis = await synthesizeAnswer(primaryQuery, crossExpanded, history);

  // Cost footer: all AI stages
  const mqc = mqResult.mqCost;
  const embedCost = subQueries.length * 50 * 0.02 / 1_000_000;
  const rerankCost = candidates.length * 500 * 0.05 / 1_000_000;
  const allCosts = (mqc?.cost ?? 0) + embedCost + rerankCost + synthesis.cost;

  const totalIn = (mqc?.promptTokens ?? 0) + synthesis.promptTokens;
  const totalOut = (mqc?.completionTokens ?? 0) + synthesis.completionTokens;
  const costFooter = allCosts > 0 ? `\n\n💰 ↑${totalIn} ↓${totalOut} · $${allCosts.toFixed(5)}` : '';

  if (source) logKBQuery({
    user_id: userId || null, user_role: role, source,
    query_original: query, query_translated: queryTranslatedLog,
    category_hint: categorySlug, category_detected: dominantCategorySlug(diversified) || null,
    top_score: mergedChunks[0]?.similarity ?? null, chunks_found: mergedChunks.length,
    search_attempt: successAttempt, ai_refused: synthesis.text.includes(AI_REFUSAL_MARKER),
    synthesis_cost: synthesis.cost, rerank_top_score: rerankTopScore,
    answer_text: synthesis.text.slice(0, 2000),
    anonymous_name: anonymousName || null,
  });

  const chunkPreviews: KBChunkPreview[] = source === 'web'
    ? diversified.map((c: KBChunk) => ({
        document_title: c.document_title,
        heading: c.heading || null,
        content: c.content,
      }))
    : [];

  return {
    text: synthesis.text + costFooter,
    parseMode: 'HTML',
    ...(chunkPreviews.length > 0 && { chunks: chunkPreviews }),
  };
}
