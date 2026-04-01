/**
 * Re-chunk internal documents (IT, IB, HR) that were imported before
 * the prefix pipeline overhaul.
 *
 * Takes existing content from kb_documents and re-processes it:
 *   delete old chunks → re-chunk → AI prefixes (L1/L2) → embed → store
 *
 * Run (local with SSH tunnel):
 *   ssh -i ~/.ssh/id_nas -L 3000:localhost:3000 root@46.225.234.164 -N
 *   npx tsx scripts/rechunk-internal-docs.ts
 *
 * Run (on dev VPS):
 *   cd /opt/cs-dev && DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/rechunk-internal-docs.ts
 */

import './eval-env';
import { processFromMarkdown } from '../src/lib/kb/processor';
import { createPostgrestClient } from '../src/lib/shared/postgrest-client';
import { config } from '../src/lib/shared/config';

const DELAY_BETWEEN_DOCS_MS = 3000;

/** Categories to re-process. */
const TARGET_CATEGORIES = ['Інформаційна безпека', 'IT', 'HR'];

async function main() {
  if (!config.db.serverUrl) {
    console.error('POSTGREST_URL not set. Use eval-env.ts or set env vars.');
    process.exit(1);
  }

  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Load category map
  const catMap = new Map<string, string>();
  const { data: cats } = await db.from('kb_categories').select('id, name');
  if (!cats || cats.length === 0) {
    console.error('No categories found.');
    process.exit(1);
  }
  for (const c of cats as { id: string; name: string }[]) catMap.set(c.id, c.name);

  // Find category IDs for target categories
  const targetCatIds = [...catMap.entries()]
    .filter(([, name]) => TARGET_CATEGORIES.includes(name))
    .map(([id]) => id);

  if (targetCatIds.length === 0) {
    console.error(`Categories not found: ${TARGET_CATEGORIES.join(', ')}`);
    process.exit(1);
  }

  console.log(`Target categories: ${targetCatIds.map(id => catMap.get(id)).join(', ')}`);

  // Load documents from target categories
  const { data: docs } = await db
    .from('kb_documents')
    .select('id, title, content, category_id, chunk_count, metadata')
    .in('category_id', targetCatIds)
    .eq('status', 'ready')
    .order('created_at');

  if (!docs || docs.length === 0) {
    console.log('No documents found.');
    return;
  }

  type Doc = {
    id: string; title: string; content: string;
    category_id: string; chunk_count: number; metadata: Record<string, unknown>;
  };

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Re-chunk ${docs.length} internal documents (IT/IB/HR)`);
  console.log(`  Pipeline: existing content → chunk → AI prefix → embed → DB`);
  console.log(`${'═'.repeat(60)}\n`);

  let ok = 0;
  let fail = 0;

  for (const doc of docs as Doc[]) {
    const catName = catMap.get(doc.category_id) || 'Загальне';
    const shortTitle = doc.title.length > 55 ? doc.title.slice(0, 55) + '…' : doc.title;

    console.log(`\n── [${ok + fail + 1}/${docs.length}] ${shortTitle} ──`);
    console.log(`  Category: ${catName}, old chunks: ${doc.chunk_count}, content: ${doc.content.length} chars`);

    if (!doc.content || doc.content.length < 100) {
      console.log(`  ✗ Skip — content too short (${doc.content?.length || 0} chars)`);
      fail++;
      continue;
    }

    try {
      // Set status to processing
      await db.from('kb_documents').update({
        status: 'processing',
        updated_at: new Date().toISOString(),
      }).eq('id', doc.id);

      // Re-process: deletes old chunks, re-chunks, generates prefixes, embeds
      const result = await processFromMarkdown(doc.id, doc.content, doc.title, catName);

      console.log(`  ✓ ${doc.chunk_count} → ${result.chunkCount} chunks`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ Error: ${msg.slice(0, 200)}`);
      // Restore status
      await db.from('kb_documents').update({ status: 'ready' }).eq('id', doc.id).catch(() => {});
      fail++;
    }

    // Delay between documents
    if (ok + fail < docs.length) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_DOCS_MS));
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Done: ${ok} ok, ${fail} failed (out of ${docs.length})`);
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
