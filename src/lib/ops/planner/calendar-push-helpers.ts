/**
 * Helpers for calendar push: fetch entries, ensure category, build event.
 * Split from calendar-push.ts for file size compliance.
 */

import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import { fetchWithTimeout } from '@/lib/shared/utils/fetch-with-timeout';
import logger from '@/lib/shared/logger';
import { GRAPH_BASE, TIMEZONE, computeEndTime } from './calendar-shared';

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_NAME = 'CS Platform';

/** Extended property GUID for linking Outlook events back to our entries. */
const EXT_PROP_ID =
  'String {c1e7b3a5-d2f4-4e89-b6c0-8a9d2f5e3b7c} Name CsPlatformEntryId';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CalPushEntry {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  subject: string | null;
  monthly_plan_id: string | null;
}

export interface ModifiedPushEntry extends CalPushEntry {
  outlook_event_id: string;
}

export type EntryWithName = CalPushEntry & { plan_name: string };
export type ModifiedEntryWithName = ModifiedPushEntry & { plan_name: string };

// ─── Build Outlook event ─────────────────────────────────────────────────────

export function buildOutlookEvent(
  entry: CalPushEntry,
  procedureName: string,
): Record<string, unknown> {
  const startHM = entry.start_time.slice(0, 5);
  const endHM = computeEndTime(entry.start_time, entry.duration_minutes);

  return {
    subject: procedureName,
    start: { dateTime: `${entry.date}T${startHM}:00`, timeZone: TIMEZONE },
    end: { dateTime: `${entry.date}T${endHM}:00`, timeZone: TIMEZONE },
    showAs: 'busy',
    categories: [CATEGORY_NAME],
    singleValueExtendedProperties: [
      { id: EXT_PROP_ID, value: entry.id },
    ],
  };
}

// ─── Ensure master category ──────────────────────────────────────────────────

export async function ensureMasterCategory(token: string, userOid: string): Promise<void> {
  const url = `${GRAPH_BASE}/users/${userOid}/outlook/masterCategories`;
  try {
    const res = await fetchWithTimeout(
      url,
      { headers: { Authorization: `Bearer ${token}` } },
      10_000,
    );
    if (!res.ok) {
      logger.warn(`[CalendarPush] Cannot read masterCategories: ${res.status}`);
      return;
    }
    const data = (await res.json()) as { value?: { displayName: string }[] };
    const exists = data.value?.some((c) => c.displayName === CATEGORY_NAME);
    if (exists) return;

    const createRes = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayName: CATEGORY_NAME, color: 'preset7' }),
    }, 10_000);

    if (createRes.ok || createRes.status === 409) {
      logger.info(`[CalendarPush] Master category "${CATEGORY_NAME}" ensured for ${userOid}`);
    } else {
      logger.warn(`[CalendarPush] Failed to create master category: ${createRes.status}`);
    }
  } catch (err) {
    logger.warn('[CalendarPush] ensureMasterCategory error:', err);
  }
}

// ─── Resolve plan names via view ──────────────────────────────────────────────

async function fetchPlanNames(db: SupabaseClient, planIds: string[]): Promise<Map<string, string>> {
  if (planIds.length === 0) return new Map();
  const { data } = await db
    .from('v_monthly_plan_details')
    .select('monthly_plan_id, plan_name')
    .in('monthly_plan_id', planIds);
  return new Map((data || []).map(p => [p.monthly_plan_id, p.plan_name ?? '']));
}

// ─── Fetch entries needing initial push (no outlook_event_id) ───────────────

export async function fetchUnpushedEntries(
  db: SupabaseClient,
  employeeId: string,
  dates: string[],
): Promise<EntryWithName[]> {
  const { data, error } = await db
    .from('weekly_calendar_entries')
    .select('id, date, start_time, duration_minutes, subject, monthly_plan_id')
    .eq('employee_id', employeeId)
    .eq('source', 'plan')
    .is('outlook_event_id', null)
    .in('date', dates);

  if (error) {
    logger.error('[CalendarPush] Failed to fetch entries:', error);
    return [];
  }

  const planIds = [...new Set((data || []).map(r => r.monthly_plan_id).filter(Boolean))] as string[];
  const nameMap = await fetchPlanNames(db, planIds);

  return (data || []).map((row) => ({
    id: row.id,
    date: row.date,
    start_time: row.start_time,
    duration_minutes: row.duration_minutes,
    subject: row.subject,
    monthly_plan_id: row.monthly_plan_id,
    plan_name: nameMap.get(row.monthly_plan_id ?? '') ?? row.subject ?? 'Подія',
  }));
}

// ─── Fetch entries needing update (needs_push + has outlook_event_id) ────────

export async function fetchModifiedEntries(
  db: SupabaseClient,
  employeeId: string,
  dates: string[],
): Promise<ModifiedEntryWithName[]> {
  const { data, error } = await db
    .from('weekly_calendar_entries')
    .select('id, date, start_time, duration_minutes, subject, monthly_plan_id, outlook_event_id')
    .eq('employee_id', employeeId)
    .eq('source', 'plan')
    .eq('needs_push', true)
    .not('outlook_event_id', 'is', null)
    .in('date', dates);

  if (error) {
    logger.error('[CalendarPush] Failed to fetch modified entries:', error);
    return [];
  }

  const planIds = [...new Set((data || []).map(r => r.monthly_plan_id).filter(Boolean))] as string[];
  const nameMap = await fetchPlanNames(db, planIds);

  return (data || []).map((row) => ({
    id: row.id,
    date: row.date,
    start_time: row.start_time,
    duration_minutes: row.duration_minutes,
    subject: row.subject,
    monthly_plan_id: row.monthly_plan_id,
    outlook_event_id: row.outlook_event_id as string,
    plan_name: nameMap.get(row.monthly_plan_id ?? '') ?? row.subject ?? 'Подія',
  }));
}
