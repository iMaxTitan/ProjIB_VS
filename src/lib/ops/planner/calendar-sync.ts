/** Sync (PULL) from Microsoft Graph calendarView to weekly_calendar_entries.
 *  - mode='full': always fetches by date range (used on week navigation)
 *  - mode='delta': uses stored delta token for incremental updates (background refresh)
 */
import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import { getGraphToken } from '@/lib/ops/graph/client';
import logger from '@/lib/shared/logger';
import { GRAPH_BASE, graphGet } from './calendar-shared';
import {
  backfillMissingSubjects,
  backfillTranscriptStatus,
} from './calendar-sync-backfill';
import {
  type GraphDeltaEvent,
  type PullResult,
  type CalendarEntry,
  type PlanEntry,
  reconcileEvent,
  detectRemovedEntries,
} from './calendar-sync-reconcile';

export type { PullResult };
export type PullMode = 'full' | 'delta';

const SELECT_FIELDS =
  'id,subject,start,end,lastModifiedDateTime,isOnlineMeeting,iCalUId';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GraphDeltaResponse {
  value: GraphDeltaEvent[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

interface SyncState {
  deltaToken: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
}

// ─── Sync state ──────────────────────────────────────────────────────────────

export async function getSyncState(
  db: SupabaseClient,
  employeeId: string,
): Promise<SyncState | null> {
  const { data, error } = await db
    .from('calendar_sync_state')
    .select('delta_token, last_synced_at, sync_error')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (error) {
    logger.error('[calendar-sync] getSyncState error:', error);
    return null;
  }
  if (!data) return null;
  return {
    deltaToken: data.delta_token,
    lastSyncedAt: data.last_synced_at,
    syncError: data.sync_error,
  };
}

export async function needsSync(
  db: SupabaseClient,
  employeeId: string,
  maxStaleMinutes = 5,
): Promise<boolean> {
  const state = await getSyncState(db, employeeId);
  if (!state || !state.lastSyncedAt) return true;
  return (
    Date.now() - new Date(state.lastSyncedAt).getTime() >
    maxStaleMinutes * 60_000
  );
}

async function saveSyncState(
  db: SupabaseClient,
  employeeId: string,
  deltaToken: string | null,
  syncError: string | null,
) {
  const { error } = await db.from('calendar_sync_state').upsert({
    employee_id: employeeId,
    delta_token: deltaToken,
    last_synced_at: new Date().toISOString(),
    sync_error: syncError,
  });
  if (error) logger.error('[calendar-sync] saveSyncState error:', error);
}

// ─── Main pull function ─────────────────────────────────────────────────────

export async function pullCalendarEvents(
  db: SupabaseClient,
  employeeId: string,
  userOid: string,
  weekStart: string,
  weekEnd: string,
  mode: PullMode = 'full',
): Promise<PullResult> {
  const result: PullResult = { created: 0, updated: 0, deleted: 0, errors: [] };

  const token = await getGraphToken();
  if (!token) {
    result.errors.push('Failed to get Graph token');
    await saveSyncState(db, employeeId, null, result.errors[0]);
    return result;
  }

  const state = await getSyncState(db, employeeId);
  const base = `${GRAPH_BASE}/users/${userOid}/calendarView/delta`;

  const useDelta = mode === 'delta' && !!state?.deltaToken;
  let url = useDelta
    ? `${base}?$deltatoken=${encodeURIComponent(state!.deltaToken!)}&$select=${SELECT_FIELDS}`
    : `${base}?startDateTime=${weekStart}T00:00:00Z&endDateTime=${weekEnd}T23:59:59Z&$select=${SELECT_FIELDS}`;

  // Paginate
  const allEvents: GraphDeltaEvent[] = [];
  let deltaLink: string | null = null;

  for (;;) {
    const resp = await graphGet<GraphDeltaResponse>(token, url, { timeout: 30_000 });
    if (!resp) {
      const msg = `Graph delta request failed: ${url.slice(0, 100)}`;
      result.errors.push(msg);
      await saveSyncState(db, employeeId, state?.deltaToken ?? null, msg);
      return result;
    }

    allEvents.push(...resp.value);

    if (resp['@odata.nextLink']) {
      url = resp['@odata.nextLink'];
    } else {
      deltaLink = resp['@odata.deltaLink'] ?? null;
      break;
    }
  }

  // Load existing entries
  const [{ data: existing }, { data: planEntries }] = await Promise.all([
    db.from('weekly_calendar_entries')
      .select('id, outlook_event_id, daily_task_id, updated_at')
      .eq('employee_id', employeeId)
      .eq('source', 'external')
      .not('outlook_event_id', 'is', null)
      .gte('date', weekStart)
      .lte('date', weekEnd),
    db.from('weekly_calendar_entries')
      .select('id, outlook_event_id, date, start_time, duration_minutes, subject')
      .eq('employee_id', employeeId)
      .eq('source', 'plan')
      .not('outlook_event_id', 'is', null)
      .gte('date', weekStart)
      .lte('date', weekEnd),
  ]);

  const entryMap = new Map<string, CalendarEntry>();
  for (const row of (existing ?? []) as CalendarEntry[]) {
    if (row.outlook_event_id) entryMap.set(row.outlook_event_id, row);
  }

  const planEntryMap = new Map<string, PlanEntry>();
  for (const row of (planEntries ?? []) as (PlanEntry & { date: string })[]) {
    if (row.outlook_event_id)
      planEntryMap.set(`${row.outlook_event_id}::${row.date}`, row);
  }

  // Clear outlook_modified BEFORE reconcile — reconcile will re-set for still-modified entries
  const { error: clearErr } = await db
    .from('weekly_calendar_entries')
    .update({ outlook_modified: false })
    .eq('employee_id', employeeId)
    .eq('outlook_modified', true)
    .gte('date', weekStart)
    .lte('date', weekEnd);
  if (clearErr) logger.error('[calendar-sync] clear outlook_modified error:', clearErr);

  for (const event of allEvents) {
    try {
      await reconcileEvent(
        db, employeeId, event, entryMap, planEntryMap,
        weekStart, weekEnd, result,
      );
    } catch (err) {
      const msg = `Event ${event.id}: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      logger.error('[calendar-sync] reconcile error:', msg);
    }
  }

  // Full mode: detect entries removed from Outlook
  if (mode === 'full') {
    await detectRemovedEntries(db, allEvents, entryMap, planEntryMap, weekStart, weekEnd, result);
  }

  // Backfill operations
  await backfillMissingSubjects(db, token, employeeId, userOid, weekStart, weekEnd);

  const onlineEventIds = new Set<string>();
  for (const event of allEvents) {
    if (!event['@removed'] && event.isOnlineMeeting) onlineEventIds.add(event.id);
  }
  await backfillTranscriptStatus(db, token, employeeId, userOid, weekStart, onlineEventIds);

  // outlook_modified was cleared before reconcile and re-set only for still-modified entries.

  const savedToken = deltaLink
    ? (new URL(deltaLink).searchParams.get('$deltatoken') ?? deltaLink)
    : null;
  await saveSyncState(db, employeeId, savedToken, null);
  logger.info(
    `[calendar-sync] Pull ${employeeId}: +${result.created} ~${result.updated} -${result.deleted}${result.errors.length ? ` (${result.errors.length} err)` : ''}`,
  );

  return result;
}
