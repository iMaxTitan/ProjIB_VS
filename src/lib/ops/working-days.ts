/**
 * Утилиты для расчёта рабочих дней и табеля.
 */

import type { TimesheetCode } from '@/types/calendar';

/** Наивный подсчёт рабочих дней (Пн-Пт) в месяце. upToDay — считать только до N-го числа включительно. */
export function countNaiveWorkingDays(year: number, month: number, upToDay?: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  const maxDay = upToDay != null ? Math.min(upToDay, daysInMonth) : daysInMonth;
  let count = 0;
  for (let d = 1; d <= maxDay; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/** Сгенерировать шаблон месяца: 8 на Пн-Пт, В на Сб-Вс */
export function generateMonthTemplate(year: number, month: number): TimesheetCode[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const template: TimesheetCode[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    template.push(dow === 0 || dow === 6 ? 'В' : '8');
  }
  return template;
}

/** Посчитать work_hours из массива дней. rate — ставка сотрудника (0.25..1.0, default 1) */
export function calcWorkHours(days: TimesheetCode[], rate: number = 1): number {
  return Math.round(days.filter(d => d === '8').length * 8 * rate);
}

/** Посчитать рабочие дни из массива */
export function calcWorkingDays(days: TimesheetCode[]): number {
  return days.filter(d => d === '8').length;
}

/** Посчитать итоги по кодам */
export function calcTimesheetSummary(days: TimesheetCode[]): Partial<Record<TimesheetCode, number>> {
  const summary: Partial<Record<TimesheetCode, number>> = {};
  for (const code of days) {
    summary[code] = (summary[code] || 0) + 1;
  }
  return summary;
}
