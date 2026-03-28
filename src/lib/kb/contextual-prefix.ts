/**
 * Contextual Retrieval — AI-generated chunk context for better embeddings.
 * Each chunk gets a 2-3 sentence prefix describing what it covers within the document.
 * Based on Anthropic's Contextual Retrieval approach (-35% to -49% retrieval failure).
 *
 * Uses Claude Haiku 4.5 via shared AI client.
 */
import { generateAIText } from '@/lib/shared/ai/client';
import { config } from '@/lib/shared/config';
import logger from '@/lib/shared/logger';

const CONTEXT_PROMPT =
  'You receive a fragment of a Ukrainian corporate/legal document and a document summary.\n' +
  'Generate a structured search index entry. Output in UKRAINIAN, instructions in English.\n\n' +
  'FORMAT (every line mandatory):\n' +
  '[Пошук: comma-separated list of 5-10 COLLOQUIAL Ukrainian search terms users would type to find this fragment]\n' +
  '[Тип: загальне правило | виняток | процедура | визначення | перелік | заборона | відповідальність]\n' +
  '[Стосується: WHO or WHAT is the subject — specific category of persons, objects, situations]\n' +
  '1-2 sentences of context (max 50 words) — what rule/procedure this fragment describes.\n\n' +
  'CRITICAL RULES for [Пошук:]:\n' +
  '- Add COLLOQUIAL synonyms for legal terms. Examples:\n' +
  '  "військовозобов\'язані які не підлягають призову" → add "заброньовані, бронювання"\n' +
  '  "припинення трудових відносин" → add "звільнення, як звільнитися"\n' +
  '  "знімні носії інформації" → add "флешка, USB"\n' +
  '  "програмне забезпечення" → add "ПЗ, софт, програми"\n' +
  '- Add abbreviations: ТЦК, ВЛК, ВОД, АРМ, КМУ, etc.\n' +
  '- Think: "what would a retail company employee type in chat to find this?"\n' +
  '- Do NOT repeat words from the document title\n\n' +
  'Output ONLY the structured entry, no explanations.';

const MAX_DOC_SUMMARY_CHARS = 6000;
const MAX_RETRIES = 3;

/**
 * Generate AI contextual prefix for a single chunk.
 * Retries on 429 rate-limit errors with exponential backoff.
 * Returns empty string on non-retryable failure (graceful degradation).
 */
export async function generateContextualPrefix(
  documentTitle: string,
  documentSummary: string,
  heading: string,
  chunkContent: string,
): Promise<string> {
  const docContext = documentSummary.slice(0, MAX_DOC_SUMMARY_CHARS);
  const userMessage =
    `Документ: «${documentTitle}»\n` +
    `Розділ: ${heading || '(без заголовку)'}\n\n` +
    `Загальний зміст документа (скорочено):\n${docContext}\n\n` +
    `Фрагмент:\n${chunkContent}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const text = await generateAIText({
        messages: [{ role: 'user', content: userMessage }],
        systemPrompt: CONTEXT_PROMPT,
        providerOverride: 'anthropic',
        anthropicModel: 'claude-haiku-4-5-20251001',
        apiKeyOverride: config.anthropic.apiKey!,
        maxTokens: 300,
        temperature: 0,
        timeoutMs: 30_000,
      });
      return text.trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.includes('rate limit') || msg.includes('429');
      if (isRateLimit) {
        // Don't retry on rate limit — return empty and let embedding proceed
        logger.warn(`[kb/context] rate limited, skipping prefix for chunk`);
        return '';
      }
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt + 1) * 2_000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      logger.error('[kb/context] prefix generation failed:', err);
      return '';
    }
  }
  return '';
}

const CONCURRENCY = 30;

/**
 * Generate contextual prefixes for all chunks of a document.
 * Parallel batches of CONCURRENCY calls for speed.
 * Returns array of prefix strings (empty string for failed chunks).
 */
export async function generateContextualPrefixes(
  documentTitle: string,
  fullDocumentText: string,
  chunks: Array<{ heading: string; content: string }>,
): Promise<string[]> {
  const docSummary = fullDocumentText.slice(0, MAX_DOC_SUMMARY_CHARS);
  const prefixes: string[] = new Array(chunks.length).fill('');

  for (let batch = 0; batch < chunks.length; batch += CONCURRENCY) {
    const slice = chunks.slice(batch, batch + CONCURRENCY);
    const results = await Promise.all(
      slice.map(chunk => generateContextualPrefix(documentTitle, docSummary, chunk.heading, chunk.content)),
    );
    for (let j = 0; j < results.length; j++) {
      prefixes[batch + j] = results[j];
    }
  }

  logger.prod('[kb/context] generated', prefixes.filter(Boolean).length, '/', chunks.length, 'prefixes for', documentTitle);
  return prefixes;
}
