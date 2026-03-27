/**
 * Shared auth helper for KB validate routes (normalize, download, index).
 * Checks authorization, rate limit, userId, and chief/head role in one call.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';
import { ROLE_GROUPS, hasRole } from '@/lib/shared/auth/role-groups';

type AuthOk = { ok: true; userId: string };
type AuthFail = { ok: false; response: NextResponse };

export async function requireKbManager(
  req: NextRequest,
  rateLimit: number,
  rateWindowMs: number,
): Promise<AuthOk | AuthFail> {
  if (!isRequestAuthorized(req)) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const rl = checkRateLimit(getRequesterKey(req), rateLimit, rateWindowMs);
  if (!rl.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Too Many Requests' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      ),
    };
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'Missing userId' }, { status: 400 }) };
  }

  const db = getServerDb();
  const { data: profile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (!profile || !hasRole(profile.role as string, ROLE_GROUPS.KB_MANAGERS)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden: only chief or head can access this resource' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, userId };
}
