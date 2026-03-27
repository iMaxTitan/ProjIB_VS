/**
 * GET/PUT /api/telegram/notification-settings
 * Manage global notification toggles (chief only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId, checkRateLimit, getRequesterKey } from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

async function checkChiefRole(db: ReturnType<typeof getServerDb>, userId: string): Promise<boolean> {
  const { data } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();
  return data?.role === 'chief';
}

/** GET — list all notification settings */
export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const db = getServerDb();

  if (!await checkChiefRole(db, userId)) {
    return NextResponse.json({ error: 'Forbidden — chief only' }, { status: 403 });
  }

  const { data, error } = await db
    .from('telegram_notification_settings')
    .select('*')
    .order('event_type');

  if (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ settings: data || [] });
}

/** PUT — toggle a notification setting */
export async function PUT(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  const db = getServerDb();

  if (!await checkChiefRole(db, userId)) {
    return NextResponse.json({ error: 'Forbidden — chief only' }, { status: 403 });
  }

  const body = await req.json();
  const { eventType, isEnabled } = body as { eventType?: string; isEnabled?: boolean };

  if (!eventType) {
    return NextResponse.json({ error: 'Missing eventType' }, { status: 400 });
  }
  if (typeof isEnabled !== 'boolean') {
    return NextResponse.json({ error: 'isEnabled must be boolean' }, { status: 400 });
  }

  const { error } = await db
    .from('telegram_notification_settings')
    .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
    .eq('event_type', eventType);

  if (error) {
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
