/**
 * KB Chunker — table-aware splitting.
 * Markdown tables preserved whole or split by rows with header duplication.
 */

import type { Chunk } from './chunker';

const CHARS_PER_TOKEN = 2.5;
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Max tokens for a table chunk before splitting by rows */
const MAX_TABLE_TOKENS = 1500;

export function isTableLine(line: string): boolean {
  return line.trimStart().startsWith('|');
}

export function isTableCaption(line: string): boolean {
  return /^\*\*[^*]+\*\*$/.test(line.trim());
}

interface Segment {
  type: 'text' | 'table';
  content: string;
}

/**
 * Split section content into alternating text and markdown-table segments.
 * Table = consecutive lines starting with "|", optionally preceded by a bold caption.
 */
export function splitIntoSegments(content: string): Segment[] {
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
      let caption = '';
      if (textLines.length > 0 && isTableCaption(textLines[textLines.length - 1])) {
        caption = textLines.pop()!;
      }
      flushText();

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

/**
 * Split a large markdown table into chunks, duplicating header + separator in each.
 * Returns table as single chunk if within MAX_TABLE_TOKENS.
 */
export function chunkTable(tableContent: string, heading: string, startIdx: number): Chunk[] {
  if (estimateTokens(tableContent) <= MAX_TABLE_TOKENS) {
    return [{
      content: tableContent,
      heading,
      chunkIndex: startIdx,
      tokenCount: estimateTokens(tableContent),
    }];
  }

  const lines = tableContent.split('\n');

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
