/**
 * KB Document Validator — analyzes document structure + quality before indexing.
 * Does NOT write to DB; returns a ValidationResult with checks + AI analysis.
 *
 * Usage: validateDocument(buffer, mimeType, fileName) → ValidationResult
 *
 * Internal helpers are split across:
 *   validator-stats.ts  — language detection, metadata extraction, statistics
 *   validator-checks.ts — structural check rules (Document Guide v2)
 */

import { parseDOCX, parseMarkdown, isMarkdown, preprocessText, type StyleMetadata } from './processor';
import { extractHeadingNumbers } from './docx-numbering';
import { generateAITextWithUsage } from '@/lib/shared/ai/client';
import { config } from '@/lib/shared/config';
import logger from '@/lib/shared/logger';
import { computeStats, detectArtifacts, extractMetadata } from './validator-stats';
import { runChecks, CHECK_LABELS } from './validator-checks';
import { isHeadingLine } from './chunker';
import { sanitizeJsonString } from './shared/json';

// ── Public types ───────────────────────────────────────────────────────────────

export interface DocumentMetadata {
  docType: string | null;
  docNumber: string | null;
  docDate: string | null;
  /** "Версія 2.0" extracted from Subtitle block */
  version: string | null;
  /** "Затверджено: Рада директорів, протокол №12" */
  approver: string | null;
}

export interface DocumentStats {
  wordCount: number;
  sectionCount: number;
  subsectionCount: number;
  tableCount: number;
  paragraphCount: number;
  estimatedChunks: number;
  parentChunks: number;        // sections as natural parent boundaries
  avgChildrenPerParent: number; // estimatedChunks / parentChunks
  language: 'uk' | 'ru' | 'en' | 'mixed';
  hasArtifacts: {
    approvalStamps: boolean;
    signatureLines: boolean;
    changelog: boolean;
    toc: boolean;
  };
}

export interface ValidationCheck {
  id: string;
  status: 'ok' | 'error' | 'warning' | 'info';
  label: string;
  detail: string;
}

/** Single per-requirement AI evaluation (semantic checks not covered by structural analysis) */
export interface AICheckItem {
  id: string;
  label: string;
  status: 'ok' | 'warning' | 'error';
  /** Empty when ok; specific explanation when warning/error */
  note: string;
}

export interface AIAnalysis {
  overallScore: 'ready' | 'minor_fixes' | 'major_fixes';
  /** 1-sentence overall verdict */
  summary: string;
  recommendations: string[];
  /** Semantic checks evaluated by AI (abbreviations, numbers in text, table captions) */
  aiChecks: AICheckItem[];
  /** Step-by-step fix instructions per checklist violation (only for non-ok items) */
  fixInstructions: Array<{ issue: string; steps: string[] }>;
}

export interface ValidationResult {
  metadata: DocumentMetadata;
  stats: DocumentStats;
  checks: ValidationCheck[];
  errors: string[];
  warnings: string[];
  aiAnalysis: AIAnalysis;
  readyToIndex: boolean;
  /** First 4000 chars of cleaned text — used as context for follow-up chat */
  preview: string;
  /** Word Title/Subtitle style data (DOCX only) */
  styleMetadata?: StyleMetadata;
}

// ── Structural-only check (no AI, ~10ms) ──────────────────────────────────────

export interface TextStructureCheck {
  readyToIndex: boolean;
  checks: ValidationCheck[];
  errors: string[];
}

/**
 * Run only structural checks on already-cleaned Markdown text.
 * Used to verify normalized text quality before indexing.
 * No AI call, no DOCX parsing needed.
 * Note: metadata is all-null intentionally — structural check has no DOCX header context.
 */
export function validateTextStructure(text: string): TextStructureCheck {
  const hasArtifacts = detectArtifacts(text);
  const stats = computeStats(text, hasArtifacts);
  const emptyMetadata: DocumentMetadata = {
    docType: null, docNumber: null, docDate: null, version: null, approver: null,
  };
  const checks = runChecks(stats, text, emptyMetadata);
  const errors = checks.filter(c => c.status === 'error').map(c => c.id);
  return { readyToIndex: errors.length === 0, checks, errors };
}

// ── AI analysis ────────────────────────────────────────────────────────────────

// Cap at 12000 chars for AI analysis — abbreviation/number checks need only the first portion.
const AI_TEXT_LIMIT = 12_000;

const AI_FALLBACK_NO_KEY: AIAnalysis = {
  overallScore: 'minor_fixes',
  summary: 'AI-аналіз недоступний — ключ API не налаштовано.',
  recommendations: [],
  aiChecks: [],
  fixInstructions: [],
};

const AI_FALLBACK_ERROR: AIAnalysis = {
  overallScore: 'minor_fixes',
  summary: 'AI-аналіз тимчасово недоступний. Структурні перевірки виконано успішно.',
  recommendations: [],
  aiChecks: [],
  fixInstructions: [],
};


async function getAIAnalysis(
  cleanedText: string,
  fileName: string,
  stats: DocumentStats,
  structuralIssues: string[],
): Promise<AIAnalysis> {
  if (!config.anthropic.apiKey) return AI_FALLBACK_NO_KEY;

  const textSample = cleanedText.length > AI_TEXT_LIMIT
    ? cleanedText.slice(0, AI_TEXT_LIMIT) +
      `\n\n[...далі ще ~${Math.round((cleanedText.length - AI_TEXT_LIMIT) / 5)} слів — структурно перевірено автоматично]`
    : cleanedText;
  const issuesList = structuralIssues.length
    ? `Структурні проблеми (вже виявлені автоматично): ${structuralIssues.join(', ')}.`
    : 'Структурних проблем не виявлено.';

  const systemPrompt =
    'Аналізатор корпоративних документів. Перевіряй відповідність Document Guide v2.\n' +
    'СУВОРО: рекомендації — ЛИШЕ для усунення виявлених проблем з наведеного чеклісту.\n' +
    'ЗАБОРОНЕНО: вигадувати вимоги поза чеклістом, додавати рекомендації яких немає серед проблем.\n\n' +
    'Чекліст Document Guide v2 (ЄДИНА основа для рекомендацій):\n' +
    '• Нумеровані заголовки H1/H2/H3 (1. Назва / 1.1. Назва / 1.1.1. Назва) через Word Heading стилі (не лише bold)\n' +
    '• Кожен розділ — мін. 3 речення тексту (не порожні)\n' +
    '• TOC (зміст) обов\'язковий якщо > 5 розділів H1\n' +
    '• Таблиці — заголовок («Таблиця N. Назва») і шапка; без порожніх таблиць\n' +
    '• Кожен розділ самодостатній — без «як зазначено вище», «відповідно до попереднього пункту»\n' +
    '• Абревіатури розшифровані при першому вживанні (якщо документ посилається на зовнішній Глосарій — це прийнятно, відміч ok)\n' +
    '• Ключові числа/строки/суми вказані в тексті, а не лише в таблицях\n\n' +
    'ПРАВИЛА для fixInstructions:\n' +
    '• Використовуй ТОЧНІ номери розділів з переліку виявлених проблем — НЕ вигадуй інші номери\n' +
    '• Пиши ЛИШЕ кроки дій у Word (\"Відкрийте розділ 4.1.2, додайте 2 речення...\") — НЕ генеруй замінний текст\n' +
    '• Кожен крок — 1 речення конкретної дії\n' +
    'Відповідай ТІЛЬКИ JSON, ТІЛЬКИ українською.';

  const userContent =
    `«${fileName}» · ${stats.wordCount} сл. · ${stats.sectionCount} розд. H1 · ` +
    `${stats.subsectionCount} підрозд. H2 · ${stats.tableCount} табл. · мова: ${stats.language}.\n` +
    `${issuesList}\n\n` +
    `ТЕКСТ ДОКУМЕНТА:\n${textSample}\n\n` +
    `Поверни JSON. Перевір по тексту 3 вимоги Document Guide v2 (тільки те що можна перевірити по тексту):\n` +
    `{"overallScore":"ready|minor_fixes|major_fixes","summary":"1 речення — підсумок по чеклісту (що саме не відповідає)",` +
    `"recommendations":["порада ТІЛЬКИ для усунення проблеми з чеклісту — не більше 3"],` +
    `"aiChecks":[` +
    `{"id":"abbreviations","label":"Абревіатури розшифровані","status":"ok|warning|error","note":"конкретно що і де, або порожньо"},` +
    `{"id":"numbers_in_text","label":"Числа/строки/суми в тексті","status":"ok|warning|error","note":"що лише в таблиці, або порожньо"},` +
    `{"id":"table_captions","label":"Назва «Таблиця N.» перед таблицею","status":"ok|warning|error","note":"яка таблиця без назви, або порожньо"}` +
    `],` +
    `"fixInstructions":[` +
    `{"issue":"назва порушення з чеклісту","steps":["Крок 1 у Word — конкретна дія","Крок 2","Крок 3"]}` +
    `]}`;

  try {
    const result = await generateAITextWithUsage({
      providerOverride: 'anthropic',
      anthropicModel: 'claude-haiku-4-5-20251001',
      maxTokens: 3000,
      temperature: 0.2,
      timeoutMs: 60_000,
      systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const parsed = JSON.parse(sanitizeJsonString(jsonMatch[0])) as Partial<AIAnalysis>;
    return {
      overallScore: parsed.overallScore ?? 'minor_fixes',
      summary: parsed.summary ?? '',
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 5) : [],
      aiChecks: Array.isArray(parsed.aiChecks) ? (parsed.aiChecks as AICheckItem[]).slice(0, 6) : [],
      fixInstructions: Array.isArray(parsed.fixInstructions)
        ? (parsed.fixInstructions as Array<{ issue: string; steps: string[] }>).slice(0, 5)
        : [],
    };
  } catch (err) {
    logger.error('[kb/validator] AI analysis failed:', err);
    return AI_FALLBACK_ERROR;
  }
}

// ── Heading consistency check (DOCX only) ──────────────────────────────────────

async function checkHeadingConsistency(
  buffer: Buffer,
  cleanedText: string,
): Promise<ValidationCheck[]> {
  const checks: ValidationCheck[] = [];
  let numbered;
  try {
    numbered = await extractHeadingNumbers(buffer);
  } catch { return checks; }
  if (numbered.length === 0) return checks;

  // Collect markdown headings from cleaned text
  const mdHeadings: string[] = [];
  for (const line of cleanedText.split('\n')) {
    if (isHeadingLine(line)) {
      mdHeadings.push(line.replace(/^#+\s*/, '').trim());
    }
  }

  // Find markdown headings that have no matching numbered heading
  const numberedTexts = new Set(numbered.map(h => h.text.toLowerCase().trim()));
  const unnumbered = mdHeadings.filter(h =>
    h.length > 3 && !numberedTexts.has(h.toLowerCase().trim()),
  );

  if (unnumbered.length > 0 && unnumbered.length < mdHeadings.length) {
    const examples = unnumbered.slice(0, 3).map(h => h.slice(0, 40));
    checks.push({
      id: 'HEADING_NO_NUMBERING', status: 'warning',
      label: 'Нумерація заголовків',
      detail: `${unnumbered.length} заголовк${unnumbered.length === 1 ? '' : 'ів'} без авто-нумерації: ${examples.join(', ')}. Перевірте стилі цих заголовків у Word`,
    });
  }

  // Check numbering sequence gaps (e.g., jumps from 4. to 6.)
  const topLevel = numbered.filter(h => h.level === 0);
  const gaps: string[] = [];
  for (let i = 1; i < topLevel.length; i++) {
    const prev = parseInt(topLevel[i - 1].number);
    const curr = parseInt(topLevel[i].number);
    if (!isNaN(prev) && !isNaN(curr) && curr > prev + 1) {
      gaps.push(`${prev}→${curr}`);
    }
  }
  if (gaps.length > 0) {
    checks.push({
      id: 'HEADING_NUMBER_GAP', status: 'warning',
      label: 'Пропуски нумерації',
      detail: `Пропуски в нумерації розділів: ${gaps.join(', ')}. Можлива помилка стилів у Word`,
    });
  }

  return checks;
}

// ── Main public function ───────────────────────────────────────────────────────

export async function validateDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<ValidationResult> {
  let rawText: string;
  let styleMetadata: StyleMetadata | undefined;
  let headingsFromStyles: boolean | undefined;

  if (isMarkdown(mimeType, fileName)) {
    rawText = parseMarkdown(buffer);
  } else {
    const parsed = await parseDOCX(buffer);
    rawText = parsed.body;
    styleMetadata = parsed.styleMetadata;
    headingsFromStyles = parsed.headingsFromStyles;
  }

  const metadata = extractMetadata(rawText, styleMetadata, fileName);
  const hasArtifacts = detectArtifacts(rawText);
  const cleanedText = preprocessText(rawText);
  const stats = computeStats(cleanedText, hasArtifacts);
  const checks = runChecks(stats, cleanedText, metadata, headingsFromStyles);

  // DOCX heading consistency: detect missing numPr / sequence gaps
  if (!isMarkdown(mimeType, fileName)) {
    const headingChecks = await checkHeadingConsistency(buffer, cleanedText);
    checks.push(...headingChecks);
  }

  const errors = checks.filter(c => c.status === 'error').map(c => c.id);
  const warnings = checks.filter(c => c.status === 'warning').map(c => c.id);
  // Pass both errors and warnings with details to AI for accurate fix instructions
  const structuralIssues = checks
    .filter(c => c.status === 'error' || c.status === 'warning')
    .map(c => `${CHECK_LABELS[c.id] ?? c.id}: ${c.detail}`);
  const aiAnalysis = await getAIAnalysis(cleanedText, fileName, stats, structuralIssues);

  // AI should not override structural analysis: no errors → cap at minor_fixes
  if (errors.length === 0 && aiAnalysis.overallScore === 'major_fixes') {
    aiAnalysis.overallScore = 'minor_fixes';
  }

  return {
    metadata,
    stats,
    checks,
    errors,
    warnings,
    aiAnalysis,
    readyToIndex: errors.length === 0,
    preview: cleanedText.slice(0, 4000),
    styleMetadata,
  };
}
