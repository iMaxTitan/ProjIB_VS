/**
 * Pipeline A/B/C test on the GOOD document only (Правила перетинання кордону).
 * Tests different RERANK_TOP_K / POST_RERANK_MAX_PER_DOC configs.
 *
 * Usage: npx tsx scripts/kb-eval-pipeline.ts
 */

import './eval-env';
import { getServerDb } from '../src/lib/shared/db-server';

const db = getServerDb();

interface TestCase {
  name: string;
  query: string;
  expectedSubstrings: string[];
}

const TESTS: TestCase[] = [
  {
    name: 'документи для виїзду',
    query: 'які документи потрібні для перетинання кордону',
    expectedSubstrings: ['паспорт'],
  },
  {
    name: 'інваліди кордон',
    query: 'чи може особа з інвалідністю виїхати за кордон під час воєнного стану',
    expectedSubstrings: ['інвалідн'],
  },
  {
    name: 'діти-сироти виїзд',
    query: 'як оформити виїзд дитини-сироти за кордон',
    expectedSubstrings: ['дит'],
  },
  {
    name: 'пункти пропуску',
    query: 'де можна перетнути державний кордон',
    expectedSubstrings: ['пункт'],
  },
  {
    name: 'хто може виїхати воєнний стан',
    query: 'хто має право виїхати за кордон під час воєнного стану',
    expectedSubstrings: ['воєнн'],
  },
  {
    name: 'супровід інваліда',
    query: 'хто може супроводжувати особу з інвалідністю при виїзді за кордон',
    expectedSubstrings: ['супровод'],
  },
  {
    name: 'консульський облік',
    query: 'чи потрібно ставати на консульський облік при виїзді',
    expectedSubstrings: ['консульськ'],
  },
  {
    name: 'дипломатичний паспорт',
    query: 'чи можна перетнути кордон за дипломатичним паспортом',
    expectedSubstrings: ['дипломатичн'],
  },
];

// ── LLM Judge ─────────────────────────────────────────────────────────────

async function llmJudge(query: string, answer: string): Promise<{ score: number; reason: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { score: -1, reason: 'no key' };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      temperature: 0,
      system: `You judge answer quality for a corporate knowledge base about Ukrainian law.
Rate how well the answer addresses the question:
- 1.0 = correct, specific, cites articles/clauses, directly answers
- 0.5 = partially correct, vague, or missing key details
- 0.0 = wrong, irrelevant, or refuses when answer should exist

Respond with exactly one line: SCORE|REASON
Example: 1.0|Contains specific articles and complete answer
Example: 0.5|Mentions the topic but lacks specific legal references`,
      messages: [
        { role: 'user', content: `Question: ${query}\n\nAnswer: ${answer.slice(0, 2000)}` },
      ],
    }),
  });

  if (!response.ok) return { score: -1, reason: 'api error' };
  const data = await response.json() as { content: Array<{ text: string }> };
  const text = (data.content?.[0]?.text ?? '').trim();
  const parts = text.split('|');
  const score = parseFloat(parts[0]);
  const reason = parts.slice(1).join('|').trim() || text;
  if ([0, 0.5, 1].includes(score)) return { score, reason };
  return { score: -1, reason: `parse error: ${text.slice(0, 80)}` };
}

// ── Pipeline configs ────────────────────────────────────────────────────

interface PipelineConfig {
  name: string;
  env: Record<string, string>;
}

const CONFIGS: PipelineConfig[] = [
  { name: 'A: k=10, max/doc=2 (current)', env: { KB_RERANK_TOP_K: '10', KB_POST_RERANK_MAX_PER_DOC: '2' } },
  { name: 'B: k=5, max/doc=2',            env: { KB_RERANK_TOP_K: '5',  KB_POST_RERANK_MAX_PER_DOC: '2' } },
  { name: 'C: k=3, max/doc=1',            env: { KB_RERANK_TOP_K: '3',  KB_POST_RERANK_MAX_PER_DOC: '1' } },
  { name: 'D: k=3, max/doc=2',            env: { KB_RERANK_TOP_K: '3',  KB_POST_RERANK_MAX_PER_DOC: '2' } },
  { name: 'E: k=8, max/doc=1',            env: { KB_RERANK_TOP_K: '8',  KB_POST_RERANK_MAX_PER_DOC: '1' } },
];

// ── Run ─────────────────────────────────────────────────────────────────

async function runConfig(config: PipelineConfig): Promise<{
  passRate: number; judgeAvg: number; avgMs: number;
  details: Array<{ name: string; passed: boolean; judge: number; reason: string; ms: number }>;
}> {
  // Apply env
  for (const [k, v] of Object.entries(config.env)) process.env[k] = v;

  // Force reimport of search module to pick up new env values
  // Since Node caches modules, we need to invalidate
  const searchModulePath = require.resolve('../src/lib/kb/search');
  delete require.cache[searchModulePath];
  const { searchAndAnswer } = await import('../src/lib/kb/search');

  const details: Array<{ name: string; passed: boolean; judge: number; reason: string; ms: number }> = [];

  for (const test of TESTS) {
    const start = Date.now();
    const result = await searchAndAnswer(test.query, { userId: 'pipe-test', role: 'chief', db });
    const ms = Date.now() - start;

    const answerLower = result.text.toLowerCase();
    const passed = test.expectedSubstrings.every(s => answerLower.includes(s.toLowerCase()));
    const { score, reason } = await llmJudge(test.query, result.text);

    details.push({ name: test.name, passed, judge: score, reason, ms });
  }

  const passRate = details.filter(d => d.passed).length / details.length;
  const judged = details.filter(d => d.judge >= 0);
  const judgeAvg = judged.length ? judged.reduce((s, d) => s + d.judge, 0) / judged.length : -1;
  const avgMs = Math.round(details.reduce((s, d) => s + d.ms, 0) / details.length);

  return { passRate, judgeAvg, avgMs, details };
}

async function main() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Pipeline A/B/C/D/E Test — GOOD document only (Правила кордону)`);
  console.log(`  ${TESTS.length} queries × ${CONFIGS.length} configs = ${TESTS.length * CONFIGS.length} runs`);
  console.log(`${'═'.repeat(70)}\n`);

  const results: Array<{ config: string; passRate: number; judgeAvg: number; avgMs: number;
    details: Array<{ name: string; passed: boolean; judge: number; reason: string; ms: number }> }> = [];

  for (const config of CONFIGS) {
    console.log(`\n── ${config.name} ${'─'.repeat(50)}\n`);

    const result = await runConfig(config);
    results.push({ config: config.name, ...result });

    for (const d of result.details) {
      const icon = d.passed ? '✅' : '❌';
      const jStr = d.judge >= 0 ? `J=${d.judge}` : 'J=?';
      console.log(`  ${icon} ${d.name} — ${jStr} ${d.ms}ms`);
      if (d.judge >= 0) console.log(`     ${d.reason}`);
    }

    console.log(`\n  → Pass: ${Math.round(result.passRate * 100)}% | Judge: ${result.judgeAvg >= 0 ? result.judgeAvg.toFixed(2) : '?'} | Avg: ${result.avgMs}ms`);
  }

  // ── Summary table ───────────────────────────────────────────────────

  console.log(`\n${'━'.repeat(70)}`);
  console.log(`  SUMMARY`);
  console.log(`${'━'.repeat(70)}`);
  console.log(`  ${'Config'.padEnd(32)} Pass%   Judge   Latency`);
  console.log(`  ${'─'.repeat(60)}`);

  for (const r of results) {
    const pass = `${Math.round(r.passRate * 100)}%`.padEnd(8);
    const judge = r.judgeAvg >= 0 ? r.judgeAvg.toFixed(2).padEnd(8) : '?'.padEnd(8);
    const ms = `${r.avgMs}ms`;
    console.log(`  ${r.config.padEnd(32)} ${pass}${judge}${ms}`);
  }
  console.log(`${'━'.repeat(70)}\n`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
