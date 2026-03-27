'use client';

import { useQuery } from '@tanstack/react-query';
import type { PivotResponse, PivotGroupBy, PivotTimeGrain, PivotMetric, PivotPeriodType, PivotFilters } from '@/types/pivot';

export interface UsePivotReportParams {
  year: number;
  periodType: PivotPeriodType;
  periodValue?: number;
  groupBy: PivotGroupBy[];
  timeGrain: PivotTimeGrain;
  metric: PivotMetric;
  filters?: PivotFilters;
}

async function fetchPivot(params: UsePivotReportParams): Promise<PivotResponse> {
  const qs = new URLSearchParams({
    year: String(params.year),
    periodType: params.periodType,
    groupBy: params.groupBy.join(','),
    timeGrain: params.timeGrain,
    metric: params.metric,
  });
  if (params.periodValue !== undefined) {
    qs.set('periodValue', String(params.periodValue));
  }
  if (params.filters && Object.keys(params.filters).length > 0) {
    qs.set('filters', JSON.stringify(params.filters));
  }

  const res = await fetch(`/api/reports/pivot?${qs.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function stableFilterKey(f?: PivotFilters): string {
  if (!f) return '';
  const keys = Object.keys(f).sort() as (keyof PivotFilters)[];
  return keys.map(k => `${k}:${(f[k] || []).join(',')}`).join('|');
}

export function usePivotReport(params: UsePivotReportParams) {
  return useQuery<PivotResponse>({
    queryKey: [
      'pivot-report',
      params.year,
      params.periodType,
      params.periodValue ?? '',
      [...params.groupBy].sort().join(','),
      params.timeGrain,
      params.metric,
      stableFilterKey(params.filters),
    ],
    queryFn: () => fetchPivot(params),
    staleTime: 5 * 60 * 1000, // 5 min (reports change infrequently)
    refetchOnMount: true,
  });
}
