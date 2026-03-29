/**
 * KB AI synthesis v3 — two-stage Extract → Compose → Code.
 *
 * Stage 1 (Extract): GPT-4.1-mini reads all chunks, returns JSON with relevant facts.
 * Stage 2 (Compose): Claude Sonnet 4.6 writes coherent answer from extracted facts.
 * Stage 3 (Code): deterministic HTML rendering with footnotes and links.
 *
 * Each stage does ONE thing → simpler prompts → better quality.
 */

import { generateAITextWithUsage, type AIResult } from '@/lib/shared/ai/client';
import { config } from '@/lib/shared/config';
import logger from '@/lib/shared/logger';
import type { KBChunk } from './query-translator';
import { dominantCategorySlug } from './query-translator';
import type { ConversationTurn } from './search';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SynthesisResult {
  text: string;
  cost: number;
  promptTokens: number;
  completionTokens: number;
  model: string;
  /** Cost breakdown per stage for the cost footer. */
  stages?: Array<{ model: string; promptTokens: number; completionTokens: number; cost: number }>;
}

interface ExtractedFact {
  text: string;
  fragment: number;    // 1-based fragment index
  ref?: string;        // e.g. "п. 3", "ст. 25"
  norm_type?: 'general' | 'exception' | 'procedure';
  audience?: string;   // "all" | "retail_employee" | "state_officer" | "military" | etc.
}

interface ExtractionResult {
  level: 'direct' | 'partial' | 'adjacent' | 'none';
  facts: ExtractedFact[];
  missing?: string;    // what info is absent (for partial)
}

interface DocInfo { url: string; title: string }

// ── Short document names ────────────────────────────────────────────────────────

const SHORT_NAMES: [RegExp, string][] = [
  [/Про мобілізаційну підготовку/i, 'Закон про мобілізацію'],
  [/Про захист прав споживачів/i, 'Закон про захист споживачів'],
  [/Податковий кодекс/i, 'Податковий кодекс'],
  [/Кодекс законів про працю/i, 'Кодекс законів про працю'],
  [/Конституція/i, 'Конституція України'],
  [/Конвенція про кіберзлочинність/i, 'Конвенція про кіберзлочинність'],
  [/Про основні засади.*кібербезпеки/i, 'Закон про кібербезпеку'],
  [/Про захист інформації/i, 'Закон про захист інформації'],
  [/Про захист персональних даних/i, 'Закон про персональні дані'],
  [/Про інформацію/i, 'Закон про інформацію'],
  [/Деякі питання реалізації положень Закону.*бронювання/i, 'Постанова КМУ №76'],
  [/Деякі питання бронювання/i, 'Постанова КМУ №1608'],
  [/Питання проведення призову/i, 'Постанова КМУ №560'],
  [/Порядку? організації та ведення військового обліку/i, 'Постанова КМУ №1487'],
  [/Про затвердження Правил надання.*електронних/i, 'Постанова КМУ №761'],
  [/Про затвердження Порядку гарантійного/i, 'Постанова КМУ №1251'],
  [/Про затвердження Правил побутового/i, 'Постанова КМУ №614'],
  [/Про затвердження Критеріїв/i, 'Наказ МОУ №722'],
  [/КМУ\s*№?\s*76\b/i, 'Постанова КМУ №76'],
  [/КМУ\s*№?\s*1608\b/i, 'Постанова КМУ №1608'],
  [/КМУ\s*№?\s*560\b/i, 'Постанова КМУ №560'],
  [/КМУ\s*№?\s*1487\b/i, 'Постанова КМУ №1487'],
];

function shortenDocName(name: string): string {
  for (const [pattern, short] of SHORT_NAMES) {
    if (pattern.test(name)) return short;
  }
  let s = name.replace(/^Про затвердження\s+/i, '');
  if (s.length > 80) s = s.slice(0, 77) + '…';
  return s;
}

// ── Post-processing ─────────────────────────────────────────────────────────────

const HALLUCINATION_RX = [
  /рекоменду[єю]\w*\s+звернути(ся|сь)/i,
  /радим[оу]\s+звернути(ся|сь)/i,
  /раджу\s+звернути(ся|сь)/i,
  /можна\s+звернути(ся|сь)\s+до/i,
  /зверніться\s+до\s+\*{0,2}[А-ЯІЇЄ]/i,
  /звертайтеся\s+до/i,
];

function stripHallucinations(text: string): string {
  const paras = text.split('\n\n');
  const clean = paras.filter(p => !HALLUCINATION_RX.some(rx => rx.test(p)));
  if (clean.length < paras.length) logger.prod('[kb/synth] stripped hallucinated paragraph(s)');
  return clean.join('\n\n');
}

function sanitizeHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, '<i>$1</i>')
    .replace(/^[\s]*[-—–]\s+/gm, '• ')
    .replace(/^•\s*•\s*/gm, '• ')
    .replace(/\n{3,}/g, '\n\n');
}

// ── Superscript ─────────────────────────────────────────────────────────────────

const SUPER = '¹²³⁴⁵⁶⁷⁸⁹';
const toSuper = (n: number): string =>
  String(n).split('').map(d => SUPER[+d - 1] || d).join('');

// ── Stage 1: Extract facts from chunks (GPT-4.1-mini) ──────────────────────────

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
  '   - Base set comparison: if fragments list approved software (e.g. PeaZip as archiver) and user asks about a DIFFERENT product in same category (e.g. WinRAR) → state that the asked product is NOT in the base set and may require a license.\n' +
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

function buildFragmentsBlock(chunks: KBChunk[]): string {
  return chunks.slice(0, 6).map((c, i) => {
    const ctx = c.contextual_prefix ? `[Контекст: ${c.contextual_prefix}]\n` : '';
    const score = typeof c._rerank_score === 'number' ? ` (relevance: ${c._rerank_score.toFixed(2)})` : '';
    return `[Фрагмент ${i + 1}${score}] ${c.document_title}` +
      (c.heading ? ` > ${c.heading}` : '') +
      `\n${ctx}${c.content.slice(0, 2000)}`;
  }).join('\n\n---\n\n');
}

/** Clean AI response to valid JSON — strip fences, find JSON object boundaries. */
function cleanJsonResponse(raw: string): string {
  let s = raw.replace(/```json\n?|\n?```/g, '').trim();
  // Find first { and last } — extract JSON object
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return s;
}

/** Call OpenRouter Gemini Flash-Lite for extract (cheap, structured JSON task). */
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

async function extractFacts(
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

// ── Stage 2: Compose answer from facts (Claude Sonnet) ──────────────────────────

const COMPOSE_BASE =
  'You are a corporate knowledge base assistant for АТБ-Маркет — найбільша національна роздрібна мережа України. ' +
  'Users are company employees at all levels: від касирів і комірників до логістів, маркетологів, IT, HR та керівництва. Output language: Ukrainian.\n' +
  'CONTEXT: В Україні діє воєнний стан. Коли є норми мирного і воєнного часу — пріоритизуй воєнні, чітко зазначай якщо норма діє тільки під час воєнного стану.\n\n' +
  'INPUT: extracted facts with source references (ref) [N].\n' +
  'TASK: compose a coherent answer using ONLY these facts. Apply facts to the context of a retail company employee.\n\n' +
  'RULES:\n' +
  '- Use wording as close to original facts as possible. Do not rephrase unnecessarily.\n' +
  '- Do NOT invent facts, terms, or advice ("зверніться", "рекомендую") not present in input.\n' +
  '- Preserve (ref) [N] markers from facts. Place at end of paragraph, not after every bullet.\n' +
  '- If all bullets in a section come from one source, put [N] once at the end of the section.\n\n' +
  'FORMAT (HTML for messenger):\n' +
  '- <b>Section title</b>, bullets «•» on new lines, NO blank lines between bullets.\n' +
  '- Blank line ONLY between different sections.\n' +
  '- Max 7-8 bullets per section.';

const CAVEAT_SUFFIX =
  '\n\nIMPORTANT: The facts below are only TANGENTIALLY related to the query. ' +
  'Start your answer with: "⚠️ В базі знань немає прямої відповіді на це запитання. Ось дотична інформація, яка може бути корисною:"\n' +
  'Be honest about what the KB does NOT contain. Do NOT present tangential facts as a direct answer.';

const COMPOSE_DOMAIN: Record<string, string> = {
  ib:
    '\nRole: InfoSec consultant. Tone: friendly, practical.\n' +
    'Sections: 1) <b>Коротка відповідь</b> 2) <b>Що потрібно зробити</b> 3) <b>Важливо знати</b>\n' +
    'Skip empty sections.',
  hr:
    '\nRole: HR consultant. Tone: friendly, practical.\n' +
    'Sections: 1) <b>Коротка відповідь</b> 2) <b>Покрокова процедура</b> 3) <b>Важливо знати</b>\n' +
    'Skip empty sections.',
  it:
    '\nRole: IT consultant. Tone: friendly, practical.\n' +
    'Sections: 1) <b>Коротка відповідь</b> 2) <b>Інструкція</b> 3) <b>Важливо знати</b>\n' +
    'Skip empty sections.',
  legal:
    '\nRole: Legal consultant for a large PRIVATE retail company (АТБ-Маркет). Tone: precise, clear.\n' +
    'AUDIENCE: employee or HR manager of a private retail company — answer from the employer/employee perspective, not abstract legal theory.\n' +
    'Prioritize facts relevant to the company and its employees. Ignore facts about categories not asked about.\n' +
    'If facts mention exceptions for sectors other than private retail (державні органи, військові частини, дипломатична служба, заклади культури) — OMIT them from the answer entirely unless the query asks about that sector.\n' +
    'One continuous text, do NOT split into sections. Quote key legal formulations verbatim.\n' +
    'End with: "⚠️ Перевірте актуальність на zakon.rada.gov.ua — законодавство може змінюватись."',
};

function buildFactsBlock(
  facts: ExtractedFact[],
  chunks: KBChunk[],
  docInfoMap: Map<string, DocInfo>,
): { text: string; sourceMap: Map<number, { title: string; url: string; shortName: string }> } {
  // Build source map: fragment index → document info (deduplicated by title)
  const sourceMap = new Map<number, { title: string; url: string; shortName: string }>();
  const titleToNum = new Map<string, number>();
  let nextNum = 1;

  for (const fact of facts) {
    const chunk = chunks[fact.fragment - 1];
    if (!chunk) continue;
    const info = docInfoMap.get(chunk.document_id);
    const title = info?.title || chunk.document_title;
    const shortName = shortenDocName(title);
    // Deduplicate by short name
    if (!titleToNum.has(shortName)) {
      titleToNum.set(shortName, nextNum);
      sourceMap.set(nextNum, { title, url: info?.url || '', shortName });
      nextNum++;
    }
  }

  // Build facts text with [N] references
  const lines = facts.map(f => {
    const chunk = chunks[f.fragment - 1];
    const info = chunk ? docInfoMap.get(chunk.document_id) : undefined;
    const title = info?.title || chunk?.document_title || '';
    const shortName = shortenDocName(title);
    const num = titleToNum.get(shortName) || f.fragment;
    const ref = f.ref ? ` (${f.ref})` : '';
    return `• ${f.text}${ref} [${num}]`;
  });

  return { text: lines.join('\n'), sourceMap };
}

async function composeAnswer(
  query: string,
  factsText: string,
  domain: string,
  history?: ConversationTurn[],
): Promise<AIResult> {
  // For caveat domains (e.g. 'legal_caveat'), apply base domain prompt + caveat suffix
  const baseDomain = domain.replace('_caveat', '');
  const isCaveat = domain.endsWith('_caveat');
  const domainPrompt = COMPOSE_DOMAIN[baseDomain] ?? '';
  const caveatPrompt = isCaveat ? CAVEAT_SUFFIX : '';
  const systemPrompt = COMPOSE_BASE + domainPrompt + caveatPrompt;

  return generateAITextWithUsage({
    messages: [
      ...(history ?? []).slice(-6).map(t => ({ role: t.role, content: t.content })),
      { role: 'user', content: `Факти з документів:\n${factsText}\n\nЗапитання: ${query}` },
    ],
    systemPrompt,
    providerOverride: 'anthropic',
    anthropicModel: 'claude-haiku-4-5-20251001',
    apiKeyOverride: config.anthropic.apiKey!,
    maxTokens: 2400,
    temperature: 0,
    timeoutMs: 25_000,
  });
}

// ── Stage 3: Code — render HTML with footnotes ──────────────────────────────────

function renderWithFootnotes(
  text: string,
  sourceMap: Map<number, { title: string; url: string; shortName: string }>,
): string {
  let body = stripHallucinations(sanitizeHtml(text));

  // Convert (ref) [N] → (ref)¹  and  [N] → ¹
  body = body.replace(/(\([^)]+\))\s*\[(\d+)\]/g, (_, ref, num) => `${ref}${toSuper(parseInt(num, 10))}`);
  body = body.replace(/\[(\d+)(?:,\s*[^\]]+)?\]/g, (_, num) => toSuper(parseInt(num, 10)));
  // Strip leftover refs: [п.1], [ст.25], literal (ref) etc.
  body = body.replace(/\s*\[(?:п|ст|р)\.?\s*\d+(?:\(\d+\))?\]/g, '');
  body = body.replace(/\s*\(ref\)/gi, '');

  // Build footnote block — always show all source documents
  if (sourceMap.size > 0) {
    const lines = [...sourceMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([num, info]) =>
        info.url
          ? `${toSuper(num)} <a href="${info.url}">${info.shortName}</a>`
          : `${toSuper(num)} ${info.shortName}`,
      );
    body += '\n\n---\n\n' + lines.join('\n');
  }

  return body;
}

// ── Load document metadata ──────────────────────────────────────────────────────

async function loadDocInfoMap(chunks: KBChunk[]): Promise<Map<string, DocInfo>> {
  const docIds = [...new Set(chunks.map(c => c.document_id))];
  const map = new Map<string, DocInfo>();
  if (!docIds.length) return map;
  const { getServerDb } = await import('@/lib/shared/db-server');
  const db = getServerDb();
  const { data } = await db.from('kb_documents').select('id, title, metadata').in('id', docIds);
  if (data && Array.isArray(data)) {
    for (const d of data as { id: string; title: string; metadata?: Record<string, unknown> }[]) {
      const url = (d.metadata?.source_url as string) || '';
      map.set(d.id, { url, title: d.title });
    }
  }
  return map;
}

// ── No-key fallback ─────────────────────────────────────────────────────────────

function renderRawChunks(chunks: KBChunk[]): SynthesisResult {
  const parts = chunks.map(c => {
    const header = `📄 <b>${c.document_title}</b>` + (c.heading ? `\n<i>${c.heading}</i>` : '');
    const body = c.content.length > 350 ? c.content.slice(0, 350) + '…' : c.content;
    return `${header}\n${body}`;
  });
  return { text: parts.join('\n\n'), cost: 0, promptTokens: 0, completionTokens: 0, model: 'none' };
}

// ── Public API ──────────────────────────────────────────────────────────────────

export async function synthesizeAnswer(
  query: string,
  chunks: KBChunk[],
  history?: ConversationTurn[],
): Promise<SynthesisResult> {
  if (!config.openai.apiKey || !config.anthropic.apiKey) return renderRawChunks(chunks);

  const docInfoMap = await loadDocInfoMap(chunks);
  const domain = dominantCategorySlug(chunks);
  const stages: SynthesisResult['stages'] = [];

  try {
    // Stage 1: Extract facts (GPT-4.1-mini)
    const { result: extraction, usage: extUsage } = await extractFacts(query, chunks);
    stages.push({ model: 'claude-haiku-4.5-extract', promptTokens: extUsage.p, completionTokens: extUsage.c, cost: extUsage.cost });
    logger.prod('[kb/synth] extraction:', extraction.level, 'facts:', extraction.facts.length,
      'refs:', extraction.facts.filter(f => f.ref).length);

    // No relevant facts → early return
    if (extraction.level === 'none' || extraction.facts.length === 0) {
      const noInfoText = `В базі знань немає інформації про цю тему.${extraction.missing ? ` ${extraction.missing}` : ''}`;
      return { text: noInfoText, cost: extUsage.cost, promptTokens: extUsage.p, completionTokens: extUsage.c, model: 'claude-haiku-4.5-extract', stages };
    }

    // Stage 1.5: Applicability Filter — remove facts irrelevant to user audience
    const RETAIL_AUDIENCE = new Set(['all', 'retail_employee', undefined, '']);
    const beforeFilter = extraction.facts.length;
    extraction.facts = extraction.facts.filter(f => {
      const aud = f.audience?.toLowerCase() || 'all';
      if (RETAIL_AUDIENCE.has(aud)) return true;
      // Exception: keep if query explicitly mentions this audience
      const qLower = query.toLowerCase();
      if (aud === 'state_officer' && (qLower.includes('держслужб') || qLower.includes('державн'))) return true;
      if (aud === 'military' && (qLower.includes('військов') || qLower.includes('збройн'))) return true;
      if (aud === 'maritime' && (qLower.includes('моряк') || qLower.includes('морськ'))) return true;
      logger.prod('[kb/synth] audience-filter: removed fact for', aud, ':', f.text.slice(0, 50));
      return false;
    });
    // Sort: general first, then procedure, then exception
    const normOrder = { general: 0, procedure: 1, exception: 2 };
    extraction.facts.sort((a, b) => (normOrder[a.norm_type || 'general'] ?? 1) - (normOrder[b.norm_type || 'general'] ?? 1));

    if (beforeFilter !== extraction.facts.length) {
      logger.prod('[kb/synth] audience-filter:', beforeFilter, '→', extraction.facts.length, 'facts');
    }

    // Re-check after filter
    if (extraction.facts.length === 0) {
      const noInfoText = `В базі знань немає інформації, що стосується працівників приватної роздрібної компанії, за цим запитом.${extraction.missing ? ` ${extraction.missing}` : ''}`;
      return { text: noInfoText, cost: extUsage.cost, promptTokens: extUsage.p, completionTokens: extUsage.c, model: 'claude-haiku-4.5-extract', stages };
    }

    // Adjacent — answer with explicit caveat about tangential info
    if (extraction.level === 'adjacent') {
      logger.prod('[kb/synth] adjacent extraction — adding caveat');
    }

    // Build facts block with source mapping
    const { text: factsText, sourceMap } = buildFactsBlock(extraction.facts, chunks, docInfoMap);
    logger.prod('[kb/synth] sample fact:', extraction.facts[0]?.text?.slice(0, 60), 'ref:', extraction.facts[0]?.ref,
      'frag:', extraction.facts[0]?.fragment);
    logger.prod('[kb/synth] factsText preview:', factsText.slice(0, 200));

    // Stage 2: Compose answer
    // For adjacent/partial extraction with medium confidence — add caveat instruction
    let composeDomain = domain;
    if (extraction.level === 'adjacent') {
      composeDomain = domain + '_caveat';
    }
    const compRes = await composeAnswer(query, factsText, composeDomain, history);
    const cp = compRes.usage?.prompt_tokens || 0;
    const cc = compRes.usage?.completion_tokens || 0;
    // Haiku 4.5: $1.00/1M input, $5.00/1M output
    const compCost = (cp * 1.00 + cc * 5.00) / 1_000_000;
    stages.push({ model: 'claude-haiku-4.5', promptTokens: cp, completionTokens: cc, cost: compCost });

    // Stage 3: Code — render HTML with footnotes
    const html = renderWithFootnotes(compRes.text || '', sourceMap);
    const totalCost = extUsage.cost + compCost;

    return {
      text: html,
      cost: totalCost,
      promptTokens: extUsage.p + cp,
      completionTokens: extUsage.c + cc,
      model: 'claude-haiku-4.5',
      stages,
    };
  } catch (err) {
    logger.error('[kb/synth] pipeline error:', err);
    return renderRawChunks(chunks);
  }
}
