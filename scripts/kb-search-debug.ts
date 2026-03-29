/**
 * Debug KB search pipeline — shows what happens at each stage.
 * Usage: npx tsx scripts/kb-search-debug.ts "які документи потрібні для бронювання працівника"
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env', override: true });
dotenv.config({ path: '.env.local', override: true });

const queryArg = process.argv[2] || 'які документи потрібні для бронювання працівника';

async function main() {
const query = queryArg;
const { generateMultiQueries } = await import('../src/lib/kb/query-translator');
const { embedBatchQueries } = await import('../src/lib/kb/embedder');
const { rerankChunks } = await import('../src/lib/kb/reranker');
const { config } = await import('../src/lib/shared/config');
const { createPostgrestClient } = await import('../src/lib/shared/postgrest-client');

const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey);

console.log(`\n🔍 Query: "${query}"\n`);

// Stage 1: Query expansion
console.log('═══ Stage 1: Query Expansion ═══');
const mq = await generateMultiQueries(query);
console.log('Domain:', mq.domain);
console.log('Specificity:', mq.specificity);
console.log('Queries:');
for (const q of mq.queries) console.log(`  → ${q}`);

// Stage 2: Embed
console.log('\n═══ Stage 2: Embed Queries ═══');
const embeddings = await embedBatchQueries(mq.queries);
console.log(`Embedded ${embeddings.length} queries (${embeddings[0]?.length} dims)`);

// Stage 3: Vector search
console.log('\n═══ Stage 3: Vector + BM25 Search ═══');
const categorySlug = mq.domain !== 'general' ? mq.domain : null;
console.log('Category filter:', categorySlug || '(none)');

const chunkMap = new Map();
for (let i = 0; i < mq.queries.length; i++) {
  const { data, error } = await db.rpc('match_kb_documents', {
    query_embedding: `[${embeddings[i].join(',')}]`,
    query_text: mq.queries[i],
    match_count: 15,
    match_threshold: 0.20,
    filter_category_slug: categorySlug,
    filter_process_id: null,
  });
  if (error) { console.error('RPC error:', error); continue; }
  const rows = (data || []) as Array<{ chunk_id: string; document_title: string; similarity: number; content: string; heading: string; contextual_prefix: string; document_id: string }>;
  console.log(`\n  Sub-query ${i}: "${mq.queries[i].slice(0, 60)}"`);
  console.log(`  Results: ${rows.length}, top score: ${rows[0]?.similarity?.toFixed(4) || 'n/a'}`);
  for (const r of rows.slice(0, 5)) {
    console.log(`    ${r.similarity.toFixed(4)} | ${r.document_title.slice(0, 50)} | ${(r.heading || '').slice(0, 40)}`);
  }
  for (const r of rows) {
    const existing = chunkMap.get(r.chunk_id);
    if (!existing || r.similarity > existing.similarity) chunkMap.set(r.chunk_id, r);
  }
}

const merged = [...chunkMap.values()].sort((a: any, b: any) => b.similarity - a.similarity);
console.log(`\n  Merged: ${merged.length} unique chunks`);
console.log('  Top 10:');
for (const c of merged.slice(0, 10)) {
  const disamb = (c.contextual_prefix || '').split(/\[пошук/i)[0]?.replace(/\*+|disambiguator:?/gi, '').trim().slice(0, 80) || '';
  console.log(`    ${c.similarity.toFixed(4)} | ${c.document_title.slice(0, 45)} | ${disamb}`);
}

// Stage 4: Subject filter
console.log('\n═══ Stage 4: Subject Filter ═══');
const SPECIAL_NORM_PATTERNS = [/лише\s+для\b/i, /спеціальний\s+порядок\s+для\b/i, /виключно\s+для\b/i, /стосується\s+лише\b/i, /не\s+стосується\s+загальн/i];
const qLower = query.toLowerCase();

let filtered = merged;
const hasSpecial = merged.some((c: any) => SPECIAL_NORM_PATTERNS.some(rx => rx.test(c.contextual_prefix || '')));
if (hasSpecial) {
  filtered = merged.filter((chunk: any) => {
    const prefix = (chunk.contextual_prefix || '').toLowerCase();
    const disambiguator = prefix.split(/\[пошук/)[0] || '';
    const isSpecial = SPECIAL_NORM_PATTERNS.some(rx => rx.test(disambiguator));
    if (!isSpecial) return true;
    const match = disambiguator.match(/лише\s+для\s+([^;.]+)/i) || disambiguator.match(/спеціальний\s+порядок\s+для\s+([^;.]+)/i);
    if (!match) return true;
    const subjectWords = match[1].trim().toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    const mentioned = subjectWords.some((w: string) => qLower.includes(w));
    if (!mentioned) console.log(`  ❌ Filtered out: "${match[1].trim().slice(0, 60)}"`);
    return mentioned;
  });
  if (filtered.length < 3) filtered = merged;
}
console.log(`  ${merged.length} → ${filtered.length} chunks`);

// Stage 5: Rerank
console.log('\n═══ Stage 5: Rerank ═══');
const reranked = await rerankChunks(query, filtered as any, 10, categorySlug || undefined);
console.log('  Top reranked:');
for (const c of reranked.slice(0, 6)) {
  const score = (c as any)._rerank_score?.toFixed(4) || 'n/a';
  const disamb = (c.contextual_prefix || '').split(/\[пошук/i)[0]?.replace(/\*+|disambiguator:?/gi, '').trim().slice(0, 80) || '';
  console.log(`    rerank=${score} | ${c.document_title.slice(0, 45)} | ${disamb}`);
}

// Stage 6: Diversity
console.log('\n═══ Stage 6: Diversity (max 2 per doc) ═══');
const docCount = new Map<string, number>();
const diversified = reranked.filter(c => {
  const count = docCount.get(c.document_id) || 0;
  if (count >= 2) return false;
  docCount.set(c.document_id, count + 1);
  return true;
});
console.log(`  ${reranked.length} → ${diversified.length} chunks`);
for (const c of diversified) {
  const score = (c as any)._rerank_score?.toFixed(4) || 'n/a';
  console.log(`    rerank=${score} | ${c.document_title.slice(0, 50)}`);
}

console.log('\n✅ Done\n');
}
main().catch(err => { console.error('Fatal:', err); process.exit(1); });
