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

// ── Scope filter — soft boost/penalty instead of hard drop ───────────────────

/** Penalty multiplier for specific-scope chunks when query doesn't mention the subject. */
const SCOPE_MISMATCH_PENALTY = 0.5;

/**
 * Soft scope filter: instead of dropping specific-scope chunks,
 * penalize their similarity score so reranker sees them lower.
 * This avoids false negatives from Ukrainian/Russian morphology mismatches.
 */
function applyScopeBoost(query: string, chunks: KBChunk[]): KBChunk[] {
  const qLower = query.toLowerCase();

  for (const chunk of chunks) {
    let scope = (chunk as KBChunk & { scope?: string }).scope || '';
    if (!scope || scope === 'general') {
      const match = (chunk.contextual_prefix || '').match(/\[scope:\s*specific:\s*([^\]]+)\]/i);
      scope = match ? `specific: ${match[1].trim()}` : 'general';
    }
    if (!scope.startsWith('specific')) continue;

    const category = scope.replace(/^specific:\s*/, '').trim().toLowerCase();
    if (!category) continue;

    // Stem-match: check if any word ≥4 chars root appears in query
    const words = category.split(/[\s,''ʼ]+/).filter(w => w.length >= 4);
    if (words.length === 0) continue;

    const mentioned = words.some(w => qLower.includes(w.slice(0, Math.max(4, w.length - 4))));
    if (!mentioned) {
      // Soft penalty — demote but don't drop
      chunk.similarity *= SCOPE_MISMATCH_PENALTY;
      logger.prod('[kb/search] scope-penalty:', scope.slice(0, 50), '→ sim *', SCOPE_MISMATCH_PENALTY);
    }
  }

  // Re-sort by penalized similarity
  return chunks.sort((a, b) => b.similarity - a.similarity);
}

// ── Post-rerank entity boost ─────────────────────────────────────────────────

/** Stop-words excluded from entity extraction (UA/RU verbs, prepositions, common words). */
const ENTITY_STOP = new Set([
  'як', 'как', 'що', 'что', 'чи', 'які', 'какие', 'яка', 'яке', 'де', 'где',
  'встановити', 'установить', 'встановлення', 'установка', 'підключити', 'подключить',
  'налаштувати', 'настроить', 'отримати', 'получить', 'зробити', 'сделать',
  'можна', 'можно', 'потрібно', 'нужно', 'треба', 'надо',
  'робочий', 'рабочий', 'робочу', 'рабочую', 'компютер', 'компьютер', 'станцію', 'станцию',
  'для', 'від', 'від', 'на', 'до', 'за', 'про', 'або', 'чи',
  'мій', 'мой', 'свій', 'свой', 'мені', 'мне', 'нам',
]);

const ENTITY_BOOST_PER_HIT = 0.08;
const ENTITY_BOOST_MAX = 0.16;

/**
 * Extract meaningful entities from query (nouns, proper names, product names)
 * and boost reranked chunks that contain them in content.
 */
/** Max document frequency ratio for an entity to be useful (IDF filter). */
const ENTITY_MAX_DF_RATIO = 0.5;

export function applyEntityBoost(query: string, subQueries: string[], chunks: KBChunk[]): void {
  // Extract candidate entities: words ≥3 chars not in stop list
  const allText = [query, ...subQueries].join(' ').toLowerCase();
  const candidates = [...new Set(
    allText.split(/[\s,;.!?()«»"']+/)
      .map(w => w.replace(/[^a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9-]/g, ''))
      .filter(w => w.length >= 3 && !ENTITY_STOP.has(w)),
  )];

  if (!candidates.length || !chunks.length) return;

  // IDF filter: skip entities that appear in >50% of chunks (too common = no signal)
  const n = chunks.length;
  const filtered = candidates.filter(entity => {
    const df = chunks.filter(c => c.content.toLowerCase().includes(entity)).length;
    return df / n <= ENTITY_MAX_DF_RATIO;
  });

  if (!filtered.length) return;

  for (const chunk of chunks) {
    const contentLower = chunk.content.toLowerCase();
    let hits = 0;
    for (const entity of filtered) {
      if (contentLower.includes(entity)) hits++;
    }
    if (hits > 0) {
      const boost = Math.min(hits * ENTITY_BOOST_PER_HIT, ENTITY_BOOST_MAX);
      const score = (chunk as KBChunk & { _rerank_score?: number })._rerank_score;
      if (typeof score === 'number') {
        (chunk as KBChunk & { _rerank_score: number })._rerank_score = score + boost;
        logger.prod('[kb/search] entity-boost:', chunk.chunk_id?.slice(0, 8), '+', boost.toFixed(3), 'hits:', hits);
      }
    }
  }
}

// ── Keyword rescue — pull critical chunks from full candidates into reranked ──

/** Pairs: [query keywords, chunk content keywords]. If query matches left, rescue chunk matching right. */
const RESCUE_RULES: Array<{ query: RegExp; chunk: RegExp }> = [
  { query: /winrar|вінрар|винрар|архіватор|архиватор|\brar\b|7.?zip/i, chunk: /peazip|архіватор/i },
  { query: /teams|тімс|тимс/i, chunk: /teams|microsoft\s*teams/i },
  { query: /acrobat|pdf.*reader/i, chunk: /acrobat|pdf/i },
];

/**
 * If query matches a rescue rule but no reranked chunk matches the content pattern,
 * find the best matching chunk from full candidates and inject it into reranked.
 * Max 1 rescue per query to avoid noise.
 */
function keywordRescue(query: string, allCandidates: KBChunk[], reranked: KBChunk[]): void {
  for (const rule of RESCUE_RULES) {
    if (!rule.query.test(query)) continue;

    // Already have a matching chunk in reranked?
    const alreadyPresent = reranked.some(c => rule.chunk.test(c.content));
    if (alreadyPresent) continue;

    // Find top 2 candidates from full pool (e.g. office + trade versions)
    const rescueCandidates = allCandidates
      .filter(c => rule.chunk.test(c.content) && !reranked.some(r => r.chunk_id === c.chunk_id))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 2);

    const median = reranked.length > 5
      ? ((reranked[2] as KBChunk & { _rerank_score?: number })._rerank_score ?? 0)
      : ((reranked[0] as KBChunk & { _rerank_score?: number })._rerank_score ?? 0.4);

    for (const rescued of rescueCandidates) {
      (rescued as KBChunk & { _rerank_score: number })._rerank_score = median;
      reranked.push(rescued);
      logger.prod('[kb/search] keyword-rescue:', rescued.chunk_id?.slice(0, 8), 'rule:', rule.query.source.slice(0, 20));
    }
  }
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

  // 4. Scope soft-boost BEFORE rerank — penalize off-scope, don't drop
  const subjectFiltered = applyScopeBoost(query, mergedChunks);

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

  // Re-sort after all adjustments and trim to KEEP_K
  reranked.sort((a, b) => ((b as KBChunk & { _rerank_score?: number })._rerank_score ?? 0) - ((a as KBChunk & { _rerank_score?: number })._rerank_score ?? 0));
  reranked.splice(RERANK_KEEP_K);

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

  // 6.1. Re-apply scope boost after expansion (expansion can re-introduce narrow-scope docs)
  const finalChunks = applyScopeBoost(query, crossExpanded);

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
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadCategories(db: SupabaseClient): Promise<Array<{ slug: string; name: string }>> {
  const { data } = await db.from('kb_categories').select('slug, name').eq('is_active', true);
  return (data ?? []) as Array<{ slug: string; name: string }>;
}
