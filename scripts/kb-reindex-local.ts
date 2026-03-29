/**
 * Local reindex script — prefix-pipeline (L1/L2 cascade).
 *
 *   npx tsx scripts/kb-reindex-local.ts                          — all docs, skip ok chunks
 *   npx tsx scripts/kb-reindex-local.ts --ids ID1 ID2            — specific documents
 *   npx tsx scripts/kb-reindex-local.ts --force-prefix           — regenerate ALL prefixes
 *   npx tsx scripts/kb-reindex-local.ts --retry-failed           — only fallback/needs_review chunks
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env', override: true });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { buildContextualContent } = await import('../src/lib/kb/chunker');
  const { embedBatch } = await import('../src/lib/kb/embedder');
  const { generateChunkPrefix } = await import('../src/lib/kb/prefix-pipeline');
  const { config } = await import('../src/lib/shared/config');
  const { createPostgrestClient } = await import('../src/lib/shared/postgrest-client');

  if (!config.db.serverUrl || !config.db.serviceRoleKey) {
    console.error('Missing DB config'); process.exit(1);
  }

  const FORCE = process.argv.includes('--force-prefix');
  const RETRY_FAILED = process.argv.includes('--retry-failed');
  const idsIdx = process.argv.indexOf('--ids');
  const IDS: string[] = idsIdx >= 0 ? process.argv.slice(idsIdx + 1).filter(a => !a.startsWith('--')) : [];

  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey);

  // Find chunks to process
  let chunkQuery = db
    .from('kb_chunks')
    .select('id, document_id, chunk_index, content, heading, token_count, contextual_prefix, prefix_status, prefix_cache_key')
    .order('document_id')
    .order('chunk_index');

  if (RETRY_FAILED) {
    // Only fallback and needs_review chunks
    chunkQuery = chunkQuery.in('prefix_status', ['fallback', 'needs_review']);
    if (IDS.length) chunkQuery = chunkQuery.in('document_id', IDS);
  } else if (IDS.length) {
    chunkQuery = chunkQuery.in('document_id', IDS);
  }

  const { data: allChunks, error: chErr } = await chunkQuery as {
    data: Array<{ id: string; document_id: string; chunk_index: number; content: string; heading: string; token_count: number; contextual_prefix: string | null; prefix_status: string | null; prefix_cache_key: string | null }> | null;
    error: unknown;
  };

  if (chErr || !allChunks?.length) {
    console.error(RETRY_FAILED ? 'No failed chunks to retry' : 'No chunks found');
    process.exit(0);
  }

  // Load doc titles and categories
  const docIds = [...new Set(allChunks.map(c => c.document_id))];
  const { data: docs } = await db.from('kb_documents').select('id, title, category_id').in('id', docIds) as { data: Array<{ id: string; title: string; category_id: string }> | null };
  const docMap = new Map((docs ?? []).map(d => [d.id, d]));

  const { data: cats } = await db.from('kb_categories').select('id, name, slug');
  const catMap = new Map((cats ?? []).map((c: { id: string; name: string; slug?: string }) => [c.id, { name: c.name, slug: c.slug || '' }]));

  const mode = RETRY_FAILED ? 'RETRY FAILED' : FORCE ? 'FORCE ALL' : 'NORMAL';
  console.log(`\n  [${mode}] ${allChunks.length} chunks across ${docIds.length} documents\n`);

  // Group by document
  const byDoc = new Map<string, typeof allChunks>();
  for (const chunk of allChunks) {
    const list = byDoc.get(chunk.document_id) || [];
    list.push(chunk);
    byDoc.set(chunk.document_id, list);
  }

  let total = { processed: 0, ok: 0, review: 0, fallback: 0, l1: 0, l2: 0, skipped: 0 };

  for (const [docId, chunks] of byDoc) {
    const doc = docMap.get(docId);
    if (!doc) continue;
    const cat = catMap.get(doc.category_id) || { name: 'Загальне', slug: 'general' };
    const domain = cat.slug || 'general';

    // Filter chunks to process
    const toProcess = FORCE
      ? chunks
      : RETRY_FAILED
        ? chunks.filter(c => c.prefix_status === 'fallback' || c.prefix_status === 'needs_review')
        : chunks.filter(c => !c.contextual_prefix);

    if (toProcess.length === 0) {
      total.skipped += chunks.length;
      continue;
    }

    process.stdout.write(`  📄 ${doc.title.slice(0, 50)}... (${toProcess.length}/${chunks.length})`);

    try {
      // Generate prefixes one by one (for retry-failed, not batch)
      const BATCH = 8;
      let stats = { ok: 0, review: 0, fallback: 0, l1: 0, l2: 0 };

      for (let i = 0; i < toProcess.length; i += BATCH) {
        const batch = toProcess.slice(i, i + BATCH);

        // Generate prefixes
        const prefixes = await Promise.all(
          batch.map(c => generateChunkPrefix(c.content, c.heading || '', doc.title, domain))
        );

        // Embed
        const contents = batch.map((c, j) =>
          buildContextualContent(cat.name, doc.title, c.heading || '', c.content, prefixes[j]?.prefixText || undefined));
        const embeddings = await embedBatch(contents);

        // Update
        for (let j = 0; j < batch.length; j++) {
          const p = prefixes[j];
          const { error: upErr } = await db.from('kb_chunks').update({
            embedding: JSON.stringify(embeddings[j]),
            contextual_prefix: p?.prefixText || null,
            scope: p?.scope || 'general',
            search_terms: p?.searchTerms || [],
            semantic_summary: p?.semanticSummary || null,
            prefix_status: p?.status || 'ok',
            prefix_cache_key: p?.cacheKey || null,
          }).eq('id', batch[j].id);
          if (upErr) throw new Error(`update ${batch[j].id}: ${(upErr as { message?: string }).message}`);

          if (p.status === 'ok') stats.ok++; else if (p.status === 'needs_review') stats.review++; else stats.fallback++;
          if (p.model === 'l1') stats.l1++; else if (p.model === 'l2') stats.l2++;
        }

        if (i + BATCH < toProcess.length) await new Promise(r => setTimeout(r, 300));
      }

      total.processed += toProcess.length;
      total.ok += stats.ok; total.review += stats.review; total.fallback += stats.fallback;
      total.l1 += stats.l1; total.l2 += stats.l2;

      console.log(` L1:${stats.l1} L2:${stats.l2} ok:${stats.ok} rev:${stats.review} fb:${stats.fallback}`);
    } catch (err) {
      console.log(` ❌ ${(err instanceof Error ? err.message : String(err)).slice(0, 60)}`);
    }
  }

  console.log(`\n  Total: ${total.processed} processed, ${total.skipped} skipped`);
  console.log(`  L1:${total.l1} L2:${total.l2} | ok:${total.ok} review:${total.review} fallback:${total.fallback}`);
  console.log(`  L2 rate: ${total.l2 > 0 ? ((total.l2 / total.processed) * 100).toFixed(1) : 0}%\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
