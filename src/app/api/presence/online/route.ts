import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getOnlineEntries } from '@/lib/ops/presence/store';
import { getEmployeesMap } from '@/lib/ops/presence/employee-cache';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

// Response cache — all users get the same online list, rebuild once per 10s (not per-request)
let cachedResponse: { json: string; at: number } | null = null;
const RESPONSE_CACHE_MS = 10_000;

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const rl = checkRateLimit(`presence:ol:${userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    );
  }

  try {
    // Return cached response if fresh (all users see the same online list)
    if (cachedResponse && Date.now() - cachedResponse.at < RESPONSE_CACHE_MS) {
      return new NextResponse(cachedResponse.json, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { ensureSeeded } = await import('@/lib/ops/presence/seed');
    await ensureSeeded(getDb());

    const onlineMap = getOnlineEntries();
    const employees = await getEmployeesMap(getDb());

    const users: Array<{
      user_id: string;
      displayName: string;
      email: string;
      photo_base64: string | null;
      online_at: string;
    }> = [];

    onlineMap.forEach((lastSeenMs, id) => {
      const emp = employees.get(id);
      if (!emp) return;
      users.push({
        user_id: emp.user_id,
        displayName: emp.full_name || emp.email || 'User',
        email: emp.email,
        photo_base64: emp.photo_base64 || null,
        online_at: new Date(lastSeenMs).toISOString(),
      });
    });

    const json = JSON.stringify({ users });
    cachedResponse = { json, at: Date.now() };

    return new NextResponse(json, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    logger.error('[presence/online] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
