/**
 * Planner — optimistic update helpers for calendar entries.
 */
import type { CalendarEntry, CreateEntryParams, ActivePlanForSlot } from './calendar-entries';

export interface WeeklyPlannerData {
  entries: CalendarEntry[];
  activePlans: ActivePlanForSlot[];
  lunchStart?: string;
  vacationDays?: string[];
}

/** Normalize time to HH:MM:SS */
const toHMS = (t: string) => (t.length === 5 ? t + ':00' : t);

/** Build optimistic CalendarEntry for create */
export function buildOptimisticEntry(
  params: CreateEntryParams & { _planName?: string; _processName?: string; _taskTitle?: string },
): CalendarEntry {
  return {
    id: `_optimistic_${Date.now()}`,
    employee_id: '',
    date: params.date,
    start_time: toHMS(params.start_time),
    duration_minutes: params.duration_minutes,
    source: 'plan',
    monthly_plan_id: params.monthly_plan_id,
    outlook_event_id: null,
    daily_task_id: params.daily_task_id ?? null,
    task_template_id: params.task_template_id ?? null,
    task_has_plan: false,
    task_completed: false,
    task_hours: 0,
    task_type: null,
    subject: null,
    has_transcript: false,
    transcript_summary: null,
    plan_name: params._planName ?? '',
    process_name: params._processName ?? '',
    task_title: params._taskTitle ?? null,
    task_description: null,
    outlook_modified: false,
    needs_push: false,
    template_title: null,
  };
}

/** Build optimistic entries for batch create */
export function buildOptimisticBatch(entries: CreateEntryParams[]): CalendarEntry[] {
  return entries.map((e, i) => ({
    id: `_optimistic_batch_${Date.now()}_${i}`,
    employee_id: '',
    date: e.date,
    start_time: toHMS(e.start_time),
    duration_minutes: e.duration_minutes,
    source: 'plan',
    monthly_plan_id: e.monthly_plan_id,
    outlook_event_id: null,
    daily_task_id: null,
    task_template_id: e.task_template_id ?? null,
    task_has_plan: false,
    task_completed: false,
    task_hours: 0,
    task_type: null,
    subject: null,
    has_transcript: false,
    transcript_summary: null,
    plan_name: '',
    process_name: '',
    task_title: null,
    task_description: null,
    outlook_modified: false,
    needs_push: false,
    template_title: null,
  }));
}

/** Apply optimistic update fields to an existing entry */
export function applyOptimisticUpdate(
  entry: CalendarEntry,
  params: { date?: string; start_time?: string; duration_minutes?: number;
    daily_task_id?: string | null; task_template_id?: string | null; monthly_plan_id?: string | null },
): CalendarEntry {
  return {
    ...entry,
    ...(params.date && { date: params.date }),
    ...(params.start_time && { start_time: toHMS(params.start_time) }),
    ...(params.duration_minutes && { duration_minutes: params.duration_minutes }),
    ...((params.date || params.start_time) ? { outlook_event_id: null } : {}),
    ...(params.daily_task_id !== undefined ? { daily_task_id: params.daily_task_id } : {}),
    ...(params.task_template_id !== undefined ? { task_template_id: params.task_template_id } : {}),
    ...(params.monthly_plan_id !== undefined ? { monthly_plan_id: params.monthly_plan_id } : {}),
    ...((params.date || params.start_time || params.duration_minutes || params.task_template_id !== undefined) && entry.outlook_event_id ? { needs_push: true } : {}),
  };
}

/** Typed fetch wrapper for planner API — throws on error */
export async function plannerFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed' }));
    throw new Error(err.error || 'Planner request failed');
  }
  return res.json();
}
