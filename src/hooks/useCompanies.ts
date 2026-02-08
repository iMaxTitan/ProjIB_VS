'use client';

import { useState, useCallback, useEffect } from 'react';
import { getCompanies } from '@/lib/services/infrastructure.service';
import type { Company } from '@/types/infrastructure';
import { getErrorMessage } from '@/lib/utils/error-message';
import logger from '@/lib/logger';

export interface UseCompaniesResult {
  companies: Company[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCompanies(): UseCompaniesResult {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCompanies();
      setCompanies(data);
    } catch (err: unknown) {
      logger.error('Ошибка загрузки компаний:', err);
      setError(getErrorMessage(err, 'Не удалось загрузить компании'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    companies,
    loading,
    error,
    refresh,
  };
}

