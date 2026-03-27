/**
 * Planner hooks -- query + mutations for weekly calendar entries.
 * Replaces useWeeklyPlanner.ts + useTaskLink.ts with /api/planner/entries endpoints.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CalendarEntry,
  ActivePlanForSlot,
  CreateEntryParams,
  UpdateEntryParams,
} from '@/lib/ops/planner/calendar-entries';
import type { SuggestedSlot } from '@/lib/ops/planner/weekly-suggest-strategies';

export const PLANNER_ENTRIES_KEY = ['planner', 'entries'] as const;

/** Normalize time to HH:MM:SS — safe for both HH:MM and HH:MM:SS input. */
const toHMS = (t: string) => (t.length === 5 ? t + ':00' : t);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeeklyPlannerData {
  entries: CalendarEntry[];
  activePlans: ActivePlanForSlot[];
  lunchStart?: string;
  vacationDays?: string[];
}

interface CreateEntryWithMeta extends CreateEntryParams {
  _procedureName?: string;
  _processName?: string;
  cascade?: boolean;
}

export interface LinkTaskParams {
  entryId: string;
  dailyTaskId?: string;
  template?: { title: string; content: string };
  monthlyPlanId?: string;
  entryDate?: string;
  durationMinutes?: number;
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function useWeeklyEntries(weekStart: string) {
  return useQuery<WeeklyPlannerData>({
    queryKey: [...PLANNER_ENTRIES_KEY, weekStart],
    queryFn: async () => {
      const res = await fetch(`/api/planner/entries?weekStart=${weekStart}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to load weekly planner');
      }
      return res.json();
    },
    staleTime: 30_000,
  });
}

// ─── Create (optimistic) ──────────────────────────────────────────────────────

export function useCreateEntry(weekStart: string) {
  const qc = useQueryClient();
  const queryKey = [...PLANNER_ENTRIES_KEY, weekStart];

  return useMutation({
    mutationFn: async (params: CreateEntryWithMeta) => {
      const { _procedureName: _, _processName: __, ...apiParams } = params;
      const res = await fetch('/api/planner/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiParams),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to create entry');
      }
      return res.json() as Promise<{ id: string }>;
    },
    onMutate: async (params) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<WeeklyPlannerData>(queryKey);

      if (prev) {
        const optimisticEntry: CalendarEntry = {
          id: `_optimistic_${Date.now()}`,
          employee_id: '',
          date: params.date,
          start_time: toHMS(params.start_time),
          duration_minutes: params.duration_minutes,
          source: 'plan',
          monthly_plan_id: params.monthly_plan_id,
          outlook_event_id: null,
          daily_task_id: null, task_template_id: params.task_template_id ?? null,
          task_has_plan: false, task_completed: false,
          subject: null,
          has_transcript: false,
          transcript_summary: null,
          procedure_name: params._procedureName ?? '',
          process_name: params._processName ?? '',
          task_title: null, task_description: null, outlook_modified: false, needs_push: false, template_title: null,
        };
        qc.setQueryData<WeeklyPlannerData>(queryKey, {
          ...prev,
          entries: [...prev.entries, optimisticEntry],
        });
      }
      return { prev };
    },
    onError: (_err, _params, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}

// ─── Update (optimistic) ──────────────────────────────────────────────────────

export function useUpdateEntry(weekStart: string) {
  const qc = useQueryClient();
  const queryKey = [...PLANNER_ENTRIES_KEY, weekStart];

  return useMutation({
    mutationFn: async (params: UpdateEntryParams & { id: string }) => {
      const res = await fetch('/api/planner/entries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to update entry');
      }
      return res.json();
    },
    onMutate: async (params) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<WeeklyPlannerData>(queryKey);

      if (prev) {
        qc.setQueryData<WeeklyPlannerData>(queryKey, {
          ...prev,
          entries: prev.entries.map((e) =>
            e.id === params.id
              ? {
                  ...e,
                  ...(params.date && { date: params.date }),
                  ...(params.start_time && { start_time: toHMS(params.start_time) }),
                  ...(params.duration_minutes && { duration_minutes: params.duration_minutes }),
                  ...((params.date || params.start_time) ? { outlook_event_id: null } : {}),
                  ...(params.daily_task_id !== undefined ? { daily_task_id: params.daily_task_id } : {}),
                  ...(params.task_template_id !== undefined ? { task_template_id: params.task_template_id } : {}),
                  ...(params.monthly_plan_id !== undefined ? { monthly_plan_id: params.monthly_plan_id } : {}),
                  // Mark needs_push for time/template changes on synced entries
                  ...((params.date || params.start_time || params.duration_minutes || params.task_template_id !== undefined) && e.outlook_event_id ? { needs_push: true } : {}),
                }
              : e,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _params, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/planner/entries?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to delete entry');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}

// ─── Batch create (accept-all) ────────────────────────────────────────────────

export function useBatchCreateEntries(weekStart: string) {
  const qc = useQueryClient();
  const queryKey = [...PLANNER_ENTRIES_KEY, weekStart];

  return useMutation({
    mutationFn: async (entries: CreateEntryParams[]) => {
      const res = await fetch('/api/planner/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to batch create entries');
      }
      return res.json() as Promise<{ created: number }>;
    },
    onMutate: async (entries) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<WeeklyPlannerData>(queryKey);
      if (prev) {
        const optimistic = entries.map<CalendarEntry>((e, i) => ({
          id: `_optimistic_batch_${Date.now()}_${i}`,
          employee_id: '',
          date: e.date,
          start_time: toHMS(e.start_time),
          duration_minutes: e.duration_minutes,
          source: 'plan',
          monthly_plan_id: e.monthly_plan_id,
          outlook_event_id: null,
          daily_task_id: null, task_template_id: null,
          task_has_plan: false, task_completed: false,
          subject: null,
          has_transcript: false,
          transcript_summary: null,
          procedure_name: '',
          process_name: '',
          task_title: null, task_description: null, outlook_modified: false, needs_push: false, template_title: null,
        }));
        qc.setQueryData<WeeklyPlannerData>(queryKey, {
          ...prev,
          entries: [...prev.entries, ...optimistic],
        });
      }
      return { prev };
    },
    onError: (_err, _params, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}

// ─── Suggest ──────────────────────────────────────────────────────────────────

export function useSuggestSlots(weekStart: string) {
  return useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams({ weekStart });
      const res = await fetch(`/api/planner/entries/suggest?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to suggest slots');
      }
      return res.json() as Promise<{ suggestions: SuggestedSlot[] }>;
    },
  });
}

// ─── Lunch ────────────────────────────────────────────────────────────────────

export function useUpdateLunch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lunchStart: string) => {
      const res = await fetch('/api/planner/entries/lunch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lunchStart }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to update lunch');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}

// ─── Copy ─────────────────────────────────────────────────────────────────────

export function useCopyWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetWeekStart: string) => {
      const res = await fetch('/api/planner/entries/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetWeekStart }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to copy week');
      }
      return res.json() as Promise<{ copied: number; skipped: number }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}

// ─── Link task to entry ──────────────────────────────────────────────────────

export function useLinkTaskToEntry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: LinkTaskParams) => {
      let taskId = params.dailyTaskId;

      // If template — create daily_task first
      if (!taskId && params.template && params.monthlyPlanId) {
        const hours = (params.durationMinutes || 60) / 60;
        const res = await fetch('/api/planner/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            monthly_plan_id: params.monthlyPlanId,
            title: params.template.title,
            description: params.template.content,
            task_date: params.entryDate,
            spent_hours: hours,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed' }));
          throw new Error(err.error || 'Failed to create task from template');
        }
        const data = await res.json();
        taskId = data.daily_task_id;
      }

      if (!taskId) throw new Error('No task to link');

      // Link task to calendar entry via PATCH
      const res = await fetch('/api/planner/entries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: params.entryId, daily_task_id: taskId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to link task');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}

// ─── Collect tasks (procedure → completed daily_tasks) ──────────────────────

export function useCollectTasks() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      procedureId: string;
      weekStart: string;
      monthlyPlanId: string;
      entries: { id: string; task_template_id: string; duration_minutes: number; date: string }[];
      externalEntries?: { id: string; duration_minutes: number; date: string; subject: string | null; transcript_summary: string | null }[];
    }) => {
      const res = await fetch('/api/planner/entries/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to collect tasks');
      }
      return res.json() as Promise<{ tasksCreated: number; entriesLinked: number }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
      qc.invalidateQueries({ queryKey: ['planner', 'tasks'] });
    },
  });
}
