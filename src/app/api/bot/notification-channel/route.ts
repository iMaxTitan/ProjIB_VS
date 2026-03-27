/**
 * PUT /api/bot/notification-channel
 * Update notification channel preference for the current user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId } from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';

const VALID_CHANNELS = ['telegram', 'teams', 'both'] as const;

export async function PUT(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { channel } = body as { channel?: string };

  if (!channel || !VALID_CHANNELS.includes(channel as typeof VALID_CHANNELS[number])) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
  }

  const db = getServerDb();

  const { error } = await db
    .from('user_profiles')
    .update({ notification_channel: channel })
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
