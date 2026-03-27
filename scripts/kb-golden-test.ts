/**
 * KB RAG Pipeline — Golden Test Runner.
 * Runs a set of predefined queries and checks expected outcomes.
 *
 * Usage: npx tsx scripts/kb-golden-test.ts
 *
 * Requires: VOYAGE_API_KEY, ANTHROPIC_API_KEY (or OPENAI_API_KEY),
 *           NEXT_PUBLIC_API_URL, POSTGREST_SERVICE_KEY
 */

import 'dotenv/config';
import { GOLDEN_TESTS, type GoldenTest } from '../src/lib/kb/__tests__/golden-tests';
import { searchAndAnswer } from '../src/lib/kb/search';
import { createClient } from '../src/lib/shared/postgrest-client';

const SUPABASE_URL = process.env.NEXT_PUBLIC_API_URL!;
const SUPABASE_KEY = process.env.POSTGREST_SERVICE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const AI_REFUSAL_MARKER = 'немає інформації про';

interface TestResult {
  test: GoldenTest;
  passed: boolean;
  answer: string;
  failures: string[];
  durationMs: number;
}

async function runTest(test: GoldenTest): Promise<TestResult> {
  const start = Date.now();
  const failures: string[] = [];

  try {
    const result = await searchAndAnswer(test.query, {
      userId: 'golden-test',
      role: 'chief',
      db,
      category: test.category,
    });

    const answer = result.text;
    const answerLower = answer.toLowerCase();

    // Check expected substrings
    for (const sub of test.expectedSubstrings) {
      if (!answerLower.includes(sub.toLowerCase())) {
        failures.push(`Missing: "${sub}"`);
      }
    }

    // Check answer vs refusal
    const hasRefusal = answer.includes(AI_REFUSAL_MARKER);
    if (test.expectAnswer && hasRefusal) {
      failures.push('Got refusal, expected answer');
    }
    if (!test.expectAnswer && !hasRefusal) {
      failures.push('Expected refusal, got answer');
    }

    // Check forbidden substrings
    for (const sub of test.forbiddenSubstrings ?? []) {
      if (answerLower.includes(sub.toLowerCase())) {
        failures.push(`Forbidden found: "${sub}"`);
      }
    }

    return {
      test,
      passed: failures.length === 0,
      answer: answer.slice(0, 200),
      failures,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      test,
      passed: false,
      answer: '',
      failures: [`Error: ${err instanceof Error ? err.message : String(err)}`],
      durationMs: Date.now() - start,
    };
  }
}

async function main() {
  console.log(`\n🧪 KB Golden Tests — ${GOLDEN_TESTS.length} tests\n`);

  const results: TestResult[] = [];

  for (const test of GOLDEN_TESTS) {
    process.stdout.write(`  ${test.name}... `);
    const result = await runTest(test);
    results.push(result);

    if (result.passed) {
      console.log(`✅ (${result.durationMs}ms)`);
    } else {
      console.log(`❌ (${result.durationMs}ms)`);
      for (const f of result.failures) {
        console.log(`     → ${f}`);
      }
      console.log(`     Answer: ${result.answer}...`);
    }
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const pct = Math.round((passed / total) * 100);

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Score: ${passed}/${total} (${pct}%)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  process.exit(passed === total ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
