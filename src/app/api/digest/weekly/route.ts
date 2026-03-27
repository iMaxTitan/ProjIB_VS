/**
 * POST /api/digest/weekly
 *
 * Sends a personalized weekly digest to all active users via Telegram/Teams.
 * Protected by x-digest-secret header (DIGEST_SECRET env var).
 * Intended to be called weekly (e.g., every Monday 09:00) via pm2 cron.
 *
 * Response: { sent: number, failed: number, skipped: number }
 */

import { createClient } from '@/lib/shared/postgrest-client';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';
import { sendNotification, type NotifProfile } from '@/lib/bot/notifications/send';
import { buildDigestMessage, type DigestUser } from '@/lib/ops/digest/service';

const CRON_SECRET = config.app.cronSecret;

let _db: ReturnType<typeof createClient> | null = null;
function getDb() {
  if (_db) return _db;
  _db = createClient(
    config.db.serverUrl,
    config.db.serviceRoleKey,
    { auth: { persistSession: false } },
  );
  return _db;
}

export async function POST(req: NextRequest) {
  // Auth: internal cron secret header
  const secret = req.headers.get('x-cron-secret');
  if (!CRON_SECRET || !secret || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = getDb();
    const now = new Date();

    // Get all active users with at least one notification channel connected
    const { data: users, error } = await db
      .from('user_profiles')
      .select(
        'user_id, full_name, role, department_id,' +
        'notification_channel, telegram_chat_id, telegram_is_active,' +
        'teams_conversation_id, teams_service_url, teams_is_active, teams_member_id',
      )
      .eq('status', 'active')
      .or('telegram_is_active.eq.true,teams_is_active.eq.true');

    if (error) {
      logger.error('[digest/weekly] Failed to load users:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    if (!users?.length) {
      logger.info('[digest/weekly] No active users with notifications');
      return NextResponse.json({ sent: 0, failed: 0, skipped: 0 });
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const user of users as unknown as Array<DigestUser & NotifProfile>) {
      try {
        const message = await buildDigestMessage(db, user, now);
        if (!message) {
          skipped++;
          continue;
        }
        await sendNotification(user, message);
        sent++;
      } catch (err) {
        failed++;
        logger.warn(`[digest/weekly] Failed for user ${user.user_id}:`, err);
      }
    }

    logger.info(`[digest/weekly] Done — sent=${sent}, failed=${failed}, skipped=${skipped}`);
    return NextResponse.json({ sent, failed, skipped });
  } catch (err) {
    logger.error('[digest/weekly] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
