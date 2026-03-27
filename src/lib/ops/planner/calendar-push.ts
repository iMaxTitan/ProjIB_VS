/**
 * Batch push weekly calendar entries to Outlook via Graph $batch API.
 * POST = create new events, PATCH = update modified events.
 * Max 20 requests per $batch call (Graph API limit).
 */

import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import { getGraphToken } from '@/lib/ops/graph/client';
import { fetchWithTimeout } from '@/lib/shared/utils/fetch-with-timeout';
import logger from '@/lib/shared/logger';
import { GRAPH_BASE, weekDates } from './calendar-shared';
import {
  type EntryWithName,
  type ModifiedEntryWithName,
  buildOutlookEvent,
  ensureMasterCategory,
  fetchUnpushedEntries,
  fetchModifiedEntries,
} from './calendar-push-helpers';

// ─── Constants ───────────────────────────────────────────────────────────────

const BATCH_SIZE = 20;

// ─── Types ───────────────────────────────────────────────────────────────────

interface BatchRequestItem {
  id: string;
  method: 'POST' | 'PATCH';
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

interface BatchResponseItem {
  id: string;
  status: number;
  body?: { id?: string; error?: { code?: string; message?: string } };
}

export interface PushResult {
  synced: number;
  updated: number;
  failed: number;
  errors: string[];
}

// ─── Graph $batch call ───────────────────────────────────────────────────────

async function sendBatch(
  token: string,
  requests: BatchRequestItem[],
): Promise<BatchResponseItem[]> {
  const res = await fetchWithTimeout(
    `${GRAPH_BASE}/$batch`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    },
    30_000,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error(`[CalendarPush] $batch HTTP ${res.status}: ${text.slice(0, 300)}`);
    return [];
  }

  const body = (await res.json()) as { responses?: BatchResponseItem[] };
  return body.responses || [];
}

// ─── Process create responses ────────────────────────────────────────────────

async function processCreateResponses(
  db: SupabaseClient,
  entries: EntryWithName[],
  responses: BatchResponseItem[],
): Promise<{ synced: number; failed: number; errors: string[] }> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const resp of responses) {
    const entry = entries[parseInt(resp.id, 10)];
    if (!entry) continue;

    if (resp.status >= 200 && resp.status < 300 && resp.body?.id) {
      const { error: err } = await db
        .from('weekly_calendar_entries')
        .update({ outlook_event_id: resp.body.id, needs_push: false, updated_at: new Date().toISOString() })
        .eq('id', entry.id);
      if (err) { failed++; errors.push(`DB update failed for ${entry.id}`); }
      else { synced++; }
    } else {
      failed++;
      const msg = resp.body?.error?.message ?? `HTTP ${resp.status}`;
      errors.push(`Entry ${entry.id}: ${msg}`);
      logger.error(`[CalendarPush] Failed entry ${entry.id}: ${resp.status} ${msg}`);
    }
  }
  return { synced, failed, errors };
}

// ─── Push modified entries (PATCH existing Outlook events) ──────────────────

async function pushModifiedEntries(
  db: SupabaseClient,
  token: string,
  userOid: string,
  entries: ModifiedEntryWithName[],
): Promise<{ updated: number; failed: number; errors: string[] }> {
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const requests: BatchRequestItem[] = chunk.map((entry, idx) => ({
      id: String(idx),
      method: 'PATCH' as const,
      url: `/users/${userOid}/events/${entry.outlook_event_id}`,
      headers: { 'Content-Type': 'application/json' },
      body: buildOutlookEvent(entry, entry.procedure_name),
    }));

    const responses = await sendBatch(token, requests);
    if (responses.length === 0) {
      failed += chunk.length;
      errors.push('Update batch failed entirely');
      continue;
    }

    for (const resp of responses) {
      const entry = chunk[parseInt(resp.id, 10)];
      if (!entry) continue;

      if (resp.status >= 200 && resp.status < 300) {
        const { error: err } = await db
          .from('weekly_calendar_entries')
          .update({ needs_push: false, updated_at: new Date().toISOString() })
          .eq('id', entry.id);
        if (err) { failed++; } else { updated++; }
      } else if (resp.status === 404) {
        // Event deleted from Outlook — unlink locally
        await db.from('weekly_calendar_entries')
          .update({ outlook_event_id: null, needs_push: false, outlook_modified: false })
          .eq('id', entry.id);
        updated++;
        logger.info(`[CalendarPush] Event ${entry.outlook_event_id} gone, unlinked ${entry.id}`);
      } else {
        failed++;
        const msg = resp.body?.error?.message ?? `HTTP ${resp.status}`;
        errors.push(`Update ${entry.id}: ${msg}`);
        logger.error(`[CalendarPush] PATCH failed ${entry.id}: ${resp.status} ${msg}`);
      }
    }
  }
  return { updated, failed, errors };
}

// ─── Main push function ──────────────────────────────────────────────────────

export async function pushToOutlook(
  db: SupabaseClient,
  employeeId: string,
  userOid: string,
  weekStart: string,
): Promise<PushResult> {
  const dates = weekDates(weekStart);
  const [newEntries, modifiedEntries] = await Promise.all([
    fetchUnpushedEntries(db, employeeId, dates),
    fetchModifiedEntries(db, employeeId, dates),
  ]);

  const totalCount = newEntries.length + modifiedEntries.length;
  if (totalCount === 0) {
    logger.info(`[CalendarPush] No entries to push for ${employeeId} week ${weekStart}`);
    return { synced: 0, updated: 0, failed: 0, errors: [] };
  }

  const token = await getGraphToken();
  if (!token) {
    return { synced: 0, updated: 0, failed: totalCount, errors: ['Failed to acquire Graph token'] };
  }

  logger.info(`[CalendarPush] Pushing ${newEntries.length} new + ${modifiedEntries.length} modified for ${employeeId}`);
  await ensureMasterCategory(token, userOid);

  const result: PushResult = { synced: 0, updated: 0, failed: 0, errors: [] };

  // 1. Create new entries (POST)
  for (let i = 0; i < newEntries.length; i += BATCH_SIZE) {
    const chunk = newEntries.slice(i, i + BATCH_SIZE);
    const requests: BatchRequestItem[] = chunk.map((entry, idx) => ({
      id: String(idx),
      method: 'POST' as const,
      url: `/users/${userOid}/events`,
      headers: { 'Content-Type': 'application/json' },
      body: buildOutlookEvent(entry, entry.procedure_name),
    }));

    const responses = await sendBatch(token, requests);
    if (responses.length === 0) {
      result.failed += chunk.length;
      result.errors.push(`Create batch failed entirely`);
      continue;
    }
    const cr = await processCreateResponses(db, chunk, responses);
    result.synced += cr.synced;
    result.failed += cr.failed;
    result.errors.push(...cr.errors);
  }

  // 2. Update modified entries (PATCH)
  if (modifiedEntries.length > 0) {
    const mr = await pushModifiedEntries(db, token, userOid, modifiedEntries);
    result.updated += mr.updated;
    result.failed += mr.failed;
    result.errors.push(...mr.errors);
  }

  logger.info(`[CalendarPush] Done: ${result.synced} new, ${result.updated} updated, ${result.failed} failed`);
  return result;
}
