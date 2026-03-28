/**
 * KB Search v2 — simplified pipeline.
 * Public API: searchAndAnswer(query, options) → KBSearchResult
 *
 * Pipeline (7 stages):
 * 1. Query analysis (multi-query + domain + specificity)
 * 2. Embedding (Voyage batch)
 * 3. Hybrid retrieval (vector + BM25 via RRF, domain as hard filter)
 * 4. Rerank (Voyage rerank-2.5, domain-specific instructions)
 * 5. Single quality gate (rerank score)
 * 6. Context expansion (neighbors + cross-ref)
 * 7. AI synthesis (single LLM call)
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
import {
  diversifyByDocument,
  expandWithRelatedDocs,
  expandWithNeighbors,
} from './search-helpers';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface KBSearchOptions {
  userId: string;
  role: string;
  source?: string;
  db: SupabaseClient;
  category?: string;
  history?: ConversationTurn[];
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

// ── Subject filter — use [Стосується:] + [Тип:] metadata to remove wrong-category chunks ─

/** Profession-specific markers in [Стосується:] that indicate a narrow subcategory */
const PROFESSION_MARKERS = [
  'культур', 'кінематограф', 'мінкульт', 'телерадіо', 'медіа', 'стратегіч',
  'морськ', 'моряк', 'судноплав', 'авіаційн', 'пілот',
  'спортсмен', 'олімпійськ', 'залізнич',
];

/**
 * If query is about a GENERAL subject (заброньований, військовозобов'язаний)
 * and a chunk's [Стосується:] mentions a SPECIFIC profession — remove it.
 * Keeps chunks without [Стосується:] metadata or with general subjects.
 */
function filterBySubject(query: string, chunks: KBChunk[]): KBChunk[] {
  const qLower = query.toLowerCase();
  // Only filter when query is about general categories, not specific professions
  const isGeneralQuery = ['заброньован', 'забронирован', 'бронюванн', 'військовозобов']
    .some(t => qLower.includes(t));
  const mentionsSpecificProfession = PROFESSION_MARKERS.some(t => qLower.includes(t));
  if (!isGeneralQuery || mentionsSpecificProfession) return chunks;

  const filtered = chunks.filter(chunk => {
    const prefix = (chunk.contextual_prefix || '').toLowerCase();
    const stMatch = prefix.match(/\[стосується:\s*([^\]]+)\]/);
    if (!stMatch) return true;
    const subject = stMatch[1];
    const isProfessionSpecific = PROFESSION_MARKERS.some(t => subject.includes(t));
    if (isProfessionSpecific) {
      logger.prod('[kb/search] subject-filter: excluded', subject.slice(0, 60));
    }
    return !isProfessionSpecific;
  });

  // Safety: don't filter out everything — keep at least 3 chunks
  return filtered.length >= 3 ? filtered : chunks;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MATCH_COUNT = parseInt(process.env.KB_MATCH_COUNT ?? '15', 10);
const MATCH_THRESHOLD = parseFloat(process.env.KB_MATCH_THRESHOLD ?? '0.20');
const RERANK_TOP_K = parseInt(process.env.KB_RERANK_TOP_K ?? '10', 10);
const RERANK_REFUSE_THRESHOLD = parseFloat(process.env.KB_RERANK_REFUSE_THRESHOLD ?? '0.15');
const POST_RERANK_MAX_PER_DOC = parseInt(process.env.KB_POST_RERANK_MAX_PER_DOC ?? '2', 10);
const NO_RESULTS_TEXT = 'В базі знань не знайдено інформації за цим запитом.\n\nСпробуйте уточнити тему: <b>ІБ</b>, <b>HR</b>, <b>IT</b> або <b>юридичні</b> питання.';

// ── Retrieval ─────────────────────────────────────────────────────────────────

async function runMultiSearch(
  subQueries: string[],
  embeddings: number[][],
  db: SupabaseClient,
  categorySlug: string | null,
): Promise<{ chunks: KBChunk[]; attempt: string | null }> {
  const searchPromises = subQueries.map((qText, i) =>
    db.rpc('match_kb_documents', {
      query_embedding: `[${embeddings[i].join(',')}]`,
      query_text: qText,
      match_count: MATCH_COUNT,
      match_threshold: MATCH_THRESHOLD,
      filter_category_slug: categorySlug,
      filter_process_id: null,
    }),
  );
  const results = await Promise.all(searchPromises);

  const rpcError = results.find(r => r.error);
  if (rpcError?.error) {
    logger.error('[kb/search] RPC error:', (rpcError.error as { message?: string }).message);
    return { chunks: [], attempt: null };
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

  return {
    chunks: [...chunkMap.values()].sort((a, b) => b.similarity - a.similarity),
    attempt,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function searchAndAnswer(query: string, options: KBSearchOptions): Promise<KBSearchResult> {
  const { userId, role, source, db, category: categoryHint, history, anonymousName } = options;

  // 1. Query analysis
  const mqResult = await generateMultiQueries(query);
  const { queries: subQueries, primaryQuery, domain } = mqResult;
  logger.prod('[kb/search] multi-query:', JSON.stringify(subQueries), 'domain:', domain);

  if (domain === 'ambiguous' || (mqResult.specificity === 'low' && mqResult.clarification)) {
    return { text: mqResult.clarification || 'Уточніть, будь ласка, що саме ви маєте на увазі?', parseMode: 'HTML' };
  }

  // 2. Embedding
  let embeddings: number[][];
  try {
    embeddings = await embedBatchQueries(subQueries);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[kb/search] embed error:', msg);
    return { text: `Помилка пошуку: ${msg}`, parseMode: 'HTML' };
  }

  // 3. Retrieval — domain as hard filter
  const categorySlug = categoryHint
    ? fuzzyMatchSlug(categoryHint, await loadCategories(db))
    : (domain !== 'general' ? (domain as string) : null);

  let { chunks: mergedChunks, attempt: successAttempt } =
    await runMultiSearch(subQueries, embeddings, db, categorySlug);

  // If domain filter returned nothing, search all categories
  if (!mergedChunks.length && categorySlug) {
    const allResult = await runMultiSearch(subQueries, embeddings, db, null);
    mergedChunks = allResult.chunks;
    successAttempt = allResult.attempt;
  }

  const queryTranslatedLog = subQueries.length > 1
    ? subQueries.join(' | ')
    : (primaryQuery !== query ? primaryQuery : null);

  if (!mergedChunks.length) {
    if (source) logKBQuery({
      user_id: userId || null, user_role: role, source,
      query_original: query, query_translated: queryTranslatedLog,
      category_hint: categorySlug, category_detected: null,
      top_score: null, chunks_found: 0, search_attempt: null,
      ai_refused: false, synthesis_cost: 0, anonymous_name: anonymousName || null,
    });
    return { text: NO_RESULTS_TEXT, parseMode: 'HTML' };
  }

  const topScore = mergedChunks[0]?.similarity ?? 0;

  // 4. Subject filter BEFORE rerank — so reranker sees only relevant chunks
  const subjectFiltered = filterBySubject(query, mergedChunks);

  // 4.1. Rerank
  const detectedDomain = domain !== 'general' ? (domain as string) : dominantCategorySlug(subjectFiltered) || undefined;
  const reranked = await rerankChunks(query, subjectFiltered, RERANK_TOP_K, detectedDomain);
  const rerankTopScore = (reranked[0] as KBChunk & { _rerank_score?: number })?._rerank_score ?? null;

  // 5. Single quality gate — after rerank
  if (rerankTopScore !== null && rerankTopScore < RERANK_REFUSE_THRESHOLD) {
    logger.prod('[kb/search] quality gate: rerank', rerankTopScore.toFixed(3), '→ refuse');
    if (source) logKBQuery({
      user_id: userId || null, user_role: role, source,
      query_original: query, query_translated: queryTranslatedLog,
      category_hint: categorySlug, category_detected: detectedDomain || null,
      top_score: topScore, chunks_found: mergedChunks.length, search_attempt: successAttempt,
      ai_refused: true, synthesis_cost: 0, rerank_top_score: rerankTopScore,
      anonymous_name: anonymousName || null,
    });
    return { text: NO_RESULTS_TEXT, parseMode: 'HTML' };
  }

  // 6. Diversity + logging
  const diversified = diversifyByDocument(reranked, POST_RERANK_MAX_PER_DOC);
  logger.prod('[kb/search] pipeline:', mergedChunks.length, '→ subject', subjectFiltered.length,
    '→ rerank', reranked.length, '→ diverse', diversified.length);

  const expanded = await expandWithNeighbors(diversified, db);
  const crossExpanded = await expandWithRelatedDocs(expanded, primaryQuery, db);

  // 7. AI synthesis
  const synthesis = await synthesizeAnswer(primaryQuery, crossExpanded, history);

  // Cost footer
  const mqc = mqResult.mqCost;
  const embedCost = subQueries.length * 50 * 0.02 / 1_000_000;
  const rerankCost = mergedChunks.length * 500 * 0.05 / 1_000_000;
  const allCosts = (mqc?.cost ?? 0) + embedCost + rerankCost + synthesis.cost;
  const totalIn = (mqc?.promptTokens ?? 0) + synthesis.promptTokens;
  const totalOut = (mqc?.completionTokens ?? 0) + synthesis.completionTokens;
  const costFooter = allCosts > 0 ? `\n\n💰 ↑${totalIn} ↓${totalOut} · $${allCosts.toFixed(5)}` : '';

  if (source) logKBQuery({
    user_id: userId || null, user_role: role, source,
    query_original: query, query_translated: queryTranslatedLog,
    category_hint: categorySlug, category_detected: dominantCategorySlug(diversified) || null,
    top_score: topScore, chunks_found: mergedChunks.length,
    search_attempt: successAttempt, ai_refused: synthesis.text.includes(AI_REFUSAL_MARKER),
    synthesis_cost: synthesis.cost, rerank_top_score: rerankTopScore,
    answer_text: synthesis.text.slice(0, 2000), anonymous_name: anonymousName || null,
  });

  const chunkPreviews: KBChunkPreview[] = source === 'web'
    ? diversified.map((c: KBChunk) => ({ document_title: c.document_title, heading: c.heading || null, content: c.content }))
    : [];

  return {
    text: synthesis.text + costFooter,
    parseMode: 'HTML',
    ...(chunkPreviews.length > 0 && { chunks: chunkPreviews }),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadCategories(db: SupabaseClient): Promise<Array<{ slug: string; name: string }>> {
  const { data } = await db.from('kb_categories').select('slug, name').eq('is_active', true);
  return (data ?? []) as Array<{ slug: string; name: string }>;
}
