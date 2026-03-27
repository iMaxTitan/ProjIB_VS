/**
 * POST /api/telegram/verify-code  — Generate a verification code for Telegram linking.
 * GET  /api/telegram/verify-code  — Check current Telegram link status.
 * DELETE /api/telegram/verify-code — Unlink Telegram account.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { isRequestAuthorized, getDbUserId, checkRateLimit, getRequesterKey } from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

function generateCode(): string {
  return randomBytes(4).toString('hex').toUpperCase(); // 8-char hex
}

/** POST — generate a new linking code stored in user_profiles */
export async function POST(req: NextRequest) {
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

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  const db = getServerDb();
  const { error } = await db
    .from('user_profiles')
    .update({
      telegram_verify_code: code,
      telegram_verify_code_expires_at: expiresAt,
      telegram_verify_code_attempts: 0,
    })
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
  }

  return NextResponse.json({ code, expiresIn: 600 });
}

/** GET — check Telegram link status + bot settings from user_profiles */
export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const db = getServerDb();
  const { data } = await db
    .from('user_profiles')
    .select('telegram_chat_id, telegram_username, telegram_is_active, telegram_linked_at, notification_channel')
    .eq('user_id', userId)
    .single();

  return NextResponse.json({
    linked: Boolean(data?.telegram_chat_id),
    isActive: data?.telegram_is_active ?? false,
    username: data?.telegram_username ?? null,
    notificationChannel: (data?.notification_channel ?? 'telegram') as 'telegram' | 'teams' | 'both',
    linkedAt: data?.telegram_linked_at ?? null,
  });
}

/** DELETE — unlink Telegram account */
export async function DELETE(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const db = getServerDb();
  await db
    .from('user_profiles')
    .update({
      telegram_chat_id: null,
      telegram_username: null,
      telegram_is_active: false,
      telegram_linked_at: null,
    })
    .eq('user_id', userId);

  return NextResponse.json({ ok: true });
}
