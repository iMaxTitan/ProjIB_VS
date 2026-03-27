import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getDbUserId,
  checkRateLimit,
  getRequesterKey,
} from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';
import { searchAndAnswer } from '@/lib/kb/search';
import logger from '@/lib/shared/logger';

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(getRequesterKey(req), 30, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { query?: string; category?: string; history?: Array<{ role: 'user' | 'assistant'; content: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json({ error: 'Запит занадто короткий' }, { status: 400 });
  }
  if (query.length > 1000) {
    return NextResponse.json({ error: 'Запит занадто довгий (макс. 1000 символів)' }, { status: 400 });
  }

  const db = getServerDb();

  // Look up user role for analytics logging
  let role = 'employee';
  try {
    const { data } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
    if (data?.role) role = data.role;
  } catch { /* non-critical */ }

  try {
    const result = await searchAndAnswer(query, {
      userId,
      role,
      source: 'web',
      db,
      category: body.category ?? undefined,
      history: Array.isArray(body.history) ? body.history.slice(-6) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    logger.error('[api/kb/search] error:', err);
    return NextResponse.json({ error: 'Помилка пошуку' }, { status: 500 });
  }
}
