/**
 * Planner task hooks -- CRUD for daily tasks + task picker via /api/planner/tasks.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PLANNER_ENTRIES_KEY } from './usePlanner';

const PLANNER_TASKS_KEY = ['planner', 'tasks'] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskPickerItem {
  daily_task_id: string;
  description: string;
  title: string | null;
  task_date: string;
  spent_hours: number;
}

interface CreateTaskParams {
  monthly_plan_id: string;
  title: string;
  description: string;
  task_date: string;
  spent_hours: number;
  company_ids?: string[];
  document_number?: string;
  project_id?: string;
  kb_document_id?: string;
  attachment_url?: string;
}

interface UpdateTaskParams {
  title?: string;
  description?: string;
  spent_hours?: number;
  task_date?: string;
}

// ─── Types for detail mode ───────────────────────────────────────────────────

export interface PlanTaskItem {
  daily_task_id: string;
  title: string | null;
  description: string;
  task_date: string;
  spent_hours: number;
  task_type: string;
  source: string;
  created_by_role: string | null;
  project_id: string | null;
  document_number: string | null;
}

export interface PlanTaskDraft {
  daily_task_id: string;
  description: string;
  task_date: string;
  spent_hours: number;
}

export interface PlanInfo {
  description: string | null;
  plannedHours: number;
  status: string | null;
  year: number | null;
  month: number | null;
  companies: string[];
  companyIds: string[];
  planProjects: { id: string; name: string }[];
  planDocuments: { id: string; title: string; source_filename: string }[];
  distributionType: string;
}

interface PlanTasksData {
  planInfo: PlanInfo;
  currentUserRole: string;
  tasks: PlanTaskItem[];
  drafts: PlanTaskDraft[];
  summary: { total: number; completed: number; totalHours: number };
}

// ─── Plan Tasks Detail (all tasks for a monthly plan) ────────────────────────

export function usePlanTasks(monthlyPlanId?: string) {
  return useQuery<PlanTasksData>({
    queryKey: [...PLANNER_TASKS_KEY, 'detail', monthlyPlanId],
    queryFn: async () => {
      const res = await fetch(`/api/planner/tasks?mode=detail&monthly_plan_id=${monthlyPlanId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to load plan tasks');
      }
      return res.json();
    },
    enabled: !!monthlyPlanId,
    staleTime: 30_000,
  });
}

// ─── Assign draft to plan ────────────────────────────────────────────────────

export function useAssignDraftToplan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ draftId, monthlyPlanId }: { draftId: string; monthlyPlanId: string }) => {
      const res = await fetch(`/api/planner/tasks/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthly_plan_id: monthlyPlanId, task_type: 'incomplete' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to assign draft');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}

// ─── Change task status (submit/approve/reject) ─────────────────────────────

export function useChangeTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, taskType }: { id: string; taskType: string }) => {
      const res = await fetch(`/api/planner/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_type: taskType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to change status');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}

// ─── Task Picker (for linking to calendar entries) ────────────────────────────

export function useTaskPicker(procedureId?: string, monthlyPlanId?: string) {
  return useQuery<TaskPickerItem[]>({
    queryKey: [...PLANNER_TASKS_KEY, 'picker', procedureId, monthlyPlanId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (procedureId) params.set('procedure_id', procedureId);
      if (monthlyPlanId) params.set('monthly_plan_id', monthlyPlanId);
      const res = await fetch(`/api/planner/tasks?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to load tasks');
      }
      return res.json();
    },
    enabled: !!(procedureId || monthlyPlanId),
    staleTime: 30_000,
  });
}

// ─── Create ───────────────────────────────────────────────────────────────────

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: CreateTaskParams) => {
      const res = await fetch('/api/planner/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to create task');
      }
      return res.json() as Promise<{ daily_task_id: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...params }: UpdateTaskParams & { id: string }) => {
      const res = await fetch(`/api/planner/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to update task');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/planner/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to delete task');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_TASKS_KEY });
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}
