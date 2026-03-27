/**
 * GET /api/meetings?startDate=ISO&endDate=ISO&targetUserId=<db_user_id>&all=true
 *
 * Returns calendar events for a date range (typically a week).
 * - all=true → ALL calendar events (meetings, appointments, etc.)
 * - all=false (default) → only Teams online meetings (with transcript info)
 * - employee/head: always returns own meetings (targetUserId ignored)
 * - chief: can pass targetUserId to see another user's meetings
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';
import { getUserMeetings } from '@/lib/ops/graph/meetings';
import logger from '@/lib/shared/logger';

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestingUserId = getDbUserId(req);
  if (!requestingUserId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(`meetings:${requestingUserId}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const targetUserIdParam = url.searchParams.get('targetUserId');

  if (!startDate || !endDate || isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) {
    return NextResponse.json({ error: 'Invalid startDate/endDate' }, { status: 400 });
  }

  try {
    const db = getServerDb();

    // Get requesting user profile (role + teams_aad_oid)
    const { data: requestingProfile } = await db
      .from('user_profiles')
      .select('role, teams_aad_oid')
      .eq('user_id', requestingUserId)
      .single();

    if (!requestingProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Determine target user
    let targetOid: string | null = null;
    let targetUserId = requestingUserId;

    if (requestingProfile.role === 'chief' && targetUserIdParam && targetUserIdParam !== requestingUserId) {
      // chief can view other users
      const { data: targetProfile } = await db
        .from('user_profiles')
        .select('teams_aad_oid, full_name')
        .eq('user_id', targetUserIdParam)
        .single();
      targetOid = targetProfile?.teams_aad_oid ?? null;
      targetUserId = targetUserIdParam;
    } else {
      targetOid = requestingProfile.teams_aad_oid;
    }

    if (!targetOid) {
      return NextResponse.json({ meetings: [], noTeams: true });
    }

    const includeAllEvents = url.searchParams.get('all') === 'true';
    const meetings = await getUserMeetings(targetOid, startDate, endDate, { includeAllEvents });
    return NextResponse.json({ meetings, targetUserId });
  } catch (err) {
    logger.error('[api/meetings] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
