/**
 * KB query translation and category helpers.
 * Extracted from search.ts to keep orchestration logic separate.
 */

import { config } from '@/lib/shared/config';
import { cleanJsonResponse } from './shared/json';

// ── Shared chunk type ──────────────────────────────────────────────────────────

/** Internal DB row shape returned by match_kb_documents RPC. */
export interface KBChunk {
  chunk_id: string;
  document_id: string;
  document_title: string;
  category_name: string;
  content: string;
  heading: string | null;
  similarity: number;
  chunk_index?: number | null;
  contextual_prefix?: string | null;
  [key: string]: unknown;
}

// ── Domain synonyms — ambiguous terms with domain-specific expansions ────────

export type KBDomain = 'ib' | 'hr' | 'it' | 'legal' | 'general' | 'ambiguous';

const DOMAIN_SYNONYMS: Record<string, Partial<Record<KBDomain, string>>> = {
  'резерв': {
    hr: 'кадровий резерв, перспективні кадри',
    legal: 'резервісти, військовий облік',
  },
  'облік': {
    legal: 'військовий облік призовників та військовозобов\'язаних',
    hr: 'кадровий облік, табель',
  },
  'мобілізація': {
    legal: 'мобілізаційна підготовка, призов, відстрочка від мобілізації',
  },
  'мобилизация': {
    legal: 'мобілізаційна підготовка, призов, відстрочка від мобілізації',
  },
  'заброньован': {
    legal: 'військовозобов\'язані які не підлягають призову на військову службу під час мобілізації, відстрочка від призову, бронювання',
  },
  'забронирован': {
    legal: 'військовозобов\'язані які не підлягають призову на військову службу під час мобілізації, відстрочка від призову, бронювання',
  },
  'бронюванн': {
    legal: 'військовозобов\'язані які не підлягають призову, відстрочка від мобілізації, бронювання працівників',
  },
  'бронирован': {
    legal: 'військовозобов\'язані які не підлягають призову, відстрочка від мобілізації, бронювання працівників',
  },
};

/** Build synonym hint block for the LLM prompt (only for terms found in query). */
function buildSynonymHint(query: string): string {
  const lower = query.toLowerCase();
  const hints: string[] = [];
  for (const [term, domains] of Object.entries(DOMAIN_SYNONYMS)) {
    if (!lower.includes(term)) continue;
    const parts = Object.entries(domains)
      .map(([d, expansion]) => `${d}: ${expansion}`)
      .join('; ');
    hints.push(`«${term}» → ${parts}`);
  }
  return hints.length
    ? '\n\nОМОНІМИ (обери правильний домен за контекстом):\n' + hints.join('\n')
    : '';
}

// ── Multi-query generation ────────────────────────────────────────────────────

export type QuerySpecificity = 'high' | 'medium' | 'low';

export interface MultiQueryResult {
  /** 2-3 Ukrainian search queries from different angles. */
  queries: string[];
  /** First query = direct translation (used for synthesis context). */
  primaryQuery: string;
  /** Detected domain for category pre-filtering. */
  domain: KBDomain;
  /** Query specificity — low means too broad/vague. */
  specificity: QuerySpecificity;
  /** Short clarification question when domain is ambiguous or query is too vague. */
  clarification?: string;
  /** Cost tracking for the multi-query LLM call. */
  mqCost?: { model: string; promptTokens: number; completionTokens: number; cost: number };
}

const MULTI_QUERY_PROMPT =
  'You are a search query generator for a Ukrainian corporate knowledge base.\n' +
  'COMPANY: АТБ-Маркет — найбільша національна роздрібна мережа України (~1000 магазинів).\n' +
  'USERS: співробітники всіх рівнів — від касирів, продавців, комірників до логістів, маркетологів, бухгалтерів, IT-спеціалістів, керівників відділів та топ-менеджменту.\n' +
  'CONTEXT: В Україні діє воєнний стан з 24.02.2022. Більшість юридичних запитів стосуються мобілізації, військового обліку, бронювання працівників, виїзду за кордон. Коли запит може стосуватись і мирних, і воєнних норм — пріоритизуй воєнні.\n\n' +
  'Transform the user query into 2-3 optimal search queries in UKRAINIAN.\n\n' +
  'STRATEGY:\n' +
  '1. DIRECT — translate to Ukrainian, preserve specific names (software, services, document numbers)\n' +
  '2. NORMATIVE — rephrase using formal document terminology\n' +
  '   (флешка → знімні носії, звільнення → припинення трудових відносин, заброньований → військовозобов\'язаний який не підлягає призову)\n' +
  '3. CONTEXTUAL — reframe from the perspective of an employee or employer of a large retail company.\n' +
  '   Think: "what would our HR department or line manager need to know about this?"\n\n' +
  'CRITICAL: If the query mentions a specific SUBJECT (заброньований, моряк, водій), EVERY sub-query MUST include that subject. Do NOT generalize "заброньований" to just "військовозобов\'язаний".\n\n' +
  'DOMAIN — classify the query:\n' +
  '• "ib" — information security, passwords, software, hardware, network, antivirus\n' +
  '• "hr" — HR, leave, dismissal, hiring, labor relations\n' +
  '• "it" — IT infrastructure, servers, configuration\n' +
  '• "legal" — laws, КМУ resolutions, mobilization, reserving (бронювання), military accounting, consumer rights\n' +
  '• "general" — cannot determine or broad query\n' +
  '• "ambiguous" — word has DIFFERENT meanings across categories. Add "clarification" field.\n\n' +
  'SPECIFICITY:\n' +
  '• "high" — specific question with details\n' +
  '• "medium" — clear topic but no specifics\n' +
  '• "low" — too broad (1-2 generic words). Add "clarification" with 2-4 options.\n\n' +
  'Examples:\n' +
  '• «установить Teams» → {"domain":"ib","queries":["встановити Microsoft Teams на робочу станцію","порядок встановлення програмного забезпечення","базовий набір ПЗ робочого місця"],"specificity":"high"}\n' +
  '• «заброньований виїзд за кордон» → {"domain":"legal","queries":["право заброньованого на перетинання державного кордону","заброньований військовозобов\'язаний виїзд за кордон документи","заброньована особа перетин кордону під час воєнного стану"],"specificity":"high"}\n' +
  '• «резерв» → {"domain":"ambiguous","queries":[],"specificity":"low","clarification":"Ви маєте на увазі кадровий резерв чи резервістів (військовий облік)?"}\n\n' +
  'Return ONLY JSON: {"domain":"...","queries":[...],"specificity":"..."}. No explanations.';

const VALID_DOMAINS: KBDomain[] = ['ib', 'hr', 'it', 'legal', 'general', 'ambiguous'];

/**
 * Generate 2-3 search queries from different angles + detect domain.
 * Falls back to single translateAndExpand() on error.
 */
export async function generateMultiQueries(text: string): Promise<MultiQueryResult> {
  const apiKey = config.anthropic.apiKey;
  if (!apiKey) return { queries: [text], primaryQuery: text, domain: 'general', specificity: 'medium' };
  try {
    const synonymHint = buildSynonymHint(text);
    const systemContent = MULTI_QUERY_PROMPT + synonymHint;

    const { generateAITextWithUsage } = await import('@/lib/shared/ai/client');
    const res = await generateAITextWithUsage({
      messages: [{ role: 'user', content: text }],
      systemPrompt: systemContent + '\n\nReturn ONLY valid JSON, no markdown fences.',
      providerOverride: 'anthropic',
      anthropicModel: 'claude-haiku-4-5-20251001',
      apiKeyOverride: apiKey,
      maxTokens: 300,
      temperature: 0,
      timeoutMs: 6_000,
    });
    const content = res.text?.trim();
    if (!content) return fallbackSingle(text);

    // Track cost: Haiku 4.5 $1.00/1M input, $5.00/1M output
    const pTok = res.usage?.prompt_tokens || 0;
    const cTok = res.usage?.completion_tokens || 0;
    const mqCost = { model: 'claude-haiku-4.5', promptTokens: pTok, completionTokens: cTok,
      cost: (pTok * 1.00 + cTok * 5.00) / 1_000_000 };

    const parsed = JSON.parse(cleanJsonResponse(content)) as { queries?: string[]; domain?: string; clarification?: string; specificity?: string };
    const domain: KBDomain = VALID_DOMAINS.includes(parsed.domain as KBDomain)
      ? (parsed.domain as KBDomain)
      : 'general';
    const specificity: QuerySpecificity =
      parsed.specificity === 'high' ? 'high' :
      parsed.specificity === 'low' ? 'low' : 'medium';

    // Ambiguous or too vague — return clarification question
    if ((domain === 'ambiguous' || specificity === 'low') && parsed.clarification) {
      return { queries: [], primaryQuery: text, domain, specificity, clarification: parsed.clarification, mqCost };
    }

    const queries = Array.isArray(parsed) ? parsed as string[] : parsed.queries;
    if (!Array.isArray(queries) || !queries.length || queries.some(q => typeof q !== 'string')) {
      return fallbackSingle(text);
    }

    const trimmed = queries.slice(0, 3).map(q => q.trim()).filter(Boolean);
    return { queries: trimmed, primaryQuery: trimmed[0], domain, specificity, mqCost };
  } catch {
    return fallbackSingle(text);
  }
}

async function fallbackSingle(text: string): Promise<MultiQueryResult> {
  const single = await translateAndExpand(text);
  return { queries: [single], primaryQuery: single, domain: 'general', specificity: 'medium' };
}

// ── Legacy single-query translation (fallback) ───────────────────────────────

/** Translate to Ukrainian + expand brand names → generic terms for better recall. */
export async function translateAndExpand(text: string): Promise<string> {
  const apiKey = config.openai.apiKey;
  if (!apiKey) return text;
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5_000);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Переформулюй запит для пошуку в корпоративній базі знань.\n' +
              'Мова: українська. Переклади якщо потрібно.\n' +
              'ГОЛОВНЕ: заміни конкретні назви на ЗАГАЛЬНІ терміни, конкретику залиш у дужках.\n' +
              'Приклади:\n' +
              '• «встановити Photoshop» → «встановлення програмного забезпечення (ПЗ) на робочу станцію»\n' +
              '• «підключити VPN» → «налаштування віртуальної приватної мережі (VPN)»\n' +
              '• «звільнитися» → «припинення трудових відносин (звільнення)»\n' +
              '• «пароль WiFi» → «доступ до бездротової мережі (WiFi, пароль)»\n' +
              'Якщо запит вже загальний — поверни як є.\n' +
              'Поверни ТІЛЬКИ результат.',
          },
          { role: 'user', content: text },
        ],
        max_tokens: 200,
        temperature: 0,
      }),
    });
    if (!res.ok) return text;
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || text;
  } catch {
    return text;
  }
}

// ── Category helpers ───────────────────────────────────────────────────────────

export function fuzzyMatchSlug(input: string, categories: Array<{ slug: string; name: string }>): string | null {
  const n = input.toLowerCase().trim();
  const exact = categories.find(c => c.slug === n);
  if (exact) return exact.slug;
  const partial = categories.find(c =>
    c.slug.includes(n) || n.includes(c.slug) ||
    c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase().slice(0, 3))
  );
  return partial?.slug ?? null;
}

const CATEGORY_NAME_TO_SLUG: Record<string, string> = {
  'інформаційна безпека': 'ib',
  'hr': 'hr',
  'it': 'it',
  'юридичний': 'legal',
};

function extractSlugFromName(categoryName: string): string {
  const n = categoryName.toLowerCase().trim();
  if (CATEGORY_NAME_TO_SLUG[n]) return CATEGORY_NAME_TO_SLUG[n];
  for (const [key, slug] of Object.entries(CATEGORY_NAME_TO_SLUG)) {
    if (n.includes(key) || key.includes(n)) return slug;
  }
  return '';
}

export function dominantCategorySlug(chunks: KBChunk[]): string {
  const scores: Record<string, number> = {};
  for (const c of chunks) {
    const slug = extractSlugFromName(c.category_name);
    if (slug) scores[slug] = (scores[slug] || 0) + c.similarity;
  }
  return Object.entries(scores).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '';
}
