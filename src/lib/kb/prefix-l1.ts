/**
 * L1 prefix generation — cheap model via OpenRouter.
 * Default: google/gemini-2.0-flash-lite (cheapest with good Ukrainian quality).
 * Generates JSON prefix with scope, search_terms, synonyms, semantic_summary.
 * Supports error-guided retry (1 max).
 */
import { config } from '@/lib/shared/config';
import { fetchWithTimeout } from '@/lib/shared/utils/fetch-with-timeout';
import logger from '@/lib/shared/logger';
import type { PrefixJson } from './prefix-validator';
import { cleanJsonResponse } from './shared/json';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const L1_MODEL = 'google/gemini-3.1-flash-lite-preview';
const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT =
  'You are a search index generator for a Ukrainian retail company knowledge base.\n' +
  'Generate a JSON search index entry for a document chunk.\n' +
  'AUDIENCE: retail employees (cashiers, managers, HR, IT, executives) searching in Ukrainian or surzhyk.\n\n' +
  'Return ONLY valid JSON with this schema:\n' +
  '{\n' +
  '  "scope": "general" | "specific: <narrow professional group>",\n' +
  '  "scope_confidence": 0.0-1.0,\n' +
  '  "formal_terms": ["key legal/formal phrases from the text"],\n' +
  '  "colloquial_synonyms": ["everyday equivalents for each formal term"],\n' +
  '  "surzhyk": ["Ukrainian-Russian mixed variants users might type"],\n' +
  '  "abbr": ["abbreviations: ТЦК, ВЛК, КМУ, ЄДРПОУ, etc."],\n' +
  '  "semantic_summary": "1-2 sentences in simple Ukrainian — what this chunk says, as if explaining to a store employee",\n' +
  '  "search_terms": ["8-12 terms a retail employee would type to find this"],\n' +
  '  "subject": "WHO this applies to",\n' +
  '  "hypothetical_questions": ["2-4 short questions this chunk answers"]\n' +
  '}\n\n' +
  'HYPOTHETICAL_QUESTIONS:\n' +
  '- 2-4 короткі питання, які працівник АТБ міг би ввести в пошук, щоб знайти цей фрагмент.\n' +
  '- Простою природною українською, як запит працівника магазину, а не юриста.\n' +
  '- Одне питання = один намір. Коротко.\n' +
  '- НЕ вигадуй те, чого немає у фрагменті.\n' +
  '- НЕ став загальні питання типу "Що це означає?".\n' +
  '- НЕ роби майже однакові питання.\n' +
  '- Дозволені кути вказані нижче у user message (domain-specific).\n\n' +
  'SCOPE: "general" for most norms. "specific: <group>" ONLY for narrow professional groups ' +
  '(священнослужителі, моряки, авіаційний персонал, спортсмени, культурні діячі).\n\n' +
  'CRITICAL: Every formal_term MUST have ≥1 colloquial equivalent.\n' +
  '"які не підлягають призову" → "заброньовані"\n' +
  '"припинення трудових відносин" → "звільнення"\n' +
  '"знімні носії інформації" → "флешка"\n\n' +
  'Return ONLY valid JSON, no markdown, no explanation.';

/**
 * Call L1 model via OpenRouter to generate prefix JSON.
 */
import { HYDE_ANGLES } from './shared/hyde-angles';

export async function generateL1Prefix(
  chunkText: string,
  heading: string,
  docTitle: string,
  dictSynonyms: string[],
  retryHint?: string,
  domain?: string,
): Promise<{ json: PrefixJson | null; raw: string }> {
  const apiKey = config.openrouter.apiKey;
  if (!apiKey) {
    logger.warn('[kb/prefix-l1] OPENROUTER_API_KEY not set');
    return { json: null, raw: '' };
  }

  const angles = HYDE_ANGLES[domain || ''] || HYDE_ANGLES.legal;
  let userMsg = `Документ: «${docTitle}»\nРозділ: ${heading || '(без заголовку)'}\n\nТекст:\n${chunkText.slice(0, 1500)}\n\nDomain: ${domain || 'general'}\nДозволені кути для hypothetical_questions:\n${angles}`;

  if (dictSynonyms.length > 0) {
    userMsg += `\n\nВідомі синоніми з словника (обов'язково включити): ${dictSynonyms.join(', ')}`;
  }

  if (retryHint) {
    userMsg += `\n\nПОПЕРЕДНЯ СПРОБА БУЛА НЕКОРЕКТНОЮ: ${retryHint}\nВиправ помилки у новій відповіді.`;
  }

  try {
    const response = await fetchWithTimeout(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: L1_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        temperature: 0,
        max_tokens: 700,
        response_format: { type: 'json_object' },
      }),
    }, TIMEOUT_MS);

    if (!response.ok) {
      const err = await response.text();
      logger.error(`[kb/prefix-l1] OpenRouter ${response.status}:`, err.slice(0, 200));
      return { json: null, raw: '' };
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || '';
    if (!raw) return { json: null, raw: '' };

    const clean = cleanJsonResponse(raw);
    const parsed = JSON.parse(clean) as PrefixJson;
    return { json: parsed, raw };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('rate limit') || msg.includes('429')) {
      logger.warn('[kb/prefix-l1] rate limited');
    } else {
      logger.error('[kb/prefix-l1] error:', msg);
    }
    return { json: null, raw: '' };
  }
}
