'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { BarChart3, RefreshCw, ChevronLeft, ChevronRight, Clock, CheckSquare, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useKPI } from '@/hooks/useKPI';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { DashboardStatCard } from './shared';
import KPIGauge from './kpi/KPIGauge';
import ProcessEfficiencyChart from './kpi/ProcessEfficiencyChart';
import type { KPIPeriodType } from './kpi/types';
import ProcessKPIView from './kpi/ProcessKPIView';
import OperationalKPIView from './kpi/OperationalKPIView';
import StrategicKPIView from './kpi/StrategicKPIView';

const MONTH_NAMES = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

function getCurrentQuarter(): number {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

function getQuarterMonths(q: number): number[] {
  const start = (q - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

const KPIContent: React.FC = () => {
  const { user } = useAuth();
  const role = (user?.role || 'employee') as 'chief' | 'head' | 'employee';
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentQuarter = getCurrentQuarter();

  // Period state
  const [year, setYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);

  // Derive periodType & periodValue from role
  const periodType: KPIPeriodType = role === 'employee' ? 'month' : role === 'head' ? 'quarter' : 'year';
  const periodValue = role === 'employee' ? selectedMonth : role === 'head' ? selectedQuarter : undefined;

  const { data, loading, error, refresh } = useKPI(year, periodType, periodValue);

  // Month options for employee (months of current quarter context)
  const monthOptions = useMemo(() => {
    if (role !== 'employee') return [];
    const q = Math.ceil(selectedMonth / 3);
    return getQuarterMonths(q).map(m => ({
      value: m,
      label: MONTH_NAMES[m - 1],
    }));
  }, [role, selectedMonth]);

  const handleYearChange = useCallback((delta: number) => {
    setYear(y => y + delta);
  }, []);

  const handleRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  // Title based on role
  const title = role === 'employee'
    ? 'Процесний KPI'
    : role === 'head'
      ? 'Операційний KPI'
      : 'Стратегічний KPI';

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-slate-50/30">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Title */}
          <div className="flex items-center gap-1.5 mr-1 sm:mr-2">
            <BarChart3 aria-hidden="true" className="h-5 w-5 text-indigo-600" />
            <h1 className="text-base sm:text-lg font-bold text-gray-800">{title}</h1>
          </div>

          {/* Year control */}
          <div className="flex items-center gap-0.5 bg-white rounded-lg border border-slate-200 px-1 py-0.5">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => handleYearChange(-1)}
              aria-label="Попередній рік"
            >
              <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm font-semibold text-slate-700 min-w-[3rem] text-center">{year}</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => handleYearChange(1)}
              aria-label="Наступний рік"
              disabled={year >= currentYear}
            >
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Employee: quarter quick-select + month picker */}
          {role === 'employee' && (
            <>
              <div className="inline-flex rounded-lg bg-slate-200/60 p-0.5" role="radiogroup" aria-label="Квартал">
                {[1, 2, 3, 4].map(q => {
                  const isActive = Math.ceil(selectedMonth / 3) === q;
                  return (
                    <button
                      key={q}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => setSelectedMonth(getQuarterMonths(q)[0])}
                      className={cn(
                        'px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium rounded-md',
                        'transition-[background-color,color,box-shadow] duration-150',
                        'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                        'active:scale-95',
                        isActive
                          ? 'bg-white text-indigo-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      )}
                    >
                      Q{q}
                    </button>
                  );
                })}
              </div>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(Number(e.target.value))}
                className="bg-white border border-slate-300 text-slate-700 text-xs sm:text-sm rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                aria-label="Виберіть місяць"
              >
                {monthOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </>
          )}

          {/* Head: quarter picker */}
          {role === 'head' && (
            <div className="inline-flex rounded-lg bg-slate-200/60 p-0.5" role="radiogroup" aria-label="Квартал">
              {[1, 2, 3, 4].map(q => {
                const isActive = selectedQuarter === q;
                return (
                  <button
                    key={q}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setSelectedQuarter(q)}
                    className={cn(
                      'px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md',
                      'transition-[background-color,color,box-shadow] duration-150',
                      'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                      'active:scale-95',
                      isActive
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    Q{q}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex-1" />

          {/* Refresh */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            aria-label="Оновити дані"
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw aria-hidden="true" className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Оновити</span>
          </Button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center items-center py-20" role="status" aria-label="Завантаження">
            <Spinner size="lg" />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 text-red-700 text-sm" role="alert">
            {error}
            <button
              type="button"
              onClick={handleRefresh}
              className="ml-2 underline text-red-600 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-400 rounded"
              aria-label="Спробувати знову"
            >
              Спробувати знову
            </button>
          </div>
        )}

        {/* Content */}
        {!loading && !error && data && (
          <>
            {/* Summary: Gauge + Stat cards */}
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-5">
              <KPIGauge
                kpiPercent={data.overall.kpi}
                planned={data.overall.planned}
                actual={data.overall.actual}
                norm={data.norm}
                size="lg"
              />
              <div className="flex-1 grid grid-cols-2 gap-2 sm:gap-3 w-full">
                <DashboardStatCard
                  title="KPI"
                  value={`${data.overall.kpi.toFixed(1)}%`}
                  icon={BarChart3}
                  tone="amber"
                />
                <DashboardStatCard
                  title="План (год)"
                  value={`${data.overall.planned.toFixed(1)}`}
                  icon={Target}
                  tone="blue"
                />
                <DashboardStatCard
                  title="Факт (год)"
                  value={`${data.overall.actual.toFixed(1)}`}
                  icon={Clock}
                  tone="emerald"
                />
                <DashboardStatCard
                  title="Норма"
                  value={`${data.norm}%`}
                  icon={CheckSquare}
                  tone="purple"
                />
              </div>
            </div>

            {/* Process efficiency chart */}
            {data.byProcess.length > 0 && (
              <ProcessEfficiencyChart processes={data.byProcess} norm={100} />
            )}

            {/* Role-specific view */}
            {role === 'employee' && <ProcessKPIView data={data} />}
            {role === 'head' && <OperationalKPIView data={data} />}
            {role === 'chief' && <StrategicKPIView data={data} />}
          </>
        )}

        {/* Empty state */}
        {!loading && !error && data && data.overall.planned === 0 && data.overall.actual === 0 && (
          <div className="text-center py-12">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 text-slate-300" aria-hidden="true" />
            <p className="text-slate-500 text-sm">Немає даних за обраний період</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default KPIContent;
