/**
 * POST /api/kb/validate/chat — follow-up AI chat about a validated document.
 * Uses the document preview (first 4000 chars) as context.
 * Auth: chief or head only. Rate limit: 20/min.
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';
import { generateAITextWithUsage } from '@/lib/shared/ai/client';
import { config } from '@/lib/shared/config';

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  preview: string;
  fileName: string;
  question: string;
  history: ChatMessage[];
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
    );
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const db = getServerDb();
  const { data: profile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (!profile || !['chief', 'head'].includes(profile.role as string)) {
    return NextResponse.json(
      { error: 'Forbidden: only chief or head can use document chat' },
      { status: 403 },
    );
  }

  if (!config.anthropic.apiKey) {
    return NextResponse.json({ error: 'AI не налаштовано' }, { status: 503 });
  }

  try {
    const body = await req.json() as ChatRequest;
    const { preview, fileName, question, history = [] } = body;

    if (!question?.trim()) {
      return NextResponse.json({ error: 'Питання не може бути порожнім' }, { status: 400 });
    }
    if (!preview?.trim()) {
      return NextResponse.json({ error: 'Відсутній контекст документа' }, { status: 400 });
    }

    const systemPrompt =
      `Ти — асистент з аналізу корпоративних документів.\n` +
      `Файл: «${fileName || 'документ'}»\n` +
      `Нижче наведено початок документа (перші 4000 символів).\n` +
      `Відповідай українською мовою. Будь конкретним і стислим.\n\n` +
      `=== ДОКУМЕНТ ===\n${preview}\n=== КІНЕЦЬ ===`;

    // Build messages: history (max 6 pairs) + current question
    const messages: ChatMessage[] = [
      ...history.slice(-12),
      { role: 'user', content: question.trim() },
    ];

    const result = await generateAITextWithUsage({
      providerOverride: 'anthropic',
      anthropicModel: 'claude-haiku-4-5-20251001',
      maxTokens: 600,
      temperature: 0.3,
      timeoutMs: 25_000,
      systemPrompt,
      messages,
    });

    return NextResponse.json({ answer: result.text });
  } catch (error: unknown) {
    logger.error('[kb/validate/chat/POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
