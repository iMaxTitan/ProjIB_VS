/**
 * Backfill operations for calendar sync:
 * - Missing subjects (delta may omit for recurring instances)
 * - Transcript status for past online meetings
 */

import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import logger from '@/lib/shared/logger';
import { GRAPH_BASE, graphGet } from './calendar-shared';

// ─── Backfill missing subjects ──────────────────────────────────────────────

export async function backfillMissingSubjects(
  db: PostgrestClient,
  token: string,
  employeeId: string,
  userOid: string,
  weekStart?: string,
  weekEnd?: string,
) {
  let query = db
    .from('weekly_calendar_entries')
    .select('id, outlook_event_id')
    .eq('employee_id', employeeId)
    .eq('source', 'external')
    .is('subject', null)
    .not('outlook_event_id', 'is', null);
  if (weekStart) query = query.gte('date', weekStart);
  if (weekEnd) query = query.lte('date', weekEnd);
  const { data: rows } = await query;

  if (!rows?.length) return;

  for (const row of rows) {
    try {
      const url = `${GRAPH_BASE}/users/${userOid}/events/${encodeURIComponent(row.outlook_event_id)}?$select=subject`;
      const evt = await graphGet<{ subject?: string }>(token, url, { timezone: false });
      if (evt?.subject) {
        await db
          .from('weekly_calendar_entries')
          .update({ subject: evt.subject })
          .eq('id', row.id);
        logger.info(`[calendar-sync] Backfilled subject for ${row.id}: "${evt.subject}"`);
      }
    } catch (err) {
      logger.warn('[calendar-sync] backfillSubject error:', err);
    }
  }
}

// ─── Backfill transcript status ──────────────────────────────────────────────

/**
 * Check transcript availability for past online meetings.
 * If onlineEventIds is available (from isOnlineMeeting in sync), skips non-online events.
 * For each online event: joinUrl → meetingId → transcripts check.
 */
export async function backfillTranscriptStatus(
  db: PostgrestClient,
  token: string,
  employeeId: string,
  userOid: string,
  weekStart: string,
  onlineEventIds: Set<string>,
) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: rows } = await db
    .from('weekly_calendar_entries')
    .select('id, outlook_event_id')
    .eq('employee_id', employeeId)
    .eq('source', 'external')
    .eq('has_transcript', false)
    .is('transcript_summary', null)
    .not('outlook_event_id', 'is', null)
    .gte('date', weekStart)
    .lt('date', today)
    .limit(20);

  if (!rows?.length) return;

  const candidates =
    onlineEventIds.size > 0
      ? (rows as { id: string; outlook_event_id: string }[]).filter((r) =>
          onlineEventIds.has(r.outlook_event_id),
        )
      : (rows as { id: string; outlook_event_id: string }[]);

  if (!candidates.length) {
    logger.info(`[calendar-sync] backfill: ${rows.length} past entries, 0 online — skipped`);
    return;
  }

  logger.info(`[calendar-sync] backfill: checking ${candidates.length} online meetings for transcripts`);

  for (const row of candidates) {
    try {
      // 1. Get joinUrl from event
      const evtUrl = `${GRAPH_BASE}/users/${userOid}/events/${encodeURIComponent(row.outlook_event_id)}?$select=onlineMeeting`;
      const evt = await graphGet<{ onlineMeeting?: { joinUrl?: string } | null }>(
        token, evtUrl, { timezone: false },
      );
      const joinUrl = evt?.onlineMeeting?.joinUrl;
      if (!joinUrl) continue;

      // 2. joinUrl → onlineMeeting ID
      const mtgUrl = `${GRAPH_BASE}/users/${userOid}/onlineMeetings?$filter=${encodeURIComponent(`joinWebUrl eq '${joinUrl}'`)}`;
      const mtg = await graphGet<{ value?: Array<{ id: string }> }>(
        token, mtgUrl, { timezone: false },
      );
      const meetingId = mtg?.value?.[0]?.id;
      if (!meetingId) continue;

      // 3. Check transcripts
      const trUrl = `${GRAPH_BASE}/users/${userOid}/onlineMeetings/${meetingId}/transcripts`;
      const tr = await graphGet<{ value?: Array<{ id: string }> }>(
        token, trUrl, { timezone: false },
      );

      if (tr?.value && tr.value.length > 0) {
        await db
          .from('weekly_calendar_entries')
          .update({ has_transcript: true })
          .eq('id', row.id);
        logger.info(`[calendar-sync] Transcript confirmed for entry ${row.id}`);
      }
    } catch (err) {
      logger.warn('[calendar-sync] backfillTranscript error:', err);
    }
  }
}
