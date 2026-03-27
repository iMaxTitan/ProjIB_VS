'use client';

import React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Spinner } from '@/components/ui/Spinner';
import { ReferenceListItem } from '../shared';
import { formatHours } from '@/lib/ops';
import type { QuarterlyReportGroup } from './types';

const quarterRoman: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

interface QuarterlyReportListProps {
  tabsSlot: React.ReactNode;
  selectedYear: number;
  availableYearsList: number[];
  hasPrevYear: boolean;
  hasNextYear: boolean;
  goPrevYear: () => void;
  goNextYear: () => void;
  loading: boolean;
  groupedReports: QuarterlyReportGroup[];
  filteredGroups: QuarterlyReportGroup[];
  selectedQuarterKey: string | null;
  onSelectQuarter: (key: string) => void;
  isMobile: boolean;
  onOpenDrawer: () => void;
}

export default function QuarterlyReportList({
  tabsSlot,
  selectedYear,
  availableYearsList,
  hasPrevYear,
  hasNextYear,
  goPrevYear,
  goNextYear,
  loading,
  groupedReports,
  filteredGroups,
  selectedQuarterKey,
  onSelectQuarter,
  isMobile,
  onOpenDrawer,
}: QuarterlyReportListProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0">
        {tabsSlot}
        {availableYearsList.length > 0 && (
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-white/40">
            <button
              onClick={goPrevYear}
              disabled={!hasPrevYear}
              aria-label="Попередній рік"
              className={cn(
                'p-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500',
                !hasPrevYear ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-slate-800 hover:bg-white/60',
              )}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="text-sm font-semibold text-slate-700 select-none">{selectedYear}</span>
            <button
              onClick={goNextYear}
              disabled={!hasNextYear}
              aria-label="Наступний рік"
              className={cn(
                'p-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500',
                !hasNextYear ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-slate-800 hover:bg-white/60',
              )}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 sm:p-2">
        {loading ? (
          <div className="flex justify-center items-center py-10"><Spinner /></div>
        ) : groupedReports.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 rounded-lg">
            <CalendarDays className="w-12 h-12 mx-auto text-slate-300 mb-3" aria-hidden="true" />
            <p className="text-slate-500">Нет квартальных планов</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredGroups.map((group) => {
              const isSelected = selectedQuarterKey === group.key;
              return (
                <ReferenceListItem
                  key={group.key}
                  tone="purple"
                  isSelected={isSelected}
                  onClick={() => { onSelectQuarter(group.key); if (isMobile) onOpenDrawer(); }}
                  ariaLabel={`Выбрать ${quarterRoman[group.quarter]} квартал ${group.year}`}
                  className="px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-purple-100/80 rounded-lg flex items-center justify-center flex-shrink-0">
                        <CalendarDays className="w-4 h-4 text-purple-600" aria-hidden="true" />
                      </div>
                      <span className="font-semibold text-slate-800">{quarterRoman[group.quarter]} квартал</span>
                    </div>
                    <div className="text-right min-w-[132px] flex-shrink-0">
                      <div className="text-xs font-semibold text-slate-700">
                        {formatHours(group.plannedHours)} / {formatHours(group.spentHours)}
                      </div>
                      <div className="w-28 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-gradient-to-r from-purple-400 to-indigo-500 rounded-full" style={{ width: `${group.completionPercentage}%` }} />
                      </div>
                    </div>
                  </div>
                </ReferenceListItem>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
