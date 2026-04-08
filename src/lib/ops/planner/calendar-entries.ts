import type { PostgrestClient } from '@/lib/shared/postgrest-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarEntry {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  source: 'plan' | 'external';
  monthly_plan_id: string | null;
  outlook_event_id: string | null;
  daily_task_id: string | null;
  task_template_id: string | null;
  /** Whether the linked daily_task has a monthly_plan_id (assigned, not draft). */
  task_has_plan: boolean;
  /** Whether the linked daily_task is completed. */
  task_completed: boolean;
  /** Hours already collected into the linked task. */
  task_hours: number;
  /** Task type: incomplete, pending_approval, completed, etc. */
  task_type: string | null;
  subject: string | null;
  has_transcript: boolean;
  transcript_summary: string | null;
  plan_name: string;
  process_name: string;
  /** Title of the linked daily_task (shown instead of plan_name). */
  task_title: string | null;
  /** Description of the linked daily_task. */
  task_description: string | null;
  /** True when plan event was modified in Outlook. */
  outlook_modified: boolean;
  /** True when entry needs to be pushed/updated in Outlook. */
  needs_push: boolean;
  /** Title from linked task template. */
  template_title: string | null;
}

export interface ActivePlanForSlot {
  monthlyPlanId: string;
  /** Display name — procedure name or initiative title */
  planName: string;
  procedureId: string | null;
  processName: string;
  departmentCode: string;
  plannedHours: number;
  status: 'active' | 'done';
  initiativeId: string | null;
}

export interface CreateEntryParams {
  monthly_plan_id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  skipOverlapCheck?: boolean;
  /** Client passes cascade=true; mapped to skipOverlapCheck in API route. */
  cascade?: boolean;
  /** Optional: link template at creation time */
  task_template_id?: string;
  /** Optional: link existing task at creation time */
  daily_task_id?: string;
}

export interface UpdateEntryParams {
  date?: string;
  start_time?: string;
  duration_minutes?: number;
  daily_task_id?: string | null;
  task_template_id?: string | null;
  monthly_plan_id?: string | null;
  skipOverlapCheck?: boolean;
  /** Client passes cascade=true; mapped to skipOverlapCheck in API route. */
  cascade?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function weekDates(weekStart: string): string[] {
  const d = new Date(weekStart);
  return Array.from({ length: 5 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

// ─── Vacation helper ─────────────────────────────────────────────────────────

export async function getVacationDaysForWeek(
  db: PostgrestClient, userId: string, weekStart: string,
): Promise<Set<string>> {
  const dates = weekDates(weekStart);
  const weekEnd = dates[dates.length - 1];

  const { data } = await db
    .from('planned_absences')
    .select('start_date, end_date')
    .eq('user_id', userId)
    .in('status', ['approved', 'pending'])
    .lte('start_date', weekEnd)
    .gte('end_date', weekStart);

  const vacDays = new Set<string>();
  for (const row of data || []) {
    for (const d of dates) {
      if (d >= row.start_date && d <= row.end_date) vacDays.add(d);
    }
  }
  return vacDays;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getWeekEntries(
  db: PostgrestClient, userId: string, weekStart: string,
): Promise<CalendarEntry[]> {
  const dates = weekDates(weekStart);

  const { data, error } = await db
    .from('weekly_calendar_entries')
    .select(`
      id, employee_id, date, start_time, duration_minutes,
      source, monthly_plan_id, outlook_event_id, daily_task_id, task_template_id,
      subject, has_transcript, transcript_summary, outlook_modified, needs_push,
      daily_tasks(monthly_plan_id, completed_at, description, title, spent_hours, task_type),
      procedure_task_templates(title)
    `)
    .eq('employee_id', userId)
    .in('date', dates)
    .order('date')
    .order('start_time');

  if (error) throw error;

  // Collect unique plan IDs and fetch plan details from view
  const planIds = [...new Set((data || []).map(r => r.monthly_plan_id).filter(Boolean))] as string[];
  const planMap = new Map<string, { plan_name: string; process_name: string }>();
  if (planIds.length > 0) {
    const { data: plans } = await db
      .from('v_monthly_plan_details')
      .select('monthly_plan_id, plan_name, process_name')
      .in('monthly_plan_id', planIds);
    for (const p of plans || []) {
      planMap.set(p.monthly_plan_id, { plan_name: p.plan_name ?? '', process_name: p.process_name ?? '' });
    }
  }

  return (data || []).map((row) => {
    const planInfo = row.monthly_plan_id ? planMap.get(row.monthly_plan_id) : undefined;
    const planName = row.source === 'external' && !planInfo
      ? (row.subject || '(без теми)')
      : (planInfo?.plan_name ?? '');
    const processName = planInfo?.process_name ?? '';

    const taskJoin = (row as Record<string, unknown>).daily_tasks as
      | { monthly_plan_id: string | null; completed_at: string | null; description: string | null; title: string | null; spent_hours: number | null; task_type: string | null }
      | { monthly_plan_id: string | null; completed_at: string | null; description: string | null; title: string | null; spent_hours: number | null; task_type: string | null }[] | null;
    const taskObj = Array.isArray(taskJoin) ? taskJoin[0] : taskJoin;

    return {
      id: row.id, employee_id: row.employee_id, date: row.date,
      start_time: row.start_time, duration_minutes: row.duration_minutes,
      source: row.source as 'plan' | 'external',
      monthly_plan_id: row.monthly_plan_id, outlook_event_id: row.outlook_event_id,
      daily_task_id: row.daily_task_id, task_template_id: (row as Record<string, unknown>).task_template_id as string | null,
      task_has_plan: !!taskObj?.monthly_plan_id, task_completed: !!taskObj?.completed_at, task_hours: Number(taskObj?.spent_hours) || 0, task_type: taskObj?.task_type ?? null,
      subject: row.subject,
      has_transcript: !!(row as Record<string, unknown>).has_transcript,
      transcript_summary: row.transcript_summary,
      plan_name: planName, process_name: processName,
      task_title: taskObj?.title ?? null,
      task_description: taskObj?.description ?? null,
      outlook_modified: !!(row as Record<string, unknown>).outlook_modified,
      needs_push: !!(row as Record<string, unknown>).needs_push,
      template_title: (() => {
        const tpl = (row as Record<string, unknown>).procedure_task_templates as { title: string } | { title: string }[] | null;
        const t = Array.isArray(tpl) ? tpl[0] : tpl;
        return t?.title ?? null;
      })(),
    };
  });
}

export async function getActivePlansForUser(
  db: PostgrestClient, userId: string, weekStart: string,
): Promise<ActivePlanForSlot[]> {
  const ws = new Date(weekStart + 'T00:00:00Z');
  const wf = new Date(ws.getTime() + 4 * 86_400_000);
  const month1 = { year: ws.getUTCFullYear(), month: ws.getUTCMonth() + 1 };
  const month2 = { year: wf.getUTCFullYear(), month: wf.getUTCMonth() + 1 };
  const months = month1.year === month2.year && month1.month === month2.month
    ? [month1] : [month1, month2];

  const { data: assignees } = await db
    .from('monthly_plan_assignees')
    .select('monthly_plan_id')
    .eq('user_id', userId);

  const planIds = (assignees || []).map((r) => r.monthly_plan_id);
  if (planIds.length === 0) return [];

  type ViewRow = {
    monthly_plan_id: string; planned_hours: number; procedure_id: string | null;
    initiative_id: string | null; status: string; plan_type: string;
    plan_name: string; process_name: string; department_code: string;
  };

  const allPlans: ViewRow[] = [];
  for (const { year, month } of months) {
    const { data } = await db
      .from('v_monthly_plan_details')
      .select('monthly_plan_id, planned_hours, procedure_id, initiative_id, status, plan_type, plan_name, process_name, department_code')
      .in('monthly_plan_id', planIds)
      .eq('year', year)
      .eq('month', month)
      .in('status', ['active', 'done']);
    if (data) allPlans.push(...(data as ViewRow[]));
  }

  const seen = new Set<string>();
  return allPlans
    .filter(p => { if (seen.has(p.monthly_plan_id)) return false; seen.add(p.monthly_plan_id); return true; })
    .map((row) => ({
      monthlyPlanId: row.monthly_plan_id,
      planName: row.plan_name ?? '',
      procedureId: row.procedure_id,
      processName: row.process_name ?? '',
      departmentCode: row.department_code ?? '',
      plannedHours: Number(row.planned_hours) || 0,
      status: row.status === 'done' ? 'done' as const : 'active' as const,
      initiativeId: row.initiative_id,
    }));
}

// ─── Write operations ────────────────────────────────────────────────────────
// Split to calendar-entries-write.ts for file size compliance.
// Re-export for convenience.
export {
  createEntry,
  createEntriesBatch,
  updateEntry,
  deleteEntry,
  copyFromLastWeek,
} from './calendar-entries-write';
