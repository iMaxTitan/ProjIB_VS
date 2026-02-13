import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId } from '@/lib/api/request-guards';
import { removePresence } from '@/lib/presence/store';

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  removePresence(userId);
  return NextResponse.json({ ok: true });
}
