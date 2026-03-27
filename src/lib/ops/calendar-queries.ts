import { queryOptions } from '@tanstack/react-query';
import type { MonthlyWorkingDays, EmployeeTimesheet } from '@/types/calendar';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/** Рабочие часы за год. Заполняется редко — staleTime: Infinity. */
export const workingDaysQueryOptions = (year: number) =>
  queryOptions({
    queryKey: ['working-days', year] as const,
    queryFn: () => fetchJson<MonthlyWorkingDays[]>(`/api/calendar/working-days?year=${year}`),
    staleTime: Infinity,
  });

/** Табели сотрудников за месяц. */
export const timesheetQueryOptions = (year: number, month: number) =>
  queryOptions({
    queryKey: ['timesheet', year, month] as const,
    queryFn: () => fetchJson<EmployeeTimesheet[]>(`/api/calendar/timesheet?year=${year}&month=${month}`),
    staleTime: 5 * 60_000,
    enabled: month > 0,
  });
