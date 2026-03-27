import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { getServerDb } from '@/lib/shared/db-server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';

// ─── Rate limit config ───
const RATE_LIMIT = 10;          // запросов (POST — мутация)
const RATE_WINDOW_MS = 60_000;  // за 1 минуту

export async function POST(req: NextRequest) {
  // 1. Авторизация
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Rate limiting
  const rateLimit = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
    );
  }

  // 3. User ID из cookie
  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  try {
    // 4. Валидация body
    const body = await req.json();
    const { reportId, text } = body as { reportId?: string; text?: string };

    if (!reportId || typeof reportId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid reportId' }, { status: 400 });
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Missing or empty text' }, { status: 400 });
    }

    // 5. Запись в БД через service-role
    const db = getServerDb();

    const { data, error } = await db
      .from('report_comments')
      .insert({
        report_id: reportId,
        user_id: userId,
        text: text.trim(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error: unknown) {
    logger.error('[reports/comment] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
