'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { proceduresQueryOptions, type ProcedureKpiRow } from '@/lib/ops/reference-queries';
import { supabase } from '@/lib/shared/db-client';
import logger from '@/lib/shared/logger';

/** Thin hook — wraps proceduresQueryOptions from lib/ops */
export function useProcedures(): {
  procedures: ProcedureKpiRow[];
  loading: boolean;
  error: string | null;
} {
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

/** Hook for CRUD operations on procedures via manage_procedure RPC */
export function useProcedureOps(userId: string) {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<string | null>(null);

  const saveProcedure = useCallback(async (action: 'create' | 'update', params: ProcedureSaveParams) => {
    setMutationError(null);
    try {
      const { data, error } = await supabase.rpc('manage_procedure', {
        p_action: action,
        p_procedure_id: params.procedure_id ?? null,
        p_name: params.name,
        p_description: params.description,
        p_service_name: params.service_name,
        p_process_id: params.process_id,
        p_category: params.category,
        p_target_value: params.target_value,
        p_target_period: params.target_period,
        p_user_id: userId,
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Ошибка сохранения');
      await queryClient.invalidateQueries({ queryKey: ['procedures'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMutationError('Ошибка сохранения: ' + msg);
      throw err;
    }
  }, [userId, queryClient]);

  const deleteProcedure = useCallback(async (procedureId: string) => {
    try {
      const { data, error } = await supabase.rpc('manage_procedure', {
        p_action: 'delete',
        p_procedure_id: procedureId,
        p_user_id: userId,
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Ошибка удаления');
      queryClient.setQueryData<ProcedureKpiRow[]>(
        ['procedures'],
        (prev) => prev ? prev.filter(m => m.entity_id !== procedureId) : [],
      );
    } catch (err: unknown) {
      logger.error('Ошибка удаления:', err);
    }
  }, [userId, queryClient]);

  return { mutationError, saveProcedure, deleteProcedure };
}
