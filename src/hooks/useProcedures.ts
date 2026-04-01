'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { proceduresQueryOptions, type ProcedureKpiRow } from '@/lib/ops/reference-queries';
import { manageProcedure } from '@/lib/ops/reference-commands';

export function useProcedures(): { procedures: ProcedureKpiRow[]; loading: boolean; error: string | null } {
  const { data: procedures = [], isLoading: loading, error: queryError } = useQuery(proceduresQueryOptions);
  const error = queryError ? (queryError instanceof Error ? queryError.message : String(queryError)) : null;
  return { procedures, loading, error };
}

interface ProcedureSaveParams {
  procedure_id?: string | null;
  name: string;
  description: string | null;
  service_name: string | null;
  process_id: string | null;
  category: string;
  target_value: number;
  target_period: string;
}

export function useProcedureOps(userId: string) {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<string | null>(null);

  const saveProcedure = useCallback(async (action: 'create' | 'update', params: ProcedureSaveParams) => {
    setMutationError(null);
    try {
      await manageProcedure(action, userId, params);
      await queryClient.invalidateQueries({ queryKey: ['procedures'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMutationError('Ошибка сохранения: ' + msg);
      throw err;
    }
  }, [userId, queryClient]);

  const deleteProcedure = useCallback(async (procedureId: string) => {
    try {
      await manageProcedure('delete', userId, { procedure_id: procedureId });
      queryClient.setQueryData<ProcedureKpiRow[]>(['procedures'], prev => prev ? prev.filter(m => m.entity_id !== procedureId) : []);
    } catch (err: unknown) {
      setMutationError(err instanceof Error ? err.message : String(err));
    }
  }, [userId, queryClient]);

  return { mutationError, saveProcedure, deleteProcedure };
}
