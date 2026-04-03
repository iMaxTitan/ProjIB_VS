/**
 * Planner hooks -- query + mutations for weekly calendar entries.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateEntryParams, UpdateEntryParams } from '@/lib/ops/planner/calendar-entries';
import type { SuggestedSlot } from '@/lib/ops/planner/weekly-suggest-strategies';
import {
  type WeeklyPlannerData,
  buildOptimisticEntry, buildOptimisticBatch, applyOptimisticUpdate, plannerFetch,
} from '@/lib/ops/planner/planner.optimistic';

export { type WeeklyPlannerData } from '@/lib/ops/planner/planner.optimistic';

export const PLANNER_ENTRIES_KEY = ['planner', 'entries'] as const;

interface CreateEntryWithMeta extends CreateEntryParams {
  _planName?: string;
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

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ─── Query ────────────────────────────────────────────────────

export function useWeeklyEntries(weekStart: string) {
  return useQuery<WeeklyPlannerData>({
    queryKey: [...PLANNER_ENTRIES_KEY, weekStart],
    queryFn: () => plannerFetch(`/api/planner/entries?weekStart=${weekStart}`),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

// ─── Create (optimistic) ──────────────────────────────────────

export function useCreateEntry(weekStart: string) {
  const qc = useQueryClient();
  const queryKey = [...PLANNER_ENTRIES_KEY, weekStart];

  return useMutation({
    mutationFn: async (params: CreateEntryWithMeta) => {
      const { _planName: _, _processName: __, ...apiParams } = params;
      return plannerFetch<{ id: string }>('/api/planner/entries', {
        method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(apiParams),
      });
    },
    onMutate: async (params) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<WeeklyPlannerData>(queryKey);
      if (prev) {
        qc.setQueryData<WeeklyPlannerData>(queryKey, {
          ...prev, entries: [...prev.entries, buildOptimisticEntry(params)],
        });
      }
      return { prev };
    },
    onError: (_e, _p, ctx) => { if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY }); },
  });
}

// ─── Update (optimistic) ──────────────────────────────────────

export function useUpdateEntry(weekStart: string) {
  const qc = useQueryClient();
  const queryKey = [...PLANNER_ENTRIES_KEY, weekStart];

  return useMutation({
    mutationFn: (params: UpdateEntryParams & { id: string }) =>
      plannerFetch('/api/planner/entries', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(params) }),
    onMutate: async (params) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<WeeklyPlannerData>(queryKey);
      if (prev) {
        qc.setQueryData<WeeklyPlannerData>(queryKey, {
          ...prev, entries: prev.entries.map(e => e.id === params.id ? applyOptimisticUpdate(e, params) : e),
        });
      }
      return { prev };
    },
    onError: (_e, _p, ctx) => { if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY }); },
  });
}

// ─── Delete ───────────────────────────────────────────────────

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => plannerFetch(`/api/planner/entries?id=${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY }); },
  });
}

// ─── Batch create (optimistic) ────────────────────────────────

export function useBatchCreateEntries(weekStart: string) {
  const qc = useQueryClient();
  const queryKey = [...PLANNER_ENTRIES_KEY, weekStart];

  return useMutation({
    mutationFn: (entries: CreateEntryParams[]) =>
      plannerFetch<{ created: number }>('/api/planner/entries', {
        method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ entries }),
      }),
    onMutate: async (entries) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<WeeklyPlannerData>(queryKey);
      if (prev) {
        qc.setQueryData<WeeklyPlannerData>(queryKey, {
          ...prev, entries: [...prev.entries, ...buildOptimisticBatch(entries)],
        });
      }
      return { prev };
    },
    onError: (_e, _p, ctx) => { if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY }); },
  });
}

// ─── Suggest ──────────────────────────────────────────────────

export function useSuggestSlots(weekStart: string) {
  return useMutation({
    mutationFn: () => plannerFetch<{ suggestions: SuggestedSlot[] }>(`/api/planner/entries/suggest?weekStart=${weekStart}`),
  });
}

// ─── Lunch ────────────────────────────────────────────────────

export function useUpdateLunch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lunchStart: string) =>
      plannerFetch('/api/planner/entries/lunch', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ lunchStart }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY }); },
  });
}

// ─── Copy week ────────────────────────────────────────────────

export function useCopyWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetWeekStart: string) =>
      plannerFetch<{ copied: number; skipped: number }>('/api/planner/entries/copy', {
        method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ targetWeekStart }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY }); },
  });
}

// ─── Link task to entry ───────────────────────────────────────

export function useLinkTaskToEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: LinkTaskParams) => {
      let taskId = params.dailyTaskId;
      if (!taskId && params.template && params.monthlyPlanId) {
        const hours = (params.durationMinutes || 60) / 60;
        const data = await plannerFetch<{ daily_task_id: string }>('/api/planner/tasks', {
          method: 'POST', headers: JSON_HEADERS,
          body: JSON.stringify({ monthly_plan_id: params.monthlyPlanId, title: params.template.title, description: params.template.content, task_date: params.entryDate, spent_hours: hours }),
        });
        taskId = data.daily_task_id;
      }
      if (!taskId) throw new Error('No task to link');
      return plannerFetch('/api/planner/entries', {
        method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ id: params.entryId, daily_task_id: taskId }),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY }); },
  });
}

// ─── Collect tasks ────────────────────────────────────────────

export function useCollectTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      monthlyPlanId: string; weekStart: string;
      entries: { id: string; task_template_id: string; duration_minutes: number; date: string }[];
      externalEntries?: { id: string; duration_minutes: number; date: string; subject: string | null; transcript_summary: string | null }[];
    }) => plannerFetch<{ tasksCreated: number; entriesLinked: number }>('/api/planner/entries/collect', {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(params),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
      qc.invalidateQueries({ queryKey: ['planner', 'tasks'] });
    },
  });
}
