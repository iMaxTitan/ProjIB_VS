import type { SupabaseClient } from '@/lib/shared/postgrest-client';

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
  subject: string | null;
  has_transcript: boolean;
  transcript_summary: string | null;
  procedure_name: string;
  process_name: string;
  /** Title of the linked daily_task (shown instead of procedure_name). */
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
  procedureId: string;
  procedureName: string;
  processName: string;
  departmentCode: string;
  plannedHours: number;
  status: 'active' | 'completed';
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
  db: SupabaseClient, userId: string, weekStart: string,
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
  db: SupabaseClient, userId: string, weekStart: string,
): Promise<CalendarEntry[]> {
  const dates = weekDates(weekStart);

  const { data, error } = await db
    .from('weekly_calendar_entries')
    .select(`
      id, employee_id, date, start_time, duration_minutes,
      source, monthly_plan_id, outlook_event_id, daily_task_id, task_template_id,
      subject, has_transcript, transcript_summary, outlook_modified, needs_push,
      monthly_plans(procedure_id, procedures(name, processes(process_name))),
      daily_tasks(monthly_plan_id, completed_at, description, title),
      procedure_task_templates(title)
    `)
    .eq('employee_id', userId)
    .in('date', dates)
    .order('date')
    .order('start_time');

  if (error) throw error;

  type PlanJoin = {
    procedure_id: string;
    procedures: {
      name: string;
      processes: { process_name: string } | { process_name: string }[] | null;
    } | null;
  };

  return (data || []).map((row) => {
    let procedureName = 'Без процедури';
    let processName = '';

    if (row.source === 'plan' && row.monthly_plans) {
      const plan = (Array.isArray(row.monthly_plans)
        ? row.monthly_plans[0] : row.monthly_plans) as unknown as PlanJoin | null;
      const proc = plan?.procedures;
      if (proc) {
        procedureName = proc.name;
        const procObj = proc.processes;
        processName = Array.isArray(procObj)
          ? procObj[0]?.process_name ?? '' : procObj?.process_name ?? '';
      }
    } else if (row.source === 'external') {
      procedureName = row.subject || '(без теми)';
    }

    // Check if linked daily_task has a plan
    const taskJoin = (row as Record<string, unknown>).daily_tasks as
      | { monthly_plan_id: string | null; completed_at: string | null; description: string | null; title: string | null }
      | { monthly_plan_id: string | null; completed_at: string | null; description: string | null; title: string | null }[] | null;
    const taskObj = Array.isArray(taskJoin) ? taskJoin[0] : taskJoin;
    const taskHasPlan = !!taskObj?.monthly_plan_id;
    const taskCompleted = !!taskObj?.completed_at;

    return {
      id: row.id, employee_id: row.employee_id, date: row.date,
      start_time: row.start_time, duration_minutes: row.duration_minutes,
      source: row.source as 'plan' | 'external',
      monthly_plan_id: row.monthly_plan_id, outlook_event_id: row.outlook_event_id,
      daily_task_id: row.daily_task_id, task_template_id: (row as Record<string, unknown>).task_template_id as string | null,
      task_has_plan: taskHasPlan, task_completed: taskCompleted,
      subject: row.subject,
      has_transcript: !!(row as Record<string, unknown>).has_transcript,
      transcript_summary: row.transcript_summary,
      procedure_name: procedureName, process_name: processName,
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
  db: SupabaseClient, userId: string, weekStart: string,
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

  type PlanRow = { monthly_plan_id: string; planned_hours: number; procedure_id: string; status: string; procedures: unknown };
  const allPlans: PlanRow[] = [];
  for (const { year, month } of months) {
    const { data } = await db
      .from('monthly_plans')
      .select('monthly_plan_id, planned_hours, procedure_id, status, procedures(name, processes(process_name, departments(department_code)))')
      .in('monthly_plan_id', planIds)
      .eq('year', year)
      .eq('month', month)
      .in('status', ['active', 'completed']);
    if (data) allPlans.push(...(data as PlanRow[]));
  }

  const seen = new Set<string>();
  const plans = allPlans.filter(p => {
    if (seen.has(p.monthly_plan_id)) return false;
    seen.add(p.monthly_plan_id);
    return true;
  });

  return plans.map((row) => {
    type DeptJoin = { department_code: string } | { department_code: string }[] | null;
    type ProcJoin = {
      name: string;
      processes: { process_name: string; departments: DeptJoin } | { process_name: string; departments: DeptJoin }[] | null;
    };
    const proc = row.procedures as unknown as ProcJoin | ProcJoin[] | null;
    const p = Array.isArray(proc) ? proc[0] : proc;
    const procObj = p?.processes;
    const processRow = Array.isArray(procObj) ? procObj[0] : procObj;
    const processName = processRow?.process_name ?? '';
    const deptObj = processRow?.departments;
    const deptRow = Array.isArray(deptObj) ? deptObj[0] : deptObj;
    const departmentCode = deptRow?.department_code ?? '';

    return {
      monthlyPlanId: row.monthly_plan_id,
      procedureId: row.procedure_id,
      procedureName: p?.name ?? 'Без процедури',
      processName,
      departmentCode,
      plannedHours: Number(row.planned_hours) || 0,
      status: row.status === 'completed' ? 'completed' as const : 'active' as const,
    };
  });
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
