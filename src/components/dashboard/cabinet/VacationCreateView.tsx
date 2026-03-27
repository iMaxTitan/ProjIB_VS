'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/shared/utils';
import { useAbsences, useCreateAbsence } from '@/hooks/useAbsences';
import type { AbsenceType } from '@/lib/ops/cabinet/absences';

const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_SHORT_UK = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];

interface VacationCreateViewProps {
  year: number;
  /** 0-based month index */
  month: number;
  onClose: () => void;
}

export default function VacationCreateView({ year, month, onClose }: VacationCreateViewProps) {
  const { data, isLoading } = useAbsences(year);
  const quota = data?.quota ?? { used14d: 0, used10d: 0, used5d: 0, totalDays: 0 };
  const canSelect14d = quota.used14d < 1;
  // 10d and 5d are mutually exclusive: either 1×10d or 2×5d
  const canSelect10d = quota.used10d < 1 && quota.used5d === 0;
  const canSelect5d = quota.used5d < 2 && quota.used10d === 0;

  const defaultType: AbsenceType = canSelect14d ? '14d' : canSelect10d ? '10d' : canSelect5d ? '5d' : '14d';
  const [absenceType, setAbsenceType] = useState<AbsenceType>(defaultType);
  const [startDay, setStartDay] = useState<number | null>(null);
  const createAbsence = useCreateAbsence();
  const calendarDays = absenceType === '14d' ? 14 : absenceType === '10d' ? 10 : 5;
  const canCreate =
    (absenceType === '14d' && canSelect14d) ||
    (absenceType === '10d' && canSelect10d) ||
    (absenceType === '5d' && canSelect5d);

  const { previewSet, crossMonthLabel } = useMemo(() => {
    if (!startDay) return { previewSet: new Set<number>(), crossMonthLabel: null };
    const start = new Date(year, month, startDay);
    const end = new Date(start);
    end.setDate(end.getDate() + calendarDays - 1);

    const set = new Set<number>();
    for (let i = 0; i < calendarDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      if (d.getMonth() === month) set.add(d.getDate());
    }

    let label: string | null = null;
    if (end.getMonth() !== month || end.getFullYear() !== year) {
      label = `→ ${end.getDate()} ${MONTH_SHORT_UK[end.getMonth()]}`;
    }

    return { previewSet: set, crossMonthLabel: label };
  }, [startDay, year, month, calendarDays]);

  const weeks = useMemo(() => buildWeeks(year, month), [year, month]);

  async function handleCreate() {
    if (!startDay || !canCreate) return;
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    try {
      await createAbsence.mutateAsync({ absence_type: absenceType, start_date: startDate });
      onClose();
    } catch { /* error shown via mutation state */ }
  }

  const noQuota = !canSelect14d && !canSelect10d && !canSelect5d;

  if (isLoading) {
    return <p className="text-[11px] text-slate-400 text-center py-3">Завантаження...</p>;
  }

  return (
    <div>
      {/* Quota info */}
      <div className="flex items-center gap-3 mb-2 text-[10px] text-slate-500">
        <span>Квота: {quota.totalDays}/24 дн.</span>
        <QuotaDots label="14д" used={quota.used14d} max={1} />
        {quota.used10d > 0
          ? <QuotaDots label="10д" used={quota.used10d} max={1} />
          : <QuotaDots label="5д" used={quota.used5d} max={2} />
        }
      </div>

      {noQuota ? (
        <p className="text-[11px] text-amber-600 text-center py-2">Квоту на {year} рік вичерпано</p>
      ) : (
        <>
          {/* Type selector */}
          <div className="flex gap-1.5 mb-2">
            {canSelect14d && (
              <button
                onClick={() => { setAbsenceType('14d'); setStartDay(null); }}
                className={cn(
                  'flex-1 py-1 rounded-lg text-xs font-medium transition-colors',
                  absenceType === '14d'
                    ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100',
                )}
              >
                14 днів
              </button>
            )}
            {canSelect10d && (
              <button
                onClick={() => { setAbsenceType('10d'); setStartDay(null); }}
                className={cn(
                  'flex-1 py-1 rounded-lg text-xs font-medium transition-colors',
                  absenceType === '10d'
                    ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100',
                )}
              >
                10 днів
              </button>
            )}
            {canSelect5d && (
              <button
                onClick={() => { setAbsenceType('5d'); setStartDay(null); }}
                className={cn(
                  'flex-1 py-1 rounded-lg text-xs font-medium transition-colors',
                  absenceType === '5d'
                    ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100',
                )}
              >
                5 днів
              </button>
            )}
          </div>

          <p className="text-[10px] text-slate-400 mb-1.5">Оберіть дату початку:</p>

          <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
            {WEEKDAY_SHORT.map(d => (
              <div key={d} className="font-semibold text-slate-400 py-0.5">{d}</div>
            ))}
            {weeks.flat().map((day, i) => {
              if (day == null) return <div key={`e-${i}`} />;
              const dow = new Date(year, month, day).getDay();
              const isWeekend = dow === 0 || dow === 6;
              const isInPreview = previewSet.has(day);
              const isStart = day === startDay;

              return (
                <button
                  key={day}
                  type="button"
                  disabled={isWeekend}
                  onClick={() => setStartDay(day)}
                  className={cn(
                    'rounded-md py-1 font-medium transition-colors',
                    isStart && 'bg-indigo-500 text-white',
                    isInPreview && !isStart && 'bg-sky-100 text-sky-700',
                    !isInPreview && !isStart && isWeekend && 'text-slate-300 cursor-default',
                    !isInPreview && !isStart && !isWeekend && 'text-slate-600 hover:bg-slate-100 cursor-pointer',
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {startDay && (
            <>
              {crossMonthLabel && (
                <p className="mt-1.5 text-[10px] text-slate-500">{crossMonthLabel}</p>
              )}
              <button
                onClick={handleCreate}
                disabled={createAbsence.isPending}
                className="mt-2 w-full py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50"
              >
                {createAbsence.isPending ? 'Створення...' : `Створити заявку (${calendarDays} к.д.)`}
              </button>
            </>
          )}

          {createAbsence.isError && (
            <p className="mt-1 text-[10px] text-red-500">{createAbsence.error.message}</p>
          )}
        </>
      )}
    </div>
  );
}

function QuotaDots({ label, used, max }: { label: string; used: number; max: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {label}:
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn(
            'inline-block w-2 h-2 rounded-sm',
            i < used ? 'bg-emerald-500' : 'bg-slate-200',
          )}
        />
      ))}
    </span>
  );
}

function buildWeeks(year: number, month: number): (number | null)[][] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const result: (number | null)[][] = [];
  let week: (number | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { result.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    result.push(week);
  }
  return result;
}
