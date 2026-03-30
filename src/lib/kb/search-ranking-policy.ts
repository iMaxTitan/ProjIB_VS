/**
 * KB Search ranking policy — scope boost, entity boost, keyword rescue.
 * Extracted from search.ts to keep orchestration logic focused.
 */

import logger from '@/lib/shared/logger';
import type { KBChunk } from './query-translator';

// ── Scope filter — soft boost/penalty instead of hard drop ───────────────────

/** Penalty multiplier for specific-scope chunks when query doesn't mention the subject. */
const SCOPE_MISMATCH_PENALTY = 0.5;

/**
 * Soft scope filter: instead of dropping specific-scope chunks,
 * penalize their similarity score so reranker sees them lower.
 * This avoids false negatives from Ukrainian/Russian morphology mismatches.
 */
export function applyScopeBoost(query: string, chunks: KBChunk[]): KBChunk[] {
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

/** Max document frequency ratio for an entity to be useful (IDF filter). */
const ENTITY_MAX_DF_RATIO = 0.5;

/**
 * Extract meaningful entities from query (nouns, proper names, product names)
 * and boost reranked chunks that contain them in content.
 */
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
export function keywordRescue(query: string, allCandidates: KBChunk[], reranked: KBChunk[]): void {
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
