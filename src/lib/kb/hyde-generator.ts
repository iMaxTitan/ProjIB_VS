/**
 * HyDE (Hypothetical Document Embedding) generator.
 *
 * Generates hypothetical questions for chunks and embeds them.
 * Used by: processor.ts (initial import), kb-reindex-local.ts (batch reindex),
 *          reindex API route, backfill script.
 *
 * Two modes:
 *   1. generateHydeForBatch() — embed pre-generated questions (for processor.ts)
 *   2. backfillHyde()         — batch LLM: 20 chunks per call, then embed
 */
import logger from '@/lib/shared/logger';
import { embedBatch } from './embedder';
import { config } from '@/lib/shared/config';
import { fetchWithTimeout } from '@/lib/shared/utils/fetch-with-timeout';
import { HYDE_ANGLES } from './shared/hyde-angles';
import { generateChunkPrefix, type PrefixResult } from './prefix-pipeline';
import type { SupabaseClient } from '@/lib/shared/postgrest-client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface HydeResult {
  questions: string[];
  questionEmbedding: number[] | null;
}

interface ChunkForHyde {
  id: string;
  document_id: string;
  content: string;
  heading: string | null;
  hypothetical_questions: string[] | null;
  question_embedding: unknown;
}

// ── Single-chunk question generation (for processor.ts) ─────────────────────

/**
 * Extract or generate hypothetical questions for a single chunk.
 * Used during initial document import where full prefix pipeline runs anyway.
 */
export async function generateQuestions(
  chunkContent: string,
  heading: string,
  docTitle: string,
  domain: string,
  existingPrefix?: PrefixResult | null,
): Promise<string[]> {
  if (existingPrefix?.hypotheticalQuestions?.length) {
    return existingPrefix.hypotheticalQuestions;
  }
  const result = await generateChunkPrefix(chunkContent, heading, docTitle, domain);
  return result.hypotheticalQuestions || [];
}

// ── Batch embed (for processor.ts / reindex) ────────────────────────────────

/**
 * Embed pre-generated questions. Returns parallel array of embeddings.
 */
export async function generateHydeForBatch(
  questions: string[][],
): Promise<Array<number[] | null>> {
  const texts = questions.map(qs => qs.length ? qs.join(' ') : '');
  const hasAny = texts.some(t => t.length > 0);
  if (!hasAny) return questions.map(() => null);

  const toEmbed = texts.map(t => t || 'placeholder');
  const embeddings = await embedBatch(toEmbed);
  return texts.map((t, i) => t ? embeddings[i] : null);
}

// ── Batch LLM: generate questions for N chunks in one call ──────────────────

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const BATCH_LLM_MODEL = 'google/gemini-3.1-flash-lite-preview';

/**
 * Generate hypothetical questions for up to 20 chunks in a single LLM call.
 * Returns parallel array of string[] (questions per chunk).
 */
async function batchGenerateQuestions(
  chunks: Array<{ content: string; heading: string; docTitle: string; domain: string }>,
): Promise<string[][]> {
  const apiKey = config.openrouter?.apiKey;
  if (!apiKey) return chunks.map(() => []);

  // Group by domain for angles
  const domain = chunks[0]?.domain || 'general';
  const angles = HYDE_ANGLES[domain] || HYDE_ANGLES.legal || '';

  // Build multi-chunk prompt
  const chunkBlocks = chunks.map((c, i) =>
    `[${i}] Документ: «${c.docTitle}» | Розділ: ${c.heading || '—'}\n${c.content.slice(0, 400)}`
  ).join('\n\n');

  const systemPrompt =
    'Ти генератор пошукових питань для корпоративної бази знань АТБ-Маркет.\n' +
    'Для кожного фрагмента згенеруй 2-4 короткі питання, які працівник магазину міг би ввести в пошук.\n\n' +
    'Правила:\n' +
    '- Простою природною українською, як запит працівника.\n' +
    '- Одне питання = один намір. Коротко.\n' +
    '- НЕ вигадуй те, чого немає у фрагменті.\n' +
    '- НЕ став загальні питання типу "Що це означає?".\n' +
    '- НЕ роби майже однакові питання.\n\n' +
    `Domain: ${domain}\nДозволені кути:\n${angles}\n\n` +
    'Відповідай ТІЛЬКИ валідним JSON — масив масивів:\n' +
    '[[\"питання 1\", \"питання 2\"], [\"питання 1\", \"питання 2\", \"питання 3\"], ...]\n' +
    `Рівно ${chunks.length} елементів у зовнішньому масиві — по одному на кожен фрагмент [0]...[${chunks.length - 1}].`;

  try {
    const response = await fetchWithTimeout(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: BATCH_LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: chunkBlocks },
        ],
        temperature: 0,
        max_tokens: chunks.length * 200,
      }),
    }, 60_000);

    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content || '';

    // Parse JSON array
    const cleaned = raw.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned) as string[][];

    if (!Array.isArray(parsed) || parsed.length !== chunks.length) {
      logger.warn('[kb/hyde] batch LLM returned wrong array length:', parsed.length, 'expected:', chunks.length);
      // Pad or trim
      const result: string[][] = [];
      for (let i = 0; i < chunks.length; i++) {
        const qs = parsed[i];
        result.push(Array.isArray(qs) ? qs.filter(q => typeof q === 'string') : []);
      }
      return result;
    }

    return parsed.map(qs => Array.isArray(qs) ? qs.filter(q => typeof q === 'string') : []);
  } catch (err) {
    logger.error('[kb/hyde] batch LLM error:', (err instanceof Error ? err.message : String(err)));
    return chunks.map(() => []);
  }
}

// ── Backfill: update existing chunks in DB ───────────────────────────────────

export interface BackfillProgress {
  total: number;
  processed: number;
  generated: number;
  errors: number;
}

/**
 * Backfill HyDE for existing chunks that have no question_embedding.
 * Uses batch LLM (20 chunks per call) + batch embed.
 */
export async function backfillHyde(
  db: SupabaseClient,
  options?: {
    batchSize?: number;
    delayMs?: number;
    documentId?: string;
    onProgress?: (p: BackfillProgress) => void;
  },
): Promise<BackfillProgress> {
  const BATCH = options?.batchSize ?? 20;
  const DELAY = options?.delayMs ?? 500;

  let query = db
    .from('kb_chunks')
    .select('id, document_id, content, heading, hypothetical_questions, question_embedding')
    .is('question_embedding', null)
    .order('document_id')
    .order('chunk_index');

  if (options?.documentId) {
    query = query.eq('document_id', options.documentId);
  }

  const { data: chunks, error } = await query as {
    data: ChunkForHyde[] | null;
    error: unknown;
  };

  if (error || !chunks?.length) {
    return { total: 0, processed: 0, generated: 0, errors: 0 };
  }

  // Load doc info
  const docIds = [...new Set(chunks.map(c => c.document_id))];
  const { data: docs } = await db
    .from('kb_documents')
    .select('id, title, category_id')
    .in('id', docIds) as { data: Array<{ id: string; title: string; category_id: string }> | null };

  const { data: cats } = await db
    .from('kb_categories')
    .select('id, slug') as { data: Array<{ id: string; slug: string }> | null };

  const docMap = new Map((docs ?? []).map(d => [d.id, d]));
  const catSlugMap = new Map((cats ?? []).map(c => [c.id, c.slug || 'general']));

  const progress: BackfillProgress = {
    total: chunks.length,
    processed: 0,
    generated: 0,
    errors: 0,
  };

  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);

    try {
      // Step 1: Split into need-questions vs have-questions
      const needQuestions: Array<{ idx: number; content: string; heading: string; docTitle: string; domain: string }> = [];
      const allQuestions: string[][] = new Array(batch.length).fill(null);

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        if (chunk.hypothetical_questions?.length) {
          allQuestions[j] = chunk.hypothetical_questions;
        } else {
          const doc = docMap.get(chunk.document_id);
          const domain = doc ? catSlugMap.get(doc.category_id) || 'general' : 'general';
          needQuestions.push({
            idx: j,
            content: chunk.content,
            heading: chunk.heading || '',
            docTitle: doc?.title || '',
            domain,
          });
        }
      }

      // Step 2: Batch LLM for chunks that need questions
      if (needQuestions.length > 0) {
        const generated = await batchGenerateQuestions(needQuestions);
        for (let k = 0; k < needQuestions.length; k++) {
          allQuestions[needQuestions[k].idx] = generated[k] || [];
        }
      }

      // Step 3: Embed all questions
      const embeddings = await generateHydeForBatch(allQuestions);

      // Step 4: Update DB
      for (let j = 0; j < batch.length; j++) {
        const updatePayload: Record<string, unknown> = {};
        if (embeddings[j]) {
          updatePayload.question_embedding = JSON.stringify(embeddings[j]);
        }
        if (allQuestions[j]?.length && !batch[j].hypothetical_questions?.length) {
          updatePayload.hypothetical_questions = allQuestions[j];
        }
        if (Object.keys(updatePayload).length === 0) continue;

        const { error: upErr } = await db
          .from('kb_chunks')
          .update(updatePayload)
          .eq('id', batch[j].id);

        if (upErr) {
          logger.error('[kb/hyde] update error:', batch[j].id, (upErr as { message?: string }).message);
          progress.errors++;
        } else {
          progress.generated++;
        }
      }

      progress.processed += batch.length;
      options?.onProgress?.(progress);

      if (i + BATCH < chunks.length) await new Promise(r => setTimeout(r, DELAY));
    } catch (err) {
      logger.error('[kb/hyde] batch error:', (err instanceof Error ? err.message : String(err)));
      progress.errors += batch.length;
      progress.processed += batch.length;
    }
  }

  return progress;
}
