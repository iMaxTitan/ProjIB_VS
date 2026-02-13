'use client';

import { useQuery } from '@tanstack/react-query';
import { processesQueryOptions } from '@/lib/queries/reference-queries';
import { Process } from '@/types/planning';

interface UseProcessesOptions {
  userId?: string;
  all?: boolean;
}

export function useProcesses(_options: UseProcessesOptions = {}): {
  processes: Process[];
  loading: boolean;
  error: string | null;
} {
  const { data: processes = [], isLoading: loading, error: queryError } = useQuery(processesQueryOptions);
  const error = queryError ? (queryError instanceof Error ? queryError.message : String(queryError)) : null;

  return { processes, loading, error };
}
