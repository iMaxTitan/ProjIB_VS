/**
 * Fill missing contextual prefixes for chunks that were skipped due to rate limits.
 * Processes chunks in small batches with delays to avoid Anthropic rate limits.
 *
 * Usage: npx tsx scripts/fill-missing-prefixes.ts
 *
 * Haiku 4.5 limits: 1K RPM, 450K input TPM.
 * Strategy: 10 concurrent calls, 3s pause between batches → ~200 RPM, safe margin.
 */

import './eval-env';
import { generateContextualPrefix } from '../src/lib/kb/contextual-prefix';
import { buildContextualContent, type DocMetaForEmbedding } from '../src/lib/kb/chunker';
import { embedBatch } from '../src/lib/kb/embedder';
import { createPostgrestClient } from '../src/lib/shared/postgrest-client';
import { config } from '../src/lib/shared/config';

const BATCH_SIZE = 10;        // concurrent AI calls per batch
const DELAY_BETWEEN_MS = 3000; // pause between batches

async function main() {
  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey, { auth: { persistSession: false } });

  // Find all chunks without structured prefix
  const { data: docs } = await db
    .from('kb_documents')
    .select('id, title, content, metadata, category_id')
    .eq('status', 'ready')
    .not('metadata->>doc_type', 'is', null);

  if (!docs?.length) { console.log('No documents found'); return; }

  // Load categories
  const catMap = new Map<string, string>();
  const { data: cats } = await db.from('kb_categories').select('id, name');
  if (cats) for (const c of cats as { id: string; name: string }[]) catMap.set(c.id, c.name);

  let totalFixed = 0;
  let totalSkipped = 0;

  for (const doc of docs as Array<{ id: string; title: string; content: string; metadata: Record<string, unknown>; category_id: string }>) {
    // Find chunks without structured prefix
    const { data: chunks } = await db
      .from('kb_chunks')
      .select('id, chunk_index, heading, content, contextual_prefix')
      .eq('document_id', doc.id)
      .order('chunk_index');

    if (!chunks?.length) continue;

    const missing = (chunks as Array<{ id: string; chunk_index: number; heading: string; content: string; contextual_prefix: string | null }>)
      .filter(c => !c.contextual_prefix || !c.contextual_prefix.includes('[Пошук:'));

    if (missing.length === 0) {
      totalSkipped++;
      continue;
    }

    console.log(`\n${doc.title.slice(0, 60)}... — ${missing.length} missing prefixes`);

    const docSummary = (doc.content || '').slice(0, 12000);
    const meta = doc.metadata as { doc_type?: string; doc_number?: string; parent_doc_id?: string };

    // Load parent law name for docMeta
    let docMeta: DocMetaForEmbedding | null = null;
    if (meta.doc_type) {
      docMeta = { doc_type: meta.doc_type, doc_number: meta.doc_number };
      if (meta.parent_doc_id) {
        const { data: parent } = await db.from('kb_documents').select('title, metadata').eq('id', meta.parent_doc_id).single();
        if (parent) {
          const p = parent as { title?: string; metadata?: Record<string, unknown> };
          const pNum = (p.metadata as Record<string, unknown>)?.doc_number || '';
          docMeta.parent_law = pNum ? `${pNum} — ${p.title}` : (p.title || '');
        }
      }
    }

    const catName = catMap.get(doc.category_id) || 'Юридичний';
    let batchFixed = 0;

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);

      // Generate prefixes
      const prefixResults = await Promise.all(
        batch.map(c => generateContextualPrefix(doc.title, docSummary, c.heading || '', c.content))
      );

      // Update chunks with new prefixes + re-embed
      for (let j = 0; j < batch.length; j++) {
        const prefix = prefixResults[j];
        if (!prefix || !prefix.includes('[Пошук:')) continue;

        // Rebuild contextual content and re-embed
        const contextual = buildContextualContent(catName, doc.title, batch[j].heading || '', batch[j].content, prefix, docMeta);
        const [embedding] = await embedBatch([contextual]);

        await db.from('kb_chunks').update({
          contextual_prefix: prefix,
          embedding: JSON.stringify(embedding),
        }).eq('id', batch[j].id);

        batchFixed++;
      }

      process.stdout.write(`  ${i + batch.length}/${missing.length} (fixed ${batchFixed})\r`);

      // Rate limit pause
      if (i + BATCH_SIZE < missing.length) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS));
      }
    }

    console.log(`  ✓ fixed ${batchFixed}/${missing.length}`);
    totalFixed += batchFixed;
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  Done: ${totalFixed} prefixes fixed, ${totalSkipped} docs skipped (already complete)`);
  console.log(`${'═'.repeat(50)}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
