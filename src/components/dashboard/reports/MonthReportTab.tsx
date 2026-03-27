'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import {
  getReportClient,
  formatHours,
} from '@/lib/ops';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Spinner } from '@/components/ui/Spinner';
import logger from '@/lib/shared/logger';
import { useIsMobile } from '@/hooks/useMediaQuery';
import * as ExcelJS from 'exceljs';
import {
  TwoPanelLayout,
  ReferenceListItem,
  MobileDetailsFab,
} from '../shared';
import MonthReportTable from './MonthReportTable';
import { MONTH_NAMES_RU, safeNumber, getTimestamp } from './report-utils';
import type { MonthProcessItem, MonthPeriodItem } from './types';

type MonthRightTab = 'process' | 'procedure' | 'company' | 'employee' | 'department';

interface MonthReportTabProps {
  tabsSlot: React.ReactNode;
}

export default function MonthReportTab({ tabsSlot }: MonthReportTabProps) {
  const isMobile = useIsMobile();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Periods
  const [monthPeriods, setMonthPeriods] = useState<MonthPeriodItem[]>([]);
  const [monthPeriodsLoading, setMonthPeriodsLoading] = useState(false);
  const [availableYearsList, setAvailableYearsList] = useState<number[]>([]);

  // Filters
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  // Рабочие дни из таблицы (с fallback на Пн-Пт)

  // Reports data
  const [monthReports, setMonthReports] = useState<MonthProcessItem[]>([]);
  const [monthProcedureReports, setMonthProcedureReports] = useState<MonthProcessItem[]>([]);
  const [monthCompanySummaryReports, setMonthCompanySummaryReports] = useState<MonthProcessItem[]>([]);
  const [monthEmployeeReports, setMonthEmployeeReports] = useState<MonthProcessItem[]>([]);
  const [monthDepartmentSummaryReports, setMonthDepartmentSummaryReports] = useState<MonthProcessItem[]>([]);
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthExportingXlsx, setMonthExportingXlsx] = useState(false);
  const [monthRightTab, setMonthRightTab] = useState<MonthRightTab>('company');
  const [error, setError] = useState<string | null>(null);

  // Load distinct years (once on mount)
  const loadAvailableYears = useCallback(async () => {
    try {
      const db = getReportClient();
      const { data, error: yErr } = await db
        .from('v_available_periods_with_stats')
        .select('year')
        .order('year', { ascending: false });
      if (yErr) throw yErr;
      const years = Array.from(new Set<number>((data || []).map((r) => (r as { year: number }).year)));
      setAvailableYearsList(years);
      return years;
    } catch (err: unknown) {
      logger.error('[MonthReportTab] loadAvailableYears failed:', err);
      return [] as number[];
    }
  }, []);

  // Load available periods for selected year only
  const loadMonthPeriods = useCallback(async () => {
    setMonthPeriodsLoading(true);
    setError(null);
    try {
      const db = getReportClient();
      const { data, error: viewError } = await db
        .from('v_available_periods_with_stats')
        .select('year, month, total_tasks, total_hours')
        .eq('year', selectedYear);
      if (viewError) throw viewError;

      type PeriodRow = { year: number; month: number; total_tasks: number; total_hours: number };
      const periods: MonthPeriodItem[] = ((data || []) as PeriodRow[]).map((r) => ({
        key: `${r.year}-${String(r.month).padStart(2, '0')}`,
        year: r.year,
        month: r.month,
        tasksCount: r.total_tasks,
        totalHours: Number(r.total_hours),
      }));

      setMonthPeriods(periods);
    } catch (err: unknown) {
      setError('Ошибка загрузки доступных месяцев');
      logger.error('[MonthReportTab] loadMonthPeriods failed:', err, JSON.stringify(err));
      setMonthPeriods([]);
    } finally {
      setMonthPeriodsLoading(false);
    }
  }, [selectedYear]);

  // Load month reports via server API (1 request instead of 7 to Supabase)
  const loadMonthReports = useCallback(async () => {
    setMonthLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports/month-summary?year=${selectedYear}&month=${selectedMonth}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setMonthReports(data.processes || []);
      setMonthProcedureReports(data.procedures || []);
      setMonthCompanySummaryReports(data.companies || []);
      setMonthEmployeeReports(data.employees || []);
      setMonthDepartmentSummaryReports(data.departments || []);
    } catch (err: unknown) {
      setError('Ошибка загрузки месячной сводки');
      logger.error('[MonthReportTab] loadMonthReports failed:', err, JSON.stringify(err));
      setMonthReports([]);
      setMonthProcedureReports([]);
      setMonthCompanySummaryReports([]);
      setMonthEmployeeReports([]);
      setMonthDepartmentSummaryReports([]);
    } finally {
      setMonthLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  // Load years once on mount; if current year has no data, jump to most recent
  useEffect(() => {
    loadAvailableYears().then((years) => {
      if (years.length > 0 && !years.includes(selectedYear)) {
        setSelectedYear(years[0]);
      }
    });
  }, [loadAvailableYears]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadMonthPeriods(); }, [loadMonthPeriods]);
  useEffect(() => { loadMonthReports(); }, [loadMonthReports]);

  // Auto-select month when periods change
  useEffect(() => {
    if (monthPeriods.length === 0) return;
    const hasSelected = monthPeriods.some((p) => p.month === selectedMonth);
    if (!hasSelected) {
      setSelectedMonth(monthPeriods[0].month);
    }
  }, [monthPeriods, selectedMonth]);

  // Periods for selected year, sorted desc
  const filteredPeriods = useMemo(
    () => monthPeriods.slice().sort((a, b) => b.month - a.month),
    [monthPeriods]
  );

  const hasPrevYear = availableYearsList.some((y) => y < selectedYear);
  const hasNextYear = availableYearsList.some((y) => y > selectedYear);

  const goPrevYear = () => {
    const prev = availableYearsList.filter((y) => y < selectedYear).sort((a, b) => b - a)[0];
    if (prev !== undefined) setSelectedYear(prev);
  };

  const goNextYear = () => {
    const next = availableYearsList.filter((y) => y > selectedYear).sort((a, b) => a - b)[0];
    if (next !== undefined) setSelectedYear(next);
  };


  // XLSX export
  const handleExportMonthXlsx = useCallback(async () => {
    const monthTableRows = monthRightTab === 'process'
      ? monthReports
      : monthRightTab === 'procedure'
        ? monthProcedureReports
        : monthRightTab === 'company'
          ? monthCompanySummaryReports
          : monthRightTab === 'employee'
            ? monthEmployeeReports
            : monthDepartmentSummaryReports;

    if (!monthTableRows.length) return;

    const showScopeColumn = monthRightTab === 'process' || monthRightTab === 'procedure' || monthRightTab === 'employee';
    const isDeptTab = monthRightTab === 'department';
    const mainHeader = monthRightTab === 'process' ? 'Процесс'
      : monthRightTab === 'procedure' ? 'Процедура'
        : monthRightTab === 'employee' ? 'Сотрудник'
          : monthRightTab === 'department' ? 'Отдел'
            : 'Предприятие';

    setMonthExportingXlsx(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Сводная');

      ws.addRow(['Сводная']);
      ws.addRow([`${MONTH_NAMES_RU[selectedMonth - 1]} ${selectedYear}`]);
      ws.addRow([]);

      const header = isDeptTab
        ? ['№', mainHeader, 'Сотрудники', '% ємн.', 'Задачи', 'Часы', 'Статус']
        : showScopeColumn
          ? ['№', mainHeader, 'Отдел', 'Задачи', 'Часы', 'Статус']
          : ['№', mainHeader, 'Задачи', 'Часы', 'Статус'];
      ws.addRow(header);

      monthTableRows.forEach((row, idx) => {
        const active = safeNumber(row.activeCount);
        const completed = safeNumber(row.completedCount);
        const statusText = active > 0 && completed > 0
          ? `${active}/${completed}`
          : active > 0 ? String(active)
            : completed > 0 ? String(completed)
              : '0';
        const mainValue = monthRightTab === 'company' || monthRightTab === 'department' ? row.scopeName : row.processName;
        const empCount = row.employeesCount ?? 0;
        const capPct = row.capacityHours ? Math.round(row.totalHours / row.capacityHours * 100) : 0;
        const rowData = isDeptTab
          ? [idx + 1, mainValue, empCount, `${capPct}%`, safeNumber(row.tasksCount), Number(safeNumber(row.totalHours).toFixed(2)), statusText]
          : showScopeColumn
            ? [idx + 1, mainValue, row.scopeName, safeNumber(row.tasksCount), Number(safeNumber(row.totalHours).toFixed(2)), statusText]
            : [idx + 1, mainValue, safeNumber(row.tasksCount), Number(safeNumber(row.totalHours).toFixed(2)), statusText];
        ws.addRow(rowData);
      });

      const totalTasks = monthTableRows.reduce((sum, row) => sum + safeNumber(row.tasksCount), 0);
      const totalHours = Number(monthTableRows.reduce((sum, row) => sum + safeNumber(row.totalHours), 0).toFixed(2));
      if (isDeptTab) {
        const totalEmps = monthTableRows.reduce((s, r) => s + (r.employeesCount ?? 0), 0);
        const totalCap = monthTableRows.reduce((s, r) => s + (r.capacityHours ?? 0), 0);
        const totalCapPct = totalCap ? `${Math.round(totalHours / totalCap * 100)}%` : '—';
        ws.addRow(['Итого', '', totalEmps, totalCapPct, totalTasks, totalHours, '']);
      } else {
        ws.addRow(showScopeColumn ? ['Итого', '', '', totalTasks, totalHours, ''] : ['Итого', '', totalTasks, totalHours, '']);
      }

      const headerRowIdx = 4;
      const totalRowIdx = ws.rowCount;
      ws.getRow(1).font = { bold: true, size: 14 };
      ws.getRow(2).font = { size: 11, color: { argb: 'FF64748B' } };
      ws.getRow(headerRowIdx).font = { bold: true };
      ws.getRow(totalRowIdx).font = { bold: true };

      ws.columns = isDeptTab
        ? [{ width: 6 }, { width: 40 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }]
        : showScopeColumn
          ? [{ width: 6 }, { width: 44 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 12 }]
          : [{ width: 6 }, { width: 44 }, { width: 12 }, { width: 12 }, { width: 12 }];

      const hoursCol = isDeptTab ? 6 : showScopeColumn ? 5 : 4;
      for (let i = headerRowIdx + 1; i <= totalRowIdx; i += 1) {
        ws.getRow(i).getCell(hoursCol).numFmt = '0.00';
        if (isDeptTab) ws.getRow(i).getCell(4).numFmt = '0.00';
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const modeName = monthRightTab === 'process' ? 'processes'
        : monthRightTab === 'procedure' ? 'procedures'
          : monthRightTab === 'company' ? 'companies'
            : monthRightTab === 'employee' ? 'employees'
              : 'departments';
      a.download = `report_${modeName}_${selectedMonth}_${selectedYear}(${getTimestamp()}).xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error('[reports] Ошибка экспорта месячной сводной в XLSX:', err);
      toast.error('Не удалось сформировать XLSX');
    } finally {
      setMonthExportingXlsx(false);
    }
  }, [monthRightTab, monthReports, monthProcedureReports, monthCompanySummaryReports, monthEmployeeReports, monthDepartmentSummaryReports, selectedMonth, selectedYear]);

  // --- Render ---

  const monthTableRows = monthRightTab === 'process'
    ? monthReports
    : monthRightTab === 'procedure'
      ? monthProcedureReports
      : monthRightTab === 'company'
        ? monthCompanySummaryReports
        : monthRightTab === 'employee'
          ? monthEmployeeReports
          : monthDepartmentSummaryReports;
  const showScopeColumn = monthRightTab === 'process' || monthRightTab === 'procedure' || monthRightTab === 'employee';
  const isDepartmentTab = monthRightTab === 'department';

  const leftPanel = (
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
        {monthPeriodsLoading ? (
          <div className="flex justify-center items-center py-10"><Spinner /></div>
        ) : monthPeriods.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 rounded-lg">
            <CalendarDays className="w-12 h-12 mx-auto text-slate-300 mb-3" aria-hidden="true" />
            <p className="text-slate-500">Нет периодов с задачами</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredPeriods.map((period) => {
              const isSelected = period.year === selectedYear && period.month === selectedMonth;
              return (
                <ReferenceListItem
                  key={period.key}
                  tone="purple"
                  isSelected={isSelected}
                  onClick={() => { setSelectedYear(period.year); setSelectedMonth(period.month); if (isMobile) setIsDrawerOpen(true); }}
                  ariaLabel={`Выбрать период ${MONTH_NAMES_RU[period.month - 1]} ${period.year}`}
                  className="px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-slate-700">{MONTH_NAMES_RU[period.month - 1]}</div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{safeNumber(period.tasksCount)} задач</span>
                      <span>{formatHours(safeNumber(period.totalHours))}</span>
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

  const rightPanel = (
    <MonthReportTable
      monthLoading={monthLoading}
      monthTableRows={monthTableRows}
      monthRightTab={monthRightTab}
      selectedMonth={selectedMonth}
      selectedYear={selectedYear}
      showScopeColumn={showScopeColumn}
      isDepartmentTab={isDepartmentTab}
      monthExportingXlsx={monthExportingXlsx}
      onExportXlsx={handleExportMonthXlsx}
      onSetRightTab={setMonthRightTab}
    />
  );

  return (
    <>
      <TwoPanelLayout
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        isDrawerOpen={isDrawerOpen}
        onDrawerClose={() => setIsDrawerOpen(false)}
        rightPanelClassName="bg-white/20"
      />
      {isMobile && (
        <MobileDetailsFab onClick={() => setIsDrawerOpen(true)} />
      )}
    </>
  );
}
