'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  Clock, CheckSquare, Building2, Users, Download, RefreshCw,
  Layers, Target, Briefcase, Filter,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { DashboardStatCard } from '../shared';
import { usePivotReport, type UsePivotReportParams } from '@/hooks/usePivotReport';
import { HoursByBucketChart, TopItemsChart } from './SummaryCharts';
import DynamicPivotTable from './SummaryPivotTable';
import type { UserInfo } from '@/types/azure';
import type { PivotGroupBy, PivotTimeGrain, PivotMetric, PivotPeriodType } from '@/types/pivot';
import * as ExcelJS from 'exceljs';

interface SummaryTabContentProps {
  user: UserInfo;
}

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const QUARTER_NAMES = ['I квартал', 'II квартал', 'III квартал', 'IV квартал'];

type PeriodToggle = 'month' | 'quarter' | 'year';

const PERIOD_OPTIONS: { id: PeriodToggle; label: string }[] = [
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
  { id: 'year', label: 'Год' },
];

interface GroupByOption {
  id: PivotGroupBy;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

const GROUP_BY_OPTIONS: GroupByOption[] = [
  { id: 'company', label: 'Предприятие', shortLabel: 'Предпр.', icon: Building2 },
  { id: 'department', label: 'Отдел', shortLabel: 'Отдел', icon: Briefcase },
  { id: 'employee', label: 'Сотрудник', shortLabel: 'Сотр.', icon: Users },
  { id: 'process', label: 'Процесс', shortLabel: 'Процесс', icon: Layers },
  { id: 'measure', label: 'Мероприятие', shortLabel: 'Меропр.', icon: Target },
  { id: 'category', label: 'Категория', shortLabel: 'Катег.', icon: Filter },
];

const METRIC_OPTIONS: { id: PivotMetric; label: string }[] = [
  { id: 'hours', label: 'Часы' },
  { id: 'tasks', label: 'Задачи' },
  { id: 'planned', label: 'План' },
  { id: 'cost', label: 'Стоимость' },
  { id: 'kpi', label: 'KPI %' },
];

const TIME_GRAIN_OPTIONS: { id: PivotTimeGrain; label: string }[] = [
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
];

export default function SummaryTabContent({ user: _user }: SummaryTabContentProps) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentQuarter = Math.ceil(currentMonth / 3);

  // Period
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [periodType, setPeriodType] = useState<PeriodToggle>('year');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);

  // Pivot params
  const [groupBy, setGroupBy] = useState<PivotGroupBy[]>(['company']);
  const [timeGrain, setTimeGrain] = useState<PivotTimeGrain>('month');
  const [metric, setMetric] = useState<PivotMetric>('hours');
  const [exporting, setExporting] = useState(false);

  const periodValue = useMemo(() => {
    if (periodType === 'month') return selectedMonth;
    if (periodType === 'quarter') return selectedQuarter;
    return undefined;
  }, [periodType, selectedMonth, selectedQuarter]);

  const years = useMemo(() => Array.from({ length: 3 }, (_, i) => currentYear - i), [currentYear]);

  // Fetch
  const params: UsePivotReportParams = useMemo(() => ({
    year: selectedYear,
    periodType: periodType as PivotPeriodType,
    periodValue,
    groupBy,
    timeGrain,
    metric,
  }), [selectedYear, periodType, periodValue, groupBy, timeGrain, metric]);

  const { data, isLoading: loading, error: queryError, refetch } = usePivotReport(params);
  const error = queryError?.message || null;

  // Stats
  const planExecution = useMemo(() => {
    if (!data || data.stats.plannedHours <= 0) return 0;
    return (data.stats.totalHours / data.stats.plannedHours) * 100;
  }, [data]);

  const avgHoursPerTask = useMemo(() => {
    if (!data || data.stats.totalTasks <= 0) return 0;
    return data.stats.totalHours / data.stats.totalTasks;
  }, [data]);

  // Group-by toggle
  function toggleGroupBy(dim: PivotGroupBy) {
    setGroupBy(prev => {
      if (prev.includes(dim)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(d => d !== dim);
      }
      return [...prev, dim];
    });
  }

  // Excel export
  const handleExport = useCallback(async () => {
    if (!data) return;
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();

      // Sheet 1: Summary
      const wsSummary = wb.addWorksheet('Сводка');
      wsSummary.columns = [
        { header: 'Показатель', key: 'metric', width: 25 },
        { header: 'Значение', key: 'value', width: 15 },
      ];
      const periodLabel = periodType === 'month' ? MONTH_NAMES[selectedMonth - 1]
        : periodType === 'quarter' ? QUARTER_NAMES[selectedQuarter - 1] : '';
      wsSummary.addRows([
        { metric: 'Период', value: `${selectedYear}${periodLabel ? `, ${periodLabel}` : ''}` },
        { metric: 'Всего часов (факт)', value: data.stats.totalHours },
        { metric: 'Всего часов (план)', value: data.stats.plannedHours },
        { metric: 'Задач', value: data.stats.totalTasks },
        { metric: 'Предприятий', value: data.stats.companiesCount },
        { metric: 'Сотрудников', value: data.stats.employeesCount },
        { metric: 'Группировка', value: data.meta.groupBy.join(', ') },
        { metric: 'Метрика', value: data.meta.metric },
      ]);

      // Sheet 2: Pivot table
      const wsPivot = wb.addWorksheet('Сводная таблица');
      const tbHeaders = data.meta.timeBuckets.map(tb => ({ header: tb.label, key: tb.key, width: 10 }));
      wsPivot.columns = [
        { header: 'Название', key: 'name', width: 35 },
        ...tbHeaders,
        { header: 'Итого', key: 'total', width: 12 },
      ];
      for (const row of data.rows) {
        const rowData: Record<string, string | number> = {
          name: row.dimensions.map(d => d.name).join(' / '),
          total: row.total,
        };
        for (const tb of data.meta.timeBuckets) {
          rowData[tb.key] = row.buckets[tb.key] || 0;
        }
        wsPivot.addRow(rowData);
      }
      // Totals row
      const totalsRow: Record<string, string | number> = { name: 'ИТОГО', total: data.grandTotal };
      for (const tb of data.meta.timeBuckets) {
        totalsRow[tb.key] = data.columnTotals[tb.key] || 0;
      }
      const totalXlsRow = wsPivot.addRow(totalsRow);
      totalXlsRow.font = { bold: true };

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const rawName = `Сводная_${selectedYear}${periodLabel ? '_' + periodLabel : ''}_${data.meta.groupBy.join('-')}.xlsx`;
      a.download = rawName.replace(/[<>:"/\\|?*]/g, '_');
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  }, [data, selectedYear, periodType, selectedMonth, selectedQuarter]);

  // _user reserved for future UI-level role guard
  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5 md:p-6 space-y-4 sm:space-y-6 bg-slate-50/30">

        {/* Row 1: Period + Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Year */}
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            aria-label="Выбрать год"
            className="bg-white border border-slate-300 text-slate-700 text-xs sm:text-sm rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Period type */}
          <div className="inline-flex rounded-lg bg-slate-200/60 p-0.5" role="radiogroup" aria-label="Тип периода">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={periodType === opt.id}
                aria-label={`Период: ${opt.label}`}
                onClick={() => setPeriodType(opt.id)}
                className={cn(
                  'px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md',
                  'transition-[background-color,color,box-shadow] duration-150',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                  periodType === opt.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Month / Quarter picker */}
          {periodType === 'month' && (
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              aria-label="Выбрать месяц"
              className="bg-white border border-slate-300 text-slate-700 text-xs sm:text-sm rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
            >
              {MONTH_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
            </select>
          )}
          {periodType === 'quarter' && (
            <select
              value={selectedQuarter}
              onChange={e => setSelectedQuarter(Number(e.target.value))}
              aria-label="Выбрать квартал"
              className="bg-white border border-slate-300 text-slate-700 text-xs sm:text-sm rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
            >
              {QUARTER_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
            </select>
          )}

          <div className="flex-1" />

          {/* Actions */}
          <Button variant="ghost" size="sm" onClick={() => refetch()} aria-label="Обновить данные" disabled={loading} className="gap-1.5">
            <RefreshCw aria-hidden="true" className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Обновить</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} aria-label="Экспортировать в Excel" disabled={!data || exporting} className="gap-1.5">
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{exporting ? 'Экспорт...' : 'Excel'}</span>
          </Button>
        </div>

        {/* Row 2: GroupBy + Metric + TimeGrain */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* GroupBy chips */}
          <div className="flex flex-wrap gap-1" role="group" aria-label="Группировка">
            {GROUP_BY_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const isActive = groupBy.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={isActive}
                  aria-label={`Группировать по: ${opt.label}`}
                  onClick={() => toggleGroupBy(opt.id)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 text-xs font-medium rounded-md border',
                    'transition-[background-color,color,border-color] duration-150',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700',
                  )}
                >
                  <Icon aria-hidden="true" className="h-3 w-3" />
                  <span className="hidden sm:inline">{opt.label}</span>
                  <span className="sm:hidden">{opt.shortLabel}</span>
                </button>
              );
            })}
          </div>

          <div className="w-px h-5 bg-slate-200 hidden sm:block" />

          {/* Metric toggle */}
          <div className="inline-flex rounded-lg bg-slate-200/60 p-0.5" role="radiogroup" aria-label="Метрика">
            {METRIC_OPTIONS.map(opt => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={metric === opt.id}
                aria-label={`Метрика: ${opt.label}`}
                onClick={() => setMetric(opt.id)}
                className={cn(
                  'px-2 sm:px-2.5 py-1.5 text-xs font-medium rounded-md',
                  'transition-[background-color,color,box-shadow] duration-150',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                  metric === opt.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-slate-200 hidden sm:block" />

          {/* TimeGrain */}
          <div className="inline-flex rounded-lg bg-slate-200/60 p-0.5" role="radiogroup" aria-label="Детализация по времени">
            {TIME_GRAIN_OPTIONS.map(opt => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={timeGrain === opt.id}
                aria-label={`Детализация: ${opt.label}`}
                onClick={() => setTimeGrain(opt.id)}
                className={cn(
                  'px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md',
                  'transition-[background-color,color,box-shadow] duration-150',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                  timeGrain === opt.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 text-red-700 text-sm">
            {error}
            <button
              type="button"
              onClick={() => refetch()}
              className="ml-2 underline text-red-600 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-400 rounded"
              aria-label="Попробовать снова"
            >
              Попробовать снова
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <Spinner size="lg" />
          </div>
        )}

        {/* Content */}
        {!loading && data && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <DashboardStatCard title="Часы (факт)" value={data.stats.totalHours.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} icon={Clock} tone="amber" />
              <DashboardStatCard title="Задач" value={data.stats.totalTasks} icon={CheckSquare} tone="blue" />
              <DashboardStatCard title="Выполнение плана" value={`${planExecution.toFixed(1)}%`} icon={Building2} tone="emerald" />
              <DashboardStatCard title="Часы/задача" value={avgHoursPerTask.toFixed(2)} icon={Users} tone="purple" />
            </div>

            {/* Pivot Table */}
            <DynamicPivotTable data={data} />

            {/* Charts (context-adaptive) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <HoursByBucketChart data={data} />
              <TopItemsChart
                rows={data.rows}
                title={`Топ по ${GROUP_BY_OPTIONS.find(o => o.id === groupBy[0])?.label || 'данным'}`}
              />
            </div>
          </>
        )}

        {/* Empty state */}
        {!loading && !error && data && data.stats.totalTasks === 0 && (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 mx-auto mb-3 text-slate-300" aria-hidden="true" />
            <p className="text-slate-500 text-sm">Нет данных за выбранный период</p>
          </div>
        )}
      </div>
    </div>
  );
}
