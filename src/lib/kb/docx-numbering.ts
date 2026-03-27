/**
 * Extract auto-numbering from Word heading paragraphs.
 *
 * Word stores outline numbering in numbering.xml + per-paragraph <w:numPr>.
 * Mammoth drops this numbering, so we parse the DOCX XML directly
 * and return an ordered list of heading texts with their computed numbers.
 */

import JSZip from 'jszip';

export interface HeadingNumber {
  /** Heading text without number (as mammoth outputs it) */
  text: string;
  /** Computed number: "1.", "5.1.", "5.1.3." */
  number: string;
  /** Outline level: 0 = H1, 1 = H2, 2 = H3 */
  level: number;
}

/** Well-known Word heading style IDs (may vary per document) */
const HEADING_STYLE_NAMES = new Set([
  'heading 1', 'heading 2', 'heading 3',
  'heading 4', 'heading 5',
]);

/**
 * Parse DOCX and extract heading auto-numbering.
 * Returns ordered array of headings with their computed numbers.
 * Only includes headings that have <w:numPr> (auto-numbered).
 */
export async function extractHeadingNumbers(buffer: Buffer): Promise<HeadingNumber[]> {
  const zip = await JSZip.loadAsync(buffer);

  const docXml = await zip.file('word/document.xml')?.async('string');
  const stylesXml = await zip.file('word/styles.xml')?.async('string');
  if (!docXml || !stylesXml) return [];

  // 1. Build styleId → heading level map from styles.xml
  const headingStyleIds = buildHeadingStyleMap(stylesXml);
  if (headingStyleIds.size === 0) return [];

  // 2. Extract heading paragraphs from document.xml
  const paragraphs = docXml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
  const headings: Array<{ text: string; ilvl: number }> = [];

  for (const p of paragraphs) {
    const styleMatch = p.match(/<w:pStyle w:val="([^"]+)"/);
    if (!styleMatch || !headingStyleIds.has(styleMatch[1])) continue;

    // Must have numPr (auto-numbering)
    if (!p.includes('<w:numPr')) continue;

    const ilvlMatch = p.match(/<w:ilvl w:val="(\d+)"/);
    const ilvl = ilvlMatch ? parseInt(ilvlMatch[1], 10) : 0;

    const texts = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
    const text = texts.join('').trim();
    if (!text) continue;

    headings.push({ text, ilvl });
  }

  if (headings.length === 0) return [];

  // 3. Compute numbers using counters per level
  return computeNumbers(headings);
}

// ── Internal helpers ────────────────────────────────────────────────────────

function buildHeadingStyleMap(stylesXml: string): Set<string> {
  const ids = new Set<string>();
  const styles = stylesXml.match(/<w:style[\s\S]*?<\/w:style>/g) || [];
  for (const s of styles) {
    const nameMatch = s.match(/<w:name w:val="([^"]+)"/i);
    const idMatch = s.match(/w:styleId="([^"]+)"/);
    if (nameMatch && idMatch && HEADING_STYLE_NAMES.has(nameMatch[1].toLowerCase())) {
      ids.add(idMatch[1]);
    }
  }
  return ids;
}

function computeNumbers(headings: Array<{ text: string; ilvl: number }>): HeadingNumber[] {
  const counters = [0, 0, 0, 0, 0]; // up to 5 levels

  return headings.map(({ text, ilvl }) => {
    // Clamp to max tracked level
    const level = Math.min(ilvl, counters.length - 1);

    // Increment current level counter
    counters[level]++;

    // Reset all deeper level counters
    for (let i = level + 1; i < counters.length; i++) counters[i] = 0;

    // Build number string: "1.", "5.1.", "5.1.3."
    const parts: number[] = [];
    for (let i = 0; i <= level; i++) parts.push(counters[i]);
    const number = parts.join('.') + '.';

    return { text, number, level };
  });
}
