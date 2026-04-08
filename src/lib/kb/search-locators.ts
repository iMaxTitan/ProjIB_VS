/**
 * KB Search locators — deterministic pre-search handlers.
 * Meta-query (list documents) and legal locator (exact article lookup).
 * Extracted from search.ts to respect 300-line limit.
 */

import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import logger from '@/lib/shared/logger';
import type { KBChunk } from './query-translator';
import type { KBSearchResult } from './search';

// ── Meta-query handler — list available documents ────────────────────────────

const META_QUERY_PATTERN = /як[іi]\s+(закон|документ|нормативн|акт)|які\s+є\s+(закон|документ)|перелік\s+(закон|документ)|список\s+(закон|документ)|что\s+есть\s+в\s+базе|какие\s+(законы|документы)|что\s+содержит/i;

export async function handleMetaQuery(
  query: string, db: PostgrestClient,
): Promise<KBSearchResult | null> {
  if (!META_QUERY_PATTERN.test(query)) return null;

  const { data } = await db
    .from('kb_documents')
    .select('title, category_id')
    .eq('status', 'ready')
    .order('title');

  if (!data?.length) return null;

  const { data: cats } = await db.from('kb_categories').select('id, name');
  const catMap = new Map((cats as Array<{ id: string; name: string }> || []).map(c => [c.id, c.name]));

  const groups = new Map<string, string[]>();
  for (const doc of data as Array<{ title: string; category_id: string }>) {
    const cat = catMap.get(doc.category_id) || 'Інше';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(doc.title);
  }

  // Deduplicate titles within each category
  for (const [cat, titles] of groups) {
    groups.set(cat, [...new Set(titles)]);
  }

  const lines: string[] = ['<b>Документи в базі знань:</b>\n'];
  for (const [cat, titles] of groups) {
    lines.push(`\n<b>${cat}</b> (${titles.length}):`);
    for (const t of titles.slice(0, 30)) {
      lines.push(`• ${t}`);
    }
    if (titles.length > 30) lines.push(`<i>... та ще ${titles.length - 30}</i>`);
  }
  lines.push(`\n<i>Всього: ${(data as unknown[]).length} документів</i>`);

  return { text: lines.join('\n'), parseMode: 'HTML' };
}

// ── Legal locator — deterministic lookup by article number ───────────────────

const LEGAL_LOCATOR_PATTERN = /(?:стаття|ст\.?)\s*(\d+(?:\.\d+)?)/i;
const LEGAL_ACT_ALIASES: Array<[RegExp, string]> = [
  [/КЗпП/i, 'Кодекс законів про працю'],
  [/ПКУ|податков/i, 'Податковий кодекс'],
  [/ЦКУ|цивільн\w*\s*кодекс/i, 'Цивільний кодекс'],
  [/ККУ|криміналь\w*\s*кодекс/i, 'Кримінальний кодекс'],
  [/ГКУ|господарськ\w*\s*кодекс/i, 'Господарський кодекс'],
  [/конституці/i, 'Конституція'],
  [/про інформацію(?!\s+для)/i, 'Про інформацію'],
  [/про захист прав споживач/i, 'Про захист прав споживачів'],
  [/про захист персональних/i, 'Про захист персональних даних'],
  [/про мобілізаці/i, 'Про мобілізаційну підготовку'],
  [/про охорону праці/i, 'Про охорону праці'],
  [/про кібербезпек/i, 'Про основні засади забезпечення кібербезпеки'],
  [/постанов[іиа]?\s*(?:кму?\s*)?\s*№?\s*(\d+)/i, ''],
];

export async function legalLocator(query: string, db: PostgrestClient): Promise<KBChunk[]> {
  const artMatch = query.match(LEGAL_LOCATOR_PATTERN);
  if (!artMatch) return [];

  const artNum = artMatch[1];
  const headingPattern = `%Стаття ${artNum}.%`;

  // Try to identify the specific law/act
  let docTitlePattern: string | null = null;
  for (const [pattern, alias] of LEGAL_ACT_ALIASES) {
    if (pattern.test(query)) {
      if (alias) {
        docTitlePattern = `%${alias}%`;
      } else {
        const pMatch = query.match(/постанов[іиа]?\s*(?:кму?\s*)?\s*№?\s*(\d+)/i);
        if (pMatch) docTitlePattern = `%${pMatch[1]}%`;
      }
      break;
    }
  }

  // Build query: chunks with matching heading + optional doc title filter
  let q = db.from('kb_chunks')
    .select('id, document_id, chunk_index, content, heading, token_count, contextual_prefix, scope, search_terms, semantic_summary, prefix_status, prefix_cache_key')
    .ilike('heading', headingPattern);

  if (docTitlePattern) {
    const { data: docIds } = await db.from('kb_documents')
      .select('id')
      .ilike('title', docTitlePattern)
      .eq('status', 'ready');
    if (docIds?.length) {
      q = q.in('document_id', (docIds as Array<{ id: string }>).map(d => d.id));
    }
  }

  const { data, error } = await q.limit(3);
  if (error || !data?.length) return [];

  // Enrich with document_title and category_name
  const docIds = [...new Set((data as Array<{ document_id: string }>).map(d => d.document_id))];
  const { data: docs } = await db.from('kb_documents').select('id, title, category_id').in('id', docIds);
  const docMap = new Map((docs as Array<{ id: string; title: string; category_id: string }> || []).map(d => [d.id, d]));

  const { data: cats } = await db.from('kb_categories').select('id, name');
  const catMap = new Map((cats as Array<{ id: string; name: string }> || []).map(c => [c.id, c.name]));

  const chunks = (data as Array<Record<string, unknown>>).map(row => {
    const doc = docMap.get(row.document_id as string);
    return {
    chunk_id: row.id as string,
    document_id: row.document_id as string,
    document_title: doc?.title || '',
    category_name: catMap.get(doc?.category_id || '') || '',
    chunk_index: row.chunk_index as number,
    content: row.content as string,
    heading: row.heading as string,
    token_count: row.token_count as number,
    contextual_prefix: (row.contextual_prefix as string) || '',
    scope: (row.scope as string) || 'general',
    search_terms: (row.search_terms as string[]) || [],
    semantic_summary: (row.semantic_summary as string) || '',
    prefix_status: (row.prefix_status as string) || '',
    similarity: 0.99, // High priority — exact match
  };
  });

  logger.prod('[kb/search] legal-locator: found', chunks.length, 'for art.', artNum,
    docTitlePattern ? `in ${docTitlePattern}` : '(any doc)');

  return chunks as unknown as KBChunk[];
}
