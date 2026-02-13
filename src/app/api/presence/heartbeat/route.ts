import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId, checkRateLimit } from '@/lib/api/request-guards';
import { touchPresence } from '@/lib/presence/store';
import logger from '@/lib/logger';

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

let _db: ReturnType<typeof createClient> | null = null;
function getDb() {
  if (_db) return _db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  _db = createClient(url, key, { auth: { persistSession: false } });
  return _db;
}

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
    const { ensureSeeded } = await import('@/lib/presence/seed');
    await ensureSeeded(getDb());

    touchPresence(userId);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    logger.error('[presence/heartbeat] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
