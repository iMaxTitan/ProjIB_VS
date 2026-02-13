'use client';

import { useState, useEffect, useCallback } from 'react';
import type { KPIResponse, KPIPeriodType } from '@/components/dashboard/content/kpi/types';

interface UseKPIReturn {
  data: KPIResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useKPI(
  year: number,
  periodType: KPIPeriodType,
  periodValue?: number,
): UseKPIReturn {
  const [data, setData] = useState<KPIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ year: String(year), periodType });
    if (periodValue !== undefined) {
      params.set('periodValue', String(periodValue));
    }

    fetch(`/api/kpi?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((json: KPIResponse) => {
        if (!controller.signal.aborted) setData(json);
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        if (!controller.signal.aborted) setError(err.message || 'Помилка завантаження KPI');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [year, periodType, periodValue, refreshKey]);

  return { data, loading, error, refresh };
}
