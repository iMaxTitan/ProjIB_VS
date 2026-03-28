/**
 * Test reindex of ONE law document through the full pipeline.
 * Usage: npx tsx scripts/reindex-one-law.ts "76-2023-п"
 *
 * Pipeline: law-fetcher → processFromMarkdown → chunks + AI prefixes + embeddings
 */

import './eval-env';
import { processFromMarkdown } from '../src/lib/kb/processor';
import { fetchLaw } from '../src/lib/ops/laws/fetcher-client';
import { createPostgrestClient } from '../src/lib/shared/postgrest-client';
import { config } from '../src/lib/shared/config';

const docNumber = process.argv[2] || '76-2023-п';

function detectDocType(num: string, current: string): string {
  const n = num.toLowerCase().trim();
  if (n.endsWith('-п') || n.includes('-п/')) return 'Постанова КМУ';
  if (n.endsWith('-р') || n.includes('-р/')) return 'Розпорядження КМУ';
  if (/[IVXLC]{2,}/.test(n)) return 'Закон України';
  return current;
}

async function main() {
  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey, { auth: { persistSession: false } });

  // Find document by doc_number in metadata
  const { data: docs } = await db
    .from('kb_documents')
    .select('id, title, metadata, category_id')
    .eq('metadata->>doc_number', docNumber);

  if (!docs?.length) {
    console.error(`Document with doc_number "${docNumber}" not found`);
    process.exit(1);
  }

  const doc = (docs as Array<{ id: string; title: string; metadata: Record<string, unknown>; category_id: string }>)[0];
  const meta = doc.metadata as { doc_type: string; doc_number: string; source_url: string };

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Test reindex: ${meta.doc_number}`);
  console.log(`  Title: ${doc.title}`);
  console.log(`  Source: ${meta.source_url}`);
  console.log(`${'═'.repeat(60)}\n`);

  // 1. Fetch via law-fetcher
  console.log('1. Fetching via law-fetcher...');
  const fetched = await fetchLaw(meta.source_url);
  console.log(`   ✓ ${fetched.charCount} chars, ${fetched.lineCount} lines`);
  console.log(`   Title: ${fetched.title}`);
  console.log(`   Preview: ${fetched.markdown.slice(0, 200)}...\n`);

  // 2. Fix doc_type
  const fixedType = detectDocType(meta.doc_number, meta.doc_type);
  if (fixedType !== meta.doc_type) {
    console.log(`2. doc_type fix: "${meta.doc_type}" → "${fixedType}"`);
  } else {
    console.log(`2. doc_type OK: "${meta.doc_type}"`);
  }

  // 3. Build markdown with header
  const title = fetched.title || doc.title;
  const date = new Date().toISOString().split('T')[0];
  const header = [
    `> **Тип:** ${fixedType}`,
    `> **Номер:** ${meta.doc_number}`,
    `> **Редакція:** актуальна станом на ${date}`,
    `> **Джерело:** ${meta.source_url}`,
  ].join('\n');

  let md = fetched.markdown;
  const titleMatch = md.match(/^# .+/);
  if (titleMatch) {
    md = md.replace(/^# .+/, `${titleMatch[0]}\n\n${header}`);
  } else {
    md = `# ${title}\n\n${header}\n\n${md}`;
  }

  // Show heading structure
  const headings = md.split('\n').filter(l => /^#{1,3}\s/.test(l));
  console.log(`\n3. Markdown structure: ${headings.length} headings`);
  for (const h of headings.slice(0, 10)) {
    console.log(`   ${h.slice(0, 80)}`);
  }
  if (headings.length > 10) console.log(`   ... and ${headings.length - 10} more`);

  // Check for numbered paragraphs (legal docs without Стаття)
  const numberedLines = md.split('\n').filter(l => /^\d{1,3}\.\s+\S/.test(l));
  console.log(`   Numbered paragraphs: ${numberedLines.length}`);
  if (numberedLines.length > 0) {
    console.log(`   First: ${numberedLines[0].slice(0, 80)}`);
  }

  // 4. Update metadata
  console.log(`\n4. Updating metadata...`);
  await db.from('kb_documents').update({
    title,
    status: 'processing',
    metadata: { ...meta, doc_type: fixedType, fetched_at: date },
    updated_at: new Date().toISOString(),
  }).eq('id', doc.id);

  // 5. Get category name
  const { data: cat } = await db.from('kb_categories').select('name').eq('id', doc.category_id).single();
  const catName = (cat as { name: string } | null)?.name || 'Юридичний';

  // 6. Process!
  console.log(`\n5. Processing (chunk → prefix → embed)...`);
  const start = Date.now();
  const result = await processFromMarkdown(doc.id, md, title, catName);
  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`   ✓ ${result.chunkCount} chunks in ${elapsed}s`);

  // 7. Verify — sample chunks
  console.log(`\n6. Verifying chunks in DB...`);
  const { data: chunks } = await db
    .from('kb_chunks')
    .select('chunk_index, heading, token_count, contextual_prefix')
    .eq('document_id', doc.id)
    .order('chunk_index')
    .limit(10);

  if (chunks) {
    for (const c of chunks as Array<{ chunk_index: number; heading: string; token_count: number; contextual_prefix: string | null }>) {
      const prefixPreview = c.contextual_prefix
        ? c.contextual_prefix.slice(0, 100).replace(/\n/g, ' ')
        : '(no prefix)';
      console.log(`   [${c.chunk_index}] h="${(c.heading || '').slice(0, 50)}" t=${c.token_count} p=${prefixPreview}`);
    }
  }

  // Count unique headings
  const { data: allChunks } = await db
    .from('kb_chunks')
    .select('heading')
    .eq('document_id', doc.id);
  if (allChunks) {
    const uniqueHeadings = new Set((allChunks as Array<{ heading: string | null }>).map(c => c.heading));
    console.log(`\n   Unique headings: ${uniqueHeadings.size} (was 1-2 before)`);
  }

  // Count prefixes with [Пошук:]
  const { data: prefixCount } = await db
    .from('kb_chunks')
    .select('id')
    .eq('document_id', doc.id)
    .like('contextual_prefix', '%[Пошук:%');
  console.log(`   Structured prefixes: ${prefixCount?.length ?? 0}/${result.chunkCount}`);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Done! ${result.chunkCount} chunks, ${elapsed}s`);
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
