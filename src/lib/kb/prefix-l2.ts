/**
 * L2 prefix generation — Claude Haiku 4.5 (expensive, high quality).
 * Called only when L1 fails validation. Adaptive quota cap per domain.
 */
import { generateAIText } from '@/lib/shared/ai/client';
import { config } from '@/lib/shared/config';
import logger from '@/lib/shared/logger';
import type { PrefixJson } from './prefix-validator';

// Same JSON schema prompt but more detailed instructions for Haiku
const SYSTEM_PROMPT =
  'You are an expert search index generator for a Ukrainian retail company knowledge base.\n' +
  'The cheaper model failed to generate a correct index. Your job is to fix it.\n\n' +
  'AUDIENCE: retail employees (cashiers to executives) searching in Ukrainian/surzhyk.\n\n' +
  'Return ONLY valid JSON:\n' +
  '{\n' +
  '  "scope": "general" | "specific: <narrow group>",\n' +
  '  "scope_confidence": 0.0-1.0,\n' +
  '  "formal_terms": ["ALL legal formalisms in the text"],\n' +
  '  "colloquial_synonyms": ["≥2 everyday equivalents for EACH formal term"],\n' +
  '  "surzhyk": ["Ukrainian-Russian mixed variants"],\n' +
  '  "abbr": ["all abbreviations"],\n' +
  '  "semantic_summary": "1-2 sentences explaining this to a store employee",\n' +
  '  "search_terms": ["8-12 terms a retail employee would type"],\n' +
  '  "subject": "specific WHO this applies to"\n' +
  '}\n\n' +
  'RULES:\n' +
  '1. "scope: general" = default. "specific: X" ONLY for narrow professional groups.\n' +
  '2. EVERY formal term MUST have ≥2 colloquial synonyms.\n' +
  '3. "які не підлягають призову" = "заброньовані, забронювати, бронювання, бронь"\n' +
  '4. "припинення трудових відносин" = "звільнення, звільнитися, увольнение"\n' +
  '5. "знімні носії інформації" = "флешка, USB, карта памяті"\n' +
  '6. Include surzhyk/Russian variants where employees commonly use them.\n\n' +
  'Return ONLY valid JSON.';

/** L2 quota tracker per batch. */
const _quotaUsed = new Map<string, number>();
const _quotaTotal = new Map<string, number>();

let _quotaCaps: Record<string, number> | null = null;

async function loadQuotaCaps(): Promise<Record<string, number>> {
  if (_quotaCaps) return _quotaCaps;
  const { getServerDb } = await import('@/lib/shared/db-server');
  const db = getServerDb();
  const { data } = await db.from('kb_pipeline_config').select('value').eq('key', 'l2_quota_caps').single();
  _quotaCaps = (data?.value as Record<string, number>) || { legal: 0.30, hr: 0.15, it: 0.15, ib: 0.15, general: 0.20 };
  return _quotaCaps;
}

/** Initialize quota for a batch. Call once per document. */
export function initBatchQuota(domain: string, totalChunks: number): void {
  _quotaUsed.set(domain, 0);
  _quotaTotal.set(domain, totalChunks);
}

/** Check if L2 quota allows another call. */
export async function canEscalateL2(domain: string): Promise<boolean> {
  const caps = await loadQuotaCaps();
  const cap = caps[domain] ?? caps.general ?? 0.20;
  const used = _quotaUsed.get(domain) || 0;
  const total = _quotaTotal.get(domain) || 1;
  return used / total < cap;
}

/** Generate prefix using Haiku L2. */
export async function generateL2Prefix(
  chunkText: string,
  heading: string,
  docTitle: string,
  dictSynonyms: string[],
  validationErrors: string[],
  domain: string,
): Promise<{ json: PrefixJson | null; raw: string }> {
  // Check quota
  if (!(await canEscalateL2(domain))) {
    logger.prod('[kb/prefix-l2] quota exceeded for domain:', domain);
    return { json: null, raw: '' };
  }

  const apiKey = config.anthropic.apiKey;
  if (!apiKey) return { json: null, raw: '' };

  let userMsg = `Документ: «${docTitle}»\nРозділ: ${heading || '(без заголовку)'}\n\nТекст:\n${chunkText.slice(0, 1500)}`;

  if (dictSynonyms.length > 0) {
    userMsg += `\n\nОбов'язкові синоніми зі словника: ${dictSynonyms.join(', ')}`;
  }

  if (validationErrors.length > 0) {
    userMsg += `\n\nL1 модель допустила помилки: ${validationErrors.join('; ')}. Виправ їх.`;
  }

  try {
    const text = await generateAIText({
      messages: [{ role: 'user', content: userMsg }],
      systemPrompt: SYSTEM_PROMPT,
      providerOverride: 'anthropic',
      anthropicModel: 'claude-haiku-4-5-20251001',
      apiKeyOverride: apiKey,
      maxTokens: 800,
      temperature: 0,
      timeoutMs: 30_000,
    });

    // Track quota
    _quotaUsed.set(domain, (_quotaUsed.get(domain) || 0) + 1);

    const raw = text.trim();
    const clean = raw.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(clean) as PrefixJson;
    return { json: parsed, raw };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[kb/prefix-l2] error:', msg);
    _quotaUsed.set(domain, (_quotaUsed.get(domain) || 0) + 1);
    return { json: null, raw: '' };
  }
}

/** Reset quota caches. */
export function invalidateL2Cache(): void {
  _quotaCaps = null;
  _quotaUsed.clear();
  _quotaTotal.clear();
}
