/**
 * KB synthesis — Stage 3: Render HTML with footnotes.
 * Also: document name shortening, hallucination stripping, source mapping.
 */

import logger from '@/lib/shared/logger';
import type { KBChunk } from './query-translator';
import type { ExtractedFact } from './synth-extract';
import type { SynthesisResult } from './synthesizer';

// ── Short document names ────────────────────────────────────────────────────────

const SHORT_NAMES: [RegExp, string][] = [
  [/Про мобілізаційну підготовку/i, 'Закон про мобілізацію'],
  [/Про захист прав споживачів/i, 'Закон про захист споживачів'],
  [/Податковий кодекс/i, 'Податковий кодекс'],
  [/Кодекс законів про працю/i, 'Кодекс законів про працю'],
  [/Конституція/i, 'Конституція України'],
  [/Конвенція про кіберзлочинність/i, 'Конвенція про кіберзлочинність'],
  [/Про основні засади.*кібербезпеки/i, 'Закон про кібербезпеку'],
  [/Про захист інформації/i, 'Закон про захист інформації'],
  [/Про захист персональних даних/i, 'Закон про персональні дані'],
  [/Про інформацію/i, 'Закон про інформацію'],
  [/Деякі питання реалізації положень Закону.*бронювання/i, 'Постанова КМУ №76'],
  [/Деякі питання бронювання/i, 'Постанова КМУ №1608'],
  [/Питання проведення призову/i, 'Постанова КМУ №560'],
  [/Порядку? організації та ведення військового обліку/i, 'Постанова КМУ №1487'],
  [/Про затвердження Правил надання.*електронних/i, 'Постанова КМУ №761'],
  [/Про затвердження Порядку гарантійного/i, 'Постанова КМУ №1251'],
  [/Про затвердження Правил побутового/i, 'Постанова КМУ №614'],
  [/Про затвердження Критеріїв/i, 'Наказ МОУ №722'],
  [/КМУ\s*№?\s*76\b/i, 'Постанова КМУ №76'],
  [/КМУ\s*№?\s*1608\b/i, 'Постанова КМУ №1608'],
  [/КМУ\s*№?\s*560\b/i, 'Постанова КМУ №560'],
  [/КМУ\s*№?\s*1487\b/i, 'Постанова КМУ №1487'],
];

function shortenDocName(name: string): string {
  for (const [pattern, short] of SHORT_NAMES) {
    if (pattern.test(name)) return short;
  }
  let s = name.replace(/^Про затвердження\s+/i, '');
  if (s.length > 80) s = s.slice(0, 77) + '…';
  return s;
}

// ── Post-processing ─────────────────────────────────────────────────────────────

const HALLUCINATION_RX = [
  /рекоменду[єю]\w*\s+звернути(ся|сь)/i,
  /радим[оу]\s+звернути(ся|сь)/i,
  /раджу\s+звернути(ся|сь)/i,
  /можна\s+звернути(ся|сь)\s+до/i,
  /зверніться\s+до\s+\*{0,2}[А-ЯІЇЄ]/i,
  /звертайтеся\s+до/i,
];

function stripHallucinations(text: string): string {
  const paras = text.split('\n\n');
  const clean = paras.filter(p => !HALLUCINATION_RX.some(rx => rx.test(p)));
  if (clean.length < paras.length) logger.prod('[kb/synth] stripped hallucinated paragraph(s)');
  return clean.join('\n\n');
}

function sanitizeHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, '<i>$1</i>')
    .replace(/^[\s]*[-—–]\s+/gm, '• ')
    .replace(/^•\s*•\s*/gm, '• ')
    .replace(/\n{3,}/g, '\n\n');
}

// ── Superscript ─────────────────────────────────────────────────────────────────

const SUPER = '¹²³⁴⁵⁶⁷⁸⁹';
const toSuper = (n: number): string =>
  String(n).split('').map(d => SUPER[+d - 1] || d).join('');

// ── Source mapping ──────────────────────────────────────────────────────────────

interface DocInfo { url: string; title: string; isLaw: boolean }

export async function loadDocInfoMap(chunks: KBChunk[]): Promise<Map<string, DocInfo>> {
  const docIds = [...new Set(chunks.map(c => c.document_id))];
  const map = new Map<string, DocInfo>();
  if (!docIds.length) return map;
  const { getServerDb } = await import('@/lib/shared/db-server');
  const db = getServerDb();
  const { data } = await db.from('kb_documents').select('id, title, metadata').in('id', docIds);
  if (data && Array.isArray(data)) {
    for (const d of data as { id: string; title: string; metadata?: Record<string, unknown> }[]) {
      const url = (d.metadata?.source_url as string) || '';
      const docType = (d.metadata?.doc_type as string) || '';
      map.set(d.id, { url, title: d.title, isLaw: Boolean(docType) });
    }
  }
  return map;
}

export function buildFactsBlock(
  facts: ExtractedFact[],
  chunks: KBChunk[],
  docInfoMap: Map<string, DocInfo>,
): { text: string; sourceMap: Map<number, { title: string; url: string; shortName: string }> } {
  const sourceMap = new Map<number, { title: string; url: string; shortName: string }>();
  const titleToNum = new Map<string, number>();
  let nextNum = 1;

  for (const fact of facts) {
    const chunk = chunks[fact.fragment - 1];
    if (!chunk) continue;
    const info = docInfoMap.get(chunk.document_id);
    const title = info?.title || chunk.document_title;
    const shortName = shortenDocName(title);
    if (!titleToNum.has(shortName)) {
      titleToNum.set(shortName, nextNum);
      sourceMap.set(nextNum, { title, url: info?.url || '', shortName });
      nextNum++;
    }
  }

  const lines = facts.map(f => {
    const chunk = chunks[f.fragment - 1];
    const info = chunk ? docInfoMap.get(chunk.document_id) : undefined;
    const title = info?.title || chunk?.document_title || '';
    const shortName = shortenDocName(title);
    const num = titleToNum.get(shortName) || f.fragment;
    const ref = f.ref ? ` (${f.ref})` : '';
    return `• ${f.text}${ref} [${num}]`;
  });

  return { text: lines.join('\n'), sourceMap };
}

// ── Render ──────────────────────────────────────────────────────────────────────

export function renderWithFootnotes(
  text: string,
  sourceMap: Map<number, { title: string; url: string; shortName: string }>,
): string {
  let body = stripHallucinations(sanitizeHtml(text));

  body = body.replace(/\[(\d+)\]/g, (_match, n) => toSuper(Number(n)));
  body = body.replace(/\s*\(ref\)/gi, '');

  if (sourceMap.size > 0) {
    const lines = [...sourceMap.entries()]
      .filter(([, v], i, arr) => arr.findIndex(([, x]) => x.shortName === v.shortName) === i)
      .map(([num, info]) =>
        info.url
          ? `${toSuper(num)} <a href="${info.url}">${info.shortName}</a>`
          : `${toSuper(num)} ${info.shortName}`,
      );
    body += '\n\n---\n\n' + lines.join('\n');
  }

  return body;
}

// ── No-key fallback ─────────────────────────────────────────────────────────────

export function renderRawChunks(chunks: KBChunk[]): SynthesisResult {
  const parts = chunks.map(c => {
    const header = `📄 <b>${c.document_title}</b>` + (c.heading ? `\n<i>${c.heading}</i>` : '');
    const body = c.content.length > 350 ? c.content.slice(0, 350) + '…' : c.content;
    return `${header}\n${body}`;
  });
  return { text: parts.join('\n\n'), cost: 0, promptTokens: 0, completionTokens: 0, model: 'none' };
}
