/**
 * Calendar sync hooks -- pull events from Outlook, push plan entries to Outlook.
 * Uses /api/planner/sync endpoints.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PLANNER_ENTRIES_KEY } from './usePlanner';

// ─── Pull from Outlook ──────────────────────────────────────────────────────

export function usePullCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { weekStart: string; weekEnd: string }) => {
      const res = await fetch('/api/planner/sync/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Помилка синхронізації');
      }
      return res.json() as Promise<{ created: number; updated: number; deleted: number; errors: string[] }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}

// ─── Push to Outlook ─────────────────────────────────────────────────────────

export function usePushCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weekStart: string) => {
      const res = await fetch('/api/planner/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Помилка синхронізації');
      }
      return res.json() as Promise<{ synced: number; failed: number; errors: string[] }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANNER_ENTRIES_KEY });
    },
  });
}
