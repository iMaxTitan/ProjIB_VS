/**
 * KB query translation and category helpers.
 * Extracted from search.ts to keep orchestration logic separate.
 */

import { config } from '@/lib/shared/config';

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

export interface MultiQueryResult {
  /** 2-3 Ukrainian search queries from different angles. */
  queries: string[];
  /** First query = direct translation (used for synthesis context). */
  primaryQuery: string;
  /** Detected domain for category pre-filtering. */
  domain: KBDomain;
  /** Short clarification question when domain is ambiguous. */
  clarification?: string;
  /** Cost tracking for the multi-query LLM call. */
  mqCost?: { model: string; promptTokens: number; completionTokens: number; cost: number };
}

const MULTI_QUERY_PROMPT =
  'Ти — пошуковий помічник корпоративної бази знань. Твоя задача — перетворити запит користувача на 2-3 оптимальних пошукових запити українською мовою.\n\n' +
  'СТРАТЕГІЯ ГЕНЕРАЦІЇ ЗАПИТІВ:\n' +
  '1. ПРЯМИЙ — переклад на українську, зберігай конкретні назви (ПЗ, сервіси, номери документів)\n' +
  '2. НОРМАТИВНИЙ — переформулюй терміном, який вживається в документах бази знань\n' +
  '   (флешка → знімні носії, модем → периферійне обладнання, звільнення → припинення трудових відносин)\n' +
  '3. КОНТЕКСТНИЙ — ширша тема для захоплення контексту\n' +
  '   (встановити Photoshop → порядок встановлення ПЗ на робочу станцію)\n' +
  'Кожен запит має бути самодостатнім — зрозумілим без оригіналу.\n\n' +
  'ДОМЕН — визнач категорію запиту:\n' +
  '• "ib" — інформаційна безпека, паролі, ПЗ, обладнання, мережа, антивірус, захист інформації\n' +
  '• "hr" — кадри, відпустка, звільнення, прийом на роботу, кадровий резерв, трудові відносини\n' +
  '• "it" — ІТ-інфраструктура, сервери, налаштування, адміністрування\n' +
  '• "legal" — закони, постанови КМУ, мобілізація, бронювання, військовий облік, юридичні норми, права споживачів\n' +
  '• "general" — не вдається визначити або запит широкий\n' +
  '• "ambiguous" — запит ЯВНО неоднозначний (слово має РІЗНІ значення в різних категоріях).\n' +
  '  Для ambiguous додай поле "clarification" — коротке уточнююче питання (1 речення, 2-3 варіанти).\n\n' +
  'Приклади:\n' +
  '• «установить Teams» → {"domain":"ib","queries":["встановити Microsoft Teams на робочу станцію","порядок встановлення програмного забезпечення","базовий набір ПЗ робочого місця"]}\n' +
  '• «як звільнитися» → {"domain":"hr","queries":["процедура звільнення за власним бажанням","припинення трудових відносин порядок дій"]}\n' +
  '• «бронювання співробітників» → {"domain":"legal","queries":["бронювання військовозобов\'язаних на період мобілізації","порядок бронювання працівників підприємства КМУ 76","відстрочка від призову на військову службу"]}\n' +
  '• «гарантія на товар» → {"domain":"legal","queries":["гарантійний ремонт або заміна товару","гарантійні зобов\'язання продавця Закон 1023","права споживачів на повернення"]}\n' +
  '• «чи можна флешку» → {"domain":"ib","queries":["використання USB-накопичувача на робочому місці","знімні носії інформації правила та обмеження"]}\n' +
  '• «резерв» → {"domain":"ambiguous","queries":[],"clarification":"Ви маєте на увазі кадровий резерв чи резервістів (військовий облік)?"}\n\n' +
  'Поверни JSON: {"domain":"...","queries":["...","..."]} або {"domain":"ambiguous","queries":[],"clarification":"..."}. Без пояснень.';

const VALID_DOMAINS: KBDomain[] = ['ib', 'hr', 'it', 'legal', 'general', 'ambiguous'];

/**
 * Generate 2-3 search queries from different angles + detect domain.
 * Falls back to single translateAndExpand() on error.
 */
export async function generateMultiQueries(text: string): Promise<MultiQueryResult> {
  const apiKey = config.openai.apiKey;
  if (!apiKey) return { queries: [text], primaryQuery: text, domain: 'general' };
  try {
    const synonymHint = buildSynonymHint(text);
    const systemContent = MULTI_QUERY_PROMPT + synonymHint;

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 6_000);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: text },
        ],
        max_tokens: 300,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return fallbackSingle(text);
    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return fallbackSingle(text);

    // Track cost: GPT-4o-mini $0.15/1M input, $0.60/1M output
    const pTok = data.usage?.prompt_tokens || 0;
    const cTok = data.usage?.completion_tokens || 0;
    const mqCost = { model: 'gpt-4o-mini', promptTokens: pTok, completionTokens: cTok,
      cost: (pTok * 0.15 + cTok * 0.60) / 1_000_000 };

    const parsed = JSON.parse(content) as { queries?: string[]; domain?: string; clarification?: string };
    const domain: KBDomain = VALID_DOMAINS.includes(parsed.domain as KBDomain)
      ? (parsed.domain as KBDomain)
      : 'general';

    // Ambiguous — return clarification question, no queries needed
    if (domain === 'ambiguous' && parsed.clarification) {
      return { queries: [], primaryQuery: text, domain, clarification: parsed.clarification, mqCost };
    }

    const queries = Array.isArray(parsed) ? parsed as string[] : parsed.queries;
    if (!Array.isArray(queries) || !queries.length || queries.some(q => typeof q !== 'string')) {
      return fallbackSingle(text);
    }

    const trimmed = queries.slice(0, 3).map(q => q.trim()).filter(Boolean);
    return { queries: trimmed, primaryQuery: trimmed[0], domain, mqCost };
  } catch {
    return fallbackSingle(text);
  }
}

async function fallbackSingle(text: string): Promise<MultiQueryResult> {
  const single = await translateAndExpand(text);
  return { queries: [single], primaryQuery: single, domain: 'general' };
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
