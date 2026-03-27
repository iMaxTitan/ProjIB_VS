/**
 * Microsoft Graph API — Teams meetings & transcripts.
 * Uses Calendars.Read + OnlineMeetings.Read.All + OnlineMeetingTranscript.Read.All (Application).
 */

import { getGraphToken, graphGet, graphGetText } from './client';

const GRAPH = 'https://graph.microsoft.com/v1.0';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MeetingAttendee {
  name: string;
  email: string;
  type: 'required' | 'optional' | 'resource';
  response: 'accepted' | 'declined' | 'tentativelyAccepted' | 'notResponded' | 'none' | 'organizer';
}

export interface MeetingInfo {
  meetingId: string;
  subject: string;
  startDateTime: string; // ISO
  endDateTime: string;   // ISO
  durationMin: number;
  hasTranscript: boolean;
  transcriptId: string | null;
  attendees: MeetingAttendee[];
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type CalEvent = {
  id: string;
  subject: string;
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

function buildMeetingInfo(evt: CalEvent, meetingId: string, hasTranscript: boolean, transcriptId: string | null): MeetingInfo {
  const start = new Date(evt.start.dateTime + (evt.start.dateTime.endsWith('Z') ? '' : 'Z'));
  const end = new Date(evt.end.dateTime + (evt.end.dateTime.endsWith('Z') ? '' : 'Z'));
  return {
    meetingId,
    subject: evt.subject || '(без теми)',
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    durationMin: Math.round((end.getTime() - start.getTime()) / 60_000),
    hasTranscript,
    transcriptId,
    attendees: mapAttendees(evt.attendees),
  };
}

/** Parse WebVTT with speaker diarization into segments. Merges consecutive lines from same speaker. */
export function parseVTT(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const blocks = vtt.split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(l => l.trim());
    for (const line of lines) {
      const match = line.match(/^<v ([^>]+)>(.+?)(?:<\/v>)?$/);
      if (!match) continue;
      const speaker = match[1].trim();
      const text = match[2].trim();
      const last = segments[segments.length - 1];
      if (last && last.speaker === speaker) {
        last.text += ' ' + text;
      } else {
        segments.push({ speaker, text });
      }
    }
  }

  return segments;
}

export function formatTranscriptAsText(segments: TranscriptSegment[]): string {
  return segments.map(s => `${s.speaker}: ${s.text}`).join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get calendar events for a user in a given date range.
 * When `includeAllEvents=true`, returns ALL calendar events (meetings, appointments, etc.).
 * When `false` (default), returns only Teams online meetings (with transcript info).
 */
export async function getUserMeetings(
  userOid: string,
  startDate: string,
  endDate: string,
  options?: { includeAllEvents?: boolean },
): Promise<MeetingInfo[]> {
  const token = await getGraphToken();
  if (!token) return [];

  const includeAll = options?.includeAllEvents ?? false;

  // Fetch calendar events with pagination
  const allEvents: CalEvent[] = [];
  let url: string | null =
    `${GRAPH}/users/${userOid}/calendarView` +
    `?startDateTime=${startDate}&endDateTime=${endDate}` +
    `&$select=id,subject,start,end,isOnlineMeeting,onlineMeeting,attendees&$top=200`;

  type CalPage = { value?: CalEvent[] };
  while (url && allEvents.length < 500) {
    const calRes: Awaited<ReturnType<typeof graphGet<CalPage>>> = await graphGet<CalPage>(token, url);
    if (!calRes.ok || !calRes.data?.value) break;
    allEvents.push(...calRes.data.value);
    // Follow @odata.nextLink for pagination
    const nextLink: unknown = (calRes.data as Record<string, unknown>)['@odata.nextLink'];
    url = typeof nextLink === 'string' ? nextLink : null;
  }

  // Split: online events (with joinUrl) vs regular events
  const onlineEvents = allEvents.filter(e => e.isOnlineMeeting && e.onlineMeeting?.joinUrl);
  const regularEvents = includeAll
    ? allEvents.filter(e => !e.isOnlineMeeting || !e.onlineMeeting?.joinUrl)
    : [];

  // Step 1: For online events — find onlineMeeting IDs in parallel
  const meetingIdResults = await Promise.all(
    onlineEvents.map(async (evt) => {
      const joinUrl = evt.onlineMeeting?.joinUrl;
      if (!joinUrl) return { evt, meetingId: null };
      const res = await graphGet<{ value?: Array<{ id: string }> }>(
        token,
        `${GRAPH}/users/${userOid}/onlineMeetings?$filter=joinWebUrl eq '${joinUrl}'`,
      );
      return { evt, meetingId: res.data?.value?.[0]?.id ?? null };
    }),
  );

  const withIds = meetingIdResults.filter(
    (r): r is { evt: CalEvent; meetingId: string } => r.meetingId !== null,
  );

  // Online events that didn't match an onlineMeeting → treat as regular
  const onlineMissed = meetingIdResults
    .filter(r => r.meetingId === null)
    .map(r => r.evt);

  // Step 2: Check transcripts for online meetings in parallel
  const transcriptResults = await Promise.all(
    withIds.map(async ({ evt, meetingId }) => {
      const res = await graphGet<{ value?: Array<{ id: string }> }>(
        token,
        `${GRAPH}/users/${userOid}/onlineMeetings/${meetingId}/transcripts`,
      );
      return { evt, meetingId, transcripts: res.data?.value ?? [] };
    }),
  );

  // Step 3: Build results
  const results: MeetingInfo[] = [];

  // Online meetings with transcript info
  for (const { evt, meetingId, transcripts } of transcriptResults) {
    results.push(buildMeetingInfo(evt, meetingId, transcripts.length > 0, transcripts[0]?.id ?? null));
  }

  // Regular events + online events without matched meetingId
  for (const evt of [...regularEvents, ...onlineMissed]) {
    results.push(buildMeetingInfo(evt, evt.id, false, null));
  }

  // Deduplicate (recurring meetings may appear twice in calendarView)
  const seen = new Set<string>();
  const deduped = results.filter(r => {
    const key = `${r.meetingId}-${r.startDateTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort chronological DESC (newest first)
  deduped.sort((a, b) => new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime());
  return deduped;
}

/**
 * Fetch VTT transcript and return as plain text "Speaker: phrase\n".
 */
export async function getTranscriptText(
  userOid: string,
  meetingId: string,
  transcriptId: string,
): Promise<string | null> {
  const token = await getGraphToken();
  if (!token) return null;

  const res = await graphGetText(
    token,
    `${GRAPH}/users/${userOid}/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content?$format=text/vtt`,
  );
  if (!res.ok) return null;

  const segments = parseVTT(res.text);
  return formatTranscriptAsText(segments);
}

/**
 * Fetch VTT and return structured segments (for UI rendering).
 */
export async function getTranscriptSegments(
  userOid: string,
  meetingId: string,
  transcriptId: string,
): Promise<TranscriptSegment[]> {
  const token = await getGraphToken();
  if (!token) return [];

  const res = await graphGetText(
    token,
    `${GRAPH}/users/${userOid}/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content?$format=text/vtt`,
  );
  if (!res.ok) return [];

  return parseVTT(res.text);
}
