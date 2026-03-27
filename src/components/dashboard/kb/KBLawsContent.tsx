'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserInfo } from '@/types/azure';
import { useLawImport, type ImportItem } from '@/hooks/useLawImport';
import LawSearchPanel from './LawSearchPanel';
import LawLibraryTable from './LawLibraryTable';
import LawImportProgress from './LawImportProgress';

interface Props {
  user: UserInfo;
  tabsSlot?: React.ReactNode;
}

/** Fetch KB categories and find the "Законодавство" / legal category. */
async function fetchLawsCategoryId(): Promise<string | null> {
  const res = await fetch('/api/kb/categories');
  if (!res.ok) return null;
  const data = (await res.json()) as { id: string; name: string; slug?: string }[];
  const cat = data.find(
    c => c.slug === 'legal' || c.name === 'Законодавство' || c.name === 'Юридичний',
  );
  return cat?.id ?? null;
}

export default function KBLawsContent({ user, tabsSlot }: Props) {
  const { importing, progress, importDocuments, reset } = useLawImport();

  const { data: categoryId } = useQuery({
    queryKey: ['kb-laws-category'],
    queryFn: fetchLawsCategoryId,
    staleTime: Infinity,
  });

  const canImport = user.role === 'chief' || user.role === 'head';

  const handleImport = (items: ImportItem[]) => {
    if (!categoryId) return;
    importDocuments(items, categoryId);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0">{tabsSlot}</div>
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Search panel */}
          <LawSearchPanel onImport={handleImport} importing={importing || !categoryId} canImport={canImport} />

          {/* Import progress */}
          {progress && <LawImportProgress progress={progress} onClose={reset} />}

          {/* Library table */}
          <LawLibraryTable />
        </div>
      </div>
    </div>
  );
}
