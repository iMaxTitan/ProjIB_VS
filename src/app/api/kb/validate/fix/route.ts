/**
 * POST /api/kb/validate/fix — generate AI fix suggestion for a specific check failure.
 * Auth: chief or head only. Rate limit: 15/min.
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { requireKbManager } from '../_auth';
import { generateAITextWithUsage } from '@/lib/shared/ai/client';
import { config } from '@/lib/shared/config';

const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;

interface FixRequest {
  checkId: string;
  label: string;
  detail: string;
  preview: string;
  fileName: string;
}

export async function POST(req: NextRequest) {
  const auth = await requireKbManager(req, RATE_LIMIT, RATE_WINDOW_MS);
  if (!auth.ok) return auth.response;

  if (!config.anthropic.apiKey) {
    return NextResponse.json({ error: 'AI не налаштовано' }, { status: 503 });
  }

  try {
    const body = await req.json() as FixRequest;
    const { checkId, label, detail, preview, fileName } = body;

    if (!checkId || !preview?.trim()) {
      return NextResponse.json({ error: 'Missing checkId or preview' }, { status: 400 });
    }

    const systemPrompt =
      'Ти — експерт з корпоративних документів. Генеруй виправлений текст розділу/секції.\n' +
      'ПРАВИЛА:\n' +
      '- Відповідай ТІЛЬКИ українською\n' +
      '- Поверни конкретний виправлений текст, який можна вставити у документ\n' +
      '- Формат: Markdown (заголовки #, ##, списки)\n' +
      '- Не пиши пояснень — тільки готовий текст для вставки\n' +
      '- Зберігай стиль та тематику оригіналу\n' +
      '- ВАЖЛИВО: текст який ти ДОДАВ або ЗМІНИВ оберни маркерами {{+}} і {{/+}}\n' +
      '- Оригінальний текст залиш без маркерів\n' +
      '- Приклад: Оригінальне речення. {{+}}Нове додане речення.{{/+}}';

    const userContent =
      `Документ: «${fileName}»\n` +
      `Проблема: ${label} — ${detail}\n` +
      `ID перевірки: ${checkId}\n\n` +
      `=== ТЕКСТ ДОКУМЕНТА ===\n${preview.slice(0, 6000)}\n=== КІНЕЦЬ ===\n\n` +
      `Згенеруй виправлений варіант тексту, який усуне цю проблему. ` +
      `Якщо проблема стосується конкретного розділу — поверни тільки цей розділ. ` +
      `Якщо потрібно додати метадані або структуру — покажи як має виглядати.`;

    const result = await generateAITextWithUsage({
      providerOverride: 'anthropic',
      anthropicModel: 'claude-haiku-4-5-20251001',
      maxTokens: 1500,
      temperature: 0.3,
      timeoutMs: 30_000,
      systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    return NextResponse.json({ fix: result.text });
  } catch (error: unknown) {
    logger.error('[kb/validate/fix/POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
