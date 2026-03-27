/**
 * KB Validator — statistics, language detection, artifact & metadata extraction.
 * Internal module for validator.ts — not part of the public KB API.
 */

import type { DocumentStats, DocumentMetadata } from './validator';
import type { StyleMetadata } from './processor';
import { chunkDocument, isHeadingLine, isTableOfContents } from './chunker';

// ── Language helpers ───────────────────────────────────────────────────────────

/** Find up to 4 words that contain Russian-specific characters (ы ъ э ё). */
export function findRussianWords(text: string): string[] {
  const found: string[] = [];
  for (const word of (text.match(/[\u0400-\u04FF'ʼa-zA-Z]+/g) ?? [])) {
    if (/[ыъэёЫЪЭЁ]/.test(word) && found.length < 4 && !found.includes(word)) {
      found.push(word);
    }
  }
  return found;
}

// ── Language detection ─────────────────────────────────────────────────────────

export function detectLanguage(text: string): DocumentStats['language'] {
  let ukScore = 0;
  let ruScore = 0;
  let asciiLetters = 0;
  let totalLetters = 0;

  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const isLetter =
      (code >= 0x0410 && code <= 0x044F) ||
      (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    if (!isLetter) continue;
    totalLetters++;
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) asciiLetters++;
    if ('іїєґІЇЄҐ'.includes(ch)) ukScore++;
    if ('ыъэЫЪЭ'.includes(ch)) ruScore++;
  }

  if (totalLetters === 0) return 'uk';
  if (asciiLetters / totalLetters > 0.5 && ukScore + ruScore < 20) return 'en';
  if (ukScore > ruScore * 3) return 'uk';
  if (ruScore > ukScore * 3) return 'ru';
  return 'mixed';
}

// ── Artifact detection ─────────────────────────────────────────────────────────

export function detectArtifacts(rawText: string): DocumentStats['hasArtifacts'] {
  return {
    approvalStamps: /СТВЕРДЖУЮ|ЗАТВЕРДЖУЮ|ЗАТВЕРДЖЕНО|ПОГОДЖЕНО|ПОГОДЖУЮ|УЗГОДЖЕНО|ВВЕДЕНО В ДІЮ/i.test(rawText),
    signatureLines:
      /^[\s_]{10,}$/m.test(rawText) || /Генеральний директор|М\.?\s*П\./i.test(rawText),
    changelog: /Дата\t[^\n]*Перелік змін|Перелік змін/i.test(rawText),
    toc: /(\t\d+\s*$|\.\s*\d+\s*$)/m.test(rawText),
  };
}

// ── Metadata extraction ────────────────────────────────────────────────────────

const TYPE_MAP: [RegExp, string][] = [
  [/\bнаказ\b/i, 'Наказ'],
  [/\bінструкція\b/i, 'Інструкція'],
  [/\bположення\b/i, 'Положення'],
  [/\bрегламент\b/i, 'Регламент'],
  [/\bпроцедура\b/i, 'Процедура'],
  [/\bметодологія\b/i, 'Методологія'],
  [/\bстандарт\b/i, 'Стандарт'],
  [/\bполітик[аи]\b/i, 'Політика'],
  [/\bзвіт\b/i, 'Звіт'],
  [/\bдоговір\b/i, 'Договір'],
  [/\bвимоги\b/i, 'Вимоги'],
  [/\bдодаток\b/i, 'Додаток'],
  [/\bглосарі[йю]\b/i, 'Глосарій'],
];

/**
 * Extract document metadata. If styleMetadata is provided (DOCX with Title/Subtitle
 * styles), uses those first. Falls back to regex on first 30 lines (for .md files
 * or documents without Title style).
 */
export function extractMetadata(
  rawText: string,
  styleMetadata?: StyleMetadata,
  fileName?: string,
): DocumentMetadata {
  const head = rawText.split('\n').slice(0, 30).join('\n');
  // Combine style title with head text for broader type/number/date detection
  const searchText = styleMetadata?.title
    ? `${styleMetadata.title}\n${head}`
    : head;

  let docType: string | null = null;
  for (const [re, label] of TYPE_MAP) {
    if (re.test(searchText)) { docType = label; break; }
  }
  // Fallback: check filename if not found in text/styles
  if (!docType && fileName) {
    for (const [re, label] of TYPE_MAP) {
      if (re.test(fileName)) { docType = label; break; }
    }
  }

  const numMatch = searchText.match(/№\s*[\w\-\/]+/);
  const docNumber = numMatch ? numMatch[0].replace(/\s+/, ' ').trim() : null;

  const dateMatch = searchText.match(
    /від\s*(\d{1,2}[.\-]\d{1,2}[.\-]\d{2,4})|\b(\d{1,2}[.\-]\d{1,2}[.\-]\d{4})\b/,
  );
  const docDate = dateMatch ? (dateMatch[1] ?? dateMatch[2]) : null;

  // Version: prefer from Subtitle style, then regex fallback
  let version: string | null = null;
  if (styleMetadata?.subtitle) {
    const subVer = styleMetadata.subtitle.match(/(?:Версія|Version)\s+([\d.]+)/i)
      ?? styleMetadata.subtitle.match(/\bv[.]?\s*([\d.]+)/i);
    version = subVer ? subVer[1] : null;
  }
  if (!version) {
    const versionMatch =
      head.match(/(?:Версія|Version)\s+([\d.]+)/i) ?? head.match(/\bv(\d+\.\d+)\b/i);
    version = versionMatch ? versionMatch[1] : null;
  }

  const approverMatch = searchText.match(
    /(?:Затверджено|Затверджений|Наказ)[:\s]+([^\n]{5,80})/i,
  );
  const approver = approverMatch ? approverMatch[1].trim().replace(/\.$/, '') : null;

  return { docType, docNumber, docDate, version, approver };
}

// ── Table quality helpers ──────────────────────────────────────────────────────

function countMarkdownTables(text: string): number {
  let count = 0;
  let inTable = false;
  for (const line of text.split('\n')) {
    const isTableLine = line.trimStart().startsWith('|');
    if (isTableLine && !inTable) { count++; inTable = true; }
    if (!isTableLine) inTable = false;
  }
  return count;
}

export function hasPoorTableQuality(text: string): boolean {
  const lines = text.split('\n');
  let tableLines: string[] = [];
  let inTable = false;

  const checkTable = (tLines: string[]) => {
    const dataRows = tLines.filter(
      l => l.trim().startsWith('|') && !/^\|[\s\-|]+\|$/.test(l.trim()),
    );
    const cells = dataRows.flatMap(r => r.split('|').filter(Boolean).map(c => c.trim()));
    if (cells.length < 4) return false;
    const emptyCells = cells.filter(c => c === '').length;
    return 1 - emptyCells / cells.length < 0.30;
  };

  for (const line of lines) {
    if (line.trimStart().startsWith('|')) {
      inTable = true;
      tableLines.push(line);
    } else if (inTable) {
      if (checkTable(tableLines)) return true;
      tableLines = [];
      inTable = false;
    }
  }
  if (inTable && checkTable(tableLines)) return true;
  return false;
}

export function hasTableWithoutHeader(text: string): boolean {
  const lines = text.split('\n');
  let inTable = false;
  let tableLines: string[] = [];
  const hasSeparator = (tLines: string[]) =>
    tLines.some(l => /^\|[\s\-:|]+\|/.test(l.trim()));

  for (const line of lines) {
    if (line.trimStart().startsWith('|')) {
      inTable = true;
      tableLines.push(line);
    } else if (inTable) {
      if (tableLines.length > 1 && !hasSeparator(tableLines)) return true;
      tableLines = [];
      inTable = false;
    }
  }
  if (inTable && tableLines.length > 1 && !hasSeparator(tableLines)) return true;
  return false;
}

// ── Stats calculation ──────────────────────────────────────────────────────────

export function computeStats(
  cleanedText: string,
  hasArtifacts: DocumentStats['hasArtifacts'],
): DocumentStats {
  const words = cleanedText.split(/\s+/).filter(w => w.length > 0);
  const paragraphs = cleanedText.split(/\n{2,}/).filter(p => p.trim().length > 0);

  // Use the same pipeline as the indexer for accurate chunk count.
  const chunks = chunkDocument(cleanedText);
  const estimatedChunks = Math.max(1, chunks.length);

  let sectionCount = 0;
  let subsectionCount = 0;
  let currentHeading = '';
  let currentContent = '';

  const flushHeadingCount = () => {
    if (!currentHeading) return;
    if (/[\t.]\s*\d{1,3}\s*$/.test(currentHeading)) return; // page-number → TOC entry
    const raw = currentHeading.trim();
    const hashMatch = raw.match(/^(#{1,3})\s/);
    const level = hashMatch ? hashMatch[1].length : 0; // 1=H1, 2=H2, 3=H3, 0=plain
    const t = raw.replace(/^#+\s*/, '');
    // H1: Word Heading 1 style (#) OR numbered "1. Title"
    if (level === 1 || (level === 0 && /^\d{1,2}\.\s/.test(t) && !/^\d{1,2}\.\d/.test(t))) {
      sectionCount++;
    // H2: Word Heading 2 style (##) OR numbered "1.1 Title" (require content to skip TOC)
    } else if (level === 2 || (level === 0 && /^\d{1,2}\.\d{1,2}\s/.test(t) && currentContent.trim() && !isTableOfContents(currentContent))) {
      subsectionCount++;
    }
  };

  for (const line of cleanedText.split('\n')) {
    if (isHeadingLine(line)) {
      flushHeadingCount();
      currentHeading = line;
      currentContent = '';
    } else {
      currentContent += line + '\n';
    }
  }
  flushHeadingCount();

  const tableCount = countMarkdownTables(cleanedText);
  const parentChunks = Math.max(1, sectionCount);
  const avgChildrenPerParent = Math.round((estimatedChunks / parentChunks) * 10) / 10;

  return {
    wordCount: words.length,
    sectionCount,
    subsectionCount,
    tableCount,
    paragraphCount: paragraphs.length,
    estimatedChunks,
    parentChunks,
    avgChildrenPerParent,
    language: detectLanguage(cleanedText),
    hasArtifacts,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Simple Ukrainian noun declension for counts. */
export function declension(
  n: number,
  genPlural: string,
  singular: string,
  fewPlural: string,
): string {
  const abs = Math.abs(n) % 100;
  const mod10 = abs % 10;
  if (abs >= 11 && abs <= 14) return genPlural;
  if (mod10 === 1) return singular;
  if (mod10 >= 2 && mod10 <= 4) return fewPlural;
  return genPlural;
}

export const LANG_LABEL: Record<string, string> = {
  uk: 'Українська', ru: 'Російська', en: 'Англійська', mixed: 'Змішана',
};
