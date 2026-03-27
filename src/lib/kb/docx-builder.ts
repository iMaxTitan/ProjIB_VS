/**
 * KB DOCX Builder — generates a valid .docx from Markdown-style text.
 *
 * Supported Markdown tokens:
 *   # Heading 1   -> Heading1 style
 *   ## Heading 2  -> Heading2 style
 *   ### Heading 3 -> Heading3 style
 *   | col | col | -> Word table (first row = header)
 *   | --- | --- | -> separator row (skipped)
 *   * text        -> list bullet paragraph
 *   **text**      -> bold inline
 *   regular text  -> Normal paragraph
 *
 * No new npm dependencies — uses already-installed PizZip.
 * XML template functions are in docx-templates.ts.
 */

import PizZip from 'pizzip';
import {
  contentTypesXml,
  relsXml,
  documentRelsXml,
  settingsXml,
  numberingXml,
  stylesXml,
  documentXml,
} from './docx-templates';

// ── XML helpers ──────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline: convert **bold** markers to <w:r> runs. */
function inlineRuns(text: string): string {
  const runs: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const boldStart = remaining.indexOf('**');
    if (boldStart < 0) {
      runs.push(`<w:r><w:t xml:space="preserve">${esc(remaining)}</w:t></w:r>`);
      break;
    }
    if (boldStart > 0) {
      runs.push(`<w:r><w:t xml:space="preserve">${esc(remaining.slice(0, boldStart))}</w:t></w:r>`);
    }
    const boldEnd = remaining.indexOf('**', boldStart + 2);
    if (boldEnd < 0) {
      runs.push(`<w:r><w:t xml:space="preserve">${esc(remaining.slice(boldStart))}</w:t></w:r>`);
      break;
    }
    const boldText = remaining.slice(boldStart + 2, boldEnd);
    runs.push(`<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(boldText)}</w:t></w:r>`);
    remaining = remaining.slice(boldEnd + 2);
  }
  return runs.join('');
}

function para(styleId: string | null, text: string): string {
  const pPr = styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : '';
  return `<w:p>${pPr}${inlineRuns(text)}</w:p>`;
}

function listPara(text: string): string {
  return (
    '<w:p>' +
    '<w:pPr><w:pStyle w:val="ListParagraph"/>' +
    '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' +
    inlineRuns(text) +
    '</w:p>'
  );
}

// ── Table builder ────────────────────────────────────────────────────────────

function parseTableRow(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

function buildTable(lines: string[]): string {
  const rows = lines.filter(l => !isSeparatorRow(l)).map(parseTableRow);
  if (rows.length === 0) return '';

  const colCount = Math.max(...rows.map(r => r.length));

  const tblCols = Array(colCount)
    .fill(0)
    .map(() => '<w:gridCol w:w="1800"/>')
    .join('');

  const headerRow = rows[0];
  const bodyRows = rows.slice(1);

  function buildRow(cells: string[], isHeader: boolean): string {
    const tcs = cells.map(cell => {
      const rPr = isHeader ? '<w:rPr><w:b/></w:rPr>' : '';
      return (
        '<w:tc>' +
        '<w:tcPr><w:tcBorders>' +
        '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '</w:tcBorders></w:tcPr>' +
        `<w:p><w:r>${rPr}<w:t xml:space="preserve">${esc(cell)}</w:t></w:r></w:p>` +
        '</w:tc>'
      );
    });
    return `<w:tr>${tcs.join('')}</w:tr>`;
  }

  return (
    '<w:tbl>' +
    `<w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>` +
    `<w:tblGrid>${tblCols}</w:tblGrid>` +
    buildRow(headerRow, true) +
    bodyRows.map(r => buildRow(r, false)).join('') +
    '</w:tbl>'
  );
}

// ── Markdown -> OOXML body ────────────────────────────────────────────────────

function markdownToBody(text: string): string {
  const lines = text.split('\n');
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    const h3m = trimmed.match(/^### (.+)/);
    const h2m = trimmed.match(/^## (.+)/);
    const h1m = trimmed.match(/^# (.+)/);

    if (h1m) { parts.push(para('Heading1', h1m[1])); i++; continue; }
    if (h2m) { parts.push(para('Heading2', h2m[1])); i++; continue; }
    if (h3m) { parts.push(para('Heading3', h3m[1])); i++; continue; }

    // Table block
    if (trimmed.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const tbl = buildTable(tableLines);
      if (tbl) parts.push(tbl);
      continue;
    }

    // Bullet
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ')) {
      parts.push(listPara(trimmed.slice(2).trim()));
      i++; continue;
    }

    // Empty line -> skip
    if (!trimmed) { i++; continue; }

    // Normal paragraph (strip leftover markdown bold markers to plain text)
    const plain = trimmed.replace(/\*\*([^*]+)\*\*/g, '$1');
    parts.push(para(null, plain));
    i++;
  }

  return parts.join('\n');
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a normalized .docx file from Markdown-style text.
 * If title is provided, inserts it as a Title-styled paragraph for roundtrip.
 * Returns a Buffer suitable for HTTP binary response.
 */
export function buildNormalizedDocx(markdownText: string, title?: string): Buffer {
  const titleParagraph = title ? para('Title', title) + '\n' : '';
  const body = titleParagraph + markdownToBody(markdownText);

  const zip = new PizZip();
  zip.file('[Content_Types].xml', contentTypesXml());
  zip.file('_rels/.rels', relsXml());
  zip.file('word/document.xml', documentXml(body));
  zip.file('word/_rels/document.xml.rels', documentRelsXml());
  zip.file('word/styles.xml', stylesXml());
  zip.file('word/numbering.xml', numberingXml());
  zip.file('word/settings.xml', settingsXml());

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
