'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/shared/utils';
import { TIMESHEET_CODES, MINI_CALENDAR_COLORS, type TimesheetCode } from '@/types/calendar';

const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

interface MiniCalendarGridProps {
  year: number;
  month: number;
  /** Array of codes, length = days in month */
  days: TimesheetCode[];
  /** Called when a day cell is clicked */
  onDayClick?: (dayIndex: number, currentCode: TimesheetCode) => void;
  /** Hint text above the grid */
  hint?: string;
  /** Extra class on the wrapper */
  className?: string;
}

/**
 * Shared mini-calendar grid — 7-column week layout.
 * Used in AddMonthModal (toggle holidays) and employee timesheet editing.
 */
export function MiniCalendarGrid({
  year,
  month,
  days,
  onDayClick,
  hint,
  className,
}: MiniCalendarGridProps) {
  const calendarWeeks = useMemo(() => {
    if (!month || days.length === 0) return [];
    const firstDay = new Date(year, month - 1, 1).getDay();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Mon=0
    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = Array(startOffset).fill(null);

    for (let d = 0; d < days.length; d++) {
      week.push(d);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }, [month, days, year]);

  if (days.length === 0) return null;

  return (
    <div className={className}>
      {hint && (
        <p className="text-sm text-slate-500 mb-2">{hint}</p>
      )}
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="font-semibold text-slate-500 py-1">{d}</div>
        ))}
        {calendarWeeks.flat().map((dayIdx, i) => {
          if (dayIdx == null) return <div key={`empty-${i}`} />;
          const code = days[dayIdx];
          const meta = TIMESHEET_CODES[code];
          const miniColor = MINI_CALENDAR_COLORS[code];
          const clickable = !!onDayClick && code !== 'В';
          return (
            <button
              key={dayIdx}
              type="button"
              onClick={() => clickable && onDayClick(dayIdx, code)}
              disabled={!clickable}
              aria-label={`${dayIdx + 1} ${meta.label}`}
              className={cn(
                'rounded-md py-1.5 text-xs font-medium transition-colors duration-150',
                miniColor,
                clickable && 'cursor-pointer hover:ring-1 hover:ring-indigo-300',
                !clickable && 'cursor-default',
              )}
            >
              {dayIdx + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
