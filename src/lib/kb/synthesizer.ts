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
  'You are a fact extraction engine for Ukrainian corporate documents.\n\n' +
  'INPUT: user query + numbered document fragments.\n' +
  'OUTPUT: strictly valid JSON, no markdown fences, no commentary.\n\n' +
  'Schema:\n' +
  '{"level":"direct|partial|adjacent|none","facts":[{"text":"...","fragment":N,"ref":"п.3"}],"missing":"..."}\n\n' +
  'RULES:\n' +
  '1. Extract EVERY fact relevant to the query: procedures, responsibilities, prohibitions, conditions, deadlines, who performs, who approves, consequences.\n' +
  '2. DEDUCTION (apply ALL of these):\n' +
  '   - Category → item: rule for "ПЗ" applies to "Photoshop", rule for "знімні носії" applies to "флешка".\n' +
  '   - Base set comparison: if fragments list approved software (e.g. PeaZip as archiver) and user asks about a DIFFERENT product in same category (e.g. WinRAR) → state that the asked product is NOT in the base set and may require a license.\n' +
  '   - Licensing: if a table marks a category as "потрібне придбання ліцензії" → apply to the queried product.\n' +
  '3. Each fact = one clean sentence in Ukrainian. Put clause/article refs in "ref" field (e.g. "п.3.2", "ст.25"), NOT in "text".\n' +
  '4. One fact per logical statement. Do not merge unrelated statements.\n' +
  '5. "fragment" = 1-based index. "ref" = article/clause reference if present (optional).\n' +
  '6. level: "direct" = query answered fully, "partial" = key parts answered, "adjacent" = related info only, "none" = nothing relevant.\n' +
  '7. "missing" = what information the fragments lack to fully answer the query. Empty string if nothing is missing.\n' +
  '8. When in doubt whether a fact is relevant — INCLUDE it. Err on the side of over-extraction.';

function buildFragmentsBlock(chunks: KBChunk[]): string {
  return chunks.slice(0, 8).map((c, i) => {
    const ctx = c.contextual_prefix ? `[Контекст: ${c.contextual_prefix}]\n` : '';
    return `[Фрагмент ${i + 1}] ${c.document_title}` +
      (c.heading ? ` > ${c.heading}` : '') +
      `\n${ctx}${c.content.slice(0, 2000)}`;
  }).join('\n\n---\n\n');
}

async function extractFacts(
  query: string, chunks: KBChunk[],
): Promise<{ result: ExtractionResult; usage: { p: number; c: number; cost: number } }> {
  const fragments = buildFragmentsBlock(chunks);

  const res = await generateAITextWithUsage({
    messages: [{ role: 'user', content: `<fragments>\n${fragments}\n</fragments>\n\n<query>${query}</query>` }],
    systemPrompt: EXTRACT_PROMPT,
    providerOverride: 'anthropic',
    anthropicModel: 'claude-haiku-4-5-20251001',
    apiKeyOverride: config.anthropic.apiKey!,
    maxTokens: 1200,
    temperature: 0,
    timeoutMs: 15_000,
  });

  const p = res.usage?.prompt_tokens || 0;
  const c = res.usage?.completion_tokens || 0;
  // Haiku 4.5: $1.00/1M input, $5.00/1M output
  const cost = (p * 1.00 + c * 5.00) / 1_000_000;

  try {
    const json = res.text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(json) as ExtractionResult;
    if (!parsed.facts) parsed.facts = [];
    if (!parsed.level) parsed.level = parsed.facts.length > 0 ? 'direct' : 'none';
    return { result: parsed, usage: { p, c, cost } };
  } catch {
    logger.prod('[kb/synth] extraction JSON parse failed, using raw');
    return {
      result: { level: 'direct', facts: [{ text: res.text, fragment: 1 }] },
      usage: { p, c, cost },
    };
  }
}

// ── Stage 2: Compose answer from facts (Claude Sonnet) ──────────────────────────

const COMPOSE_BASE =
  'You are a corporate knowledge base assistant. Output language: Ukrainian.\n\n' +
  'INPUT: extracted facts with source references (ref) [N].\n' +
  'TASK: compose a coherent answer using ONLY these facts.\n\n' +
  'RULES:\n' +
  '- Use wording as close to original facts as possible. Do not rephrase unnecessarily.\n' +
  '- Do NOT invent facts, terms, or advice ("зверніться", "рекомендую") not present in input.\n' +
  '- Preserve (ref) [N] markers from facts. Place at end of paragraph, not after every bullet.\n' +
  '- If all bullets in a section come from one source, put [N] once at the end of the section.\n\n' +
  'FORMAT (HTML for messenger):\n' +
  '- <b>Section title</b>, bullets «•» on new lines, NO blank lines between bullets.\n' +
  '- Blank line ONLY between different sections.\n' +
  '- Max 7-8 bullets per section.';

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
    '\nRole: Legal consultant. Tone: precise, clear. Quote key legal formulations verbatim.\n' +
    'One continuous text, do NOT split into sections.\n' +
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
  const systemPrompt = COMPOSE_BASE + (COMPOSE_DOMAIN[domain] ?? '');

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

    // Build facts block with source mapping
    const { text: factsText, sourceMap } = buildFactsBlock(extraction.facts, chunks, docInfoMap);
    logger.prod('[kb/synth] sample fact:', extraction.facts[0]?.text?.slice(0, 60), 'ref:', extraction.facts[0]?.ref,
      'frag:', extraction.facts[0]?.fragment);
    logger.prod('[kb/synth] factsText preview:', factsText.slice(0, 200));

    // Stage 2: Compose answer (Claude Sonnet 4.6)
    const compRes = await composeAnswer(query, factsText, domain, history);
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
