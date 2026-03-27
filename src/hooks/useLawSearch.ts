'use client';

import { useState, useCallback } from 'react';

export interface LawSearchResult {
  title: string;
  url: string;
  docId: string;
}

export interface LawRelatedResult {
  title: string;
  url: string;
  docType: string;
}

/** Hook for searching laws on zakon.rada.gov.ua and getting related documents. */
export function useLawSearch() {
  const [results, setResults] = useState<LawSearchResult[]>([]);
  const [related, setRelated] = useState<LawRelatedResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    setError(null);
    setResults([]);
    setRelated([]);
    setSearching(true);
    try {
      const res = await fetch('/api/kb/laws/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Search failed');
      }
      const data = (await res.json()) as { results: LawSearchResult[] };
      setResults(data.results);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Search failed';
      setError(msg);
    } finally {
      setSearching(false);
    }
  }, []);

  const fetchRelated = useCallback(async (url: string) => {
    setError(null);
    setRelated([]);
    setLoadingRelated(true);
    try {
      const res = await fetch('/api/kb/laws/related', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Failed to load related docs');
      }
      const data = (await res.json()) as { results: LawRelatedResult[] };
      setRelated(data.results);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load related';
      setError(msg);
    } finally {
      setLoadingRelated(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResults([]);
    setRelated([]);
    setError(null);
  }, []);

  return { results, related, searching, loadingRelated, error, search, fetchRelated, clear };
}
