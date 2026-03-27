/**
 * GET /api/meetings/[meetingId]/transcript?targetUserId=<db_user_id>&transcriptId=<id>
 *
 * Returns structured transcript segments for a meeting.
 * targetUserId defaults to the requesting user. chief can pass any targetUserId.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';
import { getTranscriptSegments } from '@/lib/ops/graph/meetings';
import logger from '@/lib/shared/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestingUserId = getDbUserId(req);
  if (!requestingUserId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(`meetings-transcript:${requestingUserId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  const { meetingId } = await params;
  const url = new URL(req.url);
  const targetUserIdParam = url.searchParams.get('targetUserId') ?? requestingUserId;
  const transcriptId = url.searchParams.get('transcriptId');

  if (!transcriptId) {
    return NextResponse.json({ error: 'Missing transcriptId' }, { status: 400 });
  }

  try {
    const db = getServerDb();

    // Verify access
    const { data: requestingProfile } = await db
      .from('user_profiles')
      .select('role')
      .eq('user_id', requestingUserId)
      .single();

    if (!requestingProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const isChief = requestingProfile.role === 'chief';
    const effectiveUserId = (isChief && targetUserIdParam !== requestingUserId)
      ? targetUserIdParam
      : requestingUserId;

    // Resolve AAD OID from DB
    const { data: targetProfile } = await db
      .from('user_profiles')
      .select('teams_aad_oid')
      .eq('user_id', effectiveUserId)
      .single();

    const userOid = targetProfile?.teams_aad_oid;
    if (!userOid) {
      return NextResponse.json({ error: 'Teams not linked for this user' }, { status: 404 });
    }

    const segments = await getTranscriptSegments(userOid, meetingId, transcriptId);
    return NextResponse.json({ segments });
  } catch (err) {
    logger.error('[api/meetings/transcript] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
