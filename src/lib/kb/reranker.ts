/**
 * KB Reranker — Voyage rerank-2.5 (cross-encoder, 32K context).
 * Reranks hybrid-search results by semantic relevance to the query.
 * Supports instruction-following for domain-specific relevance tuning.
 * Requires VOYAGE_API_KEY env var. Gracefully skips if not set.
 */
import { config } from '@/lib/shared/config';
import logger from '@/lib/shared/logger';
import { fetchWithTimeout } from '@/lib/shared/utils/fetch-with-timeout';

const RERANK_MODEL = 'rerank-2.5';
const RERANK_ENDPOINT = 'https://api.voyageai.com/v1/rerank';
const RERANK_INSTRUCTIONS: Record<string, string> = {
  legal: 'Users are employees of a retail company. Rank general norms higher than profession-specific procedures (cultural workers, sailors, athletes). Prioritize fragments with article/clause references.',
  ib: 'Prioritize procedural and regulatory instructions for information security. Rank step-by-step requirements and standards higher than definitions or policy overviews.',
  hr: 'Prioritize HR procedures, deadlines, and responsible parties. Rank specific employment rules higher than general corporate policy statements.',
  it: 'Prioritize technical instructions and configuration procedures. Rank actionable steps higher than architectural overviews.',
  default: 'Prioritize normative corporate documents that directly answer the query. Rank procedural and regulatory content higher than tangentially related fragments.',
};

/** Minimum reranker relevance score to keep a chunk (below = noise). */
export const RERANK_NOISE_THRESHOLD = 0.15;

export interface Rerankable {
  content: string;
  [key: string]: unknown;
}

/**
 * Rerank documents by query relevance using Voyage cross-encoder.
 * Returns items sorted by relevance_score (desc), top_k items only.
 * Filters out chunks below RERANK_NOISE_THRESHOLD.
 * If Voyage key is missing or API fails — returns original order unchanged.
 */
export async function rerankChunks<T extends Rerankable>(
  query: string,
  items: T[],
  topK = 4,
  domain?: string,
): Promise<T[]> {
  if (!items.length) return items;

  const apiKey = config.voyage.apiKey;
  if (!apiKey) {
    logger.debug('[kb/reranker] VOYAGE_API_KEY not set — skipping rerank');
    return items.slice(0, topK);
  }

  try {
    const response = await fetchWithTimeout(RERANK_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query: (RERANK_INSTRUCTIONS[domain ?? ''] ?? RERANK_INSTRUCTIONS.default) + '\n\nQuery: ' + query,
        documents: items.map(item => {
          const parts: string[] = [];
          if ('contextual_prefix' in item && item.contextual_prefix) {
            parts.push(String(item.contextual_prefix));
          } else {
            if ('document_title' in item && item.document_title) parts.push(`Документ: ${item.document_title}`);
            if ('heading' in item && item.heading) parts.push(`Розділ: ${item.heading}`);
          }
          parts.push(item.content);
          return parts.join('\n');
        }),
        top_k: topK,
      }),
    }, 8_000);

    if (!response.ok) {
      const err = await response.text();
      logger.prod('[kb/reranker] Voyage API error', response.status, err.slice(0, 200));
      return items.slice(0, topK);
    }

    const data = await response.json() as {
      data: Array<{ index: number; relevance_score: number }>;
    };

    const sorted = data.data
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .map(r => ({ ...items[r.index], _rerank_score: r.relevance_score }));

    const reranked = sorted.filter(r => r._rerank_score >= RERANK_NOISE_THRESHOLD);

    const chunkIds = reranked.map(r => {
      const id = 'chunk_id' in r ? String(r.chunk_id).slice(0, 8) : '?';
      const score = (r._rerank_score as number).toFixed(3);
      return `${id}=${score}`;
    }).join(', ');
    logger.prod(
      '[kb/reranker] reranked', items.length, '→', reranked.length,
      '(filtered', sorted.length - reranked.length, 'noise)',
      'chunks:', chunkIds,
    );

    return (reranked.length > 0 ? reranked : sorted.slice(0, 1)) as T[];
  } catch (err) {
    logger.prod('[kb/reranker] rerank failed, using original order:', err);
    return items.slice(0, topK);
  }
}
