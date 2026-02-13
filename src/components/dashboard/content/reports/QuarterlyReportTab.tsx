'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';

import { PlanStatus } from '@/types/planning';
import { getStatusColorClasses } from '@/lib/utils/planning-utils';
import { getQuarterlyReports } from '@/lib/services/report-service';
import { formatHours } from '@/lib/services/monthly-report.service';
import { CalendarDays, Download, Sparkles, ClipboardList, FileText } from 'lucide-react';
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
  reportSegmentedButtonClass,
  reportActionButtonClass,
  MobileDetailsFab,
} from '../shared';
import { generateQuarterlyDocumentFile } from './report-utils';
import type { QuarterlyReportItem, QuarterlyReportGroup } from './types';

type QuarterlyRightTab = 'plan' | 'report';

const quarterRoman: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

interface QuarterlyReportTabProps {
  tabsSlot: React.ReactNode;
}

export default function QuarterlyReportTab({ tabsSlot }: QuarterlyReportTabProps) {
  const isMobile = useIsMobile();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Data
  const [quarterlyReports, setQuarterlyReports] = useState<QuarterlyReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selection
  const [selectedQuarterKey, setSelectedQuarterKey] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<QuarterlyRightTab>('plan');

  // Expand/collapse year groups
  const [expandedYearGroups, setExpandedYearGroups] = useState<Record<number, boolean>>({});

  // Generation
  const [generating, setGenerating] = useState<string | null>(null);
  const [aiNotesLoading, setAiNotesLoading] = useState(false);
  const [animatingNoteIds, setAnimatingNoteIds] = useState<Set<string>>(new Set());

  // Load
  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getQuarterlyReports();
      setQuarterlyReports(data || []);
    } catch (err: unknown) {
      setError('Ошибка загрузки квартальных отчетов');
      logger.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  // Group by year+quarter
  const groupedReports = useMemo<QuarterlyReportGroup[]>(() => {
    const groups = new Map<string, { quarter: number; year: number; plans: QuarterlyReportItem[] }>();
    for (const report of quarterlyReports) {
      if (!report.year) continue;
      const key = `${report.year}-${report.quarter}`;
      if (!groups.has(key)) groups.set(key, { quarter: report.quarter, year: report.year, plans: [] });
      groups.get(key)!.plans.push(report);
    }
    return Array.from(groups.entries())
      .map(([key, group]) => {
        const departments = Array.from(new Set(group.plans.map((p) => p.department_name).filter(Boolean)));
        const plannedHours = group.plans.reduce((sum, p) => sum + (p.planned_hours_total || 0), 0);
        const spentHours = group.plans.reduce((sum, p) => sum + (p.spent_hours_total || 0), 0);
        const completionPercentage = plannedHours > 0 ? Math.min(100, Math.round((spentHours / plannedHours) * 100)) : 0;
        return { key, quarter: group.quarter, year: group.year, plans: group.plans, departments, plannedHours, spentHours, completionPercentage };
      })
      .sort((a, b) => { const yd = b.year - a.year; return yd !== 0 ? yd : b.quarter - a.quarter; });
  }, [quarterlyReports]);

  // Group quarters by year for GroupHeader rendering
  const yearGroups = useMemo(() => {
    const byYear = new Map<number, QuarterlyReportGroup[]>();
    for (const g of groupedReports) {
      if (!byYear.has(g.year)) byYear.set(g.year, []);
      byYear.get(g.year)!.push(g);
    }
    return Array.from(byYear.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, quarters]) => ({ year, quarters }));
  }, [groupedReports]);

  const selectedGroup = useMemo(
    () => groupedReports.find((g) => g.key === selectedQuarterKey) ?? null,
    [groupedReports, selectedQuarterKey]
  );

  // Auto-select first + auto-expand first year
  useEffect(() => {
    if (groupedReports.length === 0) { setSelectedQuarterKey(null); return; }
    if (!selectedQuarterKey || !groupedReports.some((g) => g.key === selectedQuarterKey)) {
      setSelectedQuarterKey(groupedReports[0].key);
      setExpandedYearGroups((prev) => ({ ...prev, [groupedReports[0].year]: true }));
    }
  }, [groupedReports, selectedQuarterKey]);

  // PDF generation
  const handleGenerateDocument = useCallback(async (year: number, quarter: number, docType: 'quarterly_plan' | 'quarterly_report') => {
    const key = `${docType}-${year}-${quarter}`;
    setGenerating(key);
    try {
      await generateQuarterlyDocumentFile(year, quarter, docType);
    } catch (err: unknown) {
      logger.error('Ошибка генерации квартального документа:', err);
      alert(err instanceof Error ? err.message : 'Ошибка генерации PDF');
    } finally {
      setGenerating(null);
    }
  }, []);

  // AI notes
  const generateAINotes = useCallback(async (quarterlyIds: string[]) => {
    if (quarterlyIds.length === 0) return;
    setAiNotesLoading(true);
    try {
      const response = await fetch('/api/reports/quarterly-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarterly_ids: quarterlyIds }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Помилка генерації');
      }
      const data = await response.json();
      const entries = Object.entries(data.notes as Record<string, string>);

      for (let i = 0; i < entries.length; i++) {
        const [qId, noteText] = entries[i];
        setTimeout(() => {
          setQuarterlyReports(prev => prev.map(r => r.quarterly_id === qId ? { ...r, note: noteText } : r));
          setAnimatingNoteIds(prev => new Set(prev).add(qId));
          setTimeout(() => {
            setAnimatingNoteIds(prev => { const next = new Set(prev); next.delete(qId); return next; });
          }, 600);
        }, i * 150);
      }
    } catch (err: unknown) {
      logger.error('Ошибка генерации AI примечаний:', err);
      alert(err instanceof Error ? err.message : 'Помилка генерації AI приміток');
    } finally {
      setAiNotesLoading(false);
    }
  }, []);

  // --- Render ---

  const statusUa: Record<string, string> = {
    completed: 'Виконано',
    active: 'В роботі',
    approved: 'Затверджено',
    failed: 'Не виконано',
    returned: 'Повернено',
    draft: 'Чернетка',
    submitted: 'На розгляді',
  };

  const leftPanel = (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0">{tabsSlot}</div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 sm:p-2">
        {loading ? (
          <div className="flex justify-center items-center py-10"><Spinner /></div>
        ) : groupedReports.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-lg">
            <CalendarDays className="w-12 h-12 mx-auto text-gray-300 mb-3" aria-hidden="true" />
            <p className="text-gray-500">Нет квартальных планов</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {yearGroups.map(({ year, quarters }) => {
              const isExpanded = expandedYearGroups[year] ?? false;
              return (
                <div key={year} className="rounded-xl border border-slate-200/80 bg-white/90 overflow-hidden">
                  <div className="p-2">
                    <GroupHeader
                      tone="purple"
                      title={`${year}`}
                      count={quarters.length}
                      showCount
                      expanded={isExpanded}
                      onToggle={() => setExpandedYearGroups((prev) => ({ ...prev, [year]: !isExpanded }))}
                      toggleAriaLabel={`${isExpanded ? 'Свернуть' : 'Развернуть'} кварталы ${year} года`}
                    />
                  </div>
                  {isExpanded && (
                    <div className="px-2 pb-2 space-y-1 border-t border-slate-100 bg-slate-50/70">
                      {quarters.map((group) => {
                        const isSelected = selectedQuarterKey === group.key;
                        return (
                          <ReferenceListItem
                            key={group.key}
                            tone="purple"
                            isSelected={isSelected}
                            onClick={() => { setSelectedQuarterKey(group.key); if (isMobile) setIsDrawerOpen(true); }}
                            ariaLabel={`Выбрать ${quarterRoman[group.quarter]} квартал ${group.year}`}
                            className="px-2.5 py-2"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-purple-100/80 rounded-lg flex items-center justify-center">
                                  <CalendarDays className="w-4.5 h-4.5 text-purple-600" aria-hidden="true" />
                                </div>
                                <h3 className="font-semibold text-slate-800">{quarterRoman[group.quarter]} квартал</h3>
                              </div>
                              <div className="text-right min-w-[132px]">
                                <div className="text-xs font-semibold text-slate-700">
                                  {formatHours(group.spentHours)} / {formatHours(group.plannedHours)}
                                </div>
                                <div className="w-28 h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
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
          gradientClassName="from-purple-500 to-indigo-500"
          cardClassName="max-w-none w-full"
          bodyClassName="flex justify-center py-10"
        >
          <Spinner />
        </GradientDetailCard>
      </div>
    );

    if (!selectedGroup) {
      return <div className="h-full flex items-center justify-center text-slate-400">Выбери квартал слева</div>;
    }

    const lastMonth = selectedGroup.quarter * 3;
    const deadline = `19.${String(lastMonth).padStart(2, '0')}.${selectedGroup.year}`;
    const selectedDocType = rightTab === 'report' ? 'quarterly_report' : 'quarterly_plan';
    const selectedGenKey = `${selectedDocType}-${selectedGroup.year}-${selectedGroup.quarter}`;
    const isGenerating = generating === selectedGenKey;

    return (
      <div className="h-full min-h-0 overflow-auto">
        <GradientDetailCard
          modeLabel="Просмотр"
          isEditing={false}
          canEdit={false}
          gradientClassName="from-purple-500 to-indigo-500"
          cardClassName="max-w-none w-full"
          bodyClassName="space-y-4"
          headerContent={
            <div className="min-w-0 flex items-center gap-3">
              <CalendarDays className="w-5 h-5 opacity-90" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-bold text-lg leading-tight">{quarterRoman[selectedGroup.quarter]} квартал {selectedGroup.year}</div>
                <div className="text-xs text-white/80">Квартальный блок отчетности</div>
              </div>
            </div>
          }
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-700 font-semibold">
              {formatHours(selectedGroup.spentHours)} / {formatHours(selectedGroup.plannedHours)}
            </div>
            <div className="text-right min-w-[130px]">
              <div className="text-xs font-semibold text-slate-700">{selectedGroup.completionPercentage}%</div>
              <div className="w-28 h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1 ml-auto">
                <div className="h-full bg-gradient-to-r from-purple-400 to-indigo-500 rounded-full" style={{ width: `${selectedGroup.completionPercentage}%` }} />
              </div>
            </div>
          </div>

          <div className={`${reportTableStyles.frame} flex flex-col min-h-[420px]`}>
            <div className="border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-3 bg-slate-50/80">
              <div className={reportTableStyles.segmentedGroup} role="radiogroup" aria-label="Тип квартальной таблицы">
                <button type="button" role="radio" aria-checked={rightTab === 'plan'} aria-label="Показать план" onClick={() => setRightTab('plan')} className={reportSegmentedButtonClass(rightTab === 'plan')}>
                  <ClipboardList aria-hidden="true" className="h-3.5 w-3.5" />План
                </button>
                <button type="button" role="radio" aria-checked={rightTab === 'report'} aria-label="Показать отчет" onClick={() => setRightTab('report')} className={reportSegmentedButtonClass(rightTab === 'report')}>
                  <FileText aria-hidden="true" className="h-3.5 w-3.5" />Отчет
                </button>
              </div>

              <div className="flex items-center gap-2">
                {rightTab === 'report' && (
                  <button
                    type="button"
                    onClick={() => { const ids = selectedGroup.plans.map(p => p.quarterly_id); generateAINotes(ids); }}
                    disabled={aiNotesLoading}
                    aria-label="Згенерувати AI примітки"
                    className={reportActionButtonClass('ai')}
                  >
                    {aiNotesLoading ? (
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
                )}
                <button
                  type="button"
                  onClick={() => handleGenerateDocument(selectedGroup.year, selectedGroup.quarter, selectedDocType)}
                  disabled={isGenerating}
                  aria-label={rightTab === 'report' ? 'Завантажити звіт PDF' : 'Завантажити план PDF'}
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

            <div className={`flex-1 min-h-0 ${reportTableStyles.scroll}`}>
              {rightTab === 'plan' ? (
                <table className={reportTableStyles.table}>
                  <colgroup>
                    <col style={{ width: '32px' }} />
                    <col style={{ width: 'calc((100% - 32px - 72px - 84px) / 2)' }} />
                    <col style={{ width: '72px' }} />
                    <col style={{ width: '84px' }} />
                    <col style={{ width: 'calc((100% - 32px - 72px - 84px) / 2)' }} />
                  </colgroup>
                  <thead className={reportTableStyles.thead}>
                    <tr className={reportTableStyles.headerRow}>
                      <th className="text-left px-1.5 py-1.5 w-8 border-r border-slate-200/80 font-semibold">№</th>
                      <th className="text-left px-1.5 py-1.5 border-r border-slate-200/80 font-semibold">Перелік завдань</th>
                      <th className="text-center px-1 py-1.5 border-r border-slate-200/80 font-semibold">Підрозділ</th>
                      <th className="text-center px-1 py-1.5 border-r border-slate-200/80 font-semibold">Термін</th>
                      <th className="text-left px-1.5 py-1.5 font-semibold">Очікуваний результат</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGroup.plans.map((plan, idx) => (
                      <tr key={plan.quarterly_id} className={reportTableRowClass(idx)}>
                        <td className="px-1.5 py-1.5 text-slate-500 border-r border-slate-100">{idx + 1}</td>
                        <td className="px-1.5 py-1.5 text-slate-800 leading-snug border-r border-slate-100">{plan.goal || 'Нет названия плана'}</td>
                        <td className="px-1 py-1.5 border-r border-slate-100 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColorClasses(plan.status as PlanStatus)}`}>
                            {plan.department_name || '—'}
                          </span>
                        </td>
                        <td className="px-1 py-1.5 text-slate-700 whitespace-nowrap border-r border-slate-100 text-center">{deadline}</td>
                        <td className="px-1.5 py-1.5 text-slate-700 leading-snug">{plan.expected_result || 'Нет ожидаемого результата'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className={reportTableStyles.table}>
                  <colgroup>
                    <col style={{ width: '32px' }} />
                    <col style={{ width: 'calc((100% - 32px - 72px - 84px - 72px) / 2)' }} />
                    <col style={{ width: '72px' }} />
                    <col style={{ width: '84px' }} />
                    <col style={{ width: '72px' }} />
                    <col style={{ width: 'calc((100% - 32px - 72px - 84px - 72px) / 2)' }} />
                  </colgroup>
                  <thead className={reportTableStyles.thead}>
                    <tr className={reportTableStyles.headerRow}>
                      <th className="text-left px-1.5 py-1.5 border-r border-slate-200/80 font-semibold">№</th>
                      <th className="text-left px-1.5 py-1.5 border-r border-slate-200/80 font-semibold">Перелік завдань</th>
                      <th className="text-center px-1 py-1.5 border-r border-slate-200/80 font-semibold">Підрозділ</th>
                      <th className="text-center px-1 py-1.5 border-r border-slate-200/80 font-semibold">Термін</th>
                      <th className="text-center px-1 py-1.5 border-r border-slate-200/80 font-semibold">Результат</th>
                      <th className="text-left px-1.5 py-1.5 font-semibold">Примітка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGroup.plans.map((plan, idx) => (
                      <tr key={plan.quarterly_id} className={reportTableRowClass(idx)}>
                        <td className="px-1.5 py-1.5 text-slate-500 border-r border-slate-100">{idx + 1}</td>
                        <td className="px-1.5 py-1.5 text-slate-800 leading-snug border-r border-slate-100">{plan.goal || '—'}</td>
                        <td className="px-1 py-1.5 text-center border-r border-slate-100">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-slate-100 text-slate-700">
                            {plan.department_name || '—'}
                          </span>
                        </td>
                        <td className="px-1 py-1.5 text-slate-700 whitespace-nowrap border-r border-slate-100 text-center">{deadline}</td>
                        <td className="px-1 py-1.5 text-center border-r border-slate-100">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                            plan.status === 'completed' ? 'bg-green-100 text-green-700' :
                            plan.status === 'failed' ? 'bg-red-100 text-red-700' :
                            plan.status === 'active' ? 'bg-violet-100 text-violet-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {statusUa[plan.status] || plan.status}
                          </span>
                        </td>
                        <td className={`px-1.5 py-1.5 leading-snug transition-colors duration-500 ${animatingNoteIds.has(plan.quarterly_id) ? 'bg-indigo-50/60' : ''}`}>
                          {aiNotesLoading && !plan.note ? (
                            <span className="text-slate-400 italic inline-flex items-center gap-1">
                              <div className="w-3 h-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                              Генерація...
                            </span>
                          ) : plan.note ? (
                            <span className="text-slate-700">{plan.note}</span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Не згенеровано</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
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
        resizerClassName="hover:bg-purple-300/50 active:bg-purple-400/50"
      />
      {isMobile && (
        <MobileDetailsFab onClick={() => setIsDrawerOpen(true)} />
      )}
    </>
  );
}
