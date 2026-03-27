/**
 * KPI helper functions — pure computations extracted from kpi.service.ts.
 */

import { countNaiveWorkingDays } from '@/lib/ops/working-days';
import type { KPIResponse } from '@/components/dashboard/kpi/types';
import type { PlanRow, QuarterlyRow, ProcedureRef, ProcessRef, UserRef } from './types';

export const KPI_NORM = 70;
const HOURS_PER_DAY = 8;

export function calcKPI(actual: number, planned: number): number {
  return planned > 0 ? Math.round((actual / planned) * 1000) / 10 : 0;
}

function getWorkingDaysInMonth(
  year: number,
  month: number,
  customHoursMap: Map<number, number>,
  upToDay?: number,
): number {
  const customHours = customHoursMap.get(month);
  const customDays = customHours != null ? customHours / HOURS_PER_DAY : null;
  if (customDays != null && upToDay == null) return customDays;
  if (customDays != null && upToDay != null) {
    const daysInMonth = new Date(year, month, 0).getDate();
    return Math.round(customDays * upToDay / daysInMonth);
  }
  return countNaiveWorkingDays(year, month, upToDay);
}

export function getAvailableHours(year: number, months: number[], customHoursMap: Map<number, number>): number {
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const today = now.getDate();
  let totalWorkingDays = 0;
  for (const m of months) {
    if (isCurrentYear && m === curMonth) {
      totalWorkingDays += getWorkingDaysInMonth(year, m, customHoursMap, today);
    } else {
      totalWorkingDays += getWorkingDaysInMonth(year, m, customHoursMap);
    }
  }
  return totalWorkingDays * HOURS_PER_DAY;
}

export function getMonthsForPeriod(periodType: string, periodValue?: number): number[] {
  if (periodType === 'month' && periodValue) return [periodValue];
  if (periodType === 'quarter' && periodValue) {
    const start = (periodValue - 1) * 3 + 1;
    return [start, start + 1, start + 2];
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

export function getQuarterForMonth(month: number): number {
  return Math.ceil(month / 3);
}

export function getQuarterMonths(quarter: number): number[] {
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

export function getPlanDeptId(
  plan: PlanRow,
  qpMap: Map<string, QuarterlyRow>,
  procedureMap: Map<string, ProcedureRef>,
  processMap: Map<string, ProcessRef>,
): string | null {
  if (plan.quarterly_id) {
    const qp = qpMap.get(plan.quarterly_id);
    if (qp?.department_id) return qp.department_id;
  }
  if (plan.procedure_id) {
    const m = procedureMap.get(plan.procedure_id);
    if (m?.process_id) {
      const p = processMap.get(m.process_id);
      if (p?.department_id) return p.department_id;
    }
  }
  return null;
}

export function getPlanProcessId(
  plan: PlanRow,
  qpMap: Map<string, QuarterlyRow>,
  procedureMap: Map<string, ProcedureRef>,
): string | null {
  if (plan.quarterly_id) {
    const qp = qpMap.get(plan.quarterly_id);
    if (qp?.process_id) return qp.process_id;
  }
  if (plan.procedure_id) {
    const m = procedureMap.get(plan.procedure_id);
    if (m?.process_id) return m.process_id;
  }
  return null;
}

export interface EmployeeNormContext {
  userTimesheets: Map<string, Map<number, number>>;
  userMap: Map<string, UserRef>;
  year: number;
  currentYear: number;
  currentMonth: number;
  todayDate: number;
  customHoursMap: Map<number, number>;
  employeeNormHours: number;
}

export function getEmployeeNormForPeriod(
  uid: string,
  periodMonths: number[],
  ctx: EmployeeNormContext,
): number {
  const { userTimesheets, userMap, year, currentYear, currentMonth, todayDate, customHoursMap, employeeNormHours } = ctx;
  const um = userTimesheets.get(uid);
  const userRate = userMap.get(uid)?.work_rate ?? 1.0;
  if (!um || um.size === 0) return Math.round(employeeNormHours * userRate * 10) / 10;

  let total = 0;
  for (const m of periodMonths) {
    const tsH = um.get(m);
    if (tsH != null) {
      if (year === currentYear && m === currentMonth) {
        const dim = new Date(year, m, 0).getDate();
        total += Math.round(tsH * todayDate / dim);
      } else {
        total += tsH;
      }
    } else {
      if (year === currentYear && m === currentMonth) {
        total += countNaiveWorkingDays(year, m, todayDate) * HOURS_PER_DAY * userRate;
      } else {
        total += getWorkingDaysInMonth(year, m, customHoursMap) * HOURS_PER_DAY * userRate;
      }
    }
  }
  return Math.round(Math.max(0, total) * KPI_NORM / 100 * 10) / 10;
}

export function emptyResult(
  year: number,
  periodType: string,
  periodValue: number | undefined,
  role: string,
): KPIResponse {
  return {
    period: { year, type: periodType as KPIResponse['period']['type'], value: periodValue },
    role: role as KPIResponse['role'],
    norm: KPI_NORM,
    overall: { planned: 0, actual: 0, kpi: 0 },
    byProcess: [],
  };
}
