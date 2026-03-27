'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Save, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import {
  TIMESHEET_CODES,
  type TimesheetCode,
  type MonthlyWorkingDays,
  type EmployeeTimesheet,
} from '@/types/calendar';
import { calcWorkHours } from '@/lib/ops/working-days';
import { toShortName } from '@/lib/ops/format-name';
import { CellCodePicker } from './CellCodePicker';

const WEEKDAY_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

interface TimesheetGridProps {
  monthData: MonthlyWorkingDays;
  timesheets: EmployeeTimesheet[];
  year: number;
  month: number;
  canEdit: boolean;
  isEditing: boolean;
  /** Map userId → modified days (dirty state managed by parent) */
  dirtyRows: Map<string, TimesheetCode[]>;
  /** Update local dirty state (no DB call) */
  onCellChange: (userId: string, dayIdx: number, newCode: TimesheetCode) => void;
  /** Save single row to DB */
  onSaveRow: (userId: string) => Promise<void>;
  /** Remove employee from month */
  onRemoveEmployee: (userId: string) => void;
  /** Set of userIds currently saving */
  savingRows: Set<string>;
}

export function TimesheetGrid({
  monthData,
  timesheets,
  year,
  month,
  canEdit,
  isEditing,
  dirtyRows,
  onCellChange,
  onSaveRow,
  onRemoveEmployee,
  savingRows,
}: TimesheetGridProps) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const [editingCell, setEditingCell] = useState<{ userId: string; dayIdx: number } | null>(null);

  const dayHeaders = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const date = new Date(year, month - 1, i + 1);
      const dow = date.getDay();
      const isWeekend = dow === 0 || dow === 6;
      return { day: i + 1, isWeekend, weekday: WEEKDAY_SHORT[dow] };
    });
  }, [year, month, daysInMonth]);

  const handleCellClick = useCallback(
    (userId: string, dayIdx: number, code: TimesheetCode) => {
      if (!canEdit || !isEditing) return;
      if (code === 'В' || code === 'С') return;
      setEditingCell({ userId, dayIdx });
    },
    [canEdit, isEditing],
  );

  const handleCodeSelect = useCallback(
    (userId: string, dayIdx: number, newCode: TimesheetCode) => {
      onCellChange(userId, dayIdx, newCode);
      setEditingCell(null);
    },
    [onCellChange],
  );

  // Close picker when leaving edit mode
  React.useEffect(() => {
    if (!isEditing) setEditingCell(null);
  }, [isEditing]);

  const sorted = useMemo(
    () => [...timesheets].sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'ru')),
    [timesheets],
  );

  /** Get effective days for a row (dirty or original) */
  const getEffectiveDays = useCallback(
    (ts: EmployeeTimesheet): TimesheetCode[] => {
      return dirtyRows.get(ts.user_id) ?? ts.days;
    },
    [dirtyRows],
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b-2 border-slate-200 bg-slate-50">
              <th
                className="sticky left-0 z-20 bg-slate-50 px-2.5 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[180px] border-r border-slate-200"
                scope="col"
              >
                Сотрудник
              </th>
              {dayHeaders.map(({ day, isWeekend, weekday }) => (
                <th
                  key={day}
                  scope="col"
                  className={cn(
                    'px-0.5 py-1 text-center min-w-[28px]',
                    isWeekend ? 'bg-slate-100/80 text-slate-400' : 'text-slate-500',
                  )}
                >
                  <div className="text-[9px] font-normal text-slate-400 leading-none mb-0.5">
                    {weekday}
                  </div>
                  <div className="text-[11px] font-medium leading-none">
                    {day}
                  </div>
                </th>
              ))}
              <th
                scope="col"
                className="px-1.5 py-2 text-center text-[11px] font-semibold text-emerald-700 border-l-2 border-emerald-200/60 min-w-[52px] bg-emerald-50/80"
              >
                Часы
              </th>
              {isEditing && canEdit && (
                <th scope="col" className="px-1 py-2 min-w-[56px]" />
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((ts, rowIdx) => {
              const effectiveDays = getEffectiveDays(ts);
              const isDirty = dirtyRows.has(ts.user_id);
              const isSaving = savingRows.has(ts.user_id);
              const effectiveHours = isDirty ? calcWorkHours(effectiveDays, ts.work_rate ?? 1.0) : ts.work_hours;

              return (
                <tr
                  key={ts.user_id}
                  className={cn(
                    'group border-b border-slate-100/70 transition-[background-color,box-shadow] duration-150',
                    isDirty
                      ? 'bg-amber-50/40 hover:bg-amber-50/60'
                      : 'bg-white hover:bg-slate-50/50 hover:shadow-[inset_3px_0_0_0_theme(colors.indigo.400)]',
                  )}
                >
                  <td
                    className={cn(
                      'sticky left-0 z-10 px-2.5 py-1.5 font-medium text-slate-700 border-r border-slate-200/60',
                      isDirty
                        ? 'bg-amber-50 group-hover:bg-amber-100 shadow-[inset_3px_0_0_0_theme(colors.amber.400)]'
                        : 'bg-white group-hover:bg-slate-50',
                    )}
                    title={ts.full_name || undefined}
                  >
                    <span className="flex items-center gap-1">
                      <span className="truncate">{toShortName(ts.full_name)}</span>
                      {ts.work_rate != null && ts.work_rate < 1 && (
                        <span className="flex-shrink-0 text-[9px] font-semibold px-1 rounded bg-cyan-100 text-cyan-700">
                          {ts.work_rate}
                        </span>
                      )}
                    </span>
                  </td>
                  {effectiveDays.map((code, idx) => {
                    const meta = TIMESHEET_CODES[code];
                    const isSystemCode = code === 'В' || code === 'С';
                    const isEditingThis = editingCell?.userId === ts.user_id && editingCell?.dayIdx === idx;
                    const cellEditable = isEditing && canEdit && !isSystemCode;
                    const isWeekendCol = dayHeaders[idx]?.isWeekend;
                    return (
                      <td
                        key={idx}
                        className={cn(
                          'relative px-0 py-0 text-center',
                          cellEditable && 'cursor-pointer',
                          isWeekendCol && !isDirty && 'bg-slate-50/60',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleCellClick(ts.user_id, idx, code)}
                          disabled={!cellEditable}
                          aria-label={`${toShortName(ts.full_name)} день ${idx + 1}: ${meta.label}`}
                          className={cn(
                            'w-full py-1 text-[10px] font-bold transition-colors',
                            meta.color,
                            cellEditable && 'hover:ring-1 hover:ring-indigo-300 hover:rounded-sm',
                          )}
                        >
                          {code}
                        </button>
                        {isEditingThis && (
                          <CellCodePicker
                            currentCode={code}
                            isWeekendOrHoliday={isSystemCode}
                            onSelect={(newCode) => handleCodeSelect(ts.user_id, idx, newCode)}
                            onClose={() => setEditingCell(null)}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="px-1 py-1 text-center font-bold text-emerald-700 border-l-2 border-emerald-200/60 bg-emerald-50/30">
                    {effectiveHours}
                  </td>
                  {isEditing && canEdit && (
                    <td className="px-0.5 py-0 text-center whitespace-nowrap">
                      <div className="flex items-center gap-0 justify-center">
                        {isDirty && (
                          <button
                            type="button"
                            onClick={() => onSaveRow(ts.user_id)}
                            disabled={isSaving}
                            aria-label={`Сохранить ${toShortName(ts.full_name)}`}
                            className="p-0.5 text-emerald-500 hover:text-emerald-700 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 rounded"
                          >
                            {isSaving ? (
                              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save aria-hidden="true" className="h-3 w-3" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveEmployee(ts.user_id)}
                          aria-label={`Удалить ${toShortName(ts.full_name)} из месяца`}
                          className="p-0.5 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:opacity-100 rounded"
                        >
                          <X aria-hidden="true" className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={daysInMonth + 2 + (isEditing && canEdit ? 1 : 0)}
                  className="text-center py-8 text-slate-400 text-sm"
                >
                  Нет сотрудников в этом месяце
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
