'use client';

import React from 'react';
import { Building2, Download, FileText, Sparkles, Zap, Pencil } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { formatPeriod, formatHours } from '@/lib/ops';
import type { CompanyReportData, MonthlyReportListItem, ProcedureInCompanyReport } from '@/lib/ops';
import type { AIUsage } from '@/lib/shared/ai/client';
import { Spinner } from '@/components/ui/Spinner';
import {
  GradientDetailCard,
  reportTableStyles,
  reportTableRowClass,
  reportActionButtonClass,
} from '../shared';

interface Props {
  loading: boolean;
  selectedItem: MonthlyReportListItem | null;
  detailLoading: boolean;
  selectedDetail: CompanyReportData | null;
  generating: string | null;
  generatingDocx: string | null;
  companyNotesLoading: boolean;
  notesUsage: AIUsage | null;
  animatingProcedureIds: Set<string>;
  setEditingProcedure: (p: ProcedureInCompanyReport | null) => void;
  onGenerate: (companyId: string, companyName: string, y: number, m: number) => void;
  onGenerateDocx: (companyId: string, companyName: string, y: number, m: number) => void;
  onGenerateNotes: (companyId: string, procedureIds: string[], y: number, m: number) => void;
}

function LoadingCard() {
  return (
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
}

export default function CompanyReportDetail({
  loading,
  selectedItem,
  detailLoading,
  selectedDetail,
  generating,
  generatingDocx,
  companyNotesLoading,
  notesUsage,
  animatingProcedureIds,
  setEditingProcedure,
  onGenerate,
  onGenerateDocx,
  onGenerateNotes,
}: Props) {
  if (loading) return <LoadingCard />;

  if (!selectedItem) return (
    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
      Выбери предприятие слева
    </div>
  );

  if (detailLoading) return <LoadingCard />;

  const isGenerating = generating === `company-${selectedItem.company_id}`;
  const isGeneratingDocx = generatingDocx === `company-docx-${selectedItem.company_id}`;

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
            {formatHours(selectedDetail?.summary?.total_hours ?? selectedItem.total_hours)} / {selectedDetail?.summary?.tasks_count ?? selectedItem.tasks_count} задач
          </div>
          <div className="flex items-center gap-2">
            {selectedDetail?.procedures?.length ? (
              <button
                type="button"
                onClick={() => {
                  const ids = selectedDetail.procedures.map(m => m.procedure_id);
                  onGenerateNotes(selectedItem.company_id!, ids, selectedItem.period_year, selectedItem.period_month);
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
              onClick={() => onGenerate(selectedItem.company_id!, selectedItem.company_name!, selectedItem.period_year, selectedItem.period_month)}
              disabled={isGenerating}
              aria-label="Завантажити звіт PDF"
              className={reportActionButtonClass('pdf')}
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                  <span>Генерація...</span>
                </>
              ) : (
                <>
                  <Download aria-hidden="true" className="w-4 h-4" />
                  <span>PDF</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onGenerateDocx(selectedItem.company_id!, selectedItem.company_name!, selectedItem.period_year, selectedItem.period_month)}
              disabled={isGeneratingDocx}
              aria-label="Завантажити звіт DOCX"
              className={reportActionButtonClass('docx')}
            >
              {isGeneratingDocx ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                  <span>Генерація...</span>
                </>
              ) : (
                <>
                  <FileText aria-hidden="true" className="w-4 h-4" />
                  <span>DOCX</span>
                </>
              )}
            </button>
          </div>
        </div>

        {notesUsage && (
          <p className="text-xs text-slate-400 flex items-center gap-1 px-1">
            <Zap className="w-3 h-3" aria-hidden="true" />
            Згенеровано: {notesUsage.total_tokens} tokens (gpt-4o-mini)
          </p>
        )}

        <div className={reportTableStyles.frame}>
          {selectedDetail?.procedures?.length ? (
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
                  {selectedDetail.procedures.map((m, idx) => (
                    <tr key={m.procedure_id} className={reportTableRowClass(idx)}>
                      <td className="px-1.5 py-1.5 text-slate-500 border-r border-slate-100">{idx + 1}</td>
                      <td className="px-1.5 py-1.5 text-slate-800 leading-snug border-r border-slate-100">{m.service_name || m.procedure_name || '—'}</td>
                      <td className="px-1.5 py-1.5 text-slate-700 leading-snug border-r border-slate-100">{m.responsible_executors || '—'}</td>
                      <td className="px-1 py-1.5 text-slate-700 text-center border-r border-slate-100">{m.employees_count}</td>
                      <td className="px-1 py-1.5 text-slate-700 text-center border-r border-slate-100">{m.hours.toFixed(1)}</td>
                      <td className={cn(
                        'px-1.5 py-1.5 leading-snug transition-colors duration-500 group/note',
                        animatingProcedureIds.has(m.procedure_id) && 'bg-indigo-50/60'
                      )}>
                        <div className="flex items-start gap-1">
                          <div className="flex-1 min-w-0">
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
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingProcedure(m)}
                            disabled={companyNotesLoading}
                            aria-label={`Редагувати примітку: ${m.service_name || m.procedure_name}`}
                            className={cn(
                              'flex-shrink-0 p-1 rounded-md',
                              'opacity-0 group-hover/note:opacity-100',
                              'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50',
                              'transition-[opacity,background-color] duration-150',
                              'focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:opacity-100',
                              'disabled:opacity-0'
                            )}
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-sm text-slate-500 text-center">Немає процедур за обраний період</div>
          )}
        </div>
      </GradientDetailCard>
    </div>
  );
}
