import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId, checkRateLimit } from '@/lib/api/request-guards';
import { getOnlineEntries } from '@/lib/presence/store';
import { getEmployeesMap } from '@/lib/presence/employee-cache';
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
    const { ensureSeeded } = await import('@/lib/presence/seed');
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

    return NextResponse.json({ users });
  } catch (error: unknown) {
    logger.error('[presence/online] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
