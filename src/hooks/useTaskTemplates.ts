/**
 * Task template hooks -- CRUD + AI generate for procedure_task_templates.
 * Uses /api/planner/templates endpoints.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const PLANNER_TEMPLATES_KEY = ['planner', 'templates'] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskTemplate {
  id: string;
  procedure_id: string;
  title: string;
  content: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

interface CreateTemplateParams {
  procedure_id: string;
  title: string;
  content: string;
}

interface UpdateTemplateParams {
  id: string;
  title?: string;
  content?: string;
  is_active?: boolean;
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function useTemplates(procedureId?: string) {
  return useQuery<TaskTemplate[]>({
    queryKey: [...PLANNER_TEMPLATES_KEY, procedureId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (procedureId) params.set('procedure_id', procedureId);
      const res = await fetch(`/api/planner/templates?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to load templates');
      }
      return res.json();
    },
    enabled: !!procedureId,
    staleTime: Infinity, // reference data
  });
}

// ─── Create ───────────────────────────────────────────────────────────────────

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: CreateTemplateParams) => {
      const res = await fetch('/api/planner/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to create template');
      }
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_TEMPLATES_KEY });
    },
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...params }: UpdateTemplateParams) => {
      const res = await fetch('/api/planner/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...params }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to update template');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_TEMPLATES_KEY });
    },
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/planner/templates?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to delete template');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_TEMPLATES_KEY });
    },
  });
}

// ─── AI Generate ──────────────────────────────────────────────────────────────

export function useGenerateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { procedure_id: string; context?: string }) => {
      const res = await fetch('/api/planner/templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to generate template');
      }
      return res.json() as Promise<{ templates: Array<{ title: string; content: string }> }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_TEMPLATES_KEY });
    },
  });
}
