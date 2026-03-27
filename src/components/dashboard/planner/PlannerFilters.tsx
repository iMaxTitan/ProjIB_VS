'use client';

import React, { useMemo, useCallback } from 'react';
import { cn } from '@/lib/shared/utils';
import { getWeekStart, toLocalDateStr } from './planner-helpers';

interface Props {
  weekStart: Date;
  onWeekChange: (newWeekStart: Date) => void;
}

const MONTH_NAMES = ['Січень','Лютий','Березень','Квітень','Травень','Червень',
  'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

const SHORT_MONTHS = ['січ','лют','бер','кві','тра','чер','лип','сер','вер','жов','лис','гру'];

function addWeeks(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n * 7);
  return r;
}

function weekLabel(ws: Date): string {
  const fri = new Date(ws);
  fri.setDate(fri.getDate() + 4);
  const d1 = ws.getDate();
  const d2 = fri.getDate();
  const m1 = SHORT_MONTHS[ws.getMonth()];
  const m2 = SHORT_MONTHS[fri.getMonth()];
  return ws.getMonth() === fri.getMonth()
    ? `${d1} – ${d2} ${m1}`
    : `${d1} ${m1} – ${d2} ${m2}`;
}

export default function PlannerFilters({ weekStart, onWeekChange }: Props) {
  const year = weekStart.getFullYear();
  const month = weekStart.getMonth();

  const years = [year - 1, year, year + 1];

  const months = useMemo(() => {
    const prev = month === 0 ? 11 : month - 1;
    const next = month === 11 ? 0 : month + 1;
    const prevY = prev > month ? year - 1 : year;
    const nextY = next < month ? year + 1 : year;
    return [
      { m: prev, y: prevY },
      { m: month, y: year },
      { m: next, y: nextY },
    ];
  }, [month, year]);

  const weeks = useMemo(() => [
    addWeeks(weekStart, -1),
    weekStart,
    addWeeks(weekStart, 1),
  ], [weekStart]);

  const currentWeekStr = toLocalDateStr(weekStart);

  const onYear = useCallback((y: number) => {
    if (y === year) return;
    const d = new Date(weekStart);
    d.setFullYear(y);
    onWeekChange(getWeekStart(d));
  }, [year, weekStart, onWeekChange]);

  const onMonth = useCallback((m: number, y: number) => {
    if (m === month && y === year) return;
    onWeekChange(getWeekStart(new Date(y, m, 15)));
  }, [month, year, onWeekChange]);

  const onWeek = useCallback((ws: Date) => {
    onWeekChange(ws);
  }, [onWeekChange]);

  return (
    <div className="flex flex-col gap-1 overflow-hidden">
      {/* Row 1: Years + Months */}
      <div className="flex items-center gap-0.5 flex-nowrap overflow-hidden">
        <div className="nav-group min-w-0" style={{ flex: '2' }} data-el="L2 nav-group · year" data-el-cat="nav">
          {years.map(y => (
            <button key={y} onClick={() => onYear(y)}
              className={cn('nav-btn flex-1 min-w-0', y === year && 'active')}
              style={{ padding: '3px 2px' }}>
              {y}
            </button>
          ))}
        </div>
        <div className="nav-group min-w-0" style={{ flex: '3' }} data-el="L2 nav-group · month" data-el-cat="nav">
          {months.map(({ m, y }) => (
            <button key={`${y}-${m}`} onClick={() => onMonth(m, y)}
              className={cn('nav-btn flex-1 min-w-0', m === month && y === year && 'active')}
              style={{ padding: '3px 2px' }}>
              {MONTH_NAMES[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Weeks */}
      <div className="nav-group flex-1 min-w-0" data-el="L2 nav-group · week" data-el-cat="nav">
        {weeks.map(ws => {
          const wsStr = toLocalDateStr(ws);
          return (
            <button key={wsStr} onClick={() => onWeek(ws)}
              className={cn('nav-btn flex-1 min-w-0 whitespace-nowrap', wsStr === currentWeekStr && 'active')}
              style={{ padding: '3px 2px' }}>
              {weekLabel(ws)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
