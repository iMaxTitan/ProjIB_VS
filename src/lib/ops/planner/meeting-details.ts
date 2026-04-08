/**
 * Fetch full meeting details (attendees, transcript status) for a single calendar event.
 * Reuses Graph helpers from meetings module.
 */
import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import { getGraphToken, graphGet } from '@/lib/ops/graph/client';
import type { MeetingInfo, MeetingAttendee } from '@/lib/ops/graph/meetings';
import logger from '@/lib/shared/logger';
import { GRAPH_BASE as GRAPH } from './calendar-shared';

type CalEvent = {
  id: string;
  subject: string;
  iCalUId?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl: string };
  attendees?: Array<{
    type?: string;
    status?: { response?: string };
    emailAddress?: { name?: string; address?: string };
  }>;
};

function mapAttendees(raw?: CalEvent['attendees']): MeetingAttendee[] {
  return (raw ?? []).map(a => ({
    name: a.emailAddress?.name ?? a.emailAddress?.address ?? 'Unknown',
    email: a.emailAddress?.address ?? '',
    type: (a.type ?? 'required') as MeetingAttendee['type'],
    response: (a.status?.response ?? 'none') as MeetingAttendee['response'],
  }));
}

/**
 * Fetch MeetingInfo for a single Outlook event by its calendar event ID.
 * Resolves online meeting ID and checks transcript availability.
 *
 * @param opts.skipTranscriptCheck — skip 2 extra Graph calls when DB already
 *   knows the transcript status (e.g. has_transcript = false from sync).
 * @param opts.db — if provided, saves attendees + metadata to meeting_cache.
 */
export async function getMeetingInfoByEventId(
  userOid: string,
  outlookEventId: string,
  opts?: { skipTranscriptCheck?: boolean; db?: PostgrestClient },
): Promise<(MeetingInfo & { iCalUId?: string }) | null> {
  const token = await getGraphToken();
  if (!token) return null;

  const eventRes = await graphGet<CalEvent>(
    token,
    `${GRAPH}/users/${userOid}/events/${encodeURIComponent(outlookEventId)}?$select=id,subject,iCalUId,start,end,isOnlineMeeting,onlineMeeting,attendees`,
  );
  if (!eventRes.ok || !eventRes.data) {
    logger.error(`[meeting-details] Failed to fetch event ${outlookEventId}`);
    return null;
  }
  const evt = eventRes.data;

  const attendees = mapAttendees(evt.attendees);
  const start = new Date(evt.start.dateTime + (evt.start.dateTime.endsWith('Z') ? '' : 'Z'));
  const end = new Date(evt.end.dateTime + (evt.end.dateTime.endsWith('Z') ? '' : 'Z'));

  let meetingId = outlookEventId;
  let hasTranscript = false;
  let transcriptId: string | null = null;

  // Resolve online meeting → check transcripts (skip if caller already knows status)
  if (!opts?.skipTranscriptCheck) {
    const joinUrl = evt.onlineMeeting?.joinUrl;
    if (evt.isOnlineMeeting && joinUrl) {
      const meetingRes = await graphGet<{ value: Array<{ id: string }> }>(
        token,
        `${GRAPH}/users/${userOid}/onlineMeetings?$filter=joinWebUrl eq '${joinUrl}'`,
      );
      const onlineMeetingId = meetingRes.data?.value?.[0]?.id;

      if (onlineMeetingId) {
        meetingId = onlineMeetingId;
        const trRes = await graphGet<{ value: Array<{ id: string }> }>(
          token,
          `${GRAPH}/users/${userOid}/onlineMeetings/${onlineMeetingId}/transcripts`,
        );
        const transcripts = trRes.data?.value ?? [];
        hasTranscript = transcripts.length > 0;
        transcriptId = transcripts[0]?.id ?? null;
      }
    }
  }

  logger.info(`[meeting-details] Event ${outlookEventId}: meetingId=${meetingId}, hasTranscript=${hasTranscript}, skipped=${!!opts?.skipTranscriptCheck}`);

  const info = {
    meetingId,
    subject: evt.subject || '(без теми)',
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    durationMin: Math.round((end.getTime() - start.getTime()) / 60_000),
    hasTranscript,
    transcriptId,
    attendees,
    iCalUId: evt.iCalUId,
  };

  // Populate shared meeting_cache (non-blocking)
  if (opts?.db && evt.iCalUId) {
    opts.db.from('meeting_cache').upsert({
      ical_uid: evt.iCalUId,
      subject: info.subject,
      start_at: info.startDateTime,
      end_at: info.endDateTime,
      attendees: JSON.stringify(attendees),
      online_meeting_id: meetingId !== outlookEventId ? meetingId : null,
      transcript_id: transcriptId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'ical_uid' }).then(({ error }) => {
      if (error) logger.error('[meeting-details] meeting_cache upsert error:', error);
      else logger.info(`[meeting-details] Cached meeting ${evt.iCalUId}`);
    });
  }

  return info;
}
