/**
 * KB Embeddings — Voyage AI (voyage-4 family, 1024 dims via Matryoshka).
 * Uses VOYAGE_API_KEY (same key as reranker).
 *
 * Asymmetric search (shared embedding space):
 *   - voyage-4-large  → indexing (max quality, one-time cost)
 *   - voyage-4-lite   → queries  (low latency, ongoing cost)
 *
 * input_type: "document" for indexing, "query" for search — improves recall.
 * output_dimension: 1024 (Matryoshka truncation, HNSW limit 2000).
 */
import { config } from '@/lib/shared/config';
import { fetchWithTimeout } from '@/lib/shared/utils/fetch-with-timeout';

const DOCUMENT_MODEL = 'voyage-4-large';
const QUERY_MODEL = 'voyage-4-lite';
const OUTPUT_DIMENSION = 1024;
const EMBEDDING_ENDPOINT = 'https://api.voyageai.com/v1/embeddings';
/** Voyage API: max 1000 items, max 120K tokens per batch for voyage-4-large.
 *  With contextual prefix + content, avg chunk is ~1000 tokens → 80 × 1000 = 80K (safe margin). */
const BATCH_SIZE = 80;

async function callEmbeddingsAPI(
  inputs: string[],
  inputType: 'document' | 'query',
): Promise<number[][]> {
  const apiKey = config.voyage.apiKey;
  if (!apiKey) throw new Error('VOYAGE_API_KEY is not set');

  const model = inputType === 'document' ? DOCUMENT_MODEL : QUERY_MODEL;

  const response = await fetchWithTimeout(EMBEDDING_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: inputs,
      input_type: inputType,
      output_dimension: OUTPUT_DIMENSION,
    }),
  }, 15_000);

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voyage embeddings error ${response.status}: ${err}`);
  }

  const data = await response.json() as { data: Array<{ embedding: number[]; index: number }> };

  // Sort by index (API may return out of order)
  const sorted = data.data.sort((a, b) => a.index - b.index);

  return sorted.map(item => {
    if (item.embedding.every(v => v === 0)) {
      throw new Error('Zero embedding returned from Voyage');
    }
    return item.embedding;
  });
}

/** Embed a batch of texts for INDEXING (input_type=document). Handles batching. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await callEmbeddingsAPI(batch, 'document');
    results.push(...embeddings);
  }

  return results;
}

/** Embed multiple SEARCH QUERIES in one API call (input_type=query). */
export async function embedBatchQueries(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return callEmbeddingsAPI(texts, 'query');
}

/** Embed a single SEARCH QUERY (input_type=query). */
export async function embedText(text: string): Promise<number[]> {
  const results = await callEmbeddingsAPI([text], 'query');
  return results[0];
}
