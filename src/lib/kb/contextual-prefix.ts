/**
 * Contextual Retrieval — AI-generated chunk context for better embeddings.
 * Each chunk gets a 2-3 sentence prefix describing what it covers within the document.
 * Based on Anthropic's Contextual Retrieval approach (-35% to -49% retrieval failure).
 *
 * Uses Claude Haiku 4.5 via shared AI client.
 */
import { generateAIText } from '@/lib/shared/ai/client';
import logger from '@/lib/shared/logger';

const CONTEXT_PROMPT =
  'Ти отримуєш фрагмент корпоративного документа та загальний опис документа.\n' +
  'Напиши короткий контекст (2-3 речення, максимум 80 слів) для цього фрагменту:\n' +
  '- Про що цей фрагмент і до якої теми він відноситься\n' +
  '- Яке правило/процедуру/заборону він описує (якщо є)\n' +
  '- До якої КАТЕГОРІЇ предметів/пристроїв/процесів відноситься\n\n' +
  'ТІЛЬКИ факти з тексту. Без «цей фрагмент описує...» — пиши як довідку.\n' +
  'Мова: українська.\n' +
  'Відповідай ТІЛЬКИ контекстом, без пояснень.';

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
        providerOverride: 'openai',
        openAIModel: 'gpt-4.1-mini',
        maxTokens: 200,
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

/**
 * Generate contextual prefixes for all chunks of a document.
 * Sequential calls with small delay to avoid rate limits.
 * Returns array of prefix strings (empty string for failed chunks).
 */
export async function generateContextualPrefixes(
  documentTitle: string,
  fullDocumentText: string,
  chunks: Array<{ heading: string; content: string }>,
): Promise<string[]> {
  const prefixes: string[] = [];
  const docSummary = fullDocumentText.slice(0, MAX_DOC_SUMMARY_CHARS);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const prefix = await generateContextualPrefix(
      documentTitle, docSummary, chunk.heading, chunk.content,
    );
    prefixes.push(prefix);

    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  logger.prod('[kb/context] generated', prefixes.filter(Boolean).length, '/', chunks.length, 'prefixes for', documentTitle);
  return prefixes;
}
