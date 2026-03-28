/**
 * Compare prefix generation quality: Claude Haiku vs Gemma 3 27B vs Qwen3 80B
 * Takes 5 real chunks and generates prefixes with each model.
 *
 * Usage: npx tsx scripts/test-prefix-models.ts
 */

import './eval-env';
import { createPostgrestClient } from '../src/lib/shared/postgrest-client';
import { config } from '../src/lib/shared/config';

const OPENROUTER_KEY = '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';

const CONTEXT_PROMPT =
  'You receive a fragment of a Ukrainian corporate/legal document and a document summary.\n' +
  'Generate a structured search index entry. Output in UKRAINIAN, instructions in English.\n\n' +
  'AUDIENCE: АТБ-Маркет — найбільша національна роздрібна мережа України (~1000 магазинів). ' +
  'Users: від касирів, продавців, комірників до логістів, маркетологів, бухгалтерів, IT, HR та керівництва. ' +
  'They search in Ukrainian or mixed Ukrainian-Russian (surzhyk).\n\n' +
  'FORMAT (every line mandatory):\n' +
  '[Пошук: comma-separated list of 5-10 COLLOQUIAL Ukrainian search terms users would type to find this fragment]\n' +
  '[Тип: загальне правило | виняток | процедура | визначення | перелік | заборона | відповідальність | вимога | право/гарантія | обов\'язок | строк/термін | стандарт/норматив]\n' +
  '[Стосується: WHO or WHAT is the subject — specific category of persons, objects, situations]\n' +
  '1-2 sentences of context (max 50 words) — what rule/procedure this fragment describes.\n\n' +
  'CRITICAL RULES for [Пошук:]:\n' +
  '- Add COLLOQUIAL synonyms and surzhyk variants. Examples:\n' +
  '  "військовозобов\'язані які не підлягають призову" → add "заброньовані, бронювання, бронирование"\n' +
  '  "припинення трудових відносин" → add "звільнення, як звільнитися, увольнение"\n' +
  '  "знімні носії інформації" → add "флешка, USB"\n' +
  '  "щорічна основна відпустка" → add "відпустка, отпуск, скільки днів відпустки"\n' +
  '- Add abbreviations: ТЦК, ВЛК, ВОД, АРМ, КМУ, КЗПП, etc.\n' +
  '- Think: "what would a Ukrainian retail chain employee type in a Telegram bot in Ukrainian or mixed Ukrainian-Russian?"\n' +
  '- Do NOT repeat words from the document title\n\n' +
  'Output ONLY the structured entry, no explanations.';

interface Model {
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
}

const MODELS: Model[] = [
  {
    name: 'Claude Haiku 4.5',
    endpoint: 'https://api.anthropic.com/v1/messages',
    apiKey: config.anthropic.apiKey!,
    model: 'claude-haiku-4-5-20251001',
  },
  {
    name: 'Grok 4 Fast ($0.20/$0.50)',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: OPENROUTER_KEY,
    model: 'x-ai/grok-4-fast',
  },
  {
    name: 'Grok 4.1 Fast ($0.20/$0.50)',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: OPENROUTER_KEY,
    model: 'x-ai/grok-4.1-fast',
  },
];

async function callAnthropic(model: Model, system: string, user: string): Promise<{ text: string; ms: number }> {
  const start = Date.now();
  const res = await fetch(model.endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': model.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model.model,
      max_tokens: 300,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return { text: `ERROR ${res.status}: ${err.slice(0, 200)}`, ms: Date.now() - start };
  }
  const data = await res.json() as { content: Array<{ text: string }> };
  return { text: data.content?.[0]?.text?.trim() || '', ms: Date.now() - start };
}

async function callOpenRouter(model: Model, system: string, user: string): Promise<{ text: string; ms: number }> {
  const start = Date.now();
  const res = await fetch(model.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${model.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model.model,
      max_tokens: 300,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return { text: `ERROR ${res.status}: ${err.slice(0, 200)}`, ms: Date.now() - start };
  }
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return { text: data.choices?.[0]?.message?.content?.trim() || '', ms: Date.now() - start };
}

async function generatePrefix(model: Model, docTitle: string, docSummary: string, heading: string, content: string): Promise<{ text: string; ms: number }> {
  const userMsg =
    `Документ: «${docTitle}»\n` +
    `Розділ: ${heading || '(без заголовку)'}\n\n` +
    `Загальний зміст документа (скорочено):\n${docSummary.slice(0, 3000)}\n\n` +
    `Фрагмент:\n${content}`;

  if (model.endpoint.includes('anthropic')) {
    return callAnthropic(model, CONTEXT_PROMPT, userMsg);
  }
  return callOpenRouter(model, CONTEXT_PROMPT, userMsg);
}

async function main() {
  const db = createPostgrestClient(config.db.serverUrl, config.db.serviceRoleKey, { auth: { persistSession: false } });

  // Get 5 diverse chunks from bronuvannya doc
  const { data: doc } = await db
    .from('kb_documents')
    .select('id, title, content')
    .eq('metadata->>doc_number', '76-2023-п')
    .single();

  if (!doc) { console.error('Doc not found'); process.exit(1); }
  const { title, content: docContent } = doc as { id: string; title: string; content: string };

  const { data: chunks } = await db
    .from('kb_chunks')
    .select('chunk_index, heading, content')
    .eq('document_id', (doc as { id: string }).id)
    .order('chunk_index')
    .limit(100);

  // Pick 5 diverse chunks: first, middle-ish, specific ones
  const allChunks = chunks as Array<{ chunk_index: number; heading: string; content: string }>;
  const selected = [allChunks[5], allChunks[15], allChunks[25], allChunks[35], allChunks[45]].filter(Boolean);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Prefix generation comparison — ${MODELS.length} models × ${selected.length} chunks`);
  console.log(`${'═'.repeat(70)}`);

  // Filter to only available models
  const availableModels = MODELS.filter(m => m.apiKey);

  for (let i = 0; i < selected.length; i++) {
    const chunk = selected[i];
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  Chunk ${i + 1}: [${chunk.chunk_index}] ${(chunk.heading || '').slice(0, 60)}`);
    console.log(`  Content: ${chunk.content.slice(0, 100).replace(/\n/g, ' ')}...`);
    console.log(`${'─'.repeat(70)}`);

    for (const model of availableModels) {
      const { text, ms } = await generatePrefix(model, title, docContent, chunk.heading || '', chunk.content);
      const hasFormat = text.includes('[Пошук:') && text.includes('[Тип:') && text.includes('[Стосується:');
      const icon = hasFormat ? '✅' : '❌';

      console.log(`\n  ${icon} ${model.name} (${ms}ms):`);
      // Show each line of the prefix
      for (const line of text.split('\n').slice(0, 6)) {
        console.log(`     ${line.slice(0, 120)}`);
      }
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  Done`);
  console.log(`${'═'.repeat(70)}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
