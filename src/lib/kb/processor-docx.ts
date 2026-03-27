/**
 * DOCX parser — mammoth-based with Word style mappings.
 * Handles Ukrainian/English heading styles, Title/Subtitle metadata,
 * bold heading fallback, and auto-numbering restoration.
 */

import { stripTags, htmlToText, detectBoldHeadings } from './processor-html';
import { extractHeadingNumbers } from './docx-numbering';

export interface StyleMetadata {
  title: string | null;
  subtitle: string | null;
}

export interface ParsedDocument {
  body: string;
  styleMetadata: StyleMetadata;
  headingsFromStyles: boolean;
}

export async function parseDOCX(buffer: Buffer): Promise<ParsedDocument> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth = (await import('mammoth')) as any;
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: [
        "p[style-name='Заголовок 1'] => h1:fresh",
        "p[style-name='Заголовок 2'] => h2:fresh",
        "p[style-name='Заголовок 3'] => h3:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Title'] => p.doc-title:fresh",
        "p[style-name='Subtitle'] => p.doc-subtitle:fresh",
        "p[style-name='Назва'] => p.doc-title:fresh",
        "p[style-name^='TOC'] => !",
        "p[style-name^='toc'] => !",
        "p[style-name='Зміст 1'] => !",
        "p[style-name='Зміст 2'] => !",
        "p[style-name='Зміст 3'] => !",
      ],
    },
  );

  const html = result.value as string;

  const titleMatches = [...html.matchAll(/<p class="doc-title">([\s\S]*?)<\/p>/gi)];
  const subtitleMatch = html.match(/<p class="doc-subtitle">([\s\S]*?)<\/p>/i);

  const title = titleMatches.length > 0
    ? titleMatches.map(m => stripTags(m[1]).trim()).filter(Boolean).join(' ')
    : null;
  const subtitle = subtitleMatch ? stripTags(subtitleMatch[1]).trim() : null;

  const cleanHtml = html
    .replace(/<p class="doc-title">[\s\S]*?<\/p>/gi, '')
    .replace(/<p class="doc-subtitle">[\s\S]*?<\/p>/gi, '');

  const hasStyleHeadings = /<h[1-3]\b/i.test(cleanHtml);
  const finalHtml = hasStyleHeadings ? cleanHtml : detectBoldHeadings(cleanHtml).html;

  let body = htmlToText(finalHtml);

  if (hasStyleHeadings) {
    body = await applyHeadingNumbers(buffer, body);
  }

  return {
    body,
    styleMetadata: { title: title || null, subtitle: subtitle || null },
    headingsFromStyles: hasStyleHeadings,
  };
}

async function applyHeadingNumbers(buffer: Buffer, markdown: string): Promise<string> {
  let headingNumbers;
  try {
    headingNumbers = await extractHeadingNumbers(buffer);
  } catch { return markdown; }
  if (headingNumbers.length === 0) return markdown;

  const queue = [...headingNumbers];
  let qi = 0;

  return markdown.split('\n').map(line => {
    if (qi >= queue.length) return line;
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (!match) return line;
    const headingText = match[2].trim();
    const entry = queue[qi];
    if (normalize(headingText) === normalize(entry.text)) {
      qi++;
      if (/^\d+\./.test(headingText)) return line;
      return `${match[1]} ${entry.number} ${headingText}`;
    }
    return line;
  }).join('\n');
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\u00A0]+/g, ' ').trim();
}
