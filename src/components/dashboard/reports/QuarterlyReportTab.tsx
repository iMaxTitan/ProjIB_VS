'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { getQuarterlyReports, getAvailableQuarterlyYears } from '@/lib/ops';
import logger from '@/lib/shared/logger';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { TwoPanelLayout, MobileDetailsFab } from '../shared';
import { generateQuarterlyDocumentFile } from './report-utils';
import type { QuarterlyReportItem, QuarterlyReportGroup, MonthProcessItem } from './types';
import QuarterlyReportList from './QuarterlyReportList';
import QuarterlyRightPanel from './QuarterlyRightPanel';
import { loadQuarterlyDeptData } from '@/lib/ops/reports/quarterly-dept';

type QuarterlyRightTab = 'plan' | 'report' | 'departments';

interface QuarterlyReportTabProps {
  tabsSlot: React.ReactNode;
}

export default function QuarterlyReportTab({ tabsSlot }: QuarterlyReportTabProps) {
  const isMobile = useIsMobile();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [quarterlyReports, setQuarterlyReports] = useState<QuarterlyReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableYearsList, setAvailableYearsList] = useState<number[]>([]);
  const [selectedQuarterKey, setSelectedQuarterKey] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<QuarterlyRightTab>('plan');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatingDocx, setGeneratingDocx] = useState<string | null>(null);
  const [aiNotesLoading, setAiNotesLoading] = useState(false);
  const [animatingNoteIds, setAnimatingNoteIds] = useState<Set<string>>(new Set());
  const [deptReportData, setDeptReportData] = useState<MonthProcessItem[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const deptCacheRef = React.useRef<Map<string, MonthProcessItem[]>>(new Map());

  const loadDepartmentData = useCallback(async (group: QuarterlyReportGroup, force = false) => {
    const cacheKey = group.key;
    if (!force) {
      const cached = deptCacheRef.current.get(cacheKey);
      if (cached) { setDeptReportData(cached); return; }
    }
    setDeptLoading(true);
    try {
      const result = await loadQuarterlyDeptData(group);
      deptCacheRef.current.set(cacheKey, result);
      setDeptReportData(result);
    } catch (err: unknown) {
      logger.error('[QuarterlyReportTab] loadDepartmentData failed:', err);
      setDeptReportData([]);
    } finally {
      setDeptLoading(false);
    }
  }, []);

  const loadAvailableYears = useCallback(async () => {
    try {
      const years = await getAvailableQuarterlyYears();
      setAvailableYearsList(years);
      return years;
    } catch (err: unknown) {
      logger.error('[QuarterlyReportTab] loadAvailableYears failed:', err);
      return [] as number[];
    }
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      setQuarterlyReports(await getQuarterlyReports(selectedYear) || []);
    } catch (err: unknown) {
      logger.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    loadAvailableYears().then((years) => {
      if (years.length > 0 && !years.includes(selectedYear)) setSelectedYear(years[0]);
    });
  }, [loadAvailableYears]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadReports(); }, [loadReports]);

  const groupedReports = useMemo<QuarterlyReportGroup[]>(() => {
    const groups = new Map<string, { quarter: number; year: number; plans: QuarterlyReportItem[] }>();
    for (const report of quarterlyReports) {
      if (!report.year) continue;
      const key = `${report.year}-${report.quarter}`;
      if (!groups.has(key)) groups.set(key, { quarter: report.quarter, year: report.year, plans: [] });
      groups.get(key)!.plans.push(report);
    }
    return Array.from(groups.entries()).map(([key, group]) => {
      const departments = Array.from(new Set(group.plans.map((p) => p.department_name).filter(Boolean)));
      const plannedHours = group.plans.reduce((sum, p) => sum + (p.planned_hours_total || 0), 0);
      const spentHours = group.plans.reduce((sum, p) => sum + (p.spent_hours_total || 0), 0);
      const completionPercentage = plannedHours > 0 ? Math.min(100, Math.round((spentHours / plannedHours) * 100)) : 0;
      return { key, quarter: group.quarter, year: group.year, plans: group.plans, departments, plannedHours, spentHours, completionPercentage };
    }).sort((a, b) => { const yd = b.year - a.year; return yd !== 0 ? yd : b.quarter - a.quarter; });
  }, [quarterlyReports]);

  const filteredGroups = useMemo(() => groupedReports.filter((g) => g.year === selectedYear), [groupedReports, selectedYear]);
  const hasPrevYear = availableYearsList.some((y) => y < selectedYear);
  const hasNextYear = availableYearsList.some((y) => y > selectedYear);
  const goPrevYear = () => { const prev = availableYearsList.filter((y) => y < selectedYear).sort((a, b) => b - a)[0]; if (prev !== undefined) setSelectedYear(prev); };
  const goNextYear = () => { const next = availableYearsList.filter((y) => y > selectedYear).sort((a, b) => a - b)[0]; if (next !== undefined) setSelectedYear(next); };

  const selectedGroup = useMemo(() => groupedReports.find((g) => g.key === selectedQuarterKey) ?? null, [groupedReports, selectedQuarterKey]);

  useEffect(() => {
    if (groupedReports.length === 0) { setSelectedQuarterKey(null); return; }
    if (!selectedQuarterKey || !groupedReports.some((g) => g.key === selectedQuarterKey)) {
      const first = groupedReports[0];
      setSelectedYear(first.year);
      setSelectedQuarterKey(first.key);
    }
  }, [groupedReports, selectedQuarterKey]);

  useEffect(() => {
    if (rightTab !== 'departments' || !selectedGroup) return;
    loadDepartmentData(selectedGroup);
  }, [rightTab, selectedGroup, loadDepartmentData]);

  const handleGenerateDocument = useCallback(async (year: number, quarter: number, docType: 'quarterly_plan' | 'quarterly_report') => {
    const key = `${docType}-${year}-${quarter}`;
    setGenerating(key);
    try { await generateQuarterlyDocumentFile(year, quarter, docType); }
    catch (err: unknown) { logger.error('Ошибка генерации квартального документа:', err); toast.error(err instanceof Error ? err.message : 'Ошибка генерации PDF'); }
    finally { setGenerating(null); }
  }, []);

  const handleGenerateDocx = useCallback(async (year: number, quarter: number) => {
    const key = `quarterly_report_docx-${year}-${quarter}`;
    setGeneratingDocx(key);
    try { await generateQuarterlyDocumentFile(year, quarter, 'quarterly_report', 'docx'); }
    catch (err: unknown) { logger.error('Ошибка генерации DOCX:', err); toast.error(err instanceof Error ? err.message : 'Ошибка генерации DOCX'); }
    finally { setGeneratingDocx(null); }
  }, []);

  const generateAINotes = useCallback(async (quarterlyIds: string[]) => {
    if (quarterlyIds.length === 0) return;
    setAiNotesLoading(true);
    try {
      const response = await fetch('/api/reports/quarterly-notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quarterly_ids: quarterlyIds }) });
      if (!response.ok) { const errData = await response.json(); throw new Error(errData.error || 'Помилка генерації'); }
      const data = await response.json();
      const entries = Object.entries(data.notes as Record<string, string>);
      for (let i = 0; i < entries.length; i++) {
        const [qId, noteText] = entries[i];
        setTimeout(() => {
          setQuarterlyReports(prev => prev.map(r => r.quarterly_id === qId ? { ...r, note: noteText } : r));
          setAnimatingNoteIds(prev => new Set(prev).add(qId));
          setTimeout(() => { setAnimatingNoteIds(prev => { const next = new Set(prev); next.delete(qId); return next; }); }, 600);
        }, i * 150);
      }
    } catch (err: unknown) {
      logger.error('Ошибка генерации AI примечаний:', err);
      toast.error(err instanceof Error ? err.message : 'Помилка генерації AI приміток');
    } finally {
      setAiNotesLoading(false);
    }
  }, []);

  return (
    <>
      <TwoPanelLayout
        leftPanel={
          <QuarterlyReportList
            tabsSlot={tabsSlot} selectedYear={selectedYear} availableYearsList={availableYearsList}
            hasPrevYear={hasPrevYear} hasNextYear={hasNextYear} goPrevYear={goPrevYear} goNextYear={goNextYear}
            loading={loading} groupedReports={groupedReports} filteredGroups={filteredGroups}
            selectedQuarterKey={selectedQuarterKey} onSelectQuarter={setSelectedQuarterKey}
            isMobile={isMobile} onOpenDrawer={() => setIsDrawerOpen(true)}
          />
        }
        rightPanel={
          <QuarterlyRightPanel
            loading={loading} selectedGroup={selectedGroup} rightTab={rightTab} setRightTab={setRightTab}
            deptReportData={deptReportData} deptLoading={deptLoading}
            onRefreshDept={() => selectedGroup && loadDepartmentData(selectedGroup, true)}
            generating={generating} generatingDocx={generatingDocx}
            aiNotesLoading={aiNotesLoading} animatingNoteIds={animatingNoteIds}
            onGenerateDoc={handleGenerateDocument} onGenerateDocx={handleGenerateDocx}
            onGenerateAINotes={generateAINotes}
          />
        }
        isDrawerOpen={isDrawerOpen} onDrawerClose={() => setIsDrawerOpen(false)}
        rightPanelClassName="bg-white/20"
      />
      {isMobile && <MobileDetailsFab onClick={() => setIsDrawerOpen(true)} />}
    </>
  );
}
