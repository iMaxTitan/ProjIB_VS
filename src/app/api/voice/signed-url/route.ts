/**
 * POST /api/voice/signed-url
 * Генерує signed URL для ElevenLabs Conversational AI сесії.
 * Auth: JWT cookie (авторизовані користувачі).
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
import { getSignedUrl } from '@/lib/bot/voice/elevenlabs-client';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
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

  const rl = checkRateLimit(`voice_url_${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  try {
    const result = await getSignedUrl();
    return NextResponse.json({ signedUrl: result.signedUrl, userId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[voice/signed-url] error:', msg);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
