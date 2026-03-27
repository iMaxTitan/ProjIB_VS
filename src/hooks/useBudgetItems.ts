'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

// ── Types ───────────────────────────────────────────────

export interface BudgetCategory {
  id: string;
  name: string;
  sort_order: number;
}

export interface BudgetItem {
  id: string;
  name: string;
  category_id: string;
  process_id: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  budget_categories: { name: string } | null;
  processes: { process_name: string } | null;
}

// ── Query keys ──────────────────────────────────────────

const ITEMS_KEY: QueryKey = ['budget-items'];
const CATEGORIES_KEY: QueryKey = ['budget-categories'];

// ── Fetch helpers ───────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Hook ────────────────────────────────────────────────

export function useBudgetItems() {
  const qc = useQueryClient();

  const { data: items = [], isLoading, error: queryError } = useQuery({
    queryKey: ITEMS_KEY,
    queryFn: () => fetchJson<BudgetItem[]>('/api/budget/items'),
    staleTime: 2 * 60_000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => fetchJson<BudgetCategory[]>('/api/budget/categories'),
    staleTime: Infinity,
  });

  const createItem = useCallback(async (params: {
    name: string; category_id: string; process_id: string; description?: string;
  }) => {
    const created = await fetchJson<BudgetItem>('/api/budget/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    await qc.invalidateQueries({ queryKey: ITEMS_KEY });
    return created;
  }, [qc]);

  const updateItem = useCallback(async (params: {
    id: string; name?: string; category_id?: string; process_id?: string;
    description?: string; is_active?: boolean;
  }) => {
    const updated = await fetchJson<BudgetItem>('/api/budget/items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    await qc.invalidateQueries({ queryKey: ITEMS_KEY });
    return updated;
  }, [qc]);

  const error = queryError ? (queryError instanceof Error ? queryError.message : String(queryError)) : null;

  return { items, categories, isLoading, error, createItem, updateItem };
}
