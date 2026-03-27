/**
 * GET /api/voice/sessions
 * Список голосових сесій для дашборду.
 * Auth: JWT cookie, chief/head only.
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';
import {
  isRequestAuthorized,
  getDbUserId,
  getRequesterKey,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';
import { getVoiceSessions, getVoiceStats } from '@/lib/bot/voice/session-logger';

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const ALLOWED_ROLES = ['chief', 'head'];

export async function GET(req: NextRequest) {
  if (!config.app.voiceBotEnabled) {
    return NextResponse.json({ error: 'Voice Bot disabled' }, { status: 503 });
  }

  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(`voice_sessions_${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  try {
    const db = getServerDb();

    // Перевіряємо роль
    const { data: profile } = await db
      .from('user_profiles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);

    const [sessions, stats] = await Promise.all([
      getVoiceSessions(db, { limit }),
      getVoiceStats(db),
    ]);

    return NextResponse.json({ sessions, stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[voice/sessions] error:', msg);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
