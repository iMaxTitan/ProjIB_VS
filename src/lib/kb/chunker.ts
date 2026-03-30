/**
 * KB Chunker — splits document text into overlapping chunks.
 * Strategy optimized for structured normative documents (IB, HR, legal).
 *
 * Boundaries (in priority order):
 *  1. Numbered section headings: "1. ", "1.1 ", "2.3.4 ", etc.
 *  2. DOCX headings (after extraction, they appear as lines ending with \n\n)
 *  3. Markdown table blocks (lines starting with "|") — kept as single chunks
 *  4. Paragraph breaks (\n\n)
 *  5. Sentence boundary (". ")
 *
 * Max chunk: 700 tokens (~280 Ukrainian words, 1750 chars at 2.5 chars/token)
 * Overlap: 100 tokens (~250 chars) between adjacent chunks in the same section
 * Tables: preserved whole; large tables (>1500 tokens) split by rows with header duplication
 */

import { splitIntoSegments, chunkTable } from './chunker-tables';

export interface Chunk {
  content: string;
  heading: string;     // e.g. "Розділ 3 > п. 3.4"
  chunkIndex: number;
  tokenCount: number;
}

/**
 * Token estimator for Cyrillic/Ukrainian text.
 * Voyage tokenizer: ~2.5 chars/token for Ukrainian.
 */
const CHARS_PER_TOKEN = 2.5;
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

const MAX_TOKENS = 700;
const OVERLAP_TOKENS = 100;
const OVERLAP_CHARS = Math.round(OVERLAP_TOKENS * CHARS_PER_TOKEN); // 250 chars
const MIN_CHUNK_TOKENS = 30;

/** Detect table of contents chunks — lines like "Назва розділу\t15" or "Section...3" */
export function isTableOfContents(text: string): boolean {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length === 0) return false;
  const tocLine = /(\t\d+\s*$|\.\s*\d+\s*$|…\s*\d+\s*$|\s{2,}\d+\s*$)/;
  const tocCount = lines.filter(l => tocLine.test(l)).length;
  return tocCount >= Math.max(1, Math.ceil(lines.length * 0.5));
}

/** Detect if a line looks like a section heading. */
export function isHeadingLine(line: string): boolean {
  if (/^#{1,3}\s+\S/.test(line)) return true;
  if (/^\s*(\d+\.)+\s+\S/.test(line)) return true;
  if (/^[IIVVX]+\.\s+\S/.test(line)) return true;
  return false;
}

// ---- Text chunking ----

/** Split text content into token-sized chunks with overlap */
function splitTextIntoChunks(content: string, heading: string, startIndex: number): Chunk[] {
  const chunks: Chunk[] = [];
  let remaining = content;
  let idx = startIndex;

  while (remaining.length > 0) {
    const maxChars = Math.round(MAX_TOKENS * CHARS_PER_TOKEN);

    if (estimateTokens(remaining) <= MAX_TOKENS) {
      chunks.push({
        content: remaining.trim(),
        heading,
        chunkIndex: idx++,
        tokenCount: estimateTokens(remaining),
      });
      break;
    }

    let splitAt = maxChars;

    const paraIdx = remaining.lastIndexOf('\n\n', maxChars);
    if (paraIdx > maxChars * 0.5) {
      splitAt = paraIdx;
    } else {
      const sentIdx = remaining.lastIndexOf('. ', maxChars);
      if (sentIdx > maxChars * 0.5) {
        splitAt = sentIdx + 1;
      } else {
        const spaceIdx = remaining.lastIndexOf(' ', maxChars);
        if (spaceIdx > maxChars * 0.3) {
          splitAt = spaceIdx;
        }
      }
    }

    const chunkText = remaining.slice(0, splitAt).trim();
    if (!chunkText) break;

    chunks.push({
      content: chunkText,
      heading,
      chunkIndex: idx++,
      tokenCount: estimateTokens(chunkText),
    });

    const nextStart = Math.max(0, splitAt - OVERLAP_CHARS);
    remaining = remaining.slice(nextStart).trim();
  }

  return chunks;
}

// ---- Heading shortening for merged sections ----

/** Extract section number from heading like "### 3.6.16. Якщо зовнішня..." → "§ 3.6.16" */
function shortenHeading(heading: string): string {
  if (!heading) return '';
  const clean = heading.replace(/^#+\s*/, '').trim();
  const numMatch = clean.match(/^((?:\d+\.)+\d*)\s*/);
  if (numMatch) return `§ ${numMatch[1].replace(/\.$/, '')}`;
  const romanMatch = clean.match(/^([IIVVX]+)\.\s/);
  if (romanMatch) return `§ ${romanMatch[1]}`;
  return clean.length > 50 ? clean.slice(0, 50) + '…' : clean;
}

// ---- Section splitting by headings ----

/** Split text into semantic sections by headings */
function splitIntoSections(text: string): Array<{ heading: string; content: string }> {
  const lines = text.split('\n');
  const sections: Array<{ heading: string; content: string }> = [];

  const mdHeadingLines = lines.filter(l => /^#{1,3}\s+\S/.test(l));
  const hasMultipleMdHeadings = mdHeadingLines.length > 1;

  const legalParagraphRx = /^\d{1,3}\.\s+\S/;
  const hasLegalParagraphs = !hasMultipleMdHeadings && lines.some(l => legalParagraphRx.test(l));

  const isSectionBreak = hasMultipleMdHeadings
    ? (line: string) => /^#{1,3}\s+\S/.test(line)
    : hasLegalParagraphs
      ? (line: string) => /^#{1,3}\s+\S/.test(line) || legalParagraphRx.test(line)
      : (line: string) => isHeadingLine(line);

  let currentHeading = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (isSectionBreak(line)) {
      const content = currentLines.join('\n').trim();
      if (content) {
        sections.push({ heading: currentHeading, content });
      } else if (currentHeading) {
        sections.push({ heading: currentHeading, content: currentHeading });
      }
      currentHeading = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  const lastContent = currentLines.join('\n').trim();
  if (lastContent) {
    sections.push({ heading: currentHeading, content: lastContent });
  } else if (currentHeading) {
    sections.push({ heading: currentHeading, content: currentHeading });
  }

  if (sections.length === 0) {
    sections.push({ heading: '', content: text.trim() });
  }

  // Merge adjacent short sections (< 200 tokens)
  const merged: Array<{ heading: string; content: string }> = [];
  for (const sec of sections) {
    const tokens = estimateTokens(sec.content);
    const prev = merged[merged.length - 1];
    const shouldMerge = prev && (
      (estimateTokens(prev.content) < 200 && tokens < 200) ||
      estimateTokens(prev.content) < 200
    );
    if (shouldMerge && prev) {
      if (prev.heading && sec.heading) {
        const prevParts = prev.heading.split(' > ').map(shortenHeading);
        prev.heading = [...prevParts, sec.heading].join(' > ');
      } else {
        prev.heading = prev.heading || sec.heading;
      }
      prev.content = prev.content + '\n\n' + sec.content;
    } else {
      merged.push({ ...sec });
    }
  }

  return merged;
}

// ---- Main chunking function ----

/** Main chunking function — table-aware */
export function chunkDocument(text: string): Chunk[] {
  if (!text.trim()) return [];

  const sections = splitIntoSections(text);
  const allChunks: Chunk[] = [];

  for (const section of sections) {
    if (!section.content.trim()) continue;

    const segments = splitIntoSegments(section.content);

    for (const segment of segments) {
      const startIdx = allChunks.length;

      if (segment.type === 'table') {
        allChunks.push(...chunkTable(segment.content, section.heading, startIdx));
      } else {
        allChunks.push(...splitTextIntoChunks(segment.content, section.heading, startIdx));
      }
    }
  }

  const filtered = allChunks.filter(c =>
    c.tokenCount >= MIN_CHUNK_TOKENS && !isTableOfContents(c.content)
  );
  filtered.forEach((c, i) => { c.chunkIndex = i; });
  return filtered;
}

/** Build contextual content string for embedding. */
export interface DocMetaForEmbedding {
  doc_type?: string;
  doc_number?: string;
  parent_law?: string;
  related_acts?: string;
}

export function buildContextualContent(
  categoryName: string,
  documentTitle: string,
  heading: string,
  chunkContent: string,
  contextualPrefix?: string,
  docMeta?: DocMetaForEmbedding | null,
): string {
  if (contextualPrefix) {
    const metaHeader = docMeta ? buildMetaHeader(docMeta) : '';
    return metaHeader ? `${metaHeader}\n${contextualPrefix}\n\n${chunkContent}` : `${contextualPrefix}\n\n${chunkContent}`;
  }
  const parts: string[] = [];
  if (docMeta) {
    const metaHeader = buildMetaHeader(docMeta);
    if (metaHeader) parts.push(metaHeader);
  }
  parts.push(`Категорія: ${categoryName}.`, `Документ: «${documentTitle}».`);
  const cleanHeading = heading.replace(/^#+\s*/, '').trim();
  if (cleanHeading) parts.push(`Розділ: ${cleanHeading}.`);
  parts.push('', chunkContent);
  return parts.join('\n');
}

function buildMetaHeader(meta: DocMetaForEmbedding): string {
  const lines: string[] = [];
  if (meta.doc_type && meta.doc_number) lines.push(`Тип: ${meta.doc_type} ${meta.doc_number}.`);
  else if (meta.doc_type) lines.push(`Тип: ${meta.doc_type}.`);
  if (meta.parent_law) lines.push(`На виконання: ${meta.parent_law}.`);
  if (meta.related_acts) lines.push(`Пов'язані: ${meta.related_acts}.`);
  return lines.join(' ');
}
