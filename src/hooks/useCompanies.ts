'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { companiesQueryOptions } from '@/lib/queries/reference-queries';
import type { Company } from '@/types/infrastructure';

export interface UseCompaniesResult {
  companies: Company[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCompanies(): UseCompaniesResult {
  const queryClient = useQueryClient();
  const { data: companies = [], isLoading: loading, error: queryError } = useQuery(companiesQueryOptions);
  const error = queryError ? (queryError instanceof Error ? queryError.message : String(queryError)) : null;

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['companies'] });
  }, [queryClient]);

  return { companies, loading, error, refresh };
}
