import { useQuery } from '@tanstack/react-query';
import type { MeetingInfo } from '@/lib/ops/graph/meetings';

interface UseMeetingsResult {
  meetings: MeetingInfo[];
  noTeams: boolean;
  isLoading: boolean;
  error: Error | null;
}

export function useMeetings(startDate: string, endDate: string, all = false): UseMeetingsResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['meetings-list', startDate, endDate, all],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (all) params.set('all', 'true');
      const res = await fetch(`/api/meetings?${params}`);
      if (!res.ok) throw new Error('Помилка завантаження');
      return res.json() as Promise<{ meetings: MeetingInfo[]; noTeams?: boolean }>;
    },
    staleTime: 2 * 60_000,
  });

  return {
    meetings: data?.meetings ?? [],
    noTeams: data?.noTeams ?? false,
    isLoading,
    error: error as Error | null,
  };
}
