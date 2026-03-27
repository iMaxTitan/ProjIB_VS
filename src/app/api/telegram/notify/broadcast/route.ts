import { createClient } from '@/lib/shared/postgrest-client';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';
import {
  isRequestAuthorized,
  getRequesterKey,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { sendNotificationsToAll, type NotifProfile } from '@/lib/bot/notifications/send';

// Broadcast a changelog entry to all users with an active notification channel.
// UI visibility restricted to chief — no extra role check needed server-side.

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

let _db: ReturnType<typeof createClient> | null = null;
function getDb() {
  if (_db) return _db;
  _db = createClient(
    config.db.serverUrl,
    config.db.serviceRoleKey,
    { auth: { persistSession: false } }
  );
  return _db;
}

const TYPE_EMOJI: Record<string, string> = {
  'Добавлено':  '🟢',
  'Оновлено':   '🔵',
  'Обновлено':  '🔵',
  'Виправлено': '🟡',
  'Исправлено': '🟡',
};

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
    );
  }

  let body: { date?: string; type?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { date, type, text } = body;
  if (!date || !type || !text) {
    return NextResponse.json({ error: 'Missing date, type or text' }, { status: 400 });
  }

  try {
    const db = getDb();

    // Get all users with at least one active notification channel
    const { data: profiles, error } = await db
      .from('user_profiles')
      .select('full_name, notification_channel, telegram_chat_id, telegram_is_active, teams_conversation_id, teams_service_url, teams_is_active, teams_member_id')
      .or('telegram_is_active.eq.true,teams_is_active.eq.true') as { data: NotifProfile[] | null; error: unknown };

    if (error) {
      logger.error('[notify/broadcast] profiles query error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    if (!profiles?.length) {
      return NextResponse.json({ notified: 0 });
    }

    const emoji = TYPE_EMOJI[type] ?? '📋';
    const message = [
      `🆕 <b>Що нового в CS Platform</b>`,
      '',
      `${emoji} <b>${type}</b> · ${date}`,
      text,
    ].join('\n');

    await sendNotificationsToAll(profiles, message);

    logger.info(`[notify/broadcast] sent to ${profiles.length} subscribers`);
    return NextResponse.json({ notified: profiles.length });
  } catch (error: unknown) {
    logger.error('[notify/broadcast] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
