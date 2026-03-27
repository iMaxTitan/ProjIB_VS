'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';

export interface LawMetadata {
  doc_type?: string;
  doc_number?: string;
  source_url?: string;
  related_docs?: string[];
  parent_doc_id?: string | null;
  fetched_at?: string;
  processing_stage?: string;
}

export interface LawDoc {
  id: string;
  title: string;
  status: string;
  chunk_count: number;
  created_at: string;
  metadata: LawMetadata;
  children: LawDoc[];
}

/** Fetch update status for a single document. */
export type UpdateStatus = 'current' | 'outdated' | 'unknown' | 'checking' | 'error';

async function fetchLaws(): Promise<LawDoc[]> {
  const res = await fetch('/api/kb/laws');
  if (!res.ok) throw new Error('Failed to fetch laws');
  const data = (await res.json()) as { laws: LawDoc[] };
  return data.laws;
}

/** Hook for the law library table — fetches all laws from KB with tree structure. */
export function useLawLibrary() {
  const queryClient = useQueryClient();
  const { data: laws = [], isLoading, error: queryError } = useQuery({
    queryKey: ['kb-laws'],
    queryFn: fetchLaws,
    staleTime: 60_000,
    // Auto-refetch every 3s while any doc is processing
    refetchInterval: (query) => {
      const data = query.state.data as LawDoc[] | undefined;
      const hasProcessing = data?.some(d => d.status === 'processing' || d.children?.some(c => c.status === 'processing'));
      return hasProcessing ? 3_000 : false;
    },
  });

  const [updateStatuses, setUpdateStatuses] = useState<Record<string, UpdateStatus>>({});

  const checkUpdate = useCallback(async (docId: string, sourceUrl: string, fetchedAt: string) => {
    setUpdateStatuses(prev => ({ ...prev, [docId]: 'checking' }));
    try {
      const res = await fetch('/api/kb/laws/check-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sourceUrl }),
      });
      if (!res.ok) throw new Error('Check failed');
      const data = (await res.json()) as { lastRevisionDate: string | null };

      if (!data.lastRevisionDate) {
        setUpdateStatuses(prev => ({ ...prev, [docId]: 'unknown' }));
        return;
      }

      // Compare: if last revision > fetched_at, document is outdated
      const revDate = new Date(data.lastRevisionDate);
      const fetchDate = new Date(fetchedAt);
      const status: UpdateStatus = revDate > fetchDate ? 'outdated' : 'current';
      setUpdateStatuses(prev => ({ ...prev, [docId]: status }));
    } catch {
      setUpdateStatuses(prev => ({ ...prev, [docId]: 'error' }));
    }
  }, []);

  const checkAllUpdates = useCallback(async () => {
    const allDocs = laws
      .flatMap(law => [law, ...law.children])
      .filter(doc => doc.metadata?.source_url && doc.metadata?.fetched_at);

    // Simple semaphore for max 3 concurrent requests
    const queue = [...allDocs];
    const results: Promise<void>[] = [];

    function next(): Promise<void> {
      const doc = queue.shift();
      if (!doc) return Promise.resolve();
      return checkUpdate(doc.id, doc.metadata!.source_url!, doc.metadata!.fetched_at!)
        .then(() => next());
    }

    // Start up to 3 workers
    const concurrency = Math.min(3, queue.length);
    for (let i = 0; i < concurrency; i++) {
      results.push(next());
    }
    await Promise.allSettled(results);
  }, [laws, checkUpdate]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['kb-laws'] });
  }, [queryClient]);

  const error = queryError ? (queryError instanceof Error ? queryError.message : String(queryError)) : null;

  return { laws, isLoading, error, updateStatuses, checkUpdate, checkAllUpdates, refresh };
}
