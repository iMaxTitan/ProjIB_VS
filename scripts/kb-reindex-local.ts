/**
 * Local reindex script — uses prefix-pipeline (L1/L2 cascade).
 *
 *   npx tsx scripts/kb-reindex-local.ts                          — all docs, skip cached
 *   npx tsx scripts/kb-reindex-local.ts --ids ID1 ID2            — specific documents
 *   npx tsx scripts/kb-reindex-local.ts --force-prefix           — regenerate ALL prefixes
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env', override: true });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { buildContextualContent } = await import('../src/lib/kb/chunker');
  const { embedBatch } = await import('../src/lib/kb/embedder');
  const { generatePrefixes } = await import('../src/lib/kb/prefix-pipeline');
  const { config } = await import('../src/lib/shared/config');
  const { createPostgrestClient } = await import('../src/lib/shared/postgrest-client');

  if (!config.db.serverUrl || !config.db.serviceRoleKey) {
    console.error('Missing DB config'); process.exit(1);
  }

  const FORCE = process.argv.includes('--force-prefix');
  const idsIdx = process.argv.indexOf('--ids');
  const IDS: string[] = idsIdx >= 0 ? process.argv.slice(idsIdx + 1).filter(a => !a.startsWith('--')) : [];

  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey);

  // Load docs
  let query = db.from('kb_documents').select('id, title, content, category_id').eq('status', 'ready').order('title');
  if (IDS.length) query = query.in('id', IDS);
  const { data: docs, error: docErr } = await query as { data: Array<{ id: string; title: string; content: string; category_id: string }> | null; error: unknown };
  if (docErr || !docs?.length) { console.error('No docs'); process.exit(1); }

  const { data: cats } = await db.from('kb_categories').select('id, name, slug');
  const catMap = new Map((cats ?? []).map((c: { id: string; name: string; slug?: string }) => [c.id, { name: c.name, slug: c.slug || '' }]));

  console.log(`\n  [PREFIX PIPELINE] ${docs.length} documents, force=${FORCE}\n`);

  let total = { chunks: 0, ok: 0, review: 0, fallback: 0, l1: 0, l2: 0 };

  for (const doc of docs) {
    const cat = catMap.get(doc.category_id) || { name: 'Загальне', slug: 'general' };
    process.stdout.write(`  📄 ${doc.title.slice(0, 55)}...`);

    try {
      // Load existing chunks
      const { data: chunks, error: chErr } = await db
        .from('kb_chunks')
        .select('id, chunk_index, content, heading, token_count, contextual_prefix, prefix_cache_key')
        .eq('document_id', doc.id)
        .order('chunk_index') as { data: Array<{ id: string; chunk_index: number; content: string; heading: string; token_count: number; contextual_prefix: string | null; prefix_cache_key: string | null }> | null; error: unknown };

      if (chErr || !chunks?.length) { console.log(' no chunks'); continue; }

      // Generate prefixes via pipeline
      const domain = cat.slug || 'general';
      const prefixes = await generatePrefixes(doc.title, domain,
        chunks.map(c => ({ heading: c.heading || '', content: c.content })));

      // Embed + update
      const BATCH = 80;
      for (let i = 0; i < chunks.length; i += BATCH) {
        const batchChunks = chunks.slice(i, i + BATCH);
        const batchPrefixes = prefixes.slice(i, i + BATCH);
        const contents = batchChunks.map((c, j) =>
          buildContextualContent(cat.name, doc.title, c.heading || '', c.content, batchPrefixes[j]?.prefixText || undefined));
        const embeddings = await embedBatch(contents);

        for (let j = 0; j < batchChunks.length; j++) {
          const p = batchPrefixes[j];
          const { error: upErr } = await db.from('kb_chunks').update({
            embedding: JSON.stringify(embeddings[j]),
            contextual_prefix: p?.prefixText || null,
            scope: p?.scope || 'general',
            search_terms: p?.searchTerms || [],
            semantic_summary: p?.semanticSummary || null,
            prefix_status: p?.status || 'ok',
            prefix_cache_key: p?.cacheKey || null,
          }).eq('id', batchChunks[j].id);
          if (upErr) throw new Error(`update ${batchChunks[j].id}: ${(upErr as { message?: string }).message}`);
        }
      }

      // Stats
      const stats = { ok: 0, review: 0, fallback: 0, l1: 0, l2: 0 };
      for (const p of prefixes) {
        if (p.status === 'ok') stats.ok++; else if (p.status === 'needs_review') stats.review++; else stats.fallback++;
        if (p.model === 'l1') stats.l1++; else if (p.model === 'l2') stats.l2++;
      }
      total.chunks += chunks.length;
      total.ok += stats.ok; total.review += stats.review; total.fallback += stats.fallback;
      total.l1 += stats.l1; total.l2 += stats.l2;

      console.log(` ${chunks.length} chunks | L1:${stats.l1} L2:${stats.l2} ok:${stats.ok} review:${stats.review} fb:${stats.fallback}`);
    } catch (err) {
      console.log(` ❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n  Total: ${total.chunks} chunks | L1:${total.l1} L2:${total.l2} | ok:${total.ok} review:${total.review} fallback:${total.fallback}`);
  console.log(`  L2 rate: ${total.l2 > 0 ? ((total.l2 / total.chunks) * 100).toFixed(1) : 0}%\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
