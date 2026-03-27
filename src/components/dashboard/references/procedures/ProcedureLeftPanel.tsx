'use client';

import React from 'react';
import { BookOpen, FileText, Target } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import type { Procedure, ProcedureCategory } from '../../kpi/types';
import { GroupHeader, ReferenceListItem } from '../../shared';
import ReferenceLeftPanelShell from '../ReferenceLeftPanelShell';
import ReferenceEmptyState from '../ReferenceEmptyState';

const CATEGORY_LABELS: Record<ProcedureCategory, string> = {
  strategic: 'Стратегический',
  process: 'Процессный',
  operational: 'Операционный',
};

const CATEGORY_COLORS: Record<ProcedureCategory, { bg: string; text: string }> = {
  strategic: { bg: 'bg-purple-100', text: 'text-purple-700' },
  process: { bg: 'bg-blue-100', text: 'text-blue-700' },
  operational: { bg: 'bg-green-100', text: 'text-green-700' },
};

interface Props {
  tabsSlot?: React.ReactNode;
  loading: boolean;
  error: string | null;
  processKeys: string[];
  proceduresByProcess: Record<string, Procedure[]>;
  expandedProcesses: Record<string, boolean>;
  selectedProcedure: Procedure | null;
  canEdit: boolean;
  etalonCountMap: Record<string, { task: number; note: number }>;
  totalProcedures: number;
  getProcessLabel: (key: string) => string;
  onToggleProcess: (key: string) => void;
  onSelectProcedure: (p: Procedure) => void;
  onAddToProcess: (processId: string) => void;
}

export default function ProcedureLeftPanel({
  tabsSlot,
  loading,
  error,
  processKeys,
  proceduresByProcess,
  expandedProcesses,
  selectedProcedure,
  canEdit,
  etalonCountMap,
  totalProcedures,
  getProcessLabel,
  onToggleProcess,
  onSelectProcedure,
  onAddToProcess,
}: Props) {
  return (
    <ReferenceLeftPanelShell
      tabsSlot={tabsSlot}
      loading={loading}
      error={error}
      isEmpty={processKeys.length === 0}
      bodyClassName="space-y-2"
      emptyState={<ReferenceEmptyState icon={<Target className="h-12 w-12" aria-hidden="true" />} text="Процедуры не найдены" />}
      body={processKeys.map((processKey) => {
        const processProcedures = proceduresByProcess[processKey] || [];
        const isExpanded = expandedProcesses[processKey] ?? false;
        const processIdForCreate =
          (processKey.startsWith('id:') ? processKey.slice(3) : '') ||
          processProcedures.find((p) => !!p.process_id)?.process_id ||
          '';
        const processTitle = getProcessLabel(processKey);

        return (
          <div key={processKey} className="space-y-1">
            <GroupHeader
              tone="purple"
              title={processTitle}
              count={processProcedures.length}
              expanded={isExpanded}
              onToggle={() => onToggleProcess(processKey)}
              onAdd={canEdit ? () => onAddToProcess(processIdForCreate) : undefined}
              toggleAriaLabel={`${isExpanded ? 'Свернуть' : 'Развернуть'} процесс ${processTitle}`}
              addAriaLabel={`Добавить процедуру в процесс ${processTitle}`}
            />

            {isExpanded && (
              <div className="space-y-1 pl-2">
                {processProcedures.map((procedure) => {
                  const isSelected = selectedProcedure?.procedure_id === procedure.procedure_id;
                  const percentage = procedure.target_value > 0
                    ? Math.round((procedure.actual_value || 0) / procedure.target_value * 100)
                    : 0;
                  const colors = CATEGORY_COLORS[procedure.category] || CATEGORY_COLORS.operational;

                  return (
                    <ReferenceListItem
                      key={procedure.procedure_id}
                      tone="purple"
                      isSelected={isSelected}
                      onClick={() => onSelectProcedure(procedure)}
                      ariaLabel={`Выбрать ${procedure.name}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-1', colors.bg.replace('-100', '-500'))} />
                        <div className="flex-1 min-w-0">
                          <span className={cn('text-sm font-medium line-clamp-2', isSelected ? 'text-purple-900' : 'text-slate-800')}>
                            {procedure.name}
                          </span>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={cn('text-2xs px-1.5 py-0.5 rounded', colors.bg, colors.text)}>
                              {CATEGORY_LABELS[procedure.category]}
                            </span>
                            <span className="text-2xs text-slate-500">
                              {procedure.target_value}/{procedure.actual_value || 0}
                            </span>
                            <span className={cn('text-2xs font-bold', percentage >= 100 ? 'text-green-600' : percentage >= 50 ? 'text-amber-600' : 'text-red-500')}>
                              {percentage}%
                            </span>
                            {(() => {
                              const ec = etalonCountMap[procedure.procedure_id];
                              if (!ec || (ec.task === 0 && ec.note === 0)) return null;
                              return (
                                <span className="flex items-center gap-1.5 text-2xs text-slate-400">
                                  {ec.task > 0 && (
                                    <span className="flex items-center gap-0.5" title="Описи задач">
                                      <FileText className="w-2.5 h-2.5" aria-hidden="true" />
                                      <span>{ec.task}</span>
                                    </span>
                                  )}
                                  {ec.note > 0 && (
                                    <span className="flex items-center gap-0.5" title="Примітки звітів">
                                      <BookOpen className="w-2.5 h-2.5" aria-hidden="true" />
                                      <span>{ec.note}</span>
                                    </span>
                                  )}
                                </span>
                              );
                            })()}
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
      footer={
        <div className="flex items-center gap-2 text-slate-500">
          <Target className="h-4 w-4 text-purple-600" aria-hidden="true" />
          <span className="text-sm">Всего процедур: {totalProcedures}</span>
        </div>
      }
    />
  );
}
