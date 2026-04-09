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

import type { PostgrestClient } from '@/lib/shared/postgrest-client';
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
import { handleMetaQuery, legalLocator } from './search-locators';
import { applyScopeBoost, applyEntityBoost, keywordRescue } from './search-ranking-policy';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface KBSearchOptions {
  userId: string;
  role: string;
  source?: string;
  db: PostgrestClient;
  category?: string;
  history?: ConversationTurn[];
  anonymousName?: string;
  /** When true, attaches stage-by-stage chunk_id arrays to result._debug for eval/diagnostics. */
  _debug?: boolean;
}

export interface KBChunkPreview {
  document_title: string;
  heading: string | null;
  content: string;
}

/** Stage-by-stage chunk_id arrays — populated only when options._debug = true. */
export interface KBSearchDebug {
  raw: string[];          // after vector + BM25 retrieval (+ fallback merge, + locator inject)
  subjectFiltered: string[]; // after applyScopeBoost (pre-rerank)
  rerank: string[];       // after Voyage rerank + boosts + KEEP_K trim
  diverse: string[];      // after diversifyByDocument
  final: string[];        // after expand neighbors + cross-ref + final scope boost
  rawTopScore: number | null;
  rerankTopScore: number | null;
  retried: boolean;
}

export interface KBSearchResult {
  text: string;
  parseMode: 'HTML';
  chunks?: KBChunkPreview[];
  _debug?: KBSearchDebug;
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


// ── Constants ─────────────────────────────────────────────────────────────────

const MATCH_COUNT = parseInt(process.env.KB_MATCH_COUNT ?? '50', 10);
const MATCH_THRESHOLD = parseFloat(process.env.KB_MATCH_THRESHOLD ?? '0.10');
const RERANK_FETCH_K = parseInt(process.env.KB_RERANK_FETCH_K ?? '50', 10);
const RERANK_KEEP_K = parseInt(process.env.KB_RERANK_KEEP_K ?? '30', 10);
const RERANK_REFUSE_THRESHOLD = parseFloat(process.env.KB_RERANK_REFUSE_THRESHOLD ?? '0.15');
const POST_RERANK_MAX_PER_DOC = parseInt(process.env.KB_POST_RERANK_MAX_PER_DOC ?? '2', 10);
const NO_RESULTS_TEXT = 'В базі знань не знайдено інформації за цим запитом.\n\nСпробуйте уточнити тему: <b>ІБ</b>, <b>HR</b>, <b>IT</b> або <b>юридичні</b> питання.';

// ── Retrieval ─────────────────────────────────────────────────────────────────

async function runMultiSearch(
  subQueries: string[],
  embeddings: number[][],
  db: PostgrestClient,
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
  const { userId, role, source, db, category: categoryHint, history, anonymousName, _debug } = options;
  const debug: KBSearchDebug | null = _debug
    ? { raw: [], subjectFiltered: [], rerank: [], diverse: [], final: [], rawTopScore: null, rerankTopScore: null, retried: false }
    : null;
  // Build a result that always includes _debug when requested, even on early refusal returns.
  const earlyReturn = (text: string): KBSearchResult => ({
    text, parseMode: 'HTML',
    ...(debug && { _debug: debug }),
  });

  // 0.0. Scope prefix: "по статуту" / "за статутом" / "у статуті" / "в статуті" → filter to Статут docs
  let docTitleFilter: string | null = null;
  const scopeMatch = query.match(/^\s*(по\s+статут[ау]|за\s+статут(?:ом|у)|[ву]\s+статут[іi])[\s,:—-]+/i);
  if (scopeMatch) {
    docTitleFilter = 'статут';
    query = query.slice(scopeMatch[0].length).trim();
    logger.prod('[kb/search] scope prefix "статут" detected, filtering by document title');
  }

  // 0. Meta-query: list available documents
  const metaAnswer = await handleMetaQuery(query, db);
  if (metaAnswer) return debug ? { ...metaAnswer, _debug: debug } : metaAnswer;

  // 0.1. Legal locator: exact article/section lookup
  const locatorChunks = await legalLocator(query, db);

  // 1. Query analysis
  const mqResult = await generateMultiQueries(query);
  const { queries: subQueries, primaryQuery, domain } = mqResult;
  logger.prod('[kb/search] multi-query:', JSON.stringify(subQueries), 'domain:', domain);

  if (domain === 'ambiguous' || (mqResult.specificity === 'low' && mqResult.clarification)) {
    return earlyReturn(mqResult.clarification || 'Уточніть, будь ласка, що саме ви маєте на увазі?');
  }

  // 1.5. Enrich queries with deterministic synonyms from kb_synonym_dict
  try {
    const { expandQueryWithSynonyms } = await import('./synonym-lookup');
    const dictTerms = await expandQueryWithSynonyms(query);
    if (dictTerms.length > 0) {
      // Add a synonym-expanded query as additional sub-query
      const synQuery = dictTerms.slice(0, 5).join(' ');
      subQueries.push(synQuery);
      logger.prod('[kb/search] synonym expansion:', synQuery.slice(0, 60));
    }
  } catch { /* dict not available — proceed without */ }

  // 2. Embedding
  let embeddings: number[][];
  try {
    embeddings = await embedBatchQueries(subQueries);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[kb/search] embed error:', msg);
    return earlyReturn(`Помилка пошуку: ${msg}`);
  }

  // 3. Retrieval — domain as hard filter
  // When scope prefix detected, drop category filter so target document isn't excluded by domain.
  const categorySlug = docTitleFilter
    ? null
    : categoryHint
    ? fuzzyMatchSlug(categoryHint, await loadCategories(db))
    : (domain !== 'general' ? (domain as string) : null);

  // Always run both domain-scoped and all-category searches in parallel.
  // Domain filter alone misses cross-domain docs (e.g. КЗпП tagged 'legal' for an HR query).
  const [searchResult, allCategoryResult] = await Promise.all([
    runMultiSearch(subQueries, embeddings, db, categorySlug),
    categorySlug ? runMultiSearch(subQueries, embeddings, db, null) : Promise.resolve(null),
  ]);
  let mergedChunks = searchResult.chunks;
  let successAttempt = searchResult.attempt;

  // Merge cross-category results: add chunks not already found by domain search
  if (allCategoryResult && allCategoryResult.chunks.length) {
    let added = 0;
    for (const c of allCategoryResult.chunks) {
      if (!mergedChunks.some(m => m.chunk_id === c.chunk_id)) {
        mergedChunks.push(c);
        added++;
      }
    }
    mergedChunks.sort((a, b) => b.similarity - a.similarity);
    if (!successAttempt) successAttempt = allCategoryResult.attempt;
    if (added > 0) logger.prod('[kb/search] cross-category merge:', added, 'extra chunks from all-category search');
  }

  // 3.0a. Apply doc-title scope filter AFTER all retrieval+fallback merges
  if (docTitleFilter) {
    const needle = docTitleFilter.toLowerCase();
    const before = mergedChunks.length;
    mergedChunks = mergedChunks.filter(c => (c.document_title || '').toLowerCase().includes(needle));
    logger.prod('[kb/search] doc-title filter:', before, '→', mergedChunks.length, `(needle: ${needle})`);
  }

  // 3.1. Inject legal locator results into candidates (top priority)
  if (locatorChunks.length > 0 && !docTitleFilter) {
    for (const lc of locatorChunks) {
      if (!mergedChunks.some(c => c.chunk_id === lc.chunk_id)) {
        mergedChunks.unshift(lc);
      }
    }
    logger.prod('[kb/search] legal-locator injected', locatorChunks.length, 'chunks');
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
    return earlyReturn(NO_RESULTS_TEXT);
  }

  const topScore = mergedChunks[0]?.similarity ?? 0;
  if (debug) {
    debug.raw = mergedChunks.map(c => c.chunk_id);
    debug.rawTopScore = topScore;
  }

  // 4. Scope soft-boost BEFORE rerank — penalize off-scope, don't drop
  const subjectFiltered = applyScopeBoost(query, mergedChunks);
  if (debug) debug.subjectFiltered = subjectFiltered.map(c => c.chunk_id);

  // 4.1. Rerank (fetch more, keep fewer after boost)
  const detectedDomain = domain !== 'general' ? (domain as string) : dominantCategorySlug(subjectFiltered) || undefined;
  const reranked = await rerankChunks(query, subjectFiltered, RERANK_FETCH_K, detectedDomain);

  // 4.2. Demote fallback chunks (prefix generation failed — lower confidence)
  for (const chunk of reranked) {
    const status = (chunk as KBChunk & { prefix_status?: string }).prefix_status;
    if (status === 'fallback' || status === 'needs_review') {
      const score = (chunk as KBChunk & { _rerank_score?: number })._rerank_score;
      if (typeof score === 'number') {
        (chunk as KBChunk & { _rerank_score: number })._rerank_score = score * 0.7;
      }
    }
  }
  // 4.3. Keyword rescue — ensure chunks with exact entity matches aren't lost
  keywordRescue(query, subjectFiltered, reranked);

  // 4.4. Entity boost — reward chunks containing query entities
  applyEntityBoost(query, subQueries, reranked);

  // Re-sort after all adjustments and trim to KEEP_K
  reranked.sort((a, b) => ((b as KBChunk & { _rerank_score?: number })._rerank_score ?? 0) - ((a as KBChunk & { _rerank_score?: number })._rerank_score ?? 0));
  reranked.splice(RERANK_KEEP_K);

  const rerankTopScore = (reranked[0] as KBChunk & { _rerank_score?: number })?._rerank_score ?? null;
  if (debug) {
    debug.rerank = reranked.map(c => c.chunk_id);
    debug.rerankTopScore = rerankTopScore;
  }

  // 5. Quality gate — refuse if rerank top score is below threshold.
  //    Deterministic retry removed: cross-category chunks are already merged at step 3.
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
    return earlyReturn(NO_RESULTS_TEXT);
  }

  // 6. Diversity + logging
  const diversified = diversifyByDocument(reranked, POST_RERANK_MAX_PER_DOC);
  if (debug) debug.diverse = diversified.map((c: KBChunk) => c.chunk_id);
  logger.prod('[kb/search] pipeline:', mergedChunks.length, '→ subject', subjectFiltered.length,
    '→ rerank', reranked.length, '→ diverse', diversified.length);

  const expanded = await expandWithNeighbors(diversified, db);
  const crossExpanded = await expandWithRelatedDocs(expanded, primaryQuery, db);

  // 6.1. Re-apply scope boost after expansion (expansion can re-introduce narrow-scope docs)
  const finalChunks = applyScopeBoost(query, crossExpanded);
  if (debug) debug.final = finalChunks.map((c: KBChunk) => c.chunk_id);

  // 7. AI synthesis
  const synthesis = await synthesizeAnswer(primaryQuery, finalChunks, history);

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
    ...(debug && { _debug: debug }),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadCategories(db: PostgrestClient): Promise<Array<{ slug: string; name: string }>> {
  const { data } = await db.from('kb_categories').select('slug, name').eq('is_active', true);
  return (data ?? []) as Array<{ slug: string; name: string }>;
}
