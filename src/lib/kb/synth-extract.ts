/**
 * KB synthesis — Stage 1: Extract facts from chunks.
 * L1: Gemini Flash-Lite (cheap, structured JSON).
 * L2: Claude Haiku 4.5 (reliable fallback).
 */

import { generateAITextWithUsage } from '@/lib/shared/ai/client';
import { config } from '@/lib/shared/config';
import logger from '@/lib/shared/logger';
import type { KBChunk } from './query-translator';
import { cleanJsonResponse } from './shared/json';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ExtractedFact {
  text: string;
  fragment: number;    // 1-based fragment index
  ref?: string;        // e.g. "п. 3", "ст. 25"
  norm_type?: 'general' | 'exception' | 'procedure';
  audience?: string;   // "all" | "retail_employee" | "state_officer" | "military" | etc.
}

export interface ExtractionResult {
  level: 'direct' | 'partial' | 'adjacent' | 'none';
  facts: ExtractedFact[];
  missing?: string;    // what info is absent (for partial)
}

// ── Prompt ─────────────────────────────────────────────────────────────────────

const EXTRACT_PROMPT =
  'You are a fact extraction engine for the corporate knowledge base of АТБ-Маркет — найбільша національна роздрібна мережа України.\n' +
  'Users are company employees at all levels: store staff (cashiers, managers, warehouse), logistics, marketing, accounting, IT, HR, regional and top management.\n' +
  'CONTEXT: Ukraine is under martial law (воєнний стан) since 24.02.2022. When both peacetime and wartime norms exist — extract wartime norms first, then note peacetime if relevant.\n\n' +
  'INPUT: user query + numbered document fragments.\n' +
  'OUTPUT: strictly valid JSON, no markdown fences, no commentary.\n\n' +
  'Schema:\n' +
  '{"level":"direct|partial|adjacent|none","facts":[{"text":"...","fragment":N,"ref":"п.3","norm_type":"general|exception|procedure","audience":"all|retail_employee|state_officer|military|diplomat|culture|maritime|sports"}],"missing":"..."}\n' +
  'norm_type: "general" = applies to everyone; "exception" = narrow subcategory rule; "procedure" = step-by-step instructions.\n' +
  'audience: WHO does this fact apply to? "all" = all employees/citizens; "retail_employee" = private company workers; "state_officer" = державні службовці; etc.\n\n' +
  'STEP 1 — UNDERSTAND THE QUERY:\n' +
  'Before extracting, identify:\n' +
  '- SUBJECT: who is the question about? (працівник як суб\'єкт даних? як обробник? військовозобов\'язаний? заброньований? підприємство?)\n' +
  '- ACTION: what specifically is asked? (право, обов\'язок, заборона, процедура, строк?)\n' +
  '- SITUATION: what specific scenario? (передача даних ТЦК, виїзд за кордон, встановлення ПЗ?)\n\n' +
  'STEP 2 — EXTRACT FACTS:\n' +
  '1. Extract facts that answer the SPECIFIC question for the SPECIFIC subject in the SPECIFIC situation.\n' +
  '2. DEDUCTION (apply ALL of these):\n' +
  '   - Category → item: rule for "ПЗ" applies to "Photoshop", rule for "знімні носії" applies to "флешка".\n' +
  '   - Base set comparison (IMPORTANT): if fragments contain a TABLE or LIST of approved/standard items and the user asks about a SPECIFIC item — ALWAYS extract: (a) what IS approved in that category from the table, (b) whether the asked item is in the approved list or not. This applies to any approved-vs-requested comparison (software, equipment, procedures, etc.).\n' +
  '   - Licensing: if a table marks a category as "потрібне придбання ліцензії" → apply to the queried product.\n' +
  '   - Legal YES/NO: if the query asks "чи може?/чи має право?/чи треба?" — the answer MUST start with a clear YES/NO fact, then supporting details.\n' +
  '   - General vs specific norms: legal texts often have a general rule followed by narrow exceptions for subcategories. Example: "заброньовані особи мають право на виїзд" = general rule; "одинокі матері серед заброньованих працівників ДЕРЖАВНИХ ОРГАНІВ" = narrow exception for a specific subcategory. RULE: extract the GENERAL norm. For exceptions/subcategories apply this test: "Does the query mention this specific subcategory?" If NO → SKIP the exception. Signals of a narrow exception: mention of a specific institution type (державні органи, військові частини, Мінкультури, Держкомтелерадіо), specific profession (моряки, спортсмени, працівники культури), or a family-status qualifier tied to a sector.\n' +
  '   - Wrong subcategory: if a fragment describes procedures for a specific profession/category NOT mentioned in the query — SKIP it. E.g. query about "заброньовані" in general → skip facts about "лист Мінкультури" or "лист Держкомтелерадіо".\n' +
  '   - AUDIENCE FILTER: the user is an employee of a PRIVATE retail company (АТБ-Маркет). Facts about subcategories that ONLY apply to державні органи, військові частини, дипломатична служба, заклади культури, моряки, спортсмени, or other specific sectors — are IRRELEVANT unless the query explicitly mentions that sector. SKIP such facts even if they appear in the same article/paragraph as the general rule. Example: "одинока мати серед заброньованих працівників державних органів з дитиною до 18 років" → SKIP (user works in private retail, not a state body).\n' +
  '3. Each fact = one clean sentence in Ukrainian. Put clause/article refs in "ref" field (e.g. "п.3.2", "ст.25"), NOT in "text".\n' +
  '4. One fact per logical statement. Do not merge unrelated statements.\n' +
  '5. "fragment" = 1-based index. "ref" = article/clause reference if present (optional).\n\n' +
  'STEP 3 — CLASSIFY LEVEL (be strict):\n' +
  '- "direct" = the fragments contain a norm that DIRECTLY answers the specific question for the specific subject.\n' +
  '- "partial" = key parts answered but some aspects missing (state what\'s missing in "missing").\n' +
  '- "adjacent" = fragments discuss the SAME TOPIC but do NOT answer the specific question. Examples:\n' +
  '    • Query about person\'s OWN data rights → fragments about processing OTHER people\'s data = adjacent.\n' +
  '    • Query about заброньовані specifically → fragments about загальний порядок for all ВЗ = adjacent.\n' +
  '    • Query about "чи треба X" → fragments describing procedure of X but not stating if it\'s required = adjacent.\n' +
  '- "none" = nothing relevant to the topic at all.\n' +
  '- "missing" = what specific information the fragments lack. Be precise: "Немає норми про обов\'язковість ВЛК саме для заброньованих осіб".\n\n' +
  'IMPORTANT: Do NOT guess or extrapolate when the specific norm is absent. If fragments say "ВЗ проходять ВЛК" but don\'t specify whether заброньовані MUST pass it — that\'s "adjacent", not "partial".\n\n' +
  'RELEVANCE SCORES: Each fragment has a relevance score (0-1). Fragments with score below 0.3 are weakly related — extract facts from them ONLY if they contain the general rule. NEVER extract narrow exceptions or subcategory-specific facts from low-score fragments.\n' +
  'For ALL fragments: when a single fragment contains BOTH a general rule AND a narrow exception — extract ONLY the general rule unless the query specifically asks about the exception\'s subcategory.';

// ── Helpers ────────────────────────────────────────────────────────────────────

export function buildFragmentsBlock(chunks: KBChunk[]): string {
  return chunks.slice(0, 6).map((c, i) => {
    const ctx = c.contextual_prefix ? `[Контекст: ${c.contextual_prefix}]\n` : '';
    const score = typeof c._rerank_score === 'number' ? ` (relevance: ${c._rerank_score.toFixed(2)})` : '';
    return `[Фрагмент ${i + 1}${score}] ${c.document_title}` +
      (c.heading ? ` > ${c.heading}` : '') +
      `\n${ctx}${c.content.slice(0, 2000)}`;
  }).join('\n\n---\n\n');
}

async function callGeminiExtract(systemPrompt: string, userMsg: string): Promise<{ text: string; ok: boolean }> {
  const apiKey = config.openrouter.apiKey;
  if (!apiKey) return { text: '', ok: false };
  try {
    const { fetchWithTimeout } = await import('@/lib/shared/utils/fetch-with-timeout');
    const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-lite-preview',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
        temperature: 0, max_tokens: 1500,
        response_format: { type: 'json_object' },
      }),
    }, 25_000);
    if (!res.ok) return { text: '', ok: false };
    const data = await res.json();
    return { text: data?.choices?.[0]?.message?.content || '', ok: true };
  } catch { return { text: '', ok: false }; }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function extractFacts(
  query: string, chunks: KBChunk[],
): Promise<{ result: ExtractionResult; usage: { p: number; c: number; cost: number } }> {
  const fragments = buildFragmentsBlock(chunks);
  const userMsg = `<fragments>\n${fragments}\n</fragments>\n\n<query>${query}</query>`;

  // Try L1: Gemini Flash-Lite (cheap, fast)
  const gemini = await callGeminiExtract(EXTRACT_PROMPT, userMsg);
  if (gemini.ok && gemini.text) {
    try {
      const json = cleanJsonResponse(gemini.text);
      const parsed = JSON.parse(json) as ExtractionResult;
      if (!parsed.facts) parsed.facts = [];
      if (!parsed.level) parsed.level = parsed.facts.length > 0 ? 'direct' : 'none';
      logger.prod('[kb/synth] extract via Gemini Flash-Lite');
      return { result: parsed, usage: { p: 0, c: 0, cost: 0 } }; // OpenRouter cost tracked separately
    } catch {
      logger.warn('[kb/synth] Gemini extract JSON parse failed, falling back to Haiku');
    }
  }

  // Fallback L2: Haiku (reliable)
  let totalP = 0, totalC = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = attempt === 0
      ? [{ role: 'user' as const, content: userMsg }]
      : [{ role: 'user' as const, content: userMsg }, { role: 'assistant' as const, content: '{' }];

    const res = await generateAITextWithUsage({
      messages,
      systemPrompt: EXTRACT_PROMPT + (attempt > 0 ? '\n\nIMPORTANT: Return ONLY raw JSON. No markdown fences. Start with {' : ''),
      providerOverride: 'anthropic',
      anthropicModel: 'claude-haiku-4-5-20251001',
      apiKeyOverride: config.anthropic.apiKey!,
      maxTokens: 1200,
      temperature: 0,
      timeoutMs: 20_000,
    });

    totalP += res.usage?.prompt_tokens || 0;
    totalC += res.usage?.completion_tokens || 0;
    const rawText = attempt > 0 ? '{' + res.text : res.text;

    try {
      const json = cleanJsonResponse(rawText);
      const parsed = JSON.parse(json) as ExtractionResult;
      if (!parsed.facts) parsed.facts = [];
      if (!parsed.level) parsed.level = parsed.facts.length > 0 ? 'direct' : 'none';
      const cost = (totalP * 1.00 + totalC * 5.00) / 1_000_000;
      logger.prod('[kb/synth] extract via Haiku (fallback)');
      return { result: parsed, usage: { p: totalP, c: totalC, cost } };
    } catch {
      if (attempt === 0) { logger.warn('[kb/synth] Haiku extract JSON parse failed, retrying'); continue; }
    }
  }

  const cost = (totalP * 1.00 + totalC * 5.00) / 1_000_000;
  return { result: { level: 'none', facts: [], missing: 'JSON parse error in extract stage' }, usage: { p: totalP, c: totalC, cost } };
}
