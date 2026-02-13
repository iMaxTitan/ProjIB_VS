'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';

import {
  getAvailableCompanyReports,
  getCompanyReportData,
  type CompanyReportData,
  type MonthlyReportListItem,
  formatPeriod,
  formatHours,
} from '@/lib/services/monthly-report.service';
import { Building2, Download, Sparkles } from 'lucide-react';
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
import { generateReportFile, MONTH_NAMES_RU } from './report-utils';

interface CompaniesReportTabProps {
  tabsSlot: React.ReactNode;
}

export default function CompaniesReportTab({ tabsSlot }: CompaniesReportTabProps) {
  const isMobile = useIsMobile();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Data
  const [companyReports, setCompanyReports] = useState<MonthlyReportListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const years = useMemo(() => Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i), []);

  // Selection
  const [selectedReportKey, setSelectedReportKey] = useState<string | null>(null);
  const [detailByKey, setDetailByKey] = useState<Record<string, CompanyReportData>>({});
  const [selectedDetail, setSelectedDetail] = useState<CompanyReportData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Report generation
  const [generating, setGenerating] = useState<string | null>(null);
  const [companyNotesLoading, setCompanyNotesLoading] = useState(false);
  const [animatingMeasureIds, setAnimatingMeasureIds] = useState<Set<string>>(new Set());

  const getItemKey = (r: MonthlyReportListItem) =>
    `${r.company_id || 'none'}-${r.period_year}-${r.period_month}`;
  const getGroupKey = (r: MonthlyReportListItem) => r.company_id || r.company_name || 'none';

  // Load list
  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAvailableCompanyReports(selectedYear);
      setCompanyReports(data);
    } catch (err: unknown) {
      setError('Ошибка загрузки отчетов по предприятиям');
      logger.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => { loadReports(); }, [loadReports]);

  // Auto-select first
  useEffect(() => {
    if (companyReports.length === 0) { setSelectedReportKey(null); return; }
    const hasSelected = selectedReportKey
      ? companyReports.some((r) => getItemKey(r) === selectedReportKey)
      : false;
    if (!hasSelected) setSelectedReportKey(getItemKey(companyReports[0]));
  }, [companyReports, selectedReportKey]);

  const selectedItem = useMemo(
    () => companyReports.find((r) => getItemKey(r) === selectedReportKey) ?? null,
    [companyReports, selectedReportKey]
  );

  // Group by company
  const groupedReports = useMemo(() => {
    const groups = new Map<string, { key: string; companyId: string | null; companyName: string; reports: MonthlyReportListItem[] }>();
    for (const report of companyReports) {
      const gk = getGroupKey(report);
      if (!groups.has(gk)) {
        groups.set(gk, { key: gk, companyId: report.company_id || null, companyName: report.company_name || 'Без названия', reports: [] });
      }
      groups.get(gk)!.reports.push(report);
    }
    const result = Array.from(groups.values());
    for (const group of result) {
      group.reports.sort((a, b) => a.period_year !== b.period_year ? b.period_year - a.period_year : b.period_month - a.period_month);
    }
    return result;
  }, [companyReports]);

  // Expand selected group
  useEffect(() => {
    if (!selectedItem) return;
    const gk = getGroupKey(selectedItem);
    setExpandedGroups((prev) => ({ ...prev, [gk]: true }));
  }, [selectedItem]);

  // Load detail
  useEffect(() => {
    if (!selectedItem?.company_id || !selectedReportKey) { setSelectedDetail(null); return; }
    const cached = detailByKey[selectedReportKey];
    if (cached) { setSelectedDetail(cached); return; }

    let cancelled = false;
    setDetailLoading(true);
    getCompanyReportData(selectedItem.company_id, selectedItem.period_year, selectedItem.period_month)
      .then((data) => {
        if (cancelled || !data) return;
        setDetailByKey((prev) => ({ ...prev, [selectedReportKey]: data }));
        setSelectedDetail(data);
      })
      .catch((err: unknown) => {
        logger.error('[reports] Ошибка загрузки деталей отчета по предприятию:', err);
        if (!cancelled) setSelectedDetail(null);
      })
      .finally(() => { if (!cancelled) setDetailLoading(false); });

    return () => { cancelled = true; };
  }, [selectedItem, selectedReportKey, detailByKey]);

  // PDF generation
  const handleGenerate = useCallback(async (companyId: string, companyName: string, year: number, month: number) => {
    const key = `company-${companyId}`;
    setGenerating(key);
    try {
      await generateReportFile('company', companyId, companyName, 'pdf', year, month);
    } catch (err: unknown) {
      logger.error('Ошибка генерации отчета:', err);
      alert(err instanceof Error ? err.message : 'Ошибка генерации отчета');
    } finally {
      setGenerating(null);
    }
  }, []);

  // AI notes
  const generateCompanyNotes = useCallback(async (companyId: string, measureIds: string[], year: number, month: number) => {
    if (measureIds.length === 0) return;
    setCompanyNotesLoading(true);
    try {
      const response = await fetch('/api/reports/company-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, measure_ids: measureIds, year, month }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Помилка генерації');
      }
      const data = await response.json();
      const entries = Object.entries(data.notes as Record<string, string>);

      for (let i = 0; i < entries.length; i++) {
        const [mId, noteText] = entries[i];
        setTimeout(() => {
          setSelectedDetail(prev => {
            if (!prev) return prev;
            return { ...prev, measures: prev.measures.map(m => m.measure_id === mId ? { ...m, note: noteText } : m) };
          });
          setAnimatingMeasureIds(prev => new Set(prev).add(mId));
          setTimeout(() => {
            setAnimatingMeasureIds(prev => { const next = new Set(prev); next.delete(mId); return next; });
          }, 600);
        }, i * 150);
      }
    } catch (err: unknown) {
      logger.error('Ошибка генерации AI примечаний для предприятия:', err);
      alert(err instanceof Error ? err.message : 'Помилка генерації AI приміток');
    } finally {
      setCompanyNotesLoading(false);
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
        ) : companyReports.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-lg">
            <Building2 className="w-12 h-12 mx-auto text-gray-300 mb-3" aria-hidden="true" />
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
                      tone="blue"
                      title={group.companyName}
                      count={group.reports.length}
                      showCount={false}
                      expanded={isExpanded}
                      onToggle={() => setExpandedGroups((prev) => ({ ...prev, [group.key]: !isExpanded }))}
                      toggleAriaLabel={`${isExpanded ? 'Свернуть' : 'Развернуть'} периоды отчетов предприятия ${group.companyName}`}
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
                            tone="blue"
                            isSelected={isSelected}
                            onClick={() => { setSelectedReportKey(rk); if (isMobile) setIsDrawerOpen(true); }}
                            ariaLabel={`Выбрать отчет ${formatPeriod(report.period_year, report.period_month)} предприятия ${group.companyName}`}
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
          gradientClassName="from-blue-500 to-indigo-500"
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
            Выбери предприятие слева
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
          gradientClassName="from-blue-500 to-indigo-500"
          cardClassName="max-w-none w-full"
          bodyClassName="flex justify-center py-10"
        >
          <Spinner />
        </GradientDetailCard>
      </div>
    );

    const companyGenKey = `company-${selectedItem.company_id}`;
    const isGenerating = generating === companyGenKey;

    return (
      <div className="h-full min-h-0 overflow-auto">
        <GradientDetailCard
          modeLabel="Просмотр"
          isEditing={false}
          canEdit={false}
          gradientClassName="from-blue-500 to-indigo-500"
          cardClassName="max-w-none w-full"
          bodyClassName="space-y-4"
          headerContent={
            <div className="min-w-0 flex items-center gap-3">
              <Building2 className="w-5 h-5 opacity-90" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-bold text-lg leading-tight">{selectedItem.company_name}</div>
                <div className="text-xs text-white/80">{formatPeriod(selectedItem.period_year, selectedItem.period_month)}</div>
              </div>
            </div>
          }
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-700 font-semibold">
              {formatHours(selectedItem.total_hours)} / {selectedItem.tasks_count} задач
            </div>
            <div className="flex items-center gap-2">
              {selectedDetail?.measures?.length ? (
                <button
                  type="button"
                  onClick={() => {
                    const ids = selectedDetail.measures.map(m => m.measure_id);
                    generateCompanyNotes(selectedItem.company_id!, ids, selectedItem.period_year, selectedItem.period_month);
                  }}
                  disabled={companyNotesLoading}
                  aria-label="Згенерувати AI примітки для підприємства"
                  className={reportActionButtonClass('ai')}
                >
                  {companyNotesLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                      <span>Генерація...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles aria-hidden="true" className="w-4 h-4" />
                      <span>AI</span>
                    </>
                  )}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => handleGenerate(selectedItem.company_id!, selectedItem.company_name!, selectedItem.period_year, selectedItem.period_month)}
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
          </div>

          <div className={reportTableStyles.frame}>
            {selectedDetail?.measures?.length ? (
              <div className={reportTableStyles.scroll}>
                <table className={reportTableStyles.table}>
                  <colgroup>
                    <col style={{ width: '32px' }} />
                    <col />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '56px' }} />
                    <col style={{ width: '72px' }} />
                    <col />
                  </colgroup>
                  <thead className={reportTableStyles.thead}>
                    <tr className={reportTableStyles.headerRow}>
                      <th className="text-left px-1.5 py-1.5 border-r border-slate-200/80 font-semibold">№</th>
                      <th className="text-left px-1.5 py-1.5 border-r border-slate-200/80 font-semibold">Найменування робіт</th>
                      <th className="text-left px-1.5 py-1.5 border-r border-slate-200/80 font-semibold">Відповідальні виконавці</th>
                      <th className="text-center px-1 py-1.5 border-r border-slate-200/80 font-semibold">Співроб.</th>
                      <th className="text-center px-1 py-1.5 border-r border-slate-200/80 font-semibold">Трудовитр.</th>
                      <th className="text-left px-1.5 py-1.5 font-semibold">Інформація про виконання</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDetail.measures.map((m, idx) => (
                      <tr key={m.measure_id} className={reportTableRowClass(idx)}>
                        <td className="px-1.5 py-1.5 text-slate-500 border-r border-slate-100">{idx + 1}</td>
                        <td className="px-1.5 py-1.5 text-slate-800 leading-snug border-r border-slate-100">{m.measure_name || '—'}</td>
                        <td className="px-1.5 py-1.5 text-slate-700 leading-snug border-r border-slate-100">{m.responsible_executors || '—'}</td>
                        <td className="px-1 py-1.5 text-slate-700 text-center border-r border-slate-100">{m.employees_count}</td>
                        <td className="px-1 py-1.5 text-slate-700 text-center border-r border-slate-100">{m.hours.toFixed(2)}</td>
                        <td className={`px-1.5 py-1.5 leading-snug transition-colors duration-500 ${animatingMeasureIds.has(m.measure_id) ? 'bg-indigo-50/60' : ''}`}>
                          {companyNotesLoading && !m.note ? (
                            <span className="text-slate-400 italic inline-flex items-center gap-1">
                              <div className="w-3 h-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                              Генерація...
                            </span>
                          ) : m.note ? (
                            <span className="text-slate-700">{m.note}</span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Не згенеровано</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-sm text-slate-500 text-center">Немає мероприятий за обраний період</div>
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
        resizerClassName="hover:bg-blue-300/50 active:bg-blue-400/50"
      />
      {isMobile && (
        <MobileDetailsFab onClick={() => setIsDrawerOpen(true)} tone="blue" />
      )}
    </>
  );
}
