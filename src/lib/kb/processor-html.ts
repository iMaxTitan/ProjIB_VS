/**
 * KB Processor — HTML helpers for mammoth output conversion.
 * Extracted from processor.ts to keep file sizes under 300 lines.
 */

export function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .trim();
}

export function htmlTableToMarkdown(tableHtml: string): string {
  const rows: string[][] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const cells: string[] = [];
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      cells.push(stripTags(tdMatch[1]).replace(/\s+/g, ' ').trim());
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return '';
  const header = `| ${rows[0].join(' | ')} |`;
  const separator = `| ${rows[0].map(() => '---').join(' | ')} |`;
  const body = rows.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n');
  return [header, separator, ...(body ? [body] : [])].join('\n');
}

/**
 * Detect bold-only headings when document lacks Word Heading styles.
 * Converts `<p><strong>short text</strong></p>` → `<h1>`/`<h2>` tags.
 * Called ONLY when mammoth output has no `<h1>`/`<h2>`/`<h3>`.
 */
export function detectBoldHeadings(html: string): { html: string; headingsDetected: boolean } {
  let count = 0;
  const result = html.replace(
    /<p>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>/gi,
    (match, inner: string) => {
      const text = stripTags(inner).trim();
      if (!text || text.length > 120) return match;
      // Skip page-number lines (tab/dots + digits at end)
      if (/[\t.][\s]*\d{1,3}\s*$/.test(text)) return match;
      // Skip sentences (period followed by uppercase letter)
      if (/\.\s+[А-ЯІЇЄҐA-Z]/.test(text)) return match;
      count++;
      // H2 if numbered like X.Y, H1 otherwise
      return /^\d{1,2}\.\d/.test(text)
        ? `<h2>${inner}</h2>`
        : `<h1>${inner}</h1>`;
    },
  );
  return { html: result, headingsDetected: count > 0 };
}

/** Convert mammoth HTML output to markdown-style plain text with heading markers */
export function htmlToText(html: string): string {
  return html
    // Tables -> Markdown (before stripping tags)
    .replace(/<table[\s\S]*?<\/table>/gi, (t) => '\n' + htmlTableToMarkdown(t) + '\n')
    // Headings -> # markers
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `# ${stripTags(t)}\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `## ${stripTags(t)}\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `### ${stripTags(t)}\n`)
    // List items
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `• ${stripTags(t)}\n`)
    // Paragraphs -> newlines
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `${stripTags(t)}\n`)
    // Line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode remaining entities
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}
