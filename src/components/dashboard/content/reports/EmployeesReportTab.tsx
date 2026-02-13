'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';

import {
  getAvailableEmployeeReports,
  getEmployeeReportData,
  type EmployeeReportData,
  type MonthlyReportListItem,
  formatPeriod,
  formatHours,
} from '@/lib/services/monthly-report.service';
import { Users, Download } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import logger from '@/lib/logger';
import { useIsMobile } from '@/hooks/useMediaQuery';
import {
  TwoPanelLayout,
  GradientDetailCard,
  GroupHeader,
  ReferenceListItem,
  reportTableStyles,
  reportTableRowClass,
  reportActionButtonClass,
  MobileDetailsFab,
} from '../shared';
import { generateReportFile } from './report-utils';

interface EmployeesReportTabProps {
  tabsSlot: React.ReactNode;
}

export default function EmployeesReportTab({ tabsSlot }: EmployeesReportTabProps) {
  const isMobile = useIsMobile();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Data
  const [employeeReports, setEmployeeReports] = useState<MonthlyReportListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const years = useMemo(() => Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i), []);

  // Selection
  const [selectedReportKey, setSelectedReportKey] = useState<string | null>(null);
  const [detailByKey, setDetailByKey] = useState<Record<string, EmployeeReportData>>({});
  const [selectedDetail, setSelectedDetail] = useState<EmployeeReportData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Report generation
  const [generating, setGenerating] = useState<string | null>(null);

  const getItemKey = (r: MonthlyReportListItem) =>
    `${r.user_id || 'none'}-${r.period_year}-${r.period_month}`;
  const getGroupKey = (r: MonthlyReportListItem) => r.user_id || r.full_name || 'none';

  // Load list
  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAvailableEmployeeReports(selectedYear);
      setEmployeeReports(data);
    } catch (err: unknown) {
      setError('Ошибка загрузки отчетов по сотрудникам');
      logger.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

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

  // Group by employee
  const groupedReports = useMemo(() => {
    const groups = new Map<string, { key: string; userId: string | null; fullName: string; reports: MonthlyReportListItem[] }>();
    for (const report of employeeReports) {
      const gk = getGroupKey(report);
      if (!groups.has(gk)) {
        groups.set(gk, { key: gk, userId: report.user_id || null, fullName: report.full_name || 'Без имени', reports: [] });
      }
      groups.get(gk)!.reports.push(report);
    }
    const result = Array.from(groups.values());
    for (const group of result) {
      group.reports.sort((a, b) => a.period_year !== b.period_year ? b.period_year - a.period_year : b.period_month - a.period_month);
    }
    return result;
  }, [employeeReports]);

  // Expand selected group
  useEffect(() => {
    if (!selectedItem) return;
    const gk = getGroupKey(selectedItem);
    setExpandedGroups((prev) => ({ ...prev, [gk]: true }));
  }, [selectedItem]);

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
  const handleGenerate = useCallback(async (userId: string, fullName: string, year: number, month: number) => {
    const key = `employee-${userId}`;
    setGenerating(key);
    try {
      await generateReportFile('employee', userId, fullName, 'pdf', year, month);
    } catch (err: unknown) {
      logger.error('Ошибка генерации отчета:', err);
      alert(err instanceof Error ? err.message : 'Ошибка генерации отчета');
    } finally {
      setGenerating(null);
    }
  }, []);

  // --- Render ---

  const leftPanel = (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0">{tabsSlot}</div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 sm:p-2">
        {isMobile && (
          <div className="mb-3 bg-white rounded-xl border border-slate-200 p-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Год</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                aria-label="Выбрать год"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-10"><Spinner /></div>
        ) : employeeReports.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-lg">
            <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" aria-hidden="true" />
            <p className="text-gray-500">Нет данных для отчетов за {selectedYear} год</p>
            <p className="text-sm text-gray-400 mt-1">Попробуйте выбрать другой год</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {groupedReports.map((group) => {
              const isExpanded = expandedGroups[group.key] ?? false;
              return (
                <div key={group.key} className="rounded-xl border border-slate-200/80 bg-white/90 overflow-hidden">
                  <div className="p-2">
                    <GroupHeader
                      tone="emerald"
                      title={group.fullName}
                      count={group.reports.length}
                      showCount={false}
                      expanded={isExpanded}
                      onToggle={() => setExpandedGroups((prev) => ({ ...prev, [group.key]: !isExpanded }))}
                      toggleAriaLabel={`${isExpanded ? 'Свернуть' : 'Развернуть'} периоды отчетов сотрудника ${group.fullName}`}
                    />
                  </div>
                  {isExpanded && (
                    <div className="px-2 pb-2 space-y-1 border-t border-slate-100 bg-slate-50/70">
                      {group.reports.map((report) => {
                        const rk = getItemKey(report);
                        const isSelected = selectedReportKey === rk;
                        return (
                          <ReferenceListItem
                            key={rk}
                            tone="emerald"
                            isSelected={isSelected}
                            onClick={() => { setSelectedReportKey(rk); if (isMobile) setIsDrawerOpen(true); }}
                            ariaLabel={`Выбрать отчет ${formatPeriod(report.period_year, report.period_month)} сотрудника ${group.fullName}`}
                            className="px-2.5 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium text-slate-700">{formatPeriod(report.period_year, report.period_month)}</div>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
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

    if (!selectedItem) {
      return (
        <div className="h-full flex flex-col">
          <div className="max-w-2xl space-y-5 p-4 sm:p-6 lg:p-8 flex-shrink-0">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Год</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  aria-label="Выбрать год"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center text-slate-400">
            Выбери сотрудника слева
          </div>
        </div>
      );
    }

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
              <div className="p-8 text-sm text-slate-500 text-center">Нет задач за выбранный период</div>
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
        resizerClassName="hover:bg-emerald-300/50 active:bg-emerald-400/50"
      />
      {isMobile && (
        <MobileDetailsFab onClick={() => setIsDrawerOpen(true)} tone="emerald" />
      )}
    </>
  );
}
