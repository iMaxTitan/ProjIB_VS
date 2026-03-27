import { useQuery } from '@tanstack/react-query';
import type { CabinetStats } from '@/lib/ops/cabinet/stats';

async function fetchCabinetStats(): Promise<CabinetStats> {
  const res = await fetch('/api/cabinet/stats');
  if (!res.ok) throw new Error(`Cabinet stats: ${res.status}`);
  return res.json();
}

export function useCabinetStats() {
  return useQuery({
    queryKey: ['cabinet', 'stats'],
    queryFn: fetchCabinetStats,
    staleTime: 60_000,
  });
}
