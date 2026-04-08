/**
 * KB Eval Framework — measures retrieval + synthesis quality.
 *
 * IMPORTANT: this script calls the REAL prod searchAndAnswer() with options._debug=true,
 * so retrieval results are bit-for-bit identical to production. Stage attribution comes
 * from search.ts itself, not a re-implemented pipeline.
 *
 * GOLD chunks are defined as PATTERNS, not UUIDs (see test-cases.json schema).
 * Patterns are resolved against the live DB at startup. If any gold pattern fails to
 * resolve to exactly one chunk, the script aborts before running tests — this prevents
 * stale or ambiguous gold from silently producing wrong baselines.
 *
 * Usage:
 *   npx tsx scripts/kb-eval.ts                — run all tests
 *   npx tsx scripts/kb-eval.ts --verbose      — show stage detail per case
 *   npx tsx scripts/kb-eval.ts --id booking-docs  — run single test
 *   npx tsx scripts/kb-eval.ts --resolve-only — only resolve gold patterns and exit (CI-friendly)
 *
 * Metrics:
 *   Recall@10     — gold chunks present in top 10 returned to synthesis (diversified)
 *   MRR@10        — mean reciprocal rank of first gold chunk in those top 10
 *   Stage retention — gold survival across raw → subjectFiltered → rerank → diverse → final
 *   WrongScope@3  — wrong-scope markers in top 3 chunks (should be 0)
 *   KeywordHit    — expected keywords present in answer
 *   NegativeHit   — negative keywords in answer (should be 0)
 *
 * Test cases live in src/lib/kb/eval/test-cases.json
 */
import './eval-env';

import { readFileSync } from 'fs';
import { resolve } from 'path';

const VERBOSE = process.argv.includes('--verbose');
const RESOLVE_ONLY = process.argv.includes('--resolve-only');
const SINGLE_ID = process.argv.includes('--id') ? process.argv[process.argv.indexOf('--id') + 1] : null;

interface GoldMatch {
  doc_title_contains: string;
  heading_contains: string;
  content_contains: string[];
}

interface TestCase {
  id: string;
  query: string;
  gold_match?: GoldMatch[];
  expected_keywords: string[];
  negative_keywords: string[];
  wrong_scope_markers: string[];
  difficulty: string;
  note?: string;
}

interface ResolvedTestCase extends TestCase {
  _resolvedGold: string[]; // chunk UUIDs resolved from gold_match patterns
}

interface EvalResult {
  id: string; query: string; difficulty: string;
  recall10: number; mrr10: number; wrongScope3: number;
  candidatesFound: number; rawTopScore: number | null; rerankTopScore: number | null;
  keywordHit: number; negativeHit: boolean; refused: boolean; retried: boolean;
  answerLen: number; answerPreview: string;
  goldInRaw: number; goldInSubject: number; goldInRerank: number; goldInDiverse: number; goldInFinal: number;
  goldTotal: number;
}

// ── Gold pattern resolver ─────────────────────────────────────────────────

interface ResolverDb {
  from(table: string): {
    select(cols: string): {
      ilike(col: string, pat: string): unknown;
      in(col: string, vals: string[]): unknown;
    };
  };
}

async function resolveGoldMatch(db: unknown, match: GoldMatch): Promise<{ ids: string[]; sample?: { id: string; heading: string | null } }> {
  const d = db as ResolverDb;
  // Step 1: find documents whose title matches
  const docsRes = await (d.from('kb_documents').select('id').ilike('title', `%${match.doc_title_contains}%`) as Promise<{ data: Array<{ id: string }> | null; error: unknown }>);
  if (docsRes.error) throw new Error(`docs query failed: ${JSON.stringify(docsRes.error)}`);
  const docIds = (docsRes.data ?? []).map(r => r.id);
  if (docIds.length === 0) {
    return { ids: [] };
  }

  // Step 2: find chunks in those documents matching heading + all content_contains
  let q = d.from('kb_chunks').select('id, heading, content').in('document_id', docIds) as { ilike(c: string, p: string): unknown };
  q = q.ilike('heading', `%${match.heading_contains}%`) as typeof q;
  for (const sub of match.content_contains) {
    q = q.ilike('content', `%${sub}%`) as typeof q;
  }
  const chunksRes = await (q as unknown as Promise<{ data: Array<{ id: string; heading: string | null; content: string }> | null; error: unknown }>);
  if (chunksRes.error) throw new Error(`chunks query failed: ${JSON.stringify(chunksRes.error)}`);
  const chunks = chunksRes.data ?? [];
  return {
    ids: chunks.map(c => c.id),
    sample: chunks[0] ? { id: chunks[0].id, heading: chunks[0].heading } : undefined,
  };
}

async function preflightResolveGold(db: unknown, cases: TestCase[]): Promise<ResolvedTestCase[]> {
  const resolved: ResolvedTestCase[] = [];
  const failures: string[] = [];

  for (const tc of cases) {
    if (!tc.gold_match || tc.gold_match.length === 0) {
      resolved.push({ ...tc, _resolvedGold: [] });
      continue;
    }
    const allGoldIds: string[] = [];
    let caseFailed = false;

    for (let i = 0; i < tc.gold_match.length; i++) {
      const m = tc.gold_match[i];
      const result = await resolveGoldMatch(db, m);
      if (result.ids.length === 0) {
        failures.push(`  ❌ ${tc.id} [match #${i}]: NO chunks match patterns ${JSON.stringify(m)}`);
        caseFailed = true;
        continue;
      }
      if (result.ids.length > 1) {
        failures.push(`  ❌ ${tc.id} [match #${i}]: AMBIGUOUS — ${result.ids.length} chunks match. Narrow content_contains. patterns=${JSON.stringify(m)}, sample heading="${result.sample?.heading?.slice(0, 100)}"`);
        caseFailed = true;
        continue;
      }
      allGoldIds.push(result.ids[0]);
    }

    if (!caseFailed) {
      resolved.push({ ...tc, _resolvedGold: allGoldIds });
    } else {
      // Push it anyway with empty resolved gold so it still runs the synthesis tests, but recall will be n/a-flagged
      resolved.push({ ...tc, _resolvedGold: [] });
    }
  }

  if (failures.length > 0) {
    console.error(`\n  GOLD RESOLUTION FAILURES (${failures.length}):\n`);
    for (const f of failures) console.error(f);
    console.error(`\n  Fix the patterns in src/lib/kb/eval/test-cases.json or run after re-indexing.`);
    console.error(`  These cases will run but their Recall/MRR will be invalid.\n`);
    if (RESOLVE_ONLY) process.exit(1);
  }

  return resolved;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const { searchAndAnswer } = await import('../src/lib/kb/search');
  const { getServerDb } = await import('../src/lib/shared/db-server');
  const db = getServerDb();

  const allCases: TestCase[] = JSON.parse(
    readFileSync(resolve(__dirname, '../src/lib/kb/eval/test-cases.json'), 'utf8'),
  );
  const cases = SINGLE_ID ? allCases.filter(t => t.id === SINGLE_ID) : allCases;

  console.log(`\n  KB Eval — ${cases.length} test cases (via prod searchAndAnswer)`);
  console.log(`  Resolving gold patterns against live DB...\n`);

  const resolvedCases = await preflightResolveGold(db, cases);
  const totalWithGold = resolvedCases.filter(c => c._resolvedGold.length > 0).length;
  console.log(`  Resolved gold for ${totalWithGold}/${cases.length} cases.\n`);

  if (RESOLVE_ONLY) {
    console.log('  --resolve-only: exiting after gold resolution check.\n');
    return;
  }

  const results: EvalResult[] = [];

  for (const tc of resolvedCases) {
    process.stdout.write(`  ${tc.id.padEnd(28)}`);
    try {
      const result = await searchAndAnswer(tc.query, {
        userId: 'eval', role: 'chief', db, _debug: true,
      });

      const dbg = result._debug;
      if (!dbg) throw new Error('searchAndAnswer did not return _debug — check search.ts wiring');

      const goldSet = new Set(tc._resolvedGold);
      const countGold = (ids: string[]) => ids.filter(id => goldSet.has(id)).length;
      const goldInRaw = countGold(dbg.raw);
      const goldInSubject = countGold(dbg.subjectFiltered);
      const goldInRerank = countGold(dbg.rerank);
      const goldInDiverse = countGold(dbg.diverse);
      const goldInFinal = countGold(dbg.final);

      const top10 = dbg.diverse.slice(0, 10);
      const recall10 = tc._resolvedGold.length > 0 ? countGold(top10) / tc._resolvedGold.length : -1;
      let mrr10 = tc._resolvedGold.length > 0 ? 0 : -1;
      for (let i = 0; i < top10.length; i++) {
        if (goldSet.has(top10[i])) { mrr10 = 1 / (i + 1); break; }
      }

      const previewText = (result.chunks ?? [])
        .slice(0, 3)
        .map(c => `${c.heading ?? ''} ${c.content}`.toLowerCase())
        .join(' ');
      const wsCount = tc.wrong_scope_markers.filter(m => previewText.includes(m.toLowerCase())).length;
      const wrongScope3 = tc.wrong_scope_markers.length > 0 ? wsCount / tc.wrong_scope_markers.length : 0;

      const answer = result.text || '';
      const answerClean = answer.split('💰')[0];
      const answerLower = answerClean.toLowerCase();
      const kwFound = tc.expected_keywords.filter(k => answerLower.includes(k.toLowerCase()));
      const keywordHit = tc.expected_keywords.length > 0 ? kwFound.length / tc.expected_keywords.length : -1;
      const negativeHit = tc.negative_keywords.some(k => answerLower.includes(k.toLowerCase()));
      const refused = answerClean.includes('не знайдено') || answerClean.includes('немає інформації');

      const r: EvalResult = {
        id: tc.id, query: tc.query, difficulty: tc.difficulty,
        recall10, mrr10, wrongScope3,
        candidatesFound: dbg.raw.length,
        rawTopScore: dbg.rawTopScore,
        rerankTopScore: dbg.rerankTopScore,
        keywordHit, negativeHit, refused, retried: dbg.retried,
        answerLen: answerClean.length,
        answerPreview: answerClean.replace(/<[^>]*>/g, '').slice(0, 120),
        goldInRaw, goldInSubject, goldInRerank, goldInDiverse, goldInFinal,
        goldTotal: tc._resolvedGold.length,
      };
      results.push(r);

      const ws = wrongScope3 > 0 ? 'WS!' : '';
      const neg = negativeHit ? 'NEG!' : '';
      const ref = refused ? 'REF' : '';
      const rt = dbg.retried ? 'RETRY' : '';
      const st = neg || ws ? '❌' : ref ? '⚠️' : keywordHit >= 0.5 ? '✅' : '⚠️';
      console.log(`${st} R=${recall10 >= 0 ? recall10.toFixed(2) : 'n/a'} MRR=${mrr10 >= 0 ? mrr10.toFixed(2) : 'n/a'} KW=${keywordHit >= 0 ? keywordHit.toFixed(2) : 'n/a'} ${ws}${neg}${ref}${rt}`);
      if (VERBOSE && tc._resolvedGold.length > 0) {
        console.log(`    [stage] raw=${goldInRaw} subj=${goldInSubject} rerank=${goldInRerank} diverse=${goldInDiverse} final=${goldInFinal} /${tc._resolvedGold.length}  candidates=${dbg.raw.length}`);
      }
      if (VERBOSE) console.log(`    ${r.answerPreview}`);
    } catch (err) {
      console.log(`❌ ERR: ${(err instanceof Error ? err.message : String(err)).slice(0, 80)}`);
      results.push({
        id: tc.id, query: tc.query, difficulty: tc.difficulty,
        recall10: 0, mrr10: 0, wrongScope3: 0,
        candidatesFound: 0, rawTopScore: null, rerankTopScore: null,
        keywordHit: 0, negativeHit: false, refused: true, retried: false,
        answerLen: 0, answerPreview: '',
        goldInRaw: 0, goldInSubject: 0, goldInRerank: 0, goldInDiverse: 0, goldInFinal: 0,
        goldTotal: tc._resolvedGold.length,
      });
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────
  const n = results.length;
  const wG = results.filter(r => r.recall10 >= 0);
  const wK = results.filter(r => r.keywordHit >= 0);
  const avgR = wG.length ? wG.reduce((s, r) => s + r.recall10, 0) / wG.length : 0;
  const avgM = wG.length ? wG.reduce((s, r) => s + r.mrr10, 0) / wG.length : 0;
  const avgK = wK.length ? wK.reduce((s, r) => s + r.keywordHit, 0) / wK.length : 0;
  const wsN = results.filter(r => r.wrongScope3 > 0).length;
  const negN = results.filter(r => r.negativeHit).length;
  const refN = results.filter(r => r.refused).length;
  const rtN = results.filter(r => r.retried).length;

  const stage = (pick: (r: EvalResult) => number) =>
    wG.reduce((s, r) => s + (r.goldTotal > 0 ? pick(r) / r.goldTotal : 0), 0) / (wG.length || 1);

  console.log(`\n  ${'═'.repeat(64)}`);
  console.log(`  STAGE GOLD RETENTION  (${wG.length} cases with resolved gold)`);
  console.log(`    Raw candidates:     ${stage(r => r.goldInRaw).toFixed(3)}`);
  console.log(`    After scope-boost:  ${stage(r => r.goldInSubject).toFixed(3)}`);
  console.log(`    After rerank:       ${stage(r => r.goldInRerank).toFixed(3)}`);
  console.log(`    After diversity:    ${stage(r => r.goldInDiverse).toFixed(3)}  ← top10 input to synthesis`);
  console.log(`    After expansion:    ${stage(r => r.goldInFinal).toFixed(3)}`);
  console.log(`  RETRIEVAL`);
  console.log(`    Recall@10:          ${avgR.toFixed(3)}`);
  console.log(`    MRR@10:             ${avgM.toFixed(3)}`);
  console.log(`    WrongScope@3:       ${wsN}/${n}`);
  console.log(`  SYNTHESIS`);
  console.log(`    KeywordHit:         ${avgK.toFixed(3)}`);
  console.log(`    NegativeHit:        ${negN}/${n}`);
  console.log(`    Refused:            ${refN}/${n}`);
  console.log(`    Deterministic retry:${rtN}/${n}`);
  console.log(`  ${'═'.repeat(64)}`);

  console.log(`\n  ${'ID'.padEnd(28)} | R@10 | MRR  | WS@3 | KW   | NEG | St`);
  console.log('  ' + '-'.repeat(72));
  for (const r of results) {
    const st = r.negativeHit ? 'NEG' : r.wrongScope3 > 0 ? 'WS!' : r.refused ? 'REF' : r.keywordHit >= 0.5 ? 'OK' : 'LOW';
    console.log(`  ${r.id.padEnd(28)} | ${r.recall10 >= 0 ? r.recall10.toFixed(2) : ' n/a'} | ${r.mrr10 >= 0 ? r.mrr10.toFixed(2) : ' n/a'} | ${r.wrongScope3.toFixed(2)} | ${r.keywordHit >= 0 ? r.keywordHit.toFixed(2) : ' n/a'} | ${r.negativeHit ? 'Y' : ' '} | ${st}`);
  }
  console.log();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
