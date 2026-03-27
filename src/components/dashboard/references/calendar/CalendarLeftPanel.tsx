'use client';

import React from 'react';
import { CalendarDays, Clock, Sun } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import type { MonthlyWorkingDays } from '@/types/calendar';
import { GroupHeader, ReferenceListItem } from '../../shared';
import ReferenceLeftPanelShell from '../ReferenceLeftPanelShell';
import ReferenceEmptyState from '../ReferenceEmptyState';

const MONTH_NAMES = [
  '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

interface Props {
  tabsSlot?: React.ReactNode;
  loading: boolean;
  error: string | null;
  years: number[];
  currentYear: number;
  monthsByYear: Map<number, MonthlyWorkingDays[]>;
  expandedYears: Record<number, boolean>;
  isCreateMode: boolean;
  selectedYear: number;
  selectedMonth: number | null;
  totalMonths: number;
  canEdit: boolean;
  onToggleYear: (y: number) => void;
  onStartCreate: (y: number) => void;
  onSelectMonth: (y: number, m: number) => void;
}

export default function CalendarLeftPanel({
  tabsSlot,
  loading,
  error,
  years,
  currentYear,
  monthsByYear,
  expandedYears,
  isCreateMode,
  selectedYear,
  selectedMonth,
  totalMonths,
  canEdit,
  onToggleYear,
  onStartCreate,
  onSelectMonth,
}: Props) {
  return (
    <ReferenceLeftPanelShell
      tabsSlot={tabsSlot}
      loading={loading}
      error={error}
      isEmpty={false}
      bodyClassName="space-y-2"
      emptyState={
        <ReferenceEmptyState
          icon={<CalendarDays className="h-12 w-12" aria-hidden="true" />}
          text="Нет месяцев"
        />
      }
      body={years.map((y) => {
        const months = monthsByYear.get(y) || [];
        const isExpanded = expandedYears[y] ?? false;
        return (
          <div key={y}>
            <GroupHeader
              title={String(y)}
              count={months.length}
              expanded={isExpanded}
              onToggle={() => onToggleYear(y)}
              onAdd={canEdit ? () => onStartCreate(y) : undefined}
              toggleAriaLabel={`${isExpanded ? 'Свернуть' : 'Развернуть'} ${y}`}
              addAriaLabel={`Добавить месяц в ${y}`}
              tone="emerald"
            />
            {isExpanded && (
              <div className="space-y-1 mt-1">
                {months.length === 0 ? (
                  <p className="text-xs text-slate-400 px-3 py-2">Нет месяцев</p>
                ) : (
                  months
                    .sort((a, b) => a.month - b.month)
                    .map((mwd) => {
                      const workDays = Math.round(mwd.work_hours / 8);
                      const holidays = mwd.day_types
                        ? mwd.day_types.filter((c) => c === 'С').length
                        : 0;
                      const isCurrent =
                        mwd.year === currentYear && mwd.month === new Date().getMonth() + 1;
                      const isSelected =
                        !isCreateMode && selectedYear === y && selectedMonth === mwd.month;

                      return (
                        <ReferenceListItem
                          key={`${mwd.year}-${mwd.month}`}
                          tone="emerald"
                          isSelected={isSelected}
                          onClick={() => onSelectMonth(y, mwd.month)}
                          ariaLabel={`${MONTH_NAMES[mwd.month]} ${y}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                              isSelected
                                ? 'bg-emerald-200/80 text-emerald-700'
                                : 'bg-emerald-50 text-emerald-500',
                            )}>
                              <CalendarDays className="h-4 w-4" aria-hidden="true" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  'text-sm font-medium truncate',
                                  isSelected ? 'text-emerald-900' : 'text-slate-800',
                                )}>
                                  {MONTH_NAMES[mwd.month]}
                                </span>
                                {isCurrent && (
                                  <span className="text-2xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium">
                                    Поточний
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" aria-hidden="true" />
                                  {mwd.work_hours} год.
                                </span>
                                <span>{workDays} роб. дн.</span>
                                {holidays > 0 && (
                                  <span className="flex items-center gap-1 text-rose-500">
                                    <Sun className="h-3 w-3" aria-hidden="true" />
                                    {holidays}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </ReferenceListItem>
                      );
                    })
                )}
              </div>
            )}
          </div>
        );
      })}
      footer={
        <div className="flex items-center gap-2 text-slate-500">
          <CalendarDays className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <span className="text-sm">Всего месяцев: {totalMonths}</span>
        </div>
      }
    />
  );
}
