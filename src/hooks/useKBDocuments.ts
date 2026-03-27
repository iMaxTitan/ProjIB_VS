import { useQuery } from '@tanstack/react-query';

interface KBDocument {
  id: string;
  title: string;
  source_filename: string;
  status: string;
}

async function fetchKBDocuments(categorySlug: string): Promise<KBDocument[]> {
  const res = await fetch(`/api/kb/documents?category=${categorySlug}`, {
    credentials: 'include',
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.documents ?? data ?? []).map((d: KBDocument) => ({
    id: d.id,
    title: d.title,
    source_filename: d.source_filename,
    status: d.status,
  }));
}

export function useKBDocuments(categorySlug: string | undefined) {
  return useQuery({
    queryKey: ['kb-documents', categorySlug],
    queryFn: () => fetchKBDocuments(categorySlug!),
    enabled: !!categorySlug,
    staleTime: 5 * 60_000,
  });
}
