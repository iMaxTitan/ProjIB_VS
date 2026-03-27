/**
 * Planner draft hooks -- CRUD for unassigned tasks.
 * Uses /api/planner/drafts endpoints.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DraftsData } from '@/lib/ops/planner/drafts';
import { PLANNER_ENTRIES_KEY } from './usePlanner';

const PLANNER_DRAFTS_KEY = ['planner', 'drafts'] as const;

// ─── Query ────────────────────────────────────────────────────────────────────

export function useDrafts() {
  return useQuery<DraftsData>({
    queryKey: PLANNER_DRAFTS_KEY,
    queryFn: async () => {
      const res = await fetch('/api/planner/drafts');
      if (!res.ok) throw new Error(`Drafts: ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });
}

// ─── Create ───────────────────────────────────────────────────────────────────

export function useCreateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { description: string; hours: number; date?: string; meetingId?: string; planId?: string }) => {
      const res = await fetch('/api/planner/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to create draft');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_DRAFTS_KEY });
      qc.invalidateQueries({ queryKey: ['cabinet', 'stats'] });
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}

// ─── Assign ───────────────────────────────────────────────────────────────────

export function useAssignDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { draftId: string; planId: string }) => {
      const res = await fetch('/api/planner/drafts/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to assign draft');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_DRAFTS_KEY });
      qc.invalidateQueries({ queryKey: ['cabinet', 'stats'] });
    },
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function useDeleteDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draftId: string) => {
      const res = await fetch(`/api/planner/drafts?id=${encodeURIComponent(draftId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to delete draft');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_DRAFTS_KEY });
      qc.invalidateQueries({ queryKey: ['cabinet', 'stats'] });
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}

