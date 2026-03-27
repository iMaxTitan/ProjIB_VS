/**
 * POST /api/planner/meetings/info
 * Fetch full meeting details (attendees, transcript status) for a calendar entry.
 * Uses shared meeting_cache when available.
 * Body: { entryId: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { getMeetingInfoByEventId } from '@/lib/ops/planner/meeting-details';
import type { MeetingAttendee } from '@/lib/ops/graph/meetings';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }
  const rl = checkRateLimit(`meeting-info:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  try {
    const { entryId } = await req.json();
    if (!entryId || typeof entryId !== 'string') {
      return NextResponse.json({ error: 'Missing entryId' }, { status: 400 });
    }

    const db = getDb();

    // Verify entry belongs to user
    const { data: entry } = await db.from('weekly_calendar_entries')
      .select('outlook_event_id, transcript_summary, has_transcript, ical_uid')
      .eq('id', entryId)
      .eq('employee_id', userId)
      .single();

    if (!entry?.outlook_event_id) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    // -- Fast path: check shared meeting_cache --
    if (entry.ical_uid) {
      const { data: cached } = await db.from('meeting_cache')
        .select('attendees, online_meeting_id, transcript_id, transcript_summary')
        .eq('ical_uid', entry.ical_uid)
        .maybeSingle();

      if (cached && cached.attendees) {
        const attendees = (typeof cached.attendees === 'string'
          ? JSON.parse(cached.attendees) : cached.attendees) as MeetingAttendee[];
        logger.info(`[planner/meetings/info] Cache HIT for ical_uid=${entry.ical_uid} (${attendees.length} attendees)`);
        return NextResponse.json({
          meetingId: cached.online_meeting_id ?? entry.outlook_event_id,
          hasTranscript: entry.has_transcript,
          transcriptId: cached.transcript_id ?? null,
          attendees,
          cachedSummary: cached.transcript_summary ?? entry.transcript_summary ?? null,
        });
      }
    }

    // -- Slow path: fetch from Graph --
    const { data: profile } = await db.from('user_profiles')
      .select('teams_aad_oid')
      .eq('user_id', userId)
      .single();

    if (!profile?.teams_aad_oid) {
      return NextResponse.json({ error: "Немає прив'язки до Teams" }, { status: 400 });
    }

    // Always check transcript status from Graph (backfill may have missed it)
    const meetingInfo = await getMeetingInfoByEventId(
      profile.teams_aad_oid, entry.outlook_event_id,
      { skipTranscriptCheck: false, db },
    );

    if (!meetingInfo) {
      return NextResponse.json({ error: 'Failed to fetch meeting details' }, { status: 502 });
    }

    // Sync transcript status to DB
    if (meetingInfo.hasTranscript !== entry.has_transcript) {
      await db.from('weekly_calendar_entries')
        .update({ has_transcript: meetingInfo.hasTranscript })
        .eq('id', entryId);
    }

    // Backfill ical_uid if missing
    if (!entry.ical_uid && meetingInfo.iCalUId) {
      await db.from('weekly_calendar_entries')
        .update({ ical_uid: meetingInfo.iCalUId })
        .eq('id', entryId);
    }

    return NextResponse.json({
      ...meetingInfo,
      cachedSummary: entry.transcript_summary ?? null,
    });
  } catch (err) {
    logger.error('[planner/meetings/info] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
