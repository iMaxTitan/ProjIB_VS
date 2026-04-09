/**
 * Event reconciliation logic for calendar sync (PULL).
 * Handles: plan event modifications, external event CRUD, removal detection.
 */

import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import logger from '@/lib/shared/logger';
import { parseEventTimes } from './calendar-shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GraphDeltaEvent {
  id: string;
  subject?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  lastModifiedDateTime?: string;
  isOnlineMeeting?: boolean;
  iCalUId?: string;
  '@removed'?: { reason: string };
}

export interface PullResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

export interface CalendarEntry {
  id: string;
  outlook_event_id: string;
  daily_task_id: string | null;
  monthly_plan_id: string | null;
  updated_at: string;
}

export interface PlanEntry {
  id: string;
  outlook_event_id: string;
  start_time: string;
  duration_minutes: number;
  subject: string | null;
}

// ─── Detect removed entries (full mode) ──────────────────────────────────────

export async function detectRemovedEntries(
  db: PostgrestClient,
  allEvents: GraphDeltaEvent[],
  entryMap: Map<string, CalendarEntry>,
  planEntryMap: Map<string, PlanEntry>,
  weekStart: string,
  weekEnd: string,
  result: PullResult,
) {
  const graphEventIds = new Set<string>();
  for (const event of allEvents) {
    if (!event['@removed']) {
      const parsed = parseEventTimes(event);
      if (parsed && parsed.date >= weekStart && parsed.date <= weekEnd) {
        const pk = `${event.id}::${parsed.date}`;
        if (!planEntryMap.has(pk)) {
          graphEventIds.add(event.id);
        }
      }
    }
  }
  // Remove external entries that disappeared from Outlook (keep if linked to task or plan)
  for (const [outlookId, entry] of entryMap) {
    if (graphEventIds.has(outlookId)) continue;
    if (entry.daily_task_id || entry.monthly_plan_id) {
      // Linked to plan — convert to plan entry
      const { error } = await db.from('weekly_calendar_entries')
        .update({ source: 'plan', outlook_event_id: null, needs_push: false, outlook_modified: false, updated_at: new Date().toISOString() })
        .eq('id', entry.id);
      if (error) { logger.error(`[calendar-sync] detectRemoved convert error: ${error.message}`); }
      else { result.deleted++; logger.info(`[calendar-sync] Entry ${entry.id} converted to plan (Outlook event gone)`); }
      continue;
    }
    const { error } = await db.from('weekly_calendar_entries').delete().eq('id', entry.id);
    if (error) {
      logger.error(`[calendar-sync] detectRemoved delete error: ${error.message}`);
    } else {
      result.deleted++;
    }
  }

  // Plan entries deleted from Outlook — clear outlook_event_id (entry stays, becomes 'distributed')
  const graphEventIdsAll = new Set<string>();
  for (const event of allEvents) {
    if (!event['@removed'] && event.id) graphEventIdsAll.add(event.id);
  }
  for (const [pk, planEntry] of planEntryMap) {
    const outlookId = pk.split('::')[0];
    if (graphEventIdsAll.has(outlookId)) continue;
    const { error } = await db.from('weekly_calendar_entries')
      .update({ outlook_event_id: null, outlook_modified: false, needs_push: false })
      .eq('id', planEntry.id);
    if (error) {
      logger.error(`[calendar-sync] detectRemoved plan unlink error: ${error.message}`);
    } else {
      result.deleted++;
      logger.info(`[calendar-sync] Plan entry ${planEntry.id} unlinked from deleted Outlook event`);
    }
  }
}

// ─── Event reconciliation ───────────────────────────────────────────────────

export async function reconcileEvent(
  db: PostgrestClient,
  employeeId: string,
  event: GraphDeltaEvent,
  entryMap: Map<string, CalendarEntry>,
  planEntryMap: Map<string, PlanEntry>,
  weekStart: string,
  weekEnd: string,
  result: PullResult,
): Promise<void> {
  // Handle delta removal of plan entries (event deleted in Outlook)
  if (event['@removed']) {
    // Check if any plan entry is linked to this event
    for (const [pk, pe] of planEntryMap) {
      if (pk.startsWith(`${event.id}::`)) {
        await db.from('weekly_calendar_entries')
          .update({ outlook_event_id: null, outlook_modified: false, needs_push: false })
          .eq('id', pe.id);
        result.deleted++;
        logger.info(`[calendar-sync] Plan entry ${pe.id} unlinked (delta @removed)`);
      }
    }
    // Continue to handle external removal below
  }

  // Check if this is our own plan event pushed to Outlook
  const parsedForPlan = event['@removed'] ? null : parseEventTimes(event);
  const planKey = parsedForPlan ? `${event.id}::${parsedForPlan.date}` : null;
  const planEntry = planKey ? planEntryMap.get(planKey) : null;

  if (planEntry && parsedForPlan) {
    const parsed = parsedForPlan;
    const dbTime = planEntry.start_time.slice(0, 5);
    const timeChanged =
      parsed.startTime !== dbTime ||
      parsed.durationMinutes !== planEntry.duration_minutes;
    // Only flag subject change if local subject was explicitly set (non-null).
    // When subject is null, Outlook returns the procedure name we pushed — that's expected.
    const subjectChanged =
      event.subject !== undefined &&
      planEntry.subject !== null &&
      event.subject !== planEntry.subject;

    if (timeChanged || subjectChanged) {
      const updateData: Record<string, unknown> = { outlook_modified: true };
      if (timeChanged) {
        updateData.date = parsed.date;
        updateData.start_time = parsed.startTime;
        updateData.duration_minutes = parsed.durationMinutes;
      }
      if (subjectChanged && event.subject) {
        updateData.subject = event.subject;
      }
      await db
        .from('weekly_calendar_entries')
        .update(updateData)
        .eq('id', planEntry.id);
      result.updated++;
      logger.info(
        `[calendar-sync] Plan entry ${planEntry.id} modified in Outlook (time: ${timeChanged}, subject: ${subjectChanged})`,
      );
    }
    return;
  }

  const existing = entryMap.get(event.id);

  // Handle removals
  if (event['@removed']) {
    if (!existing) return;
    // Linked to plan — convert to plan entry (event deleted in Outlook, plan stays)
    if (existing.daily_task_id || existing.monthly_plan_id) {
      const { error } = await db.from('weekly_calendar_entries')
        .update({ source: 'plan', outlook_event_id: null, needs_push: false, outlook_modified: false, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) throw new Error(`convert to plan failed: ${error.message}`);
      logger.info(`[calendar-sync] Entry ${existing.id} converted to plan (Outlook event deleted)`);
      result.deleted++;
      return;
    }
    const { error } = await db.from('weekly_calendar_entries').delete().eq('id', existing.id);
    if (error) throw new Error(`delete failed: ${error.message}`);
    result.deleted++;
    return;
  }

  const parsed = parseEventTimes(event);
  if (!parsed) return;
  if (parsed.date < weekStart || parsed.date > weekEnd) return;

  if (!existing) {
    const { error } = await db.from('weekly_calendar_entries').insert({
      employee_id: employeeId,
      date: parsed.date,
      start_time: parsed.startTime,
      duration_minutes: parsed.durationMinutes,
      source: 'external',
      outlook_event_id: event.id,
      subject: event.subject ?? null,
      has_transcript: false,
      ical_uid: event.iCalUId ?? null,
    });
    if (error) throw new Error(`insert failed: ${error.message}`);
    result.created++;
  } else {
    // LWW: compare Graph lastModified vs our updated_at
    const graphModified = event.lastModifiedDateTime
      ? new Date(event.lastModifiedDateTime).getTime()
      : 0;
    const ourModified = new Date(existing.updated_at).getTime();
    if (graphModified <= ourModified) return;

    const updateData: Record<string, unknown> = {
      date: parsed.date,
      start_time: parsed.startTime,
      duration_minutes: parsed.durationMinutes,
      updated_at: new Date().toISOString(),
    };
    if (event.subject !== undefined) updateData.subject = event.subject;
    if (event.iCalUId) updateData.ical_uid = event.iCalUId;

    const { error } = await db
      .from('weekly_calendar_entries')
      .update(updateData)
      .eq('id', existing.id);
    if (error) throw new Error(`update failed: ${error.message}`);
    result.updated++;
  }
}
