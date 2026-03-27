'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import {
  getAvailableCompanyReports,
  getCompanyReportData,
  type CompanyReportData,
  type MonthlyReportListItem,
  formatHours,
} from '@/lib/ops';
import { Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import type { ProcedureInCompanyReport } from '@/lib/ops';
import ProcedureNoteModal from './ProcedureNoteModal';
import type { AIUsage } from '@/lib/shared/ai/client';
import { Spinner } from '@/components/ui/Spinner';
import logger from '@/lib/shared/logger';
import { useIsMobile } from '@/hooks/useMediaQuery';
import {
  TwoPanelLayout,
  ReferenceListItem,
  MobileDetailsFab,
} from '../shared';
import { generateReportFile } from './report-utils';
import CompanyReportDetail from './CompanyReportDetail';
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
        className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          'p-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500',
          isCurrentMonth ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-slate-800 hover:bg-white/60',
        )}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

interface CompaniesReportTabProps {
  tabsSlot: React.ReactNode;
}

export default function CompaniesReportTab({ tabsSlot }: CompaniesReportTabProps) {
  const isMobile = useIsMobile();
  const today = new Date();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Data
  const [companyReports, setCompanyReports] = useState<MonthlyReportListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Month/year navigation
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  // Selection
  const [selectedReportKey, setSelectedReportKey] = useState<string | null>(null);
  const [detailByKey, setDetailByKey] = useState<Record<string, CompanyReportData>>({});
  const [selectedDetail, setSelectedDetail] = useState<CompanyReportData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Report generation
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatingDocx, setGeneratingDocx] = useState<string | null>(null);
  const [companyNotesLoading, setCompanyNotesLoading] = useState(false);
  const [animatingProcedureIds, setAnimatingProcedureIds] = useState<Set<string>>(new Set());
  const [notesUsage, setNotesUsage] = useState<AIUsage | null>(null);
  const [editingProcedure, setEditingProcedure] = useState<ProcedureInCompanyReport | null>(null);

  const getItemKey = (r: MonthlyReportListItem) =>
    `${r.company_id || 'none'}-${r.period_year}-${r.period_month}`;

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

  // Load reports for the selected month only
  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAvailableCompanyReports(year, month);
      setCompanyReports(data);
    } catch (err: unknown) {
      setError('Ошибка загрузки отчетов по предприятиям');
      logger.error(err);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

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
        setCompanyReports((prev) => prev.map((r) =>
          getItemKey(r) === selectedReportKey
            ? { ...r, total_hours: data.summary.total_hours, tasks_count: data.summary.tasks_count }
            : r
        ));
      })
      .catch((err: unknown) => {
        logger.error('[reports] Ошибка загрузки деталей отчета по предприятию:', err);
        if (!cancelled) setSelectedDetail(null);
      })
      .finally(() => { if (!cancelled) setDetailLoading(false); });

    return () => { cancelled = true; };
  }, [selectedItem, selectedReportKey, detailByKey]);

  // PDF generation
  const handleGenerate = useCallback(async (companyId: string, companyName: string, y: number, m: number) => {
    const key = `company-${companyId}`;
    setGenerating(key);
    try {
      await generateReportFile('company', companyId, companyName, 'pdf', y, m);
    } catch (err: unknown) {
      logger.error('Ошибка генерации отчета:', err);
      toast.error(err instanceof Error ? err.message : 'Ошибка генерации отчета');
    } finally {
      setGenerating(null);
    }
  }, []);

  // DOCX generation
  const handleGenerateDocx = useCallback(async (companyId: string, companyName: string, y: number, m: number) => {
    const key = `company-docx-${companyId}`;
    setGeneratingDocx(key);
    try {
      await generateReportFile('company', companyId, companyName, 'docx', y, m);
    } catch (err: unknown) {
      logger.error('Ошибка генерации DOCX:', err);
      toast.error(err instanceof Error ? err.message : 'Ошибка генерации DOCX');
    } finally {
      setGeneratingDocx(null);
    }
  }, []);

  // Handle single procedure note saved from modal
  const handleNoteSaved = useCallback((procedureId: string, note: string) => {
    setSelectedDetail(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        procedures: prev.procedures.map(m =>
          m.procedure_id === procedureId ? { ...m, note } : m
        ),
      };
    });
    setAnimatingProcedureIds(prev => new Set(prev).add(procedureId));
    setTimeout(() => {
      setAnimatingProcedureIds(prev => {
        const next = new Set(prev);
        next.delete(procedureId);
        return next;
      });
    }, 600);
  }, []);

  // Clear usage after 5s
  useEffect(() => {
    if (!notesUsage) return;
    const timer = setTimeout(() => setNotesUsage(null), 5_000);
    return () => clearTimeout(timer);
  }, [notesUsage]);

  // AI notes
  const generateCompanyNotes = useCallback(async (companyId: string, procedureIds: string[], y: number, m: number) => {
    if (procedureIds.length === 0) return;
    setCompanyNotesLoading(true);
    setNotesUsage(null);
    try {
      const response = await fetch('/api/reports/company-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ company_id: companyId, procedure_ids: procedureIds, year: y, month: m }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Помилка генерації');
      }
      const data = await response.json();
      if (data.usage) setNotesUsage(data.usage);
      const entries = Object.entries(data.notes as Record<string, string>);

      for (let i = 0; i < entries.length; i++) {
        const [mId, noteText] = entries[i];
        setTimeout(() => {
          setSelectedDetail(prev => {
            if (!prev) return prev;
            return { ...prev, procedures: prev.procedures.map(p => p.procedure_id === mId ? { ...p, note: noteText } : p) };
          });
          setAnimatingProcedureIds(prev => new Set(prev).add(mId));
          setTimeout(() => {
            setAnimatingProcedureIds(prev => { const next = new Set(prev); next.delete(mId); return next; });
          }, 600);
        }, i * 150);
      }
    } catch (err: unknown) {
      logger.error('Ошибка генерации AI примечаний для предприятия:', err);
      toast.error(err instanceof Error ? err.message : 'Помилка генерації AI приміток');
    } finally {
      setCompanyNotesLoading(false);
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
        ) : companyReports.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-12 h-12" aria-hidden="true" />}
            title={`Нет данных за ${MONTHS_UA[month - 1]} ${year}`}
            className="py-10 bg-slate-50 rounded-lg"
          />
        ) : (
          <div className="space-y-1">
            {companyReports.map((report) => {
              const rk = getItemKey(report);
              const isSelected = selectedReportKey === rk;
              return (
                <ReferenceListItem
                  key={rk}
                  tone="blue"
                  isSelected={isSelected}
                  onClick={() => { setSelectedReportKey(rk); if (isMobile) setIsDrawerOpen(true); }}
                  ariaLabel={`Вибрати звіт ${report.company_name}`}
                  className="px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" aria-hidden="true" />
                      <span className={cn('text-sm font-medium truncate', isSelected ? 'text-blue-900' : 'text-slate-700')}>
                        {report.company_name || '—'}
                      </span>
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

  const rightPanel = (
    <CompanyReportDetail
      loading={loading}
      selectedItem={selectedItem}
      detailLoading={detailLoading}
      selectedDetail={selectedDetail}
      generating={generating}
      generatingDocx={generatingDocx}
      companyNotesLoading={companyNotesLoading}
      notesUsage={notesUsage}
      animatingProcedureIds={animatingProcedureIds}
      setEditingProcedure={setEditingProcedure}
      onGenerate={handleGenerate}
      onGenerateDocx={handleGenerateDocx}
      onGenerateNotes={generateCompanyNotes}
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
        <MobileDetailsFab onClick={() => setIsDrawerOpen(true)} tone="blue" />
      )}
      {editingProcedure && selectedItem?.company_id && (
        <ProcedureNoteModal
          isOpen={!!editingProcedure}
          onClose={() => setEditingProcedure(null)}
          procedure={editingProcedure}
          companyId={selectedItem.company_id}
          year={selectedItem.period_year}
          month={selectedItem.period_month}
          onNoteSaved={handleNoteSaved}
        />
      )}
    </>
  );
}
