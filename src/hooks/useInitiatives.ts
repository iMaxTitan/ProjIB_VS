'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Initiative {
  id: string;
  title: string;
  description: string | null;
  source: string;
  is_active: boolean;
  department_id: string | null;
  process_id: string | null;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = ['initiatives'] as const;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
  return res.json();
}

export function useInitiatives() {
  return useQuery<Initiative[]>({
    queryKey: QUERY_KEY,
    queryFn: () => fetchJson('/api/db/initiatives?select=id,title,description,source,is_active,department_id,process_id,created_at,updated_at&order=title'),
    staleTime: Infinity,
  });
}

export function useInitiativeMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const create = useMutation({
    mutationFn: (params: { title: string; description?: string; department_id?: string | null; process_id?: string | null }) =>
      fetchJson('/api/db/initiatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ title: params.title, description: params.description || null, department_id: params.department_id || null, process_id: params.process_id || null, source: 'planned' }),
      }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: (params: { id: string; title?: string; description?: string | null; is_active?: boolean; department_id?: string | null; process_id?: string | null }) => {
      const { id, ...fields } = params;
      return fetchJson(`/api/db/initiatives?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
      });
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/db/initiatives?id=eq.${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
