/**
 * KB Eval Framework — measures retrieval + synthesis quality.
 *
 * Usage:
 *   npx tsx scripts/kb-eval.ts                — run all tests
 *   npx tsx scripts/kb-eval.ts --verbose      — show answer previews
 *   npx tsx scripts/kb-eval.ts --id booking-docs  — run single test
 *
 * Metrics:
 *   Recall@10     — gold chunks found in top 10
 *   MRR@10        — mean reciprocal rank of first gold chunk
 *   WrongScope@3  — wrong-scope markers in top 3 chunks (should be 0)
 *   KeywordHit    — expected keywords present in answer
 *   NegativeHit   — negative keywords in answer (should be 0)
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env', override: true });
dotenv.config({ path: '.env.local', override: true });

import { readFileSync } from 'fs';
import { resolve } from 'path';

const VERBOSE = process.argv.includes('--verbose');
const SINGLE_ID = process.argv.includes('--id') ? process.argv[process.argv.indexOf('--id') + 1] : null;

interface TestCase {
  id: string;
  query: string;
  gold_chunk_ids: string[];
  expected_keywords: string[];
  negative_keywords: string[];
  wrong_scope_markers: string[];
  difficulty: string;
}

interface EvalResult {
  id: string; query: string; difficulty: string;
  recall10: number; mrr10: number; wrongScope3: number;
  chunksFound: number; topVectorScore: number; topRerankScore: number;
  keywordHit: number; negativeHit: boolean; refused: boolean;
  answerLen: number; answerPreview: string; cost: number;
}

async function main() {
  const { generateMultiQueries } = await import('../src/lib/kb/query-translator');
  const { embedBatchQueries } = await import('../src/lib/kb/embedder');
  const { rerankChunks } = await import('../src/lib/kb/reranker');
  const { synthesizeAnswer } = await import('../src/lib/kb/synthesizer');
  const { config } = await import('../src/lib/shared/config');
  const { createPostgrestClient } = await import('../src/lib/shared/postgrest-client');
  const { expandQueryWithSynonyms } = await import('../src/lib/kb/synonym-lookup');

  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey);
  const testCases: TestCase[] = JSON.parse(
    readFileSync(resolve(__dirname, '../src/lib/kb/eval/test-cases.json'), 'utf8'),
  );
  const cases = SINGLE_ID ? testCases.filter(t => t.id === SINGLE_ID) : testCases;
  console.log(`\n  KB Eval — ${cases.length} test cases\n`);

  const results: EvalResult[] = [];

  for (const tc of cases) {
    process.stdout.write(`  ${tc.id.padEnd(28)}`);
    try {
      // 1. Query expansion
      const mq = await generateMultiQueries(tc.query);
      const subQueries = [...mq.queries];
      try {
        const dict = await expandQueryWithSynonyms(tc.query);
        if (dict.length > 0) subQueries.push(dict.slice(0, 5).join(' '));
      } catch { /* ok */ }

      // 2. Embed + search (using tuned params from search.ts)
      const EVAL_MATCH_COUNT = 50;
      const EVAL_MATCH_THRESHOLD = 0.10;
      const EVAL_RERANK_TOP_K = 50;

      const embeddings = await embedBatchQueries(subQueries);
      const slug = mq.domain !== 'general' ? mq.domain : null;
      const chunkMap = new Map<string, any>();
      for (let i = 0; i < subQueries.length; i++) {
        const { data } = await db.rpc('match_kb_documents', {
          query_embedding: `[${embeddings[i].join(',')}]`,
          query_text: subQueries[i], match_count: EVAL_MATCH_COUNT, match_threshold: EVAL_MATCH_THRESHOLD,
          filter_category_slug: slug, filter_process_id: null,
        });
        for (const r of (data || []) as any[]) {
          const ex = chunkMap.get(r.chunk_id);
          if (!ex || r.similarity > ex.similarity) chunkMap.set(r.chunk_id, r);
        }
      }
      const allChunks = [...chunkMap.values()].sort((a: any, b: any) => b.similarity - a.similarity);

      // Stage diagnostics: gold presence in raw candidates
      const rawCandidateIds = allChunks.map((c: any) => c.chunk_id);
      const goldInCandidates = tc.gold_chunk_ids.filter(id => rawCandidateIds.includes(id));

      // 3. Rerank
      const reranked = await rerankChunks(tc.query, allChunks, EVAL_RERANK_TOP_K, slug || undefined);

      // Stage diagnostics: gold presence after rerank
      const rerankIds = reranked.map((c: any) => c.chunk_id);
      const goldInRerank = tc.gold_chunk_ids.filter(id => rerankIds.includes(id));

      // 4. Metrics
      const top10ids = reranked.slice(0, 10).map((c: any) => c.chunk_id);
      const goldFound = tc.gold_chunk_ids.filter(id => top10ids.includes(id));
      const recall10 = tc.gold_chunk_ids.length > 0 ? goldFound.length / tc.gold_chunk_ids.length : -1;

      let mrr10 = tc.gold_chunk_ids.length > 0 ? 0 : -1;
      for (let i = 0; i < Math.min(reranked.length, 10); i++) {
        if (tc.gold_chunk_ids.includes((reranked[i] as any).chunk_id)) { mrr10 = 1 / (i + 1); break; }
      }

      // Stage diagnostics log (only for cases with gold chunks)
      if (tc.gold_chunk_ids.length > 0 && VERBOSE) {
        console.log(`    [stage] candidates=${allChunks.length} gold_in_raw=${goldInCandidates.length}/${tc.gold_chunk_ids.length} gold_in_rerank=${goldInRerank.length}/${tc.gold_chunk_ids.length} gold_in_top10=${goldFound.length}/${tc.gold_chunk_ids.length}`);
      }

      const top3text = reranked.slice(0, 3)
        .map((c: any) => ((c.contextual_prefix || '') + ' ' + c.content).toLowerCase()).join(' ');
      const wsCount = tc.wrong_scope_markers.filter(m => top3text.includes(m.toLowerCase())).length;
      const wrongScope3 = tc.wrong_scope_markers.length > 0 ? wsCount / tc.wrong_scope_markers.length : 0;

      // 5. Synthesis
      const synthesis = await synthesizeAnswer(tc.query, reranked.slice(0, 6) as any);
      const answer = synthesis.text || '';
      const answerLower = answer.toLowerCase();
      const kwFound = tc.expected_keywords.filter(k => answerLower.includes(k.toLowerCase()));
      const keywordHit = tc.expected_keywords.length > 0 ? kwFound.length / tc.expected_keywords.length : -1;
      const negativeHit = tc.negative_keywords.some(k => answerLower.includes(k.toLowerCase()));
      const refused = answer.includes('не знайдено') || answer.includes('немає інформації');

      const r: EvalResult = {
        id: tc.id, query: tc.query, difficulty: tc.difficulty,
        recall10, mrr10, wrongScope3, chunksFound: allChunks.length,
        topVectorScore: allChunks[0]?.similarity || 0,
        topRerankScore: (reranked[0] as any)?._rerank_score || 0,
        keywordHit, negativeHit, refused,
        answerLen: answer.length,
        answerPreview: answer.replace(/<[^>]*>/g, '').slice(0, 120),
        cost: synthesis.cost,
      };
      results.push(r);

      const ws = wrongScope3 > 0 ? `WS!` : '';
      const neg = negativeHit ? 'NEG!' : '';
      const ref = refused ? 'REF' : '';
      const st = neg || ws ? '❌' : ref ? '⚠️' : keywordHit >= 0.5 ? '✅' : '⚠️';
      console.log(`${st} R=${recall10 >= 0 ? recall10.toFixed(2) : 'n/a'} MRR=${mrr10 >= 0 ? mrr10.toFixed(2) : 'n/a'} KW=${keywordHit >= 0 ? keywordHit.toFixed(2) : 'n/a'} ${ws}${neg}${ref}`);
      if (VERBOSE) console.log(`    ${r.answerPreview}`);
    } catch (err) {
      console.log(`❌ ERR: ${(err instanceof Error ? err.message : String(err)).slice(0, 60)}`);
      results.push({ id: tc.id, query: tc.query, difficulty: tc.difficulty, recall10: 0, mrr10: 0, wrongScope3: 0, chunksFound: 0, topVectorScore: 0, topRerankScore: 0, keywordHit: 0, negativeHit: false, refused: true, answerLen: 0, answerPreview: '', cost: 0 });
    }
  }

  // Summary
  const n = results.length;
  const wG = results.filter(r => r.recall10 >= 0);
  const wK = results.filter(r => r.keywordHit >= 0);
  const avgR = wG.length ? wG.reduce((s, r) => s + r.recall10, 0) / wG.length : 0;
  const avgM = wG.length ? wG.reduce((s, r) => s + r.mrr10, 0) / wG.length : 0;
  const avgK = wK.length ? wK.reduce((s, r) => s + r.keywordHit, 0) / wK.length : 0;
  const wsN = results.filter(r => r.wrongScope3 > 0).length;
  const negN = results.filter(r => r.negativeHit).length;
  const refN = results.filter(r => r.refused).length;
  const cost = results.reduce((s, r) => s + r.cost, 0);

  console.log(`\n  ${'═'.repeat(60)}`);
  console.log(`  RETRIEVAL  (${wG.length} with gold chunks)`);
  console.log(`    Recall@10:      ${avgR.toFixed(3)}`);
  console.log(`    MRR@10:         ${avgM.toFixed(3)}`);
  console.log(`    WrongScope@3:   ${wsN}/${n}`);
  console.log(`  SYNTHESIS`);
  console.log(`    KeywordHit:     ${avgK.toFixed(3)}`);
  console.log(`    NegativeHit:    ${negN}/${n}`);
  console.log(`    Refused:        ${refN}/${n}`);
  console.log(`  COST: $${cost.toFixed(4)}`);
  console.log(`  ${'═'.repeat(60)}`);

  console.log(`\n  ${'ID'.padEnd(28)} | R@10 | MRR  | WS@3 | KW   | NEG | St`);
  console.log('  ' + '-'.repeat(72));
  for (const r of results) {
    const st = r.negativeHit ? 'NEG' : r.wrongScope3 > 0 ? 'WS!' : r.refused ? 'REF' : r.keywordHit >= 0.5 ? 'OK' : 'LOW';
    console.log(`  ${r.id.padEnd(28)} | ${r.recall10 >= 0 ? r.recall10.toFixed(2) : ' n/a'} | ${r.mrr10 >= 0 ? r.mrr10.toFixed(2) : ' n/a'} | ${r.wrongScope3.toFixed(2)} | ${r.keywordHit >= 0 ? r.keywordHit.toFixed(2) : ' n/a'} | ${r.negativeHit ? 'Y' : ' '} | ${st}`);
  }
  console.log();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
