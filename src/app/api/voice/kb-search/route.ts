/**
 * POST /api/voice/kb-search
 * Function call від ElevenLabs → пошук у базі знань.
 * Auth: webhook secret (виклик від ElevenLabs, не від браузера).
 *
 * Вся логіка (переформулювання, очистка для голосу) — тут, НЕ в промті говорилки.
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';
import { checkRateLimit } from '@/lib/shared/api/request-guards';
import { searchAndAnswer } from '@/lib/kb';
import { getServerDb } from '@/lib/shared/db-server';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

/** Маркери «не знайдено» у відповіді KB */
const NOT_FOUND_MARKERS = [
  'не знайдено інформації',
  'немає інформації',
  'відсутня інформація',
  'база знань порожня',
];

function verifyWebhookSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-webhook-secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '');
  return !!config.elevenlabs.webhookSecret && secret === config.elevenlabs.webhookSecret;
}

/** Очищення тексту від HTML/форматування для озвучування TTS */
function cleanForVoice(text: string): string {
  return text
    // Видалити cost footer (🤖 model · tokens · $cost)
    .replace(/\n*🤖\s.+$/s, '')
    // Видалити рядки-посилання на документи (📄 «...», § ...)
    .replace(/^📄\s.+$/gm, '')
    // Видалити HTML теги (залишити текст всередині)
    .replace(/<[^>]+>/g, '')
    // Замінити спецсимволи HTML
    .replace(/&amp;/g, 'і').replace(/&lt;/g, '').replace(/&gt;/g, '').replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    // Видалити розділювачі
    .replace(/^-{3,}$/gm, '')
    .replace(/^\*{3,}$/gm, '')
    // Буллети → прибрати символ, залишити текст
    .replace(/^[•·●]\s*/gm, '')
    // Стиснути зайві порожні рядки
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Переформулювання запиту через OpenAI для retry при «не знайдено» */
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
              'Приклади:\n' +
              '• «порносайти» → «політика використання інтернету на робочому місці»\n' +
              '• «встановити Photoshop» → «встановлення програмного забезпечення на робочу станцію»\n' +
              '• «зламали пошту» → «інцидент інформаційної безпеки, компрометація облікового запису»\n' +
              'Мова: українська. Поверни ТІЛЬКИ переформульований запит.',
          },
          { role: 'user', content: original },
        ],
        max_tokens: 200,
        temperature: 0,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!config.app.voiceBotEnabled) {
    return NextResponse.json({ error: 'Voice Bot disabled' }, { status: 503 });
  }

  if (!verifyWebhookSecret(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rl = checkRateLimit('voice_kb_global', RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  let body: { query?: string; category?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  try {
    const db = getServerDb();

    // 1. Перший пошук — оригінальний запит
    let result = await searchAndAnswer(query, {
      userId: '',
      role: 'employee',
      source: 'voice-bot',
      db,
      category: body.category,
    });

    // 2. Retry — якщо KB не знайшла, переформулювати та спробувати ще раз
    const isNotFound = NOT_FOUND_MARKERS.some(m => result.text.toLowerCase().includes(m));
    if (isNotFound) {
      const rephrased = await rephraseQuery(query);
      if (rephrased && rephrased !== query) {
        logger.info('[voice/kb-search] retry with rephrased:', rephrased);
        result = await searchAndAnswer(rephrased, {
          userId: '',
          role: 'employee',
          source: 'voice-bot',
          db,
          category: body.category,
        });
      }
    }

    // 3. Очистка для голосу
    const plainText = cleanForVoice(result.text);

    return NextResponse.json({ answer: plainText });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[voice/kb-search] error:', msg);
    return NextResponse.json({ answer: 'Вибачте, не вдалося знайти відповідь.' });
  }
}
