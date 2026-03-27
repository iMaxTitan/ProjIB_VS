/**
 * KB Document Normalizer — rewrites a document to meet Document Guide v2.
 *
 * Uses claude-sonnet-4-6 (haiku is insufficient for complex rewriting).
 * Rule: never invent facts — empty sections get a [ПОТРІБНО РОЗКРИТИ: ...] marker.
 */

import { generateAITextWithUsage } from '@/lib/shared/ai/client';
import type { AIUsage } from '@/lib/shared/ai/client';
import type { ValidationResult, TextStructureCheck } from './validator';
import { validateTextStructure } from './validator';
import { isTableOfContents } from './chunker';
import { config } from '@/lib/shared/config';
import logger from '@/lib/shared/logger';

// ── Public types ─────────────────────────────────────────────────────────────

export interface NormalizationResult {
  normalizedText: string;
  changes: string[];
  usage: AIUsage;
  /** Structural check of the normalized text (no AI). Used to gate the "Index" button. */
  structuralCheck: TextStructureCheck;
  /** True if the input text was truncated before normalization (document too large). */
  wasTextTruncated: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_TEXT_CHARS = 80_000;
const CHANGES_MARKER = '===CHANGES===';
const DOCUMENT_MARKER = '===DOCUMENT===';

const SYSTEM_PROMPT =
  'Ти — редактор корпоративних документів. Завдання: виправити документ згідно Document Guide v2.\n\n' +
  'Document Guide v2 — ЄДИНІ вимоги:\n' +
  '• Нумеровані заголовки: H1 = «1. Назва» (# в Markdown), H2 = «1.1. Назва» (##), H3 = «1.1.1. Назва» (###)\n' +
  '• Кожен розділ — мін. 3 речення або 3 пункти списку\n' +
  '• Самодостатні розділи: без «як зазначено вище» / «відповідно до розділу X» — замінювати конкретним посиланням\n' +
  '• Абревіатури розшифровані при першому вживанні\n' +
  '• Таблиці мають назву «Таблиця N. Назва» перед таблицею та шапку (перший рядок = назви стовпців)\n\n' +
  'ЗАЛІЗНІ ПРАВИЛА:\n' +
  '1. ЗАБОРОНЕНО вигадувати факти, числа, терміни, процедури\n' +
  '2. Порожній/тонкий розділ → заміни на: [ПОТРІБНО РОЗКРИТИ: що саме не вистачає]\n' +
  '3. Зберігай мову оригіналу — не перекладати\n' +
  '4. Зберігай структуру та наявний зміст — переписуй ТІЛЬКИ те що порушує Guide\n\n' +
  'ФОРМАТ ВІДПОВІДІ (суворо):\n' +
  CHANGES_MARKER + '\n' +
  '1. Перша зміна (конкретно: що і де виправлено)\n' +
  '2. Друга зміна\n' +
  '...\n' +
  DOCUMENT_MARKER + '\n' +
  '[ПОВНИЙ Markdown-текст виправленого документа]';

// ── Pre-cleaning ─────────────────────────────────────────────────────────────

/**
 * Additional text cleanup before sending to the AI normalizer.
 * Removes TOC blocks and trims at a clean heading boundary if text exceeds limit.
 */
function preCleanForNormalizer(text: string, limit: number): { cleaned: string; truncated: boolean } {
  // 1. Remove table-of-contents blocks (often 1–3k chars in large docs)
  const blocks = text.split(/\n{2,}/);
  const withoutToc = blocks
    .filter(b => b.trim() && !isTableOfContents(b.trim()))
    .join('\n\n');

  if (withoutToc.length <= limit) {
    return { cleaned: withoutToc, truncated: false };
  }

  // 2. Truncate at the last H1/H2 boundary before the limit (avoid mid-section cuts)
  const slice = withoutToc.slice(0, limit);
  const lastHeading = Math.max(
    slice.lastIndexOf('\n# '),
    slice.lastIndexOf('\n## '),
  );
  const cutAt = lastHeading > limit * 0.5 ? lastHeading : slice.length;
  return { cleaned: withoutToc.slice(0, cutAt).trimEnd(), truncated: true };
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function normalizeDocument(
  fullText: string,
  fileName: string,
  validation: Pick<ValidationResult, 'checks' | 'aiAnalysis'>,
): Promise<NormalizationResult> {
  if (!config.anthropic.apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  const { cleaned: textToProcess, truncated: wasTextTruncated } = preCleanForNormalizer(fullText, MAX_TEXT_CHARS);

  const issueLines = [
    ...validation.checks
      .filter((c): c is typeof c & { status: 'error' | 'warning' } =>
        c.status === 'error' || c.status === 'warning')
      .map(c => `[${c.status.toUpperCase()}] ${c.label}: ${c.detail}`),
    ...validation.aiAnalysis.aiChecks
      .filter((c): c is typeof c & { status: 'error' | 'warning' } =>
        c.status === 'error' || c.status === 'warning')
      .map(c => `[${c.status.toUpperCase()}] ${c.label}: ${c.note}`),
  ];

  const issuesList = issueLines.length > 0
    ? issueLines.join('\n')
    : 'Серйозних структурних проблем не виявлено — перевір абревіатури та таблиці';

  const userContent =
    `Файл: «${fileName}»\n\n` +
    `Виявлені проблеми (виправ ВСЕ перелічені):\n${issuesList}\n\n` +
    `ДОКУМЕНТ ДЛЯ ВИПРАВЛЕННЯ:\n${textToProcess}`;

  try {
    const result = await generateAITextWithUsage({
      providerOverride: 'anthropic',
      anthropicModel: 'claude-sonnet-4-6',
      maxTokens: 16000,
      temperature: 0.2,
      timeoutMs: 180_000,
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    return parseResponse(result.text, fullText, result.usage, wasTextTruncated);
  } catch (err) {
    logger.error('[kb/normalizer] AI call failed:', err);
    throw err;
  }
}

// ── Response parser ──────────────────────────────────────────────────────────

function parseResponse(
  responseText: string,
  originalText: string,
  usage: AIUsage | undefined,
  wasTextTruncated: boolean,
): NormalizationResult {
  const fallbackUsage: AIUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  const changesIdx = responseText.indexOf(CHANGES_MARKER);
  const documentIdx = responseText.indexOf(DOCUMENT_MARKER);

  if (changesIdx < 0 || documentIdx < 0 || documentIdx <= changesIdx) {
    // Markers not found — don't use raw AI response as document content.
    return {
      normalizedText: originalText,
      changes: ['Документ нормалізовано'],
      usage: usage ?? fallbackUsage,
      structuralCheck: validateTextStructure(originalText),
      wasTextTruncated,
    };
  }

  const changesRaw = responseText
    .slice(changesIdx + CHANGES_MARKER.length, documentIdx)
    .trim();

  const normalizedText = (responseText
    .slice(documentIdx + DOCUMENT_MARKER.length)
    .trim()) || originalText;

  const changes = changesRaw
    .split('\n')
    .map(l => l.replace(/^\d+\.\s*/, '').replace(/^[-•*]\s*/, '').trim())
    .filter(l => l.length > 0);

  return {
    normalizedText,
    changes: changes.length > 0 ? changes : ['Документ нормалізовано'],
    usage: usage ?? fallbackUsage,
    structuralCheck: validateTextStructure(normalizedText),
    wasTextTruncated,
  };
}
