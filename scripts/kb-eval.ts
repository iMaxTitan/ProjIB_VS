/**
 * KB RAG Pipeline — Evaluation Runner with LLM Judge.
 *
 * Runs golden tests through the RAG pipeline, evaluates with:
 * 1. Substring checks (deterministic)
 * 2. LLM Judge scoring (Claude rates 0 / 0.5 / 1)
 *
 * Usage:
 *   npx tsx scripts/kb-eval.ts                    # run all tests
 *   npx tsx scripts/kb-eval.ts --category legal   # filter by category
 *   npx tsx scripts/kb-eval.ts --judge            # enable LLM Judge (costs ~$0.05)
 *   npx tsx scripts/kb-eval.ts --verbose          # show answers
 *   npx tsx scripts/kb-eval.ts --config B         # run config B (see CONFIGS)
 *
 * Requires: VOYAGE_API_KEY, ANTHROPIC_API_KEY, NEXT_PUBLIC_API_URL, POSTGREST_SERVICE_KEY
 */

import './eval-env';
import { GOLDEN_TESTS, type GoldenTest } from '../src/lib/kb/__tests__/golden-tests';
import { searchAndAnswer } from '../src/lib/kb/search';
import { getServerDb } from '../src/lib/shared/db-server';

const db = getServerDb();

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const useJudge = args.includes('--judge');
const verbose = args.includes('--verbose');
const catFilter = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;
const configName = args.includes('--config') ? args[args.indexOf('--config') + 1] : 'A';

// ── Pipeline configs for A/B testing ────────────────────────────────────────

interface PipelineConfig {
  name: string;
  description: string;
  env: Record<string, string>;
}

const CONFIGS: Record<string, PipelineConfig> = {
  A: {
    name: 'A (current)',
    description: 'Current production config: RERANK_TOP_K=10, POST_RERANK_MAX_PER_DOC=2',
    env: {},
  },
  B: {
    name: 'B (reduced k)',
    description: 'Reduced context: RERANK_TOP_K=5, POST_RERANK_MAX_PER_DOC=2',
    env: { KB_RERANK_TOP_K: '5' },
  },
  C: {
    name: 'C (minimal k)',
    description: 'Minimal context: RERANK_TOP_K=3, POST_RERANK_MAX_PER_DOC=1',
    env: { KB_RERANK_TOP_K: '3', KB_POST_RERANK_MAX_PER_DOC: '1' },
  },
};

const activeConfig = CONFIGS[configName] ?? CONFIGS.A;

// Apply config env overrides
for (const [k, v] of Object.entries(activeConfig.env)) {
  process.env[k] = v;
}

// ── LLM Judge ───────────────────────────────────────────────────────────────

async function llmJudge(query: string, answer: string): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return -1;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      temperature: 0,
      system: `You are a strict answer quality judge for a corporate knowledge base.
Rate how well the answer addresses the question using ONLY this scale:
- 1.0 = correct, complete, directly answers the question with specific facts
- 0.5 = partially correct or too vague, missing key details
- 0.0 = wrong, irrelevant, or a refusal when answer exists in the KB
Reply with ONLY a number: 0, 0.5, or 1`,
      messages: [
        { role: 'user', content: `Question: ${query}\n\nAnswer: ${answer.slice(0, 1500)}` },
      ],
    }),
  });

  if (!response.ok) return -1;

  const data = await response.json() as { content: Array<{ text: string }> };
  const text = data.content?.[0]?.text?.trim() ?? '';
  const score = parseFloat(text);
  return [0, 0.5, 1].includes(score) ? score : -1;
}

// ── Test runner ─────────────────────────────────────────────────────────────

const AI_REFUSAL_MARKER = 'немає інформації про';

interface TestResult {
  test: GoldenTest;
  passed: boolean;
  answer: string;
  failures: string[];
  judgeScore: number;
  durationMs: number;
}

async function runTest(test: GoldenTest): Promise<TestResult> {
  const start = Date.now();
  const failures: string[] = [];

  try {
    const result = await searchAndAnswer(test.query, {
      userId: 'eval-test',
      role: 'chief',
      db,
      category: test.category,
    });

    const answer = result.text;
    const answerLower = answer.toLowerCase();

    // Substring checks
    for (const sub of test.expectedSubstrings) {
      if (!answerLower.includes(sub.toLowerCase())) {
        failures.push(`Missing: "${sub}"`);
      }
    }

    // Refusal check
    const hasRefusal = answer.includes(AI_REFUSAL_MARKER);
    if (test.expectAnswer && hasRefusal) {
      failures.push('Got refusal, expected answer');
    }
    if (!test.expectAnswer && !hasRefusal) {
      failures.push('Expected refusal, got answer');
    }

    // Forbidden substrings
    for (const sub of test.forbiddenSubstrings ?? []) {
      if (answerLower.includes(sub.toLowerCase())) {
        failures.push(`Forbidden: "${sub}"`);
      }
    }

    // LLM Judge (optional)
    let judgeScore = -1;
    if (useJudge && test.expectAnswer) {
      judgeScore = await llmJudge(test.query, answer);
    }

    return {
      test,
      passed: failures.length === 0,
      answer: answer.slice(0, 300),
      failures,
      judgeScore,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      test,
      passed: false,
      answer: '',
      failures: [`Error: ${err instanceof Error ? err.message : String(err)}`],
      judgeScore: -1,
      durationMs: Date.now() - start,
    };
  }
}

// ── Main ───────────��────────────────────────────────────────────────────────

async function main() {
  let tests = GOLDEN_TESTS;

  // Filter by category
  if (catFilter) {
    tests = tests.filter(t => {
      if (catFilter === 'legal') return !t.category || t.category === 'legal';
      if (catFilter === 'refusal') return !t.expectAnswer;
      return t.category === catFilter;
    });
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  KB Eval — Config ${activeConfig.name}`);
  console.log(`  ${activeConfig.description}`);
  console.log(`  Tests: ${tests.length} | Judge: ${useJudge ? 'ON' : 'OFF'} | Verbose: ${verbose ? 'ON' : 'OFF'}`);
  console.log(`${'═'.repeat(60)}\n`);

  const results: TestResult[] = [];
  let idx = 0;

  for (const test of tests) {
    idx++;
    process.stdout.write(`  [${idx}/${tests.length}] ${test.name}... `);
    const result = await runTest(test);
    results.push(result);

    const judgeStr = result.judgeScore >= 0 ? ` J=${result.judgeScore}` : '';
    if (result.passed) {
      console.log(`✅ ${result.durationMs}ms${judgeStr}`);
    } else {
      console.log(`❌ ${result.durationMs}ms${judgeStr}`);
      for (const f of result.failures) {
        console.log(`     → ${f}`);
      }
    }

    if (verbose && result.answer) {
      console.log(`     📝 ${result.answer.replace(/\n/g, ' ').slice(0, 150)}...`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const pct = Math.round((passed / total) * 100);

  const judged = results.filter(r => r.judgeScore >= 0);
  const avgJudge = judged.length
    ? (judged.reduce((s, r) => s + r.judgeScore, 0) / judged.length)
    : null;

  const avgMs = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length);

  // By difficulty
  const byDiff = ['easy', 'medium', 'hard'].map(d => {
    const group = results.filter(r => (r.test.difficulty ?? 'easy') === d);
    if (!group.length) return null;
    const p = group.filter(r => r.passed).length;
    const j = group.filter(r => r.judgeScore >= 0);
    const jAvg = j.length ? (j.reduce((s, r) => s + r.judgeScore, 0) / j.length).toFixed(2) : '-';
    return { d, total: group.length, passed: p, jAvg };
  }).filter(Boolean);

  console.log(`\n${'━'.repeat(60)}`);
  console.log(`  Config: ${activeConfig.name}`);
  console.log(`  Pass rate: ${passed}/${total} (${pct}%)`);
  if (avgJudge !== null) console.log(`  LLM Judge avg: ${avgJudge.toFixed(2)}`);
  console.log(`  Avg latency: ${avgMs}ms`);

  if (byDiff.length) {
    console.log(`\n  By difficulty:`);
    for (const d of byDiff) {
      if (d) console.log(`    ${d.d}: ${d.passed}/${d.total} pass, judge=${d.jAvg}`);
    }
  }

  // Failed tests summary
  const failed = results.filter(r => !r.passed);
  if (failed.length > 0) {
    console.log(`\n  Failed:`);
    for (const r of failed) {
      console.log(`    ❌ ${r.test.name}: ${r.failures.join(', ')}`);
    }
  }

  console.log(`${'━'.repeat(60)}\n`);

  process.exit(passed === total ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
