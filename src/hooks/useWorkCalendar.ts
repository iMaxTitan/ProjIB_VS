'use client';

import { useCallback, useMemo } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { workingDaysQueryOptions, timesheetQueryOptions } from '@/lib/ops/calendar-queries';
import { countNaiveWorkingDays, calcWorkHours } from '@/lib/ops/working-days';
import type {
  MonthlyWorkingDays,
  EmployeeTimesheet,
  SetWorkingDaysParams,
  TimesheetCode,
} from '@/types/calendar';

interface UseWorkCalendarReturn {
  workingDaysList: MonthlyWorkingDays[];
  timesheets: EmployeeTimesheet[];
  loadingDays: boolean;
  loadingTimesheets: boolean;
  error: string | null;

  /** Получить work_hours за месяц (из таблицы или fallback Пн-Пт × 8) */
  getMonthWorkHours: (month: number) => number;
  /** Получить рабочие дни за месяц (work_hours / 8) */
  getWorkingDays: (month: number) => number;

  /** Создать месяц с шаблоном (chief only). Автоматически добавляет всех active. */
  createMonth: (params: SetWorkingDaysParams) => Promise<boolean>;
  /** Удалить месяц + все timesheets (chief only) */
  deleteMonth: (year: number, month: number) => Promise<boolean>;
  /** Добавить конкретных сотрудников в месяц (догрузка) */
  addEmployees: (year: number, month: number, userIds: string[]) => Promise<boolean>;
  /** Обновить шаблон месяца + прокинуть в табели (где день совпадает со старым шаблоном) */
  updateTemplate: (year: number, month: number, dayTypes: TimesheetCode[]) => Promise<boolean>;
  /** Обновить массив дней сотрудника */
  updateTimesheet: (year: number, month: number, userId: string, days: TimesheetCode[]) => Promise<boolean>;
  /** Удалить сотрудника из месяца */
  removeEmployee: (year: number, month: number, userId: string) => Promise<boolean>;
}

export function useWorkCalendar(year: number, month?: number): UseWorkCalendarReturn {
  const queryClient = useQueryClient();

  const {
    data: workingDaysList = [],
    isLoading: loadingDays,
    error: daysError,
  } = useQuery(workingDaysQueryOptions(year));

  const {
    data: timesheets = [],
    isLoading: loadingTimesheets,
    error: tsError,
  } = useQuery(timesheetQueryOptions(year, month ?? 0));

  const error = daysError
    ? (daysError instanceof Error ? daysError.message : String(daysError))
    : tsError
      ? (tsError instanceof Error ? tsError.message : String(tsError))
      : null;

  const getMonthWorkHours = useCallback(
    (m: number): number => {
      const record = workingDaysList.find((d) => d.month === m);
      return record ? record.work_hours : countNaiveWorkingDays(year, m) * 8;
    },
    [workingDaysList, year],
  );

  const getWorkingDays = useCallback(
    (m: number): number => Math.round(getMonthWorkHours(m) / 8),
    [getMonthWorkHours],
  );

  const createMonth = useCallback(
    async (params: SetWorkingDaysParams): Promise<boolean> => {
      try {
        const res = await fetch('/api/calendar/working-days', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(params),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const saved: MonthlyWorkingDays = await res.json();
        // Обновляем кэш working-days
        queryClient.setQueryData<MonthlyWorkingDays[]>(
          ['working-days', params.year],
          (prev) => {
            if (!prev) return [saved];
            const idx = prev.findIndex((d) => d.month === params.month);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = saved;
              return updated;
            }
            return [...prev, saved].sort((a, b) => a.month - b.month);
          },
        );
        // Инвалидируем timesheets (они были созданы автоматически)
        await queryClient.invalidateQueries({ queryKey: ['timesheet', params.year, params.month] });
        return true;
      } catch {
        return false;
      }
    },
    [queryClient],
  );

  const deleteMonth = useCallback(
    async (y: number, m: number): Promise<boolean> => {
      try {
        const res = await fetch(`/api/calendar/working-days?year=${y}&month=${m}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        // Удаляем из кэша
        queryClient.setQueryData<MonthlyWorkingDays[]>(
          ['working-days', y],
          (prev) => prev?.filter((d) => d.month !== m) ?? [],
        );
        queryClient.removeQueries({ queryKey: ['timesheet', y, m] });
        return true;
      } catch {
        return false;
      }
    },
    [queryClient],
  );

  const addEmployees = useCallback(
    async (y: number, m: number, userIds: string[]): Promise<boolean> => {
      try {
        const res = await fetch('/api/calendar/timesheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ year: y, month: m, userIds }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        await queryClient.invalidateQueries({ queryKey: ['timesheet', y, m] });
        return true;
      } catch {
        return false;
      }
    },
    [queryClient],
  );

  const updateTemplate = useCallback(
    async (y: number, m: number, dayTypes: TimesheetCode[]): Promise<boolean> => {
      try {
        const res = await fetch('/api/calendar/working-days', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ year: y, month: m, dayTypes }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const saved: MonthlyWorkingDays = await res.json();
        // Обновляем кэш working-days
        queryClient.setQueryData<MonthlyWorkingDays[]>(
          ['working-days', y],
          (prev) =>
            prev?.map((d) => (d.month === m ? saved : d)) ?? [saved],
        );
        // Инвалидируем timesheets (сервер прокинул изменения)
        await queryClient.invalidateQueries({ queryKey: ['timesheet', y, m] });
        return true;
      } catch {
        return false;
      }
    },
    [queryClient],
  );

  const updateTimesheet = useCallback(
    async (y: number, m: number, userId: string, days: TimesheetCode[]): Promise<boolean> => {
      try {
        // Оптимистичное обновление (учитываем ставку сотрудника из снапшота)
        queryClient.setQueryData<EmployeeTimesheet[]>(
          ['timesheet', y, m],
          (prev) => {
            const ts = prev?.find((t) => t.user_id === userId);
            const rate = ts?.work_rate ?? 1.0;
            const newWorkHours = calcWorkHours(days, rate);
            return prev?.map((t) =>
              t.user_id === userId ? { ...t, days, work_hours: newWorkHours } : t,
            ) ?? [];
          },
        );

        const res = await fetch('/api/calendar/timesheet', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ year: y, month: m, userId, days }),
        });
        if (!res.ok) {
          // Откат при ошибке
          await queryClient.invalidateQueries({ queryKey: ['timesheet', y, m] });
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        return true;
      } catch {
        return false;
      }
    },
    [queryClient],
  );

  const removeEmployee = useCallback(
    async (y: number, m: number, userId: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/calendar/timesheet?year=${y}&month=${m}&userId=${userId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        // Удаляем из кэша
        queryClient.setQueryData<EmployeeTimesheet[]>(
          ['timesheet', y, m],
          (prev) => prev?.filter((ts) => ts.user_id !== userId) ?? [],
        );
        return true;
      } catch {
        return false;
      }
    },
    [queryClient],
  );

  return {
    workingDaysList,
    timesheets,
    loadingDays,
    loadingTimesheets,
    error,
    getMonthWorkHours,
    getWorkingDays,
    createMonth,
    deleteMonth,
    addEmployees,
    updateTemplate,
    updateTimesheet,
    removeEmployee,
  };
}

/** Thin hook — fetch working days for multiple years */
export function useWorkCalendarYears(years: number[]): { data: MonthlyWorkingDays[]; isLoading: boolean } {
  const queries = useQueries({ queries: years.map((y) => workingDaysQueryOptions(y)) });
  const data = useMemo(() => queries.flatMap((q) => q.data ?? []), [queries]);
  const isLoading = queries.some((q) => q.isLoading);
  return { data, isLoading };
}
