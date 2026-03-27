import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { touchPresence } from '@/lib/ops/presence/store';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  // Per-userId rate limit (все пользователи за одним NAT → per-IP не подходит)
  const rl = checkRateLimit(`presence:hb:${userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  try {
    // Ensure seed runs on first request (lazy)
    const { ensureSeeded } = await import('@/lib/ops/presence/seed');
    await ensureSeeded(getDb());

    touchPresence(userId);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    logger.error('[presence/heartbeat] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
