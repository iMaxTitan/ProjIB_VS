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

export interface Chunk {
  content: string;
  heading: string;     // e.g. "Розділ 3 > п. 3.4"
  chunkIndex: number;
  tokenCount: number;
}

/**
 * Token estimator for Cyrillic/Ukrainian text.
 * Voyage tokenizer: ~2.5 chars/token for Ukrainian.
 * (OpenAI estimate was 4 chars/token — valid for English, not Cyrillic)
 */
const CHARS_PER_TOKEN = 2.5;
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

const MAX_TOKENS = 700;
const OVERLAP_TOKENS = 100;
const OVERLAP_CHARS = Math.round(OVERLAP_TOKENS * CHARS_PER_TOKEN); // 250 chars
const MIN_CHUNK_TOKENS = 30; // skip tiny chunks (ToC lines, approval stamps, signatures, etc.)

/** Max tokens for a table chunk before splitting by rows */
const MAX_TABLE_TOKENS = 1500;

/** Detect table of contents chunks — lines like "Назва розділу\t15" or "Section...3" */
export function isTableOfContents(text: string): boolean {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length === 0) return false;
  // ToC line: ends with tab+digits, or dots+digits, or just digits
  const tocLine = /(\t\d+\s*$|\.\s*\d+\s*$|…\s*\d+\s*$|\s{2,}\d+\s*$)/;
  const tocCount = lines.filter(l => tocLine.test(l)).length;
  // Flag as ToC if at least half the lines match
  return tocCount >= Math.max(1, Math.ceil(lines.length * 0.5));
}

/** Detect if a line looks like a section heading.
 *  Handles two sources:
 *  - mammoth output:       # Title, ## Sub, ### Point
 *  - word-extractor/plain: 1. Title, 1.1 Sub, I. Intro
 */
export function isHeadingLine(line: string): boolean {
  // mammoth markdown headings (from Word Heading 1/2/3 styles)
  if (/^#{1,3}\s+\S/.test(line)) return true;
  // numbered headings: "1. ", "1.1 ", "2.3.4 "
  if (/^\s*(\d+\.)+\s+\S/.test(line)) return true;
  // Roman numeral headings: "I. ", "II. "
  if (/^[IIVVX]+\.\s+\S/.test(line)) return true;
  return false;
}

/** Check if a line is part of a markdown table */
function isTableLine(line: string): boolean {
  return line.trimStart().startsWith('|');
}

/** Check if a line is a bold caption (table caption from table-converter) */
function isTableCaption(line: string): boolean {
  return /^\*\*[^*]+\*\*$/.test(line.trim());
}

// ---- Segment splitting: separate text and table blocks ----

interface Segment {
  type: 'text' | 'table';
  content: string;
}

/**
 * Split section content into alternating text and markdown-table segments.
 * Table = consecutive lines starting with "|", optionally preceded by a bold caption.
 */
function splitIntoSegments(content: string): Segment[] {
  const lines = content.split('\n');
  const segments: Segment[] = [];
  let textLines: string[] = [];

  function flushText() {
    const text = textLines.join('\n').trim();
    if (text) segments.push({ type: 'text', content: text });
    textLines = [];
  }

  let i = 0;
  while (i < lines.length) {
    if (isTableLine(lines[i])) {
      // Check if previous line was a bold caption — include it with the table
      let caption = '';
      if (textLines.length > 0 && isTableCaption(textLines[textLines.length - 1])) {
        caption = textLines.pop()!;
      }
      flushText();

      // Collect all consecutive table lines
      const tableLines: string[] = [];
      if (caption) tableLines.push(caption);
      while (i < lines.length && isTableLine(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      segments.push({ type: 'table', content: tableLines.join('\n') });
    } else {
      textLines.push(lines[i]);
      i++;
    }
  }
  flushText();

  return segments;
}

// ---- Table chunking with header duplication ----

/**
 * Split a large markdown table into chunks, duplicating header + separator in each.
 * Returns table as single chunk if within MAX_TABLE_TOKENS.
 */
function chunkTable(tableContent: string, heading: string, startIdx: number): Chunk[] {
  if (estimateTokens(tableContent) <= MAX_TABLE_TOKENS) {
    return [{
      content: tableContent,
      heading,
      chunkIndex: startIdx,
      tokenCount: estimateTokens(tableContent),
    }];
  }

  // Split into lines, find header (line 0) and separator (line 1)
  const lines = tableContent.split('\n');

  // Find where the actual table starts (might have a bold caption before)
  let tableStartIdx = 0;
  let caption = '';
  if (lines.length > 0 && isTableCaption(lines[0])) {
    caption = lines[0];
    tableStartIdx = 1;
  }

  const headerLine = lines[tableStartIdx] || '';
  const separatorLine = lines[tableStartIdx + 1] || '';
  const bodyLines = lines.slice(tableStartIdx + 2);

  const headerBlock = [
    ...(caption ? [caption] : []),
    headerLine,
    separatorLine,
  ].join('\n');
  const headerTokens = estimateTokens(headerBlock);
  const maxBodyTokens = MAX_TABLE_TOKENS - headerTokens;

  const chunks: Chunk[] = [];
  let idx = startIdx;
  let currentBodyLines: string[] = [];
  let currentTokens = 0;

  for (const bodyLine of bodyLines) {
    const lineTokens = estimateTokens(bodyLine);
    if (currentTokens + lineTokens > maxBodyTokens && currentBodyLines.length > 0) {
      // Flush current chunk
      const chunkContent = headerBlock + '\n' + currentBodyLines.join('\n');
      chunks.push({
        content: chunkContent,
        heading,
        chunkIndex: idx++,
        tokenCount: estimateTokens(chunkContent),
      });
      currentBodyLines = [];
      currentTokens = 0;
    }
    currentBodyLines.push(bodyLine);
    currentTokens += lineTokens;
  }

  // Flush remaining
  if (currentBodyLines.length > 0) {
    const chunkContent = headerBlock + '\n' + currentBodyLines.join('\n');
    chunks.push({
      content: chunkContent,
      heading,
      chunkIndex: idx++,
      tokenCount: estimateTokens(chunkContent),
    });
  }

  return chunks;
}

// ---- Text chunking (original logic) ----

/** Split text content into token-sized chunks with overlap */
function splitTextIntoChunks(content: string, heading: string, startIndex: number): Chunk[] {
  const chunks: Chunk[] = [];
  let remaining = content;
  let idx = startIndex;

  while (remaining.length > 0) {
    const maxChars = Math.round(MAX_TOKENS * CHARS_PER_TOKEN); // 1125 chars

    if (estimateTokens(remaining) <= MAX_TOKENS) {
      chunks.push({
        content: remaining.trim(),
        heading,
        chunkIndex: idx++,
        tokenCount: estimateTokens(remaining),
      });
      break;
    }

    // Find a good split point within maxChars (prefer semantic boundaries)
    let splitAt = maxChars;

    // Try paragraph boundary first
    const paraIdx = remaining.lastIndexOf('\n\n', maxChars);
    if (paraIdx > maxChars * 0.5) {
      splitAt = paraIdx;
    } else {
      // Try sentence boundary
      const sentIdx = remaining.lastIndexOf('. ', maxChars);
      if (sentIdx > maxChars * 0.5) {
        splitAt = sentIdx + 1; // include the period
      } else {
        // Try word boundary to avoid mid-word splits
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

    // Move forward with overlap
    const nextStart = Math.max(0, splitAt - OVERLAP_CHARS);
    remaining = remaining.slice(nextStart).trim();
  }

  return chunks;
}

// ---- Heading shortening for merged sections ----

/** Extract section number from heading like "### 3.6.16. Якщо зовнішня..." → "§ 3.6.16" */
function shortenHeading(heading: string): string {
  if (!heading) return '';
  // Strip markdown markers
  const clean = heading.replace(/^#+\s*/, '').trim();
  // Try to extract numbered prefix: "3.6.16. Text..." or "3.6.16 Text..."
  const numMatch = clean.match(/^((?:\d+\.)+\d*)\s*/);
  if (numMatch) return `§ ${numMatch[1].replace(/\.$/, '')}`;
  // Roman numerals: "II. Text..."
  const romanMatch = clean.match(/^([IIVVX]+)\.\s/);
  if (romanMatch) return `§ ${romanMatch[1]}`;
  // No number — first 50 chars
  return clean.length > 50 ? clean.slice(0, 50) + '…' : clean;
}

// ---- Section splitting by headings ----

/** Split text into semantic sections by headings */
function splitIntoSections(text: string): Array<{ heading: string; content: string }> {
  const lines = text.split('\n');
  const sections: Array<{ heading: string; content: string }> = [];

  // If document has markdown headings (mammoth DOCX output), use ONLY those as
  // section breaks. Numbered points (3.1.1, 3.3.5) are body text, not headings —
  // treating them as headings drops all single-line numbered points.
  const hasMarkdownHeadings = lines.some(l => /^#{1,3}\s+\S/.test(l));
  const isSectionBreak = hasMarkdownHeadings
    ? (line: string) => /^#{1,3}\s+\S/.test(line)
    : (line: string) => isHeadingLine(line);

  let currentHeading = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (isSectionBreak(line)) {
      const content = currentLines.join('\n').trim();
      if (content) {
        sections.push({ heading: currentHeading, content });
      } else if (currentHeading) {
        // Heading with no body (e.g. single-line numbered point used as heading
        // in plain-text docs) — preserve heading text as content
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

  // If no sections detected (flat text), treat whole document as one section
  if (sections.length === 0) {
    sections.push({ heading: '', content: text.trim() });
  }

  // Merge adjacent short sections (< 200 tokens) to avoid over-fragmentation
  // Heading strategy: shorten previous headings, keep last (most relevant) full
  const merged: Array<{ heading: string; content: string }> = [];
  for (const sec of sections) {
    const tokens = estimateTokens(sec.content);
    const prev = merged[merged.length - 1];
    const shouldMerge = prev && (
      (estimateTokens(prev.content) < 200 && tokens < 200) ||
      estimateTokens(prev.content) < 200
    );
    if (shouldMerge && prev) {
      // Shorten previous heading(s), keep current full
      if (prev.heading && sec.heading) {
        // prev.heading may already contain " > " from earlier merges
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

    // Split section into text segments and table segments
    const segments = splitIntoSegments(section.content);

    for (const segment of segments) {
      const startIdx = allChunks.length;

      if (segment.type === 'table') {
        // Table: keep whole or split by rows for huge tables
        allChunks.push(...chunkTable(segment.content, section.heading, startIdx));
      } else {
        // Text: standard token-based chunking with overlap
        allChunks.push(...splitTextIntoChunks(segment.content, section.heading, startIdx));
      }
    }
  }

  // Filter out garbage chunks (too short, or table of contents) and re-index
  const filtered = allChunks.filter(c =>
    c.tokenCount >= MIN_CHUNK_TOKENS && !isTableOfContents(c.content)
  );
  filtered.forEach((c, i) => { c.chunkIndex = i; });
  return filtered;
}

/** Build contextual content string for embedding.
 *  If AI contextual prefix is available, uses it for richer context.
 *  Falls back to template-based prefix otherwise.
 */
export interface DocMetaForEmbedding {
  doc_type?: string;
  doc_number?: string;
  parent_law?: string;    // e.g. "Закон 3543-XII — Про мобілізаційну підготовку та мобілізацію"
  related_acts?: string;  // e.g. "КМУ №76 (бронювання), КМУ №560 (призов)"
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
    // Contextual prefix already has AI-generated context — just add doc meta header
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
