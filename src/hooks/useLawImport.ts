'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface ImportItem {
  url?: string;
  title: string;
  docType: string;
  docNumber: string;
  /** Markdown content for file-based import (no URL fetch). */
  fileContent?: string;
  fileName?: string;
}

export interface ImportProgress {
  total: number;
  done: number;
  current: string;
  results: { url?: string; title: string; documentId?: string; error?: string }[];
}

/** Hook for importing law documents into KB. */
export function useLawImport() {
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importDocuments = useCallback(async (
    items: ImportItem[],
    categoryId: string,
    parentDocId?: string,
  ) => {
    setImporting(true);
    setError(null);
    const prog: ImportProgress = { total: items.length, done: 0, current: '', results: [] };
    setProgress({ ...prog });

    try {
      // First item = parent law, rest = related acts (get parentDocId from first)
      let resolvedParentId = parentDocId;

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        prog.current = item.title;
        setProgress({ ...prog });

        try {
          const res = await fetch('/api/kb/laws/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: item.url || undefined,
              title: item.title,
              docType: item.docType,
              docNumber: item.docNumber,
              categoryId,
              parentDocId: idx === 0 && !parentDocId ? undefined : resolvedParentId,
              fileContent: item.fileContent,
              fileName: item.fileName,
            }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const msg = (err as { error?: string }).error || `Import failed: ${res.status}`;
            prog.results.push({ url: item.url, title: item.title, error: msg });
          } else {
            const data = (await res.json()) as { documentId: string; title: string };
            prog.results.push({ url: item.url, title: data.title, documentId: data.documentId });
            // First successful import = parent for the rest
            if (idx === 0 && !resolvedParentId) {
              resolvedParentId = data.documentId;
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Import failed';
          prog.results.push({ url: item.url || '', title: item.title, error: msg });
        }

        prog.done++;
        setProgress({ ...prog });
      }

      // Refresh law library after import
      queryClient.invalidateQueries({ queryKey: ['kb-laws'] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Import failed';
      setError(msg);
    } finally {
      setImporting(false);
    }
  }, [queryClient]);

  const reset = useCallback(() => {
    setProgress(null);
    setError(null);
  }, []);

  return { importing, progress, error, importDocuments, reset };
}
