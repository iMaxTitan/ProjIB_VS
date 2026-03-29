/**
 * Two-pass contextual prefix generation for KB chunks.
 *
 * Pass A: "Legal decoder" — paraphrase chunk in plain language for retail employee.
 * Pass B: Structured JSON prefix — scope, search terms, semantic summary.
 * + Deterministic synonym layer from kb_synonym_dict.
 *
 * Output stored in kb_chunks: contextual_prefix (full text for embedding),
 * scope (column), search_terms (column), semantic_summary (column).
 */
import { generateAIText } from '@/lib/shared/ai/client';
import { config } from '@/lib/shared/config';
import logger from '@/lib/shared/logger';
import { findSynonymsForText } from './synonym-lookup';

// ── Prompts ──────────────────────────────────────────────────────────────────

const DECODE_PROMPT =
  'Ти — помічник для працівників найбільшої роздрібної мережі України (АТБ-Маркет, ~1000 магазинів).\n' +
  'Перекажи цей юридичний фрагмент ПРОСТОЮ МОВОЮ, як би ти пояснив касиру, продавцю або менеджеру магазину.\n' +
  '- Заміни всі юридичні формалізми на повсякденні слова\n' +
  '- "які не підлягають призову" → "заброньовані"\n' +
  '- "припинення трудових відносин" → "звільнення"\n' +
  '- "знімні носії інформації" → "флешки"\n' +
  '- Збережи ВСІ конкретні цифри, строки, назви органів\n' +
  '- 2-4 речення, максимум 80 слів\n' +
  'Відповідай ТІЛЬКИ перефразом, без вступу.';

const PREFIX_PROMPT =
  'Generate a structured search index for a knowledge base chunk. Output ONLY valid JSON.\n\n' +
  'You receive: original legal text + plain-language paraphrase.\n\n' +
  'AUDIENCE: retail chain employees (cashiers to executives), searching in Ukrainian/surzhyk.\n\n' +
  'JSON schema (every field mandatory):\n' +
  '{\n' +
  '  "scope": "general" | "specific: <narrow group>",\n' +
  '  "semantic_summary": "1-2 natural sentences in Ukrainian — what this chunk is about, using PLAIN language",\n' +
  '  "search_terms": ["8-12 colloquial Ukrainian search terms a retail employee would type"],\n' +
  '  "formal_terms": ["key legal formalisms found in the original text"],\n' +
  '  "type": "процедура | визначення | перелік | заборона | вимога | право | обовязок | строк | стандарт",\n' +
  '  "subject": "WHO this applies to — specific category"\n' +
  '}\n\n' +
  'SCOPE RULES:\n' +
  '- DEFAULT is "general". Use for: employees, companies, military-obligated, citizens, state bodies.\n' +
  '- "specific: <group>" ONLY for narrow professional groups: священнослужителі, моряки, авіаційний персонал, спортсмени, культурні діячі.\n' +
  '- When in doubt → "general".\n\n' +
  'SEARCH_TERMS RULES:\n' +
  '- Include BOTH formal and colloquial terms from original AND paraphrase.\n' +
  '- Add surzhyk/Russian variants where common.\n' +
  '- Add abbreviations (ТЦК, ВЛК, КМУ, ЄДРПОУ, etc).\n' +
  '- Every formal_term MUST have at least one colloquial equivalent in search_terms.\n\n' +
  'Return ONLY valid JSON, no markdown fences.';

// ── Config ───────────────────────────────────────────────────────────────────

const MAX_RETRIES = 4;
const CONCURRENCY = 12;
const RATE_LIMIT_PAUSE_MS = 10_000;
const MAX_TOC_CHARS = 1500;

// ── Types ────────────────────────────────────────────────────────────────────

export interface PrefixResult {
  /** Full text for embedding (semantic_summary + search terms + synonyms). */
  prefixText: string;
  /** Scope tag for DB column. */
  scope: string;
  /** Search terms array for DB column / BM25. */
  searchTerms: string[];
  /** Semantic summary for DB column. */
  semanticSummary: string;
}

// ── TOC builder ──────────────────────────────────────────────────────────────

export function buildTocSummary(chunks: Array<{ heading: string; content: string }>): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  let totalChars = 'Структура документа:\n'.length;
  for (const chunk of chunks) {
    const h = chunk.heading?.trim();
    if (!h || seen.has(h)) continue;
    seen.add(h);
    const shortH = h.length > 80 ? h.slice(0, 77) + '…' : h;
    const first = chunk.content.replace(/\r/g, '').split(/[.\n]/)[0]?.trim() || '';
    const sentence = first.length > 80 ? first.slice(0, 77) + '…' : first;
    const line = sentence ? `• ${shortH}\n  → ${sentence}` : `• ${shortH}`;
    if (totalChars + line.length + 1 > MAX_TOC_CHARS) break;
    lines.push(line);
    totalChars += line.length + 1;
  }
  return lines.length > 0 ? 'Структура документа:\n' + lines.join('\n') : '';
}

// ── AI calls with retry ──────────────────────────────────────────────────────

async function callHaiku(system: string, user: string, maxTokens: number): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const text = await generateAIText({
        messages: [{ role: 'user', content: user }],
        systemPrompt: system,
        providerOverride: 'anthropic',
        anthropicModel: 'claude-haiku-4-5-20251001',
        apiKeyOverride: config.anthropic.apiKey!,
        maxTokens,
        temperature: 0,
        timeoutMs: 30_000,
      });
      return text.trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.includes('rate limit') || msg.includes('429');
      if (attempt < MAX_RETRIES) {
        const delay = isRateLimit ? RATE_LIMIT_PAUSE_MS * (attempt + 1) : Math.pow(2, attempt + 1) * 2_000;
        if (isRateLimit) logger.warn(`[kb/context] rate limited, retry ${attempt + 1}/${MAX_RETRIES}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      logger.error('[kb/context] AI call failed after retries:', msg);
      return '';
    }
  }
  return '';
}

// ── Two-pass prefix generation ───────────────────────────────────────────────

/**
 * Generate prefix for a single chunk using two-pass approach.
 * Pass A: decode legal → plain language.
 * Pass B: structured JSON from original + paraphrase.
 * + Deterministic synonyms from kb_synonym_dict.
 */
export async function generateChunkPrefix(
  documentTitle: string,
  tocSummary: string,
  heading: string,
  chunkContent: string,
): Promise<PrefixResult> {
  const fallback: PrefixResult = { prefixText: '', scope: 'general', searchTerms: [], semanticSummary: '' };

  // Pass A: decode to plain language
  const decodeUser =
    `Документ: «${documentTitle}»\n` +
    `Розділ: ${heading || '(без заголовку)'}\n\n` +
    `Фрагмент:\n${chunkContent}`;

  const paraphrase = await callHaiku(DECODE_PROMPT, decodeUser, 200);
  if (!paraphrase) return fallback;

  // Pass B: structured JSON prefix
  const prefixUser =
    `Документ: «${documentTitle}»\n` +
    (tocSummary ? `Структура:\n${tocSummary}\n\n` : '') +
    `Оригінальний текст:\n${chunkContent.slice(0, 1500)}\n\n` +
    `Простою мовою:\n${paraphrase}`;

  const jsonRaw = await callHaiku(PREFIX_PROMPT, prefixUser, 400);
  if (!jsonRaw) return { ...fallback, semanticSummary: paraphrase, prefixText: paraphrase };

  // Parse JSON
  let parsed: Record<string, unknown>;
  try {
    const clean = jsonRaw.replace(/```json\n?|\n?```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    logger.warn('[kb/context] JSON parse failed, using paraphrase only');
    return { ...fallback, semanticSummary: paraphrase, prefixText: paraphrase };
  }

  const scope = typeof parsed.scope === 'string' ? parsed.scope : 'general';
  const semanticSummary = typeof parsed.semantic_summary === 'string' ? parsed.semantic_summary : paraphrase;
  const searchTerms = Array.isArray(parsed.search_terms) ? parsed.search_terms.filter((t): t is string => typeof t === 'string') : [];
  const subject = typeof parsed.subject === 'string' ? parsed.subject : '';

  // Deterministic synonyms from DB dictionary
  const dictSynonyms = await findSynonymsForText(chunkContent + ' ' + paraphrase);

  // Merge all search terms (AI + dictionary)
  const allTerms = [...new Set([...searchTerms, ...dictSynonyms])];

  // Build full prefix text for embedding
  const prefixLines = [
    `[Scope: ${scope}]`,
    semanticSummary,
    allTerms.length > 0 ? `[Пошук: ${allTerms.join(', ')}]` : '',
    subject ? `[Стосується: ${subject}]` : '',
  ].filter(Boolean);

  return {
    prefixText: prefixLines.join('\n'),
    scope: scope.startsWith('specific') ? scope : 'general',
    searchTerms: allTerms,
    semanticSummary,
  };
}

// ── Batch generation ─────────────────────────────────────────────────────────

/**
 * Generate prefixes for all chunks of a document.
 * Returns parallel arrays of PrefixResult.
 */
export async function generateContextualPrefixes(
  documentTitle: string,
  _fullDocumentText: string,
  chunks: Array<{ heading: string; content: string }>,
): Promise<PrefixResult[]> {
  const tocSummary = buildTocSummary(chunks);
  const results: PrefixResult[] = new Array(chunks.length);

  for (let batch = 0; batch < chunks.length; batch += CONCURRENCY) {
    const slice = chunks.slice(batch, batch + CONCURRENCY);
    const batchResults = await Promise.all(
      slice.map(chunk => generateChunkPrefix(documentTitle, tocSummary, chunk.heading, chunk.content)),
    );
    for (let j = 0; j < batchResults.length; j++) {
      results[batch + j] = batchResults[j];
    }
    if (batch + CONCURRENCY < chunks.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const ok = results.filter(r => r.prefixText).length;
  logger.prod('[kb/context] generated', ok, '/', chunks.length, 'prefixes for', documentTitle);
  return results;
}

// ── Legacy compat — returns string[] for old callers ─────────────────────────

/**
 * @deprecated Use generateContextualPrefixes() which returns PrefixResult[].
 * This wrapper returns just the prefix text strings for backward compatibility.
 */
export async function generateContextualPrefixesLegacy(
  documentTitle: string,
  fullDocumentText: string,
  chunks: Array<{ heading: string; content: string }>,
): Promise<string[]> {
  const results = await generateContextualPrefixes(documentTitle, fullDocumentText, chunks);
  return results.map(r => r.prefixText);
}
