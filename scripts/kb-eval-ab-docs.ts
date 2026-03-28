/**
 * A/B test: "good" document (structured prefixes + per-section chunks)
 * vs "regular" document (text prefix + same heading for all chunks).
 *
 * Good: "Правила перетинання державного кордону" (57-95-п)
 * Regular: "Бронювання військовозобов'язаних" (КМУ 76)
 *
 * Usage: npx tsx scripts/kb-eval-ab-docs.ts
 */

import './eval-env';
import { searchAndAnswer } from '../src/lib/kb/search';
import { getServerDb } from '../src/lib/shared/db-server';

const db = getServerDb();

interface TestCase {
  name: string;
  query: string;
  doc: 'good' | 'regular';
  expectedSubstrings: string[];
}

const TESTS: TestCase[] = [
  // ═══ "Good" document — Правила перетинання кордону ═══
  {
    name: 'GOOD: документи для виїзду',
    query: 'які документи потрібні для перетинання кордону',
    doc: 'good',
    expectedSubstrings: ['паспорт'],
  },
  {
    name: 'GOOD: інваліди кордон',
    query: 'чи може особа з інвалідністю виїхати за кордон під час воєнного стану',
    doc: 'good',
    expectedSubstrings: ['інвалідн'],
  },
  {
    name: 'GOOD: діти-сироти виїзд',
    query: 'як оформити виїзд дитини-сироти за кордон',
    doc: 'good',
    expectedSubstrings: ['дит'],
  },
  {
    name: 'GOOD: пункти пропуску',
    query: 'де можна перетнути державний кордон',
    doc: 'good',
    expectedSubstrings: ['пункт'],
  },
  {
    name: 'GOOD: хто може виїхати під час воєнного стану',
    query: 'хто має право виїхати за кордон під час воєнного стану',
    doc: 'good',
    expectedSubstrings: ['воєнн'],
  },

  // ═══ "Regular" document — Бронювання ═══
  {
    name: 'REG: строк бронювання',
    query: 'на який строк надається бронювання працівників',
    doc: 'regular',
    expectedSubstrings: ['місяц'],
  },
  {
    name: 'REG: хто може бронювати',
    query: 'які підприємства мають право бронювати працівників',
    doc: 'regular',
    expectedSubstrings: ['критично важлив'],
  },
  {
    name: 'REG: ліміт 50%',
    query: 'скільки відсотків працівників можна забронювати',
    doc: 'regular',
    expectedSubstrings: ['50'],
  },
  {
    name: 'REG: порядок подання',
    query: 'який порядок подання документів на бронювання працівників',
    doc: 'regular',
    expectedSubstrings: ['бронюванн'],
  },
  {
    name: 'REG: що буде якщо порушив облік',
    query: 'які наслідки порушення правил військового обліку на підприємстві',
    doc: 'regular',
    expectedSubstrings: ['порушен'],
  },
];

// ── LLM Judge ─────────────────────────────────────────────────────────────

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
      max_tokens: 100,
      temperature: 0,
      system: `You are a strict answer quality judge for a corporate knowledge base about Ukrainian law.
Rate how well the answer addresses the question. Consider:
- Does it contain specific facts (article numbers, dates, percentages)?
- Is it directly answering the question or giving vague general info?
- Are the cited sources relevant?

Reply with ONLY a JSON: {"score": 0|0.5|1, "reason": "brief reason"}
- 1.0 = correct, specific, directly answers with concrete facts
- 0.5 = partially correct, vague, or missing key details
- 0.0 = wrong, irrelevant, or refusal when answer should exist`,
      messages: [
        { role: 'user', content: `Question: ${query}\n\nAnswer: ${answer.slice(0, 2000)}` },
      ],
    }),
  });

  if (!response.ok) return -1;
  const data = await response.json() as { content: Array<{ text: string }> };
  const text = data.content?.[0]?.text?.trim() ?? '';
  try {
    const parsed = JSON.parse(text);
    console.log(`     🤖 Judge: ${parsed.score} — ${parsed.reason}`);
    return parsed.score;
  } catch {
    const score = parseFloat(text);
    return [0, 0.5, 1].includes(score) ? score : -1;
  }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  A/B Doc Test: structured prefixes vs regular prefixes`);
  console.log(`  GOOD = Правила перетинання кордону (structured [Пошук:][Тип:])`);
  console.log(`  REG  = Бронювання військовозобов'язаних (text paragraph prefix)`);
  console.log(`${'═'.repeat(65)}\n`);

  const results: Array<{
    test: TestCase; passed: boolean; judgeScore: number;
    rerankTop: string; answer: string; durationMs: number;
  }> = [];

  for (let i = 0; i < TESTS.length; i++) {
    const test = TESTS[i];
    process.stdout.write(`  [${i + 1}/${TESTS.length}] ${test.name}... `);
    const start = Date.now();

    const result = await searchAndAnswer(test.query, {
      userId: 'ab-test',
      role: 'chief',
      db,
    });

    const answer = result.text;
    const answerLower = answer.toLowerCase();
    const passed = test.expectedSubstrings.every(s => answerLower.includes(s.toLowerCase()));
    const durationMs = Date.now() - start;

    console.log(passed ? `✅ ${durationMs}ms` : `❌ ${durationMs}ms`);
    if (!passed) {
      for (const s of test.expectedSubstrings) {
        if (!answerLower.includes(s.toLowerCase())) console.log(`     → Missing: "${s}"`);
      }
    }

    // Show answer snippet
    const cleanAnswer = answer.replace(/<[^>]+>/g, '').replace(/\n+/g, ' ');
    console.log(`     📝 ${cleanAnswer.slice(0, 180)}...`);

    // LLM Judge
    const judgeScore = await llmJudge(test.query, answer);

    results.push({ test, passed, judgeScore, rerankTop: '', answer, durationMs });
    console.log('');
  }

  // ── Summary ───────────────────────────────────────────────────────────

  const good = results.filter(r => r.test.doc === 'good');
  const regular = results.filter(r => r.test.doc === 'regular');

  const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  const goodPass = good.filter(r => r.passed).length;
  const regPass = regular.filter(r => r.passed).length;
  const goodJudge = avg(good.filter(r => r.judgeScore >= 0).map(r => r.judgeScore));
  const regJudge = avg(regular.filter(r => r.judgeScore >= 0).map(r => r.judgeScore));
  const goodMs = avg(good.map(r => r.durationMs));
  const regMs = avg(regular.map(r => r.durationMs));

  console.log(`${'━'.repeat(65)}`);
  console.log(`  RESULTS COMPARISON`);
  console.log(`${'━'.repeat(65)}`);
  console.log(`                    GOOD (structured)    REG (regular)`);
  console.log(`  Pass rate:        ${goodPass}/${good.length} (${Math.round(goodPass / good.length * 100)}%)               ${regPass}/${regular.length} (${Math.round(regPass / regular.length * 100)}%)`);
  console.log(`  LLM Judge avg:    ${goodJudge.toFixed(2)}                    ${regJudge.toFixed(2)}`);
  console.log(`  Avg latency:      ${Math.round(goodMs)}ms                ${Math.round(regMs)}ms`);
  console.log(`${'━'.repeat(65)}\n`);

  if (goodJudge > regJudge) {
    console.log(`  → Structured prefixes WIN by ${((goodJudge - regJudge) * 100).toFixed(0)}% on LLM Judge\n`);
  } else if (regJudge > goodJudge) {
    console.log(`  → Regular prefixes WIN by ${((regJudge - goodJudge) * 100).toFixed(0)}% on LLM Judge\n`);
  } else {
    console.log(`  → TIE on LLM Judge\n`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
