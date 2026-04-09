/**
 * Calendar entries — write operations (create, update, delete, copy).
 * Split from calendar-entries.ts for file size compliance.
 */

import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import logger from '@/lib/shared/logger';
import { getWeekEntries, type CreateEntryParams, type UpdateEntryParams } from './calendar-entries';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function slotsOverlap(startA: string, durA: number, startB: string, durB: number): boolean {
  const a0 = timeToMinutes(startA);
  const b0 = timeToMinutes(startB);
  return a0 < b0 + durB && b0 < a0 + durA;
}

async function checkOverlap(
  db: PostgrestClient, userId: string, date: string,
  startTime: string, durationMinutes: number, excludeId?: string,
): Promise<void> {
  let query = db
    .from('weekly_calendar_entries')
    .select('start_time, duration_minutes')
    .eq('employee_id', userId)
    .eq('date', date)
    .eq('source', 'plan');

  if (excludeId) query = query.neq('id', excludeId);

  const { data: existing } = await query;
  const hasConflict = (existing || []).some((s) =>
    slotsOverlap(startTime, durationMinutes, s.start_time, s.duration_minutes),
  );
  if (hasConflict) throw new Error('Слот перетинається з існуючим');
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createEntry(
  db: PostgrestClient, userId: string, params: CreateEntryParams,
): Promise<{ id: string }> {
  const startMin = timeToMinutes(params.start_time);
  if (startMin < 540 || startMin + params.duration_minutes > 1080) {
    throw new Error('Слот має бути в межах 9:00–18:00');
  }

  // Block creation on vacation days
  const { data: absences } = await db
    .from('planned_absences')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['approved', 'pending'])
    .lte('start_date', params.date)
    .gte('end_date', params.date)
    .limit(1);
  if (absences && absences.length > 0) {
    throw new Error('Цей день — відпустка');
  }

  if (!params.skipOverlapCheck) {
    await checkOverlap(db, userId, params.date, params.start_time, params.duration_minutes);
  }

  const insertRow: Record<string, unknown> = {
    employee_id: userId, source: 'plan',
    monthly_plan_id: params.monthly_plan_id,
    date: params.date, start_time: params.start_time,
    duration_minutes: params.duration_minutes,
  };
  if (params.task_template_id) insertRow.task_template_id = params.task_template_id;
  if (params.daily_task_id) insertRow.daily_task_id = params.daily_task_id;

  const { data, error } = await db
    .from('weekly_calendar_entries')
    .insert(insertRow)
    .select('id')
    .single();

  if (error) throw error;
  logger.info(`[CalendarEntries] Created entry ${data!.id} for ${userId} on ${params.date} ${params.start_time}`);
  return { id: data!.id };
}

export async function createEntriesBatch(
  db: PostgrestClient, userId: string, entries: CreateEntryParams[],
): Promise<{ created: number }> {
  if (entries.length === 0) return { created: 0 };

  // Filter out vacation days (silent skip)
  const uniqueDates = [...new Set(entries.map(e => e.date))];
  const { data: absences } = await db
    .from('planned_absences')
    .select('start_date, end_date')
    .eq('user_id', userId)
    .in('status', ['approved', 'pending'])
    .lte('start_date', uniqueDates[uniqueDates.length - 1])
    .gte('end_date', uniqueDates[0]);
  const vacDates = new Set<string>();
  for (const a of absences || []) {
    for (const d of uniqueDates) {
      if (d >= a.start_date && d <= a.end_date) vacDates.add(d);
    }
  }
  const filtered = vacDates.size > 0 ? entries.filter(e => !vacDates.has(e.date)) : entries;
  if (filtered.length === 0) return { created: 0 };

  const rows = filtered.map((e) => ({
    employee_id: userId, source: 'plan' as const,
    monthly_plan_id: e.monthly_plan_id, date: e.date,
    start_time: e.start_time, duration_minutes: e.duration_minutes,
  }));
  const { error } = await db.from('weekly_calendar_entries').insert(rows);
  if (error) throw error;
  logger.info(`[CalendarEntries] Batch created ${rows.length} entries for ${userId} (skipped ${entries.length - filtered.length} vacation days)`);
  return { created: rows.length };
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateEntry(
  db: PostgrestClient, userId: string, entryId: string, params: UpdateEntryParams,
): Promise<{ oldOutlookEventId: string | null }> {
  const { data: existing, error: fetchErr } = await db
    .from('weekly_calendar_entries')
    .select('id, source, date, start_time, duration_minutes, outlook_event_id, daily_task_id')
    .eq('id', entryId)
    .eq('employee_id', userId)
    .single();

  if (fetchErr || !existing) throw new Error('Запис не знайдено');

  // Block time edits on completed entries only
  const existingTaskId = (existing as Record<string, unknown>).daily_task_id;
  const timeUpdate = params.date || params.start_time || params.duration_minutes;
  if (existingTaskId && timeUpdate) {
    // Check if the linked task is completed
    const { data: taskRow } = await db
      .from('daily_tasks')
      .select('task_type')
      .eq('daily_task_id', existingTaskId)
      .single();
    if (taskRow?.task_type === 'completed') {
      throw new Error('Запис зібрано в задачу, редагування заблоковано');
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.date !== undefined) updates.date = params.date;
  if (params.start_time !== undefined) updates.start_time = params.start_time;
  if (params.duration_minutes !== undefined) updates.duration_minutes = params.duration_minutes;
  if (params.daily_task_id !== undefined) updates.daily_task_id = params.daily_task_id;
  if (params.task_template_id !== undefined) updates.task_template_id = params.task_template_id;
  if (params.monthly_plan_id !== undefined) updates.monthly_plan_id = params.monthly_plan_id;

  const hasOutlookEvent = !!(existing as Record<string, unknown>).outlook_event_id;

  if (timeUpdate) {
    const newDate = params.date ?? existing.date;
    const newTime = params.start_time ?? existing.start_time;
    const newDur = params.duration_minutes ?? existing.duration_minutes;

    const startMin = timeToMinutes(newTime);
    if (startMin < 540 || startMin + newDur > 1080) {
      throw new Error('Слот має бути в межах 9:00–18:00');
    }
    if (!params.skipOverlapCheck) {
      await checkOverlap(db, userId, newDate, newTime, newDur, entryId);
    }
    // Don't clear outlook_event_id — Push will update the existing event
    if (hasOutlookEvent) {
      updates.needs_push = true;
      updates.outlook_modified = false;
    }
  }

  // Template change requires Push to update subject in Outlook
  if (params.task_template_id !== undefined && hasOutlookEvent) {
    updates.needs_push = true;
  }

  const { error } = await db
    .from('weekly_calendar_entries')
    .update(updates)
    .eq('id', entryId)
    .eq('employee_id', userId);

  if (error) throw error;
  logger.info(`[CalendarEntries] Updated entry ${entryId}`);
  return { oldOutlookEventId: timeUpdate ? existing.outlook_event_id : null };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteEntry(
  db: PostgrestClient, userId: string, entryId: string,
): Promise<{ outlookEventId: string | null }> {
  const { data, error: fetchErr } = await db
    .from('weekly_calendar_entries')
    .select('source, outlook_event_id, daily_task_id')
    .eq('id', entryId)
    .eq('employee_id', userId)
    .single();

  if (fetchErr || !data) throw new Error('Запис не знайдено');
  if (data.source !== 'plan') throw new Error('Зовнішні події не можна видаляти');

  const taskId = (data as Record<string, unknown>).daily_task_id;
  if (taskId) {
    const { data: taskRow } = await db
      .from('daily_tasks')
      .select('task_type')
      .eq('daily_task_id', taskId)
      .single();
    if (taskRow?.task_type === 'completed') {
      throw new Error('Запис зібрано в задачу, видалення заблоковано');
    }
    // Unlink task from slot — keep the plan entry
    const { error } = await db
      .from('weekly_calendar_entries')
      .update({ daily_task_id: null, task_template_id: null, needs_push: false, updated_at: new Date().toISOString() })
      .eq('id', entryId)
      .eq('employee_id', userId);
    if (error) throw error;
    return { outlookEventId: data.outlook_event_id };
  }

  const { error } = await db
    .from('weekly_calendar_entries')
    .delete()
    .eq('id', entryId)
    .eq('employee_id', userId);

  if (error) throw error;
  logger.info(`[CalendarEntries] Deleted entry ${entryId}`);
  return { outlookEventId: data.outlook_event_id };
}

// ─── Copy from last week ──────────────────────────────────────────────────────

export async function copyFromLastWeek(
  db: PostgrestClient, userId: string, targetWeekStart: string,
): Promise<{ copied: number; skipped: number }> {
  const target = new Date(targetWeekStart);
  const prev = new Date(target);
  prev.setDate(prev.getDate() - 7);
  const prevStart = prev.toISOString().slice(0, 10);

  const prevEntries = await getWeekEntries(db, userId, prevStart);
  const planEntries = prevEntries.filter((e) => e.source === 'plan');
  if (planEntries.length === 0) return { copied: 0, skipped: 0 };

  const targetEntries = await getWeekEntries(db, userId, targetWeekStart);
  let copied = 0;
  let skipped = 0;

  for (const entry of planEntries) {
    const oldDate = new Date(entry.date);
    const newDate = new Date(oldDate);
    newDate.setDate(oldDate.getDate() + 7);
    const newDateStr = newDate.toISOString().slice(0, 10);

    const hasConflict = targetEntries
      .filter((t) => t.source === 'plan')
      .some((t) => t.date === newDateStr && slotsOverlap(
        entry.start_time, entry.duration_minutes, t.start_time, t.duration_minutes,
      ));

    if (hasConflict) { skipped++; continue; }

    const { error } = await db.from('weekly_calendar_entries').insert({
      employee_id: userId, source: 'plan',
      monthly_plan_id: entry.monthly_plan_id || null,
      date: newDateStr, start_time: entry.start_time,
      duration_minutes: entry.duration_minutes,
      task_template_id: entry.task_template_id || null,
    });

    if (error) { skipped++; } else { copied++; }
  }

  logger.info(`[CalendarEntries] Copied ${copied} entries, skipped ${skipped} for ${userId}`);
  return { copied, skipped };
}
