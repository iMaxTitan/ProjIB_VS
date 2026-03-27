'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import {
  getAvailableEmployeeReports,
  getEmployeeReportData,
  type EmployeeReportData,
  type MonthlyReportListItem,
  formatPeriod,
  formatHours,
} from '@/lib/ops';
import { Users, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Spinner } from '@/components/ui/Spinner';
import logger from '@/lib/shared/logger';
import { useIsMobile } from '@/hooks/useMediaQuery';
import {
  TwoPanelLayout,
  GradientDetailCard,
  ReferenceListItem,
  reportTableStyles,
  reportTableRowClass,
  reportActionButtonClass,
  MobileDetailsFab,
} from '../shared';
import { generateReportFile } from './report-utils';
import EmptyState from '@/components/ui/EmptyState';

const MONTHS_UA = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

interface MonthNavProps {
  year: number;
  month: number;
  isCurrentMonth: boolean;
  onPrev: () => void;
  onNext: () => void;
}

function MonthNav({ year, month, isCurrentMonth, onPrev, onNext }: MonthNavProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-white/40">
      <button
        onClick={onPrev}
        aria-label="Попередній місяць"
        className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="text-sm font-semibold text-slate-700 select-none">
        {MONTHS_UA[month - 1]} {year}
      </span>
      <button
        onClick={onNext}
        disabled={isCurrentMonth}
        aria-label="Наступний місяць"
        className={cn(
          'p-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500',
          isCurrentMonth ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-slate-800 hover:bg-white/60',
        )}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

interface EmployeesReportTabProps {
  tabsSlot: React.ReactNode;
}

export default function EmployeesReportTab({ tabsSlot }: EmployeesReportTabProps) {
  const isMobile = useIsMobile();
  const today = new Date();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Data
  const [employeeReports, setEmployeeReports] = useState<MonthlyReportListItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Month/year navigation
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  // Selection
  const [selectedReportKey, setSelectedReportKey] = useState<string | null>(null);
  const [detailByKey, setDetailByKey] = useState<Record<string, EmployeeReportData>>({});
  const [selectedDetail, setSelectedDetail] = useState<EmployeeReportData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Report generation
  const [generating, setGenerating] = useState<string | null>(null);

  const getItemKey = (r: MonthlyReportListItem) =>
    `${r.user_id || 'none'}-${r.period_year}-${r.period_month}`;

  const prevMonth = () => {
    setSelectedReportKey(null);
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (isCurrentMonth) return;
    setSelectedReportKey(null);
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Load reports for selected month only
  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAvailableEmployeeReports(year, month);
      setEmployeeReports(data);
    } catch (err: unknown) {
      logger.error(err);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { loadReports(); }, [loadReports]);

  // Auto-select first
  useEffect(() => {
    if (employeeReports.length === 0) { setSelectedReportKey(null); return; }
    const hasSelected = selectedReportKey
      ? employeeReports.some((r) => getItemKey(r) === selectedReportKey)
      : false;
    if (!hasSelected) setSelectedReportKey(getItemKey(employeeReports[0]));
  }, [employeeReports, selectedReportKey]);

  const selectedItem = useMemo(
    () => employeeReports.find((r) => getItemKey(r) === selectedReportKey) ?? null,
    [employeeReports, selectedReportKey]
  );

  // Load detail
  useEffect(() => {
    if (!selectedItem?.user_id || !selectedReportKey) { setSelectedDetail(null); return; }
    const cached = detailByKey[selectedReportKey];
    if (cached) { setSelectedDetail(cached); return; }

    let cancelled = false;
    setDetailLoading(true);
    getEmployeeReportData(selectedItem.user_id, selectedItem.period_year, selectedItem.period_month)
      .then((data) => {
        if (cancelled || !data) return;
        setDetailByKey((prev) => ({ ...prev, [selectedReportKey]: data }));
        setSelectedDetail(data);
      })
      .catch((err: unknown) => {
        logger.error('[reports] Ошибка загрузки деталей отчета по сотруднику:', err);
        if (!cancelled) setSelectedDetail(null);
      })
      .finally(() => { if (!cancelled) setDetailLoading(false); });

    return () => { cancelled = true; };
  }, [selectedItem, selectedReportKey, detailByKey]);

  // PDF generation
  const handleGenerate = useCallback(async (userId: string, fullName: string, y: number, m: number) => {
    const key = `employee-${userId}`;
    setGenerating(key);
    try {
      await generateReportFile('employee', userId, fullName, 'pdf', y, m);
    } catch (err: unknown) {
      logger.error('Ошибка генерации отчета:', err);
      toast.error(err instanceof Error ? err.message : 'Ошибка генерации отчета');
    } finally {
      setGenerating(null);
    }
  }, []);

  // --- Render ---

  const leftPanel = (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0">
        {tabsSlot}
        <MonthNav
          year={year}
          month={month}
          isCurrentMonth={isCurrentMonth}
          onPrev={prevMonth}
          onNext={nextMonth}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 sm:p-2">
        {loading ? (
          <div className="flex justify-center items-center py-10"><Spinner /></div>
        ) : employeeReports.length === 0 ? (
          <EmptyState
            icon={<Users className="w-12 h-12" aria-hidden="true" />}
            title={`Нет данных за ${MONTHS_UA[month - 1]} ${year}`}
            className="py-10 bg-slate-50 rounded-lg"
          />
        ) : (
          <div className="space-y-1">
            {employeeReports.map((report) => {
              const rk = getItemKey(report);
              const isSelected = selectedReportKey === rk;
              return (
                <ReferenceListItem
                  key={rk}
                  tone="emerald"
                  isSelected={isSelected}
                  onClick={() => { setSelectedReportKey(rk); if (isMobile) setIsDrawerOpen(true); }}
                  ariaLabel={`Вибрати звіт ${report.full_name}`}
                  className="px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Users className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" aria-hidden="true" />
                      <div className="min-w-0">
                        <span className={cn('text-sm font-medium truncate block', isSelected ? 'text-emerald-900' : 'text-slate-700')}>
                          {report.full_name || '—'}
                        </span>
                        {report.department_name && (
                          <span className="text-xs text-slate-400 truncate block">{report.department_name}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 flex-shrink-0">
                      <span>{report.tasks_count} задач</span>
                      <span>{formatHours(report.total_hours)}</span>
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

  const rightPanel = (() => {
    if (loading) return (
      <div className="h-full min-h-0 overflow-auto">
        <GradientDetailCard
          modeLabel="Загрузка..."
          isEditing={false}
          canEdit={false}
          gradientClassName="from-emerald-500 to-teal-500"
          cardClassName="max-w-none w-full"
          bodyClassName="flex justify-center py-10"
        >
          <Spinner />
        </GradientDetailCard>
      </div>
    );

    if (!selectedItem) return (
      <EmptyState title="Выбери сотрудника слева" variant="centered" />
    );

    if (detailLoading) return (
      <div className="h-full min-h-0 overflow-auto">
        <GradientDetailCard
          modeLabel="Загрузка..."
          isEditing={false}
          canEdit={false}
          gradientClassName="from-emerald-500 to-teal-500"
          cardClassName="max-w-none w-full"
          bodyClassName="flex justify-center py-10"
        >
          <Spinner />
        </GradientDetailCard>
      </div>
    );

    const employeeGenKey = `employee-${selectedItem.user_id}`;
    const isGenerating = generating === employeeGenKey;

    return (
      <div className="h-full min-h-0 overflow-auto">
        <GradientDetailCard
          modeLabel="Просмотр"
          isEditing={false}
          canEdit={false}
          gradientClassName="from-emerald-500 to-teal-500"
          cardClassName="max-w-none w-full"
          bodyClassName="space-y-4"
          headerContent={
            <div className="min-w-0 flex items-center gap-3">
              <Users className="w-5 h-5 opacity-90" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-bold text-lg leading-tight">{selectedItem.full_name}</div>
                <div className="text-xs text-white/80">
                  {selectedItem.department_name ? `${selectedItem.department_name} · ` : ''}
                  {formatPeriod(selectedItem.period_year, selectedItem.period_month)}
                </div>
              </div>
            </div>
          }
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-700 font-semibold">
              {formatHours(selectedItem.total_hours)} / {selectedItem.tasks_count} задач
            </div>
            <button
              type="button"
              onClick={() => handleGenerate(selectedItem.user_id!, selectedItem.full_name!, selectedItem.period_year, selectedItem.period_month)}
              disabled={isGenerating}
              aria-label="Завантажити звіт PDF"
              className={reportActionButtonClass('pdf')}
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                  <span>Генерация...</span>
                </>
              ) : (
                <>
                  <Download aria-hidden="true" className="w-4 h-4" />
                  <span>PDF</span>
                </>
              )}
            </button>
          </div>

          <div className={reportTableStyles.frame}>
            {selectedDetail?.tasks?.length ? (
              <div className={reportTableStyles.scroll}>
                <table className={reportTableStyles.table}>
                  <colgroup>
                    <col style={{ width: '32px' }} />
                    <col style={{ width: 'calc((100% - 32px - 90px - 90px) / 2)' }} />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: 'calc((100% - 32px - 90px - 90px) / 2)' }} />
                  </colgroup>
                  <thead className={reportTableStyles.thead}>
                    <tr className={reportTableStyles.headerRow}>
                      <th className="text-left px-1.5 py-1.5 border-r border-slate-200/80 font-semibold">№</th>
                      <th className="text-left px-1.5 py-1.5 border-r border-slate-200/80 font-semibold">Задача</th>
                      <th className="text-center px-1.5 py-1.5 border-r border-slate-200/80 font-semibold">Часы</th>
                      <th className="text-center px-1.5 py-1.5 border-r border-slate-200/80 font-semibold">Дата</th>
                      <th className="text-left px-1.5 py-1.5 font-semibold">Предприятие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDetail.tasks.map((task, idx) => (
                      <tr key={task.task_id} className={reportTableRowClass(idx)}>
                        <td className="px-1.5 py-1.5 text-slate-500 border-r border-slate-100">{idx + 1}</td>
                        <td className="px-1.5 py-1.5 text-slate-800 leading-snug border-r border-slate-100">{task.description || '—'}</td>
                        <td className="px-1.5 py-1.5 text-slate-700 text-center border-r border-slate-100">{task.spent_hours || 0}</td>
                        <td className="px-1.5 py-1.5 text-slate-700 text-center border-r border-slate-100">{task.completed_at || '—'}</td>
                        <td className="px-1.5 py-1.5 text-slate-700 leading-snug">
                          {task.company_names?.length ? task.company_names.join(', ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Нет задач за выбранный период" className="p-8" />
            )}
          </div>
        </GradientDetailCard>
      </div>
    );
  })();

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
        <MobileDetailsFab onClick={() => setIsDrawerOpen(true)} tone="emerald" />
      )}
    </>
  );
}
