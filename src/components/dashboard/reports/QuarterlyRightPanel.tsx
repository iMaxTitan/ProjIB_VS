'use client';

import React from 'react';
import { CalendarDays, Download, Sparkles, ClipboardList, FileText, Briefcase, RefreshCw } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { PlanStatus } from '@/types/planning';
import { getStatusColorClasses } from '@/lib/ops/plans/planning-utils';
import { formatHours } from '@/lib/ops';
import {
  GradientDetailCard,
  reportTableStyles,
  reportTableRowClass,
  reportSegmentedButtonClass,
  reportActionButtonClass,
} from '../shared';
import QuarterlyDepartmentsTable from './QuarterlyDepartmentsTable';
import type { QuarterlyReportGroup, MonthProcessItem } from './types';
import { Badge } from '@/components/ui/badge';

const quarterRoman: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };
const statusUa: Record<string, string> = {
  completed: 'Виконано', active: 'В роботі', approved: 'Затверджено',
  failed: 'Не виконано', returned: 'Повернено', draft: 'Чернетка', submitted: 'На розгляді',
};

type QuarterlyRightTab = 'plan' | 'report' | 'departments';

interface QuarterlyRightPanelProps {
  loading: boolean;
  selectedGroup: QuarterlyReportGroup | null;
  rightTab: QuarterlyRightTab;
  setRightTab: (tab: QuarterlyRightTab) => void;
  deptReportData: MonthProcessItem[];
  deptLoading: boolean;
  onRefreshDept: () => void;
  generating: string | null;
  generatingDocx: string | null;
  aiNotesLoading: boolean;
  animatingNoteIds: Set<string>;
  onGenerateDoc: (year: number, quarter: number, docType: 'quarterly_plan' | 'quarterly_report') => void;
  onGenerateDocx: (year: number, quarter: number) => void;
  onGenerateAINotes: (quarterlyIds: string[]) => void;
}

export default function QuarterlyRightPanel({
  loading, selectedGroup, rightTab, setRightTab,
  deptReportData, deptLoading, onRefreshDept,
  generating, generatingDocx, aiNotesLoading, animatingNoteIds,
  onGenerateDoc, onGenerateDocx, onGenerateAINotes,
}: QuarterlyRightPanelProps) {
  if (loading) {
    return (
      <div className="h-full min-h-0 overflow-auto">
        <GradientDetailCard modeLabel="Загрузка..." isEditing={false} canEdit={false} gradientClassName="from-purple-500 to-indigo-500" cardClassName="max-w-none w-full" bodyClassName="flex justify-center py-10">
          <Spinner />
        </GradientDetailCard>
      </div>
    );
  }

  if (!selectedGroup) {
    return <div className="h-full flex items-center justify-center text-slate-400">Выбери квартал слева</div>;
  }

  const totalCapacity = (() => {
    const seen = new Set<string>();
    let sum = 0;
    for (const r of deptReportData) {
      if (!seen.has(r.scopeId)) { seen.add(r.scopeId); sum += r.capacityHours || 0; }
    }
    return sum;
  })();

  const lastMonth = selectedGroup.quarter * 3;
  const deadline = `19.${String(lastMonth).padStart(2, '0')}.${selectedGroup.year}`;
  const selectedDocType = rightTab === 'report' ? 'quarterly_report' : 'quarterly_plan';
  const selectedGenKey = `${selectedDocType}-${selectedGroup.year}-${selectedGroup.quarter}`;
  const isGenerating = generating === selectedGenKey;
  const isGeneratingDocx = generatingDocx === `quarterly_report_docx-${selectedGroup.year}-${selectedGroup.quarter}`;
  const completePct = totalCapacity > 0
    ? Math.min(100, Math.round((selectedGroup.spentHours / totalCapacity) * 100))
    : selectedGroup.completionPercentage;

  return (
    <div className="h-full min-h-0 overflow-auto">
      <GradientDetailCard
        modeLabel="Просмотр" isEditing={false} canEdit={false}
        gradientClassName="from-purple-500 to-indigo-500" cardClassName="max-w-none w-full" bodyClassName="space-y-4"
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
            {formatHours(selectedGroup.spentHours)} / {totalCapacity > 0 ? formatHours(totalCapacity) : formatHours(selectedGroup.plannedHours)}
          </div>
          <div className="text-right min-w-[130px]">
            <div className="text-xs font-semibold text-slate-700">{completePct}%</div>
            <div className="w-28 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1 ml-auto">
              <div className="h-full bg-gradient-to-r from-purple-400 to-indigo-500 rounded-full" style={{ width: `${completePct}%` }} />
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
              <button type="button" role="radio" aria-checked={rightTab === 'departments'} aria-label="Показать процессы по отделам" onClick={() => setRightTab('departments')} className={reportSegmentedButtonClass(rightTab === 'departments')}>
                <Briefcase aria-hidden="true" className="h-3.5 w-3.5" />УИБК
              </button>
            </div>
            {rightTab === 'departments' && (
              <button type="button" onClick={onRefreshDept} disabled={deptLoading} aria-label="Обновить данные" className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50">
                <RefreshCw aria-hidden="true" className={`h-4 w-4 ${deptLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
            {rightTab !== 'departments' && (
              <div className="flex items-center gap-2">
                {rightTab === 'report' && (
                  <button type="button" onClick={() => onGenerateAINotes(selectedGroup.plans.map(p => p.quarterly_id))} disabled={aiNotesLoading} aria-label="Згенерувати AI примітки" className={reportActionButtonClass('ai')}>
                    {aiNotesLoading ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" /><span>Генерація...</span></>) : (<><Sparkles aria-hidden="true" className="w-4 h-4" /><span>AI</span></>)}
                  </button>
                )}
                <button type="button" onClick={() => onGenerateDoc(selectedGroup.year, selectedGroup.quarter, selectedDocType)} disabled={isGenerating} aria-label={rightTab === 'report' ? 'Завантажити звіт PDF' : 'Завантажити план PDF'} className={reportActionButtonClass('pdf')}>
                  {isGenerating ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" /><span>Генерація...</span></>) : (<><Download aria-hidden="true" className="w-4 h-4" /><span>PDF</span></>)}
                </button>
                {rightTab === 'report' && (
                  <button type="button" onClick={() => onGenerateDocx(selectedGroup.year, selectedGroup.quarter)} disabled={isGeneratingDocx} aria-label="Завантажити звіт DOCX" className={reportActionButtonClass('docx')}>
                    {isGeneratingDocx ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" /><span>Генерація...</span></>) : (<><FileText aria-hidden="true" className="w-4 h-4" /><span>DOCX</span></>)}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={`flex-1 min-h-0 ${reportTableStyles.scroll}`}>
            {rightTab === 'plan' ? (
              <table className={reportTableStyles.table}>
                <colgroup>
                  <col style={{ width: '32px' }} /><col style={{ width: 'calc((100% - 32px - 72px - 84px) / 2)' }} />
                  <col style={{ width: '72px' }} /><col style={{ width: '84px' }} /><col style={{ width: 'calc((100% - 32px - 72px - 84px) / 2)' }} />
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
                        <Badge className={`whitespace-nowrap ${getStatusColorClasses(plan.status as PlanStatus)}`}>
                          {plan.department_name || '—'}
                        </Badge>
                      </td>
                      <td className="px-1 py-1.5 text-slate-700 whitespace-nowrap border-r border-slate-100 text-center">{deadline}</td>
                      <td className="px-1.5 py-1.5 text-slate-700 leading-snug">{plan.expected_result || 'Нет ожидаемого результата'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : rightTab === 'report' ? (
              <table className={reportTableStyles.table}>
                <colgroup>
                  <col style={{ width: '32px' }} /><col style={{ width: 'calc((100% - 32px - 72px - 84px - 72px) / 2)' }} />
                  <col style={{ width: '72px' }} /><col style={{ width: '84px' }} /><col style={{ width: '72px' }} />
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
                        <Badge variant="slate" className="whitespace-nowrap">{plan.department_name || '—'}</Badge>
                      </td>
                      <td className="px-1 py-1.5 text-slate-700 whitespace-nowrap border-r border-slate-100 text-center">{deadline}</td>
                      <td className="px-1 py-1.5 text-center border-r border-slate-100">
                        <Badge variant={
                          plan.status === 'completed' ? 'success' :
                          plan.status === 'failed' ? 'red' :
                          plan.status === 'active' ? 'violet' : 'slate'
                        } className="whitespace-nowrap">{statusUa[plan.status] || plan.status}</Badge>
                      </td>
                      <td className={`px-1.5 py-1.5 leading-snug transition-colors duration-500 ${animatingNoteIds.has(plan.quarterly_id) ? 'bg-indigo-50/60' : ''}`}>
                        {aiNotesLoading && !plan.note ? (
                          <span className="text-slate-400 italic inline-flex items-center gap-1">
                            <div className="w-3 h-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" aria-hidden="true" />Генерація...
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
            ) : (
              <QuarterlyDepartmentsTable deptReportData={deptReportData} deptLoading={deptLoading} />
            )}
          </div>
        </div>
      </GradientDetailCard>
    </div>
  );
}
