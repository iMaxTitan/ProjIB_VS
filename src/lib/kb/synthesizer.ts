/**
 * KB AI synthesis v3 — orchestrator.
 *
 * Stage 1 (Extract): synth-extract.ts — facts from chunks via Gemini/Haiku.
 * Stage 2 (Compose): inline — Claude Sonnet 4.6 writes answer from facts.
 * Stage 3 (Render):  synth-render.ts — HTML with footnotes.
 */

import { generateAITextWithUsage, type AIProvider, type AIResult } from '@/lib/shared/ai/client';
import { config } from '@/lib/shared/config';
import logger from '@/lib/shared/logger';
import type { KBChunk } from './query-translator';
import { dominantCategorySlug } from './query-translator';
import { extractFacts } from './synth-extract';
import { loadDocInfoMap, buildFactsBlock, renderWithFootnotes, renderRawChunks } from './synth-render';
import type { ConversationTurn } from './search';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SynthesisResult {
  text: string;
  cost: number;
  promptTokens: number;
  completionTokens: number;
  model: string;
  stages?: Array<{ model: string; promptTokens: number; completionTokens: number; cost: number }>;
}

// ── Stage 2: Compose answer from facts (Claude Sonnet) ──────────────────────────

const COMPOSE_BASE =
  'You are a corporate knowledge base assistant for АТБ-Маркет — найбільша національна роздрібна мережа України. ' +
  'Users are company employees at all levels: від касирів і комірників до логістів, маркетологів, IT, HR та керівництва. Output language: Ukrainian.\n' +
  'CONTEXT: В Україні діє воєнний стан. Коли є норми мирного і воєнного часу — пріоритизуй воєнні, чітко зазначай якщо норма діє тільки під час воєнного стану.\n\n' +
  'INPUT: extracted facts with article references (ст. X, п. Y).\n' +
  'TASK: compose a coherent answer using ONLY these facts. Apply facts to the context of a retail company employee.\n\n' +
  'RULES:\n' +
  '- Use wording as close to original facts as possible. Do not rephrase unnecessarily.\n' +
  '- Do NOT invent facts, terms, or advice ("зверніться", "рекомендую") not present in input.\n' +
  '- Keep article references (ст. X, п. Y) from facts inline in each bullet.\n' +
  '- ALWAYS keep [N] document markers from the facts. Place them after the article reference: "(п.3.2) [1]". If a bullet combines facts from multiple documents, include all markers: "[1][2]".\n\n' +
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
    'Sections:\n' +
    '1) <b>Коротка відповідь</b> — 1-2 sentences max. Include key NUMBERS (amounts, terms, deadlines) from facts. Convert НМДГ to real amounts in UAH when possible. For yes/no: start with Так/Ні + condition. Max 300 chars.\n' +
    '2) <b>Що це означає</b> — key provisions as bullets. Each bullet = 1 rule + specific article reference in legal format (ч. 1 ст. 185 КК). Convert abstract values (НМДГ) to real UAH amounts.\n' +
    '3) <b>Важливо!</b> — 1-2 most critical restrictions, deadlines or penalties. Skip if nothing critical.\n' +
    'Skip empty sections. Quote key legal formulations verbatim.\n' +
    'End with: "⚠️ Перевірте актуальність на zakon.rada.gov.ua — законодавство може змінюватись."',
};

async function composeAnswer(
  query: string,
  factsText: string,
  domain: string,
  history?: ConversationTurn[],
  overrides?: {
    providerOverride?: AIProvider;
    anthropicModel?: string;
    openAIModel?: string;
    apiKeyOverride?: string;
  },
): Promise<AIResult> {
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
    providerOverride: overrides?.providerOverride ?? 'anthropic',
    anthropicModel: overrides?.anthropicModel ?? 'claude-sonnet-4-6',
    openAIModel: overrides?.openAIModel,
    apiKeyOverride: overrides?.apiKeyOverride ?? config.anthropic.apiKey!,
    maxTokens: 2400,
    temperature: 0,
    timeoutMs: 30_000,
  });
}

// ── Public API ──────────────────────────────────────────────────────────────────

export async function synthesizeAnswer(
  query: string,
  chunks: KBChunk[],
  history?: ConversationTurn[],
): Promise<SynthesisResult> {
  if (!config.openrouter.apiKey || !config.anthropic.apiKey) return renderRawChunks(chunks);

  const docInfoMap = await loadDocInfoMap(chunks);
  const domain = dominantCategorySlug(chunks);
  const stages: SynthesisResult['stages'] = [];

  try {
    // Stage 1: Extract facts
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
      const qLower = query.toLowerCase();
      if (aud === 'state_officer' && (qLower.includes('держслужб') || qLower.includes('державн'))) return true;
      if (aud === 'military' && (qLower.includes('військов') || qLower.includes('збройн'))) return true;
      if (aud === 'maritime' && (qLower.includes('моряк') || qLower.includes('морськ'))) return true;
      logger.prod('[kb/synth] audience-filter: removed fact for', aud, ':', f.text.slice(0, 50));
      return false;
    });
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

    if (extraction.level === 'adjacent') {
      logger.prod('[kb/synth] adjacent extraction — adding caveat');
    }

    // Build facts block with source mapping
    const { text: factsText, sourceMap } = buildFactsBlock(extraction.facts, chunks, docInfoMap);
    logger.prod('[kb/synth] sample fact:', extraction.facts[0]?.text?.slice(0, 60), 'ref:', extraction.facts[0]?.ref,
      'frag:', extraction.facts[0]?.fragment);
    logger.prod('[kb/synth] factsText preview:', factsText.slice(0, 200));

    // Stage 2: Compose answer
    let composeDomain = domain;
    if (extraction.level === 'adjacent') {
      composeDomain = domain + '_caveat';
    }
    let compRes: AIResult;
    let composeModel = 'claude-sonnet-4.6';
    try {
      compRes = await composeAnswer(query, factsText, composeDomain, history);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.prod('[kb/synth] anthropic failed, falling back to openai:', message);
      try {
        compRes = await composeAnswer(query, factsText, composeDomain, history, {
          providerOverride: 'openai',
          openAIModel: 'gpt-4.1',
          apiKeyOverride: config.openai.apiKey,
        });
        composeModel = 'gpt-4.1';
      } catch (fallbackErr) {
        const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        logger.error('[kb/synth] openai fallback also failed:', fbMsg);
        throw fallbackErr;
      }
    }
    const cp = compRes.usage?.prompt_tokens || 0;
    const cc = compRes.usage?.completion_tokens || 0;
    const compCost = (cp * 3.00 + cc * 15.00) / 1_000_000;
    stages.push({ model: composeModel, promptTokens: cp, completionTokens: cc, cost: compCost });

    // Stage 3: Code — render HTML with footnotes
    const html = renderWithFootnotes(compRes.text || '', sourceMap);
    const totalCost = extUsage.cost + compCost;

    return {
      text: html,
      cost: totalCost,
      promptTokens: extUsage.p + cp,
      completionTokens: extUsage.c + cc,
      model: composeModel,
      stages,
    };
  } catch (err) {
    logger.error('[kb/synth] pipeline error:', err);
    return renderRawChunks(chunks);
  }
}
