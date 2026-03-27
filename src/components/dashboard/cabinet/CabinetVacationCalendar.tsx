'use client';

import React, { useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { useTeamAbsences } from '@/hooks/useAbsences';
import { Spinner } from '@/components/ui/Spinner';
import VacationMonthPopover from './VacationMonthPopover';

const MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

import type { TeamAbsenceInfo } from '@/lib/ops/cabinet/absences';

interface PopoverState {
  userId: string;
  monthIdx: number;
  approvedDays: number[];
  pendingDays: number[];
  isOwnRow: boolean;
  absences: TeamAbsenceInfo[];
  anchorRect: DOMRect;
}

export default function CabinetVacationCalendar() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isLoading, error } = useTeamAbsences(year);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const rows = data?.rows;
  const currentUserId = data?.currentUserId;
  const currentUserRole = data?.currentUserRole;
  const isManager = currentUserRole === 'chief' || currentUserRole === 'head';
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const handleCellClick = useCallback(
    (e: React.MouseEvent<HTMLTableCellElement>, userId: string, monthIdx: number) => {
      if (!rows || !currentUserId) return;

      const emp = rows.find(r => r.userId === userId);
      if (!emp) return;

      const approved = emp.approvedDays[monthIdx] || [];
      const pending = emp.pendingDays[monthIdx] || [];
      const isOwn = userId === currentUserId;
      const hasData = approved.length > 0 || pending.length > 0;

      // Only open for: cells with data (view) or own empty cells (create)
      if (!hasData && !isOwn) return;

      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setPopover({ userId, monthIdx, approvedDays: approved, pendingDays: pending, isOwnRow: isOwn, absences: emp.absences, anchorRect: rect });
    },
    [rows, currentUserId],
  );

  const closePopover = useCallback(() => setPopover(null), []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-sky-500" />
          <h3 className="text-sm font-semibold text-slate-700">Календар відпусток</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setYear(y => y - 1); closePopover(); }}
            className="p-1 rounded hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[50px] text-center">{year}</span>
          <button
            onClick={() => { setYear(y => y + 1); closePopover(); }}
            className="p-1 rounded hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-5 w-5 text-sky-500" />
        </div>
      ) : error ? (
        <div className="py-6 text-center text-sm text-slate-400">Не вдалося завантажити дані</div>
      ) : !rows?.length ? (
        <div className="py-6 text-center text-sm text-slate-400">Немає відпусток у {year} році</div>
      ) : (
        <div ref={tableRef} className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b-2 border-slate-200 bg-slate-50">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[160px] border-r border-slate-200">
                  Співробітник
                </th>
                {MONTHS_SHORT.map((m, i) => (
                  <th
                    key={m}
                    className={cn(
                      'px-1.5 py-2 text-center text-[11px] font-semibold min-w-[42px]',
                      year === currentYear && i === currentMonth ? 'text-sky-600 bg-sky-50/60' : 'text-slate-500',
                    )}
                  >
                    {m}
                  </th>
                ))}
                <th className="px-2 py-2 text-center text-[11px] font-semibold text-slate-500 min-w-[42px] border-l border-slate-200">
                  Всего
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(emp => {
                const isOwn = emp.userId === currentUserId;
                const hasPending = emp.absences.some(a => a.status === 'pending');
                const canApproveThis = isManager && !isOwn && hasPending;
                return (
                  <tr
                    key={emp.userId}
                    className={cn(
                      'border-b border-slate-100',
                      isOwn ? 'bg-indigo-50/40 hover:bg-indigo-50/60'
                        : canApproveThis ? 'bg-amber-50/30 hover:bg-amber-50/50'
                        : 'hover:bg-slate-50/50',
                    )}
                  >
                    <td
                      className={cn(
                        'sticky left-0 z-10 px-3 py-1.5 font-medium border-r border-slate-200/60 whitespace-nowrap',
                        isOwn ? 'bg-indigo-50/40 text-indigo-700'
                          : canApproveThis ? 'bg-amber-50/30 text-slate-700'
                          : 'bg-white text-slate-700',
                      )}
                    >
                      {canApproveThis && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 align-middle" title="Очікує затвердження" />
                      )}
                      {emp.fullName}
                      {isOwn && <span className="ml-1 text-[10px] text-indigo-400">(ви)</span>}
                      {!isOwn && (emp.role === 'chief' || emp.role === 'head') && (
                        <span className="ml-1 text-[10px] text-sky-400">
                          {emp.role === 'chief' ? 'шеф' : 'кер.'}
                        </span>
                      )}
                    </td>
                    {Array.from({ length: 12 }).map((_, i) => {
                      const approved = emp.approvedDays[i] || [];
                      const pending = emp.pendingDays[i] || [];
                      const total = approved.length + pending.length;
                      const hasData = total > 0;
                      const isClickable = hasData || isOwn;

                      return (
                        <td
                          key={i}
                          onClick={isClickable ? (e) => handleCellClick(e, emp.userId, i) : undefined}
                          className={cn(
                            'px-1.5 py-1.5 text-center',
                            isClickable && 'cursor-pointer hover:bg-sky-50/50 transition-colors',
                          )}
                        >
                          {hasData ? (
                            <span
                              className={cn(
                                'inline-block min-w-[24px] px-1 py-0.5 rounded text-[11px] font-semibold',
                                pending.length > 0 && approved.length === 0
                                  ? 'bg-sky-50/60 text-sky-500 border border-dashed border-sky-300'
                                  : pending.length > 0
                                    ? 'bg-sky-100 text-sky-700 border border-sky-200'
                                    : 'bg-sky-50 text-sky-600',
                              )}
                              title={
                                pending.length > 0
                                  ? `Затверджено: ${approved.length} дн., очікує: ${pending.length} дн.`
                                  : `${approved.length} дн.`
                              }
                            >
                              {total}
                            </span>
                          ) : isOwn ? (
                            <span className="inline-block min-w-[24px] px-1 py-0.5 rounded text-[11px] text-slate-300">
                              +
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-center font-semibold text-slate-600 border-l border-slate-200 text-[11px]">
                      {emp.totalDays}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Popover */}
      {popover && (
        <VacationMonthPopover
          year={year}
          month={popover.monthIdx}
          approvedDays={popover.approvedDays}
          pendingDays={popover.pendingDays}
          isOwnRow={popover.isOwnRow}
          absences={popover.absences}
          isManager={isManager}
          onClose={closePopover}
          anchorRect={popover.anchorRect}
        />
      )}
    </div>
  );
}
