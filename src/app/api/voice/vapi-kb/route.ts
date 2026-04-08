/**
 * POST /api/voice/vapi-kb
 * Tool-call endpoint for Vapi voice assistant → KB search.
 *
 * Vapi sends:
 *   { message: { type: "tool-calls", toolCalls: [{ id, function: { name, arguments } }] } }
 * Expected response:
 *   { results: [{ toolCallId, result }] }
 *
 * Auth: VAPI_SERVER_SECRET via x-vapi-secret header or Authorization Bearer.
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';
import { checkRateLimit } from '@/lib/shared/api/request-guards';
import { searchAndAnswer } from '@/lib/kb';
import { getServerDb } from '@/lib/shared/db-server';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

const NOT_FOUND_MARKERS = [
  'не знайдено інформації',
  'немає інформації',
  'відсутня інформація',
  'база знань порожня',
];

function verifySecret(req: NextRequest): boolean {
  const secret =
    req.headers.get('x-vapi-secret') ??
    req.headers.get('authorization')?.replace('Bearer ', '');
  return !!config.vapi.serverSecret && secret === config.vapi.serverSecret;
}

/** Clean text from HTML/formatting for TTS output */
function cleanForVoice(text: string): string {
  return text
    .replace(/\n*🤖\s.+$/s, '')
    .replace(/^📄\s.+$/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, 'і')
    .replace(/&lt;/g, '')
    .replace(/&gt;/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/^-{3,}$/gm, '')
    .replace(/^\*{3,}$/gm, '')
    .replace(/^[•·●]\s*/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

async function rephraseQuery(original: string): Promise<string | null> {
  const apiKey = config.openai.apiKey;
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5_000);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Користувач поставив запитання до корпоративної бази знань, але відповідь не знайдена.\n' +
              'Переформулюй запит ширше, використовуючи загальніші терміни.\n' +
              'Мова: українська. Поверни ТІЛЬКИ переформульований запит.',
          },
          { role: 'user', content: original },
        ],
        max_completion_tokens: 200,
        temperature: 0,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

interface VapiToolCall {
  id: string;
  type?: string;
  function: { name: string; arguments: Record<string, unknown> };
}

interface VapiRequest {
  message?: {
    type?: string;
    toolCalls?: VapiToolCall[];
    // legacy single-call format
    functionCall?: { name: string; parameters: Record<string, unknown> };
  };
}

async function handleKBSearch(query: string, category?: string): Promise<string> {
  const db = getServerDb();

  let result = await searchAndAnswer(query, {
    userId: '',
    role: 'employee',
    source: 'voice-bot',
    db,
    category,
  });

  const isNotFound = NOT_FOUND_MARKERS.some((m) => result.text.toLowerCase().includes(m));
  if (isNotFound) {
    const rephrased = await rephraseQuery(query);
    if (rephrased && rephrased !== query) {
      logger.info('[vapi-kb] retry with rephrased:', rephrased);
      result = await searchAndAnswer(rephrased, {
        userId: '',
        role: 'employee',
        source: 'voice-bot',
        db,
        category,
      });
    }
  }

  return cleanForVoice(result.text);
}

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rl = checkRateLimit('vapi_kb_global', RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  let body: VapiRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const msg = body.message;

    // Format 1: tool-calls (array)
    if (msg?.type === 'tool-calls' && msg.toolCalls?.length) {
      const results = await Promise.all(
        msg.toolCalls.map(async (tc) => {
          const args = tc.function.arguments;
          const query = (args.query as string)?.trim();
          if (!query) return { toolCallId: tc.id, result: 'Не зрозумів запитання.' };
          const answer = await handleKBSearch(query, args.category as string | undefined);
          return { toolCallId: tc.id, result: answer };
        }),
      );
      return NextResponse.json({ results });
    }

    // Format 2: single function-call (legacy)
    if (msg?.functionCall) {
      const params = msg.functionCall.parameters;
      const query = (params.query as string)?.trim();
      if (!query) return NextResponse.json({ result: 'Не зрозумів запитання.' });
      const answer = await handleKBSearch(query, params.category as string | undefined);
      return NextResponse.json({ result: answer });
    }

    return NextResponse.json({ error: 'Unknown message format' }, { status: 400 });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('[vapi-kb] error:', errMsg);
    return NextResponse.json({
      results: [{ toolCallId: 'error', result: 'Вибачте, не вдалося знайти відповідь.' }],
    });
  }
}
