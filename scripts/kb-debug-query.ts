/**
 * Debug a single KB query — shows full pipeline: candidates → rerank → diversity → synthesis input.
 * Usage: POSTGREST_DIRECT=1 npx tsx scripts/kb-debug-query.ts "як встановити фотошоп"
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env', override: true });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const query = process.argv[2];
  if (!query) { console.error('Usage: npx tsx scripts/kb-debug-query.ts "query"'); process.exit(1); }

  const { generateMultiQueries } = await import('../src/lib/kb/query-translator');
  const { embedBatchQueries } = await import('../src/lib/kb/embedder');
  const { rerankChunks } = await import('../src/lib/kb/reranker');
  const { diversifyByDocument } = await import('../src/lib/kb/search-helpers');
  const { config } = await import('../src/lib/shared/config');
  const { createPostgrestClient } = await import('../src/lib/shared/postgrest-client');

  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey);

  console.log(`\n  Query: "${query}"\n`);

  // 1. Multi-query
  const mq = await generateMultiQueries(query);
  const subQueries = [...mq.queries];
  console.log(`  Domain: ${mq.domain}`);
  console.log(`  Sub-queries: ${JSON.stringify(subQueries)}\n`);

  // 2. Embed + search
  const embeddings = await embedBatchQueries(subQueries);
  const slug = mq.domain !== 'general' ? mq.domain : null;
  const chunkMap = new Map<string, any>();
  for (let i = 0; i < subQueries.length; i++) {
    const { data } = await db.rpc('match_kb_documents', {
      query_embedding: `[${embeddings[i].join(',')}]`,
      query_text: subQueries[i], match_count: 50, match_threshold: 0.10,
      filter_category_slug: slug, filter_process_id: null,
    });
    for (const r of (data || []) as any[]) {
      const ex = chunkMap.get(r.chunk_id);
      if (!ex || r.similarity > ex.similarity) chunkMap.set(r.chunk_id, r);
    }
  }
  const allChunks = [...chunkMap.values()].sort((a: any, b: any) => b.similarity - a.similarity);
  console.log(`  Raw candidates: ${allChunks.length}`);
  console.log(`  Top 5 candidates (by vector):`);
  for (const c of allChunks.slice(0, 5)) {
    console.log(`    ${c.chunk_id.slice(0, 8)} sim=${c.similarity.toFixed(3)} doc="${(c.document_title || '').slice(0, 60)}" heading="${(c.heading || '').slice(0, 60)}"`);
  }

  // 3. Rerank
  const reranked = await rerankChunks(query, allChunks, 30, slug || undefined);
  console.log(`\n  After rerank: ${reranked.length}`);
  console.log(`  Top 10 reranked:`);
  for (let i = 0; i < Math.min(10, reranked.length); i++) {
    const c = reranked[i] as any;
    console.log(`    #${i + 1} ${c.chunk_id.slice(0, 8)} rerank=${c._rerank_score?.toFixed(3)} doc="${(c.document_title || '').slice(0, 60)}" heading="${(c.heading || '').slice(0, 40)}"`);
  }

  // 4. Diversity
  const diversified = diversifyByDocument(reranked, 2);
  console.log(`\n  After diversity (max 2/doc): ${diversified.length}`);
  console.log(`  Chunks going to synthesis (top 6):`);
  for (let i = 0; i < Math.min(6, diversified.length); i++) {
    const c = diversified[i] as any;
    console.log(`    #${i + 1} ${c.chunk_id.slice(0, 8)} rerank=${c._rerank_score?.toFixed(3)} doc="${(c.document_title || '').slice(0, 70)}"`);
    console.log(`       content: "${c.content.slice(0, 150).replace(/\n/g, ' ')}"`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
