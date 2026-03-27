'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Target, FileText, BookOpen } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import { cn } from '@/lib/shared/utils';
import { Procedure, ProcedureCategory } from '../../kpi/types';
import { useProcedures } from '@/hooks/useProcedures';
import { useProcesses } from '@/hooks/useProcesses';
import ReferenceLeftPanelShell from '../ReferenceLeftPanelShell';
import ReferenceEmptyState from '../ReferenceEmptyState';
import ReferenceDetailsEmptyState from '../ReferenceDetailsEmptyState';
import ProcedureEtalons from './ProcedureEtalons';
import { TwoPanelLayout, GradientDetailCard, GroupHeader, DetailSection, ReferenceListItem } from '../../shared';

const CATEGORY_COLORS: Record<ProcedureCategory, { bg: string; text: string; dot: string }> = {
  strategic: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  process: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  operational: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
};

const CATEGORY_LABELS: Record<ProcedureCategory, string> = {
  strategic: 'Стратегічний',
  process: 'Процесний',
  operational: 'Операційний',
};

interface EtalonCount {
  procedure_id: string;
  task_count: number;
  note_count: number;
}

const NO_PROCESS_KEY = '__NO_PROCESS__';
const NO_PROCESS_LABEL = 'Без процесу';

function decodeMojibake(value: string): string {
  if (!value || !/[РСЃ]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(Array.from(value).map((ch) => ch.charCodeAt(0) & 0xff));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return value;
  }
}

export default function EtalonsReferenceContent({ user, tabsSlot }: { user: UserInfo; tabsSlot?: React.ReactNode }) {
  const { procedures: rawProcedures, loading: proceduresLoading } = useProcedures();
  const { processes, loading: processesLoading } = useProcesses();
  const { data: etalonCounts = [] } = useQuery<EtalonCount[]>({
    queryKey: ['etalon-counts'],
    queryFn: async () => {
      const res = await fetch('/api/ai/embeddings?mode=counts', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const procedures = useMemo<Procedure[]>(() =>
    rawProcedures.map(m => ({
      procedure_id: m.entity_id,
      process_id: m.process_id,
      name: m.entity_name,
      description: m.description ?? undefined,
      service_name: m.service_name ?? undefined,
      category: (m.category as ProcedureCategory) || 'operational',
      target_value: m.target_value ?? 0,
      target_period: (m.target_period as 'year' | 'quarter' | 'month') || 'year',
      is_active: true,
      process_name: m.process_name,
    })),
    [rawProcedures]
  );

  const loading = proceduresLoading || processesLoading;

  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [expandedProcesses, setExpandedProcesses] = useState<Record<string, boolean>>({});

  const canCreate = user.role === 'chief' || user.role === 'head';
  const canDelete = user.role === 'chief';

  const processNameById = useMemo(
    () => Object.fromEntries(processes.map((p) => [p.process_id, p.process_name])),
    [processes]
  );

  const getProcessKey = useCallback((procedure: Procedure) => {
    if (procedure.process_id) return `id:${procedure.process_id}`;
    const rawName = (procedure.process_name || '').trim();
    if (rawName) return `name:${rawName}`;
    return NO_PROCESS_KEY;
  }, []);

  const getProcessLabel = useCallback((processKey: string) => {
    if (processKey === NO_PROCESS_KEY) return NO_PROCESS_LABEL;
    if (processKey.startsWith('id:')) {
      const processId = processKey.slice(3);
      return processNameById[processId] || NO_PROCESS_LABEL;
    }
    if (processKey.startsWith('name:')) {
      return decodeMojibake(processKey.slice(5));
    }
    return decodeMojibake(processKey);
  }, [processNameById]);

  // Etalon counts indexed by procedure_id
  const etalonCountMap = useMemo(() => {
    const map: Record<string, { task: number; note: number }> = {};
    for (const row of etalonCounts) {
      map[row.procedure_id] = { task: row.task_count, note: row.note_count };
    }
    return map;
  }, [etalonCounts]);

  // Group procedures by process
  const proceduresByProcess = useMemo(() => {
    const grouped: Record<string, Procedure[]> = {};

    processes.forEach(p => {
      grouped[`id:${p.process_id}`] = [];
    });

    procedures.forEach(m => {
      const key = getProcessKey(m);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });

    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      if (a === NO_PROCESS_KEY) return 1;
      if (b === NO_PROCESS_KEY) return -1;
      return getProcessLabel(a).localeCompare(getProcessLabel(b), 'uk');
    });

    const result: Record<string, Procedure[]> = {};
    sortedKeys.forEach(key => { result[key] = grouped[key]; });
    return result;
  }, [procedures, processes, getProcessKey, getProcessLabel]);

  const processKeys = useMemo(() => Object.keys(proceduresByProcess), [proceduresByProcess]);

  // Sum etalon counts per process
  const etalonsByProcess = useMemo(() => {
    const result: Record<string, { task: number; note: number }> = {};
    for (const [processKey, procs] of Object.entries(proceduresByProcess)) {
      let task = 0, note = 0;
      for (const proc of procs) {
        const c = etalonCountMap[proc.procedure_id];
        if (c) { task += c.task; note += c.note; }
      }
      result[processKey] = { task, note };
    }
    return result;
  }, [proceduresByProcess, etalonCountMap]);

  const toggleProcess = useCallback((key: string) => {
    setExpandedProcesses(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSelect = (procedure: Procedure) => {
    setSelectedProcedure(procedure);
    const key = getProcessKey(procedure);
    setExpandedProcesses(prev => ({ ...prev, [key]: true }));
    setIsDrawerOpen(true);
  };

  const handleClose = () => {
    setSelectedProcedure(null);
    setIsDrawerOpen(false);
  };

  // Left panel — Process → Procedure tree
  const leftPanel = (
    <ReferenceLeftPanelShell
      tabsSlot={tabsSlot}
      loading={loading}
      error={null}
      isEmpty={processKeys.length === 0}
      bodyClassName="space-y-2"
      emptyState={
        <ReferenceEmptyState
          icon={<Sparkles className="h-12 w-12" aria-hidden="true" />}
          text="Процедури не знайдені"
        />
      }
      body={processKeys.map((processKey) => {
        const procs = proceduresByProcess[processKey] || [];
        const isExpanded = expandedProcesses[processKey] ?? false;
        const title = getProcessLabel(processKey);

        const processEtalons = etalonsByProcess[processKey] || { task: 0, note: 0 };
        const totalEtalons = processEtalons.task + processEtalons.note;

        return (
          <div key={processKey} className="space-y-1">
            <GroupHeader
              tone="purple"
              title={title}
              count={procs.length}
              expanded={isExpanded}
              onToggle={() => toggleProcess(processKey)}
              toggleAriaLabel={`${isExpanded ? 'Згорнути' : 'Розгорнути'} процес ${title}`}
            />
            {totalEtalons > 0 && (
              <div className="flex items-center gap-3 pl-9 text-2xs text-slate-500">
                <span className="flex items-center gap-1" aria-label={`Описи задач: ${processEtalons.task}`}>
                  <FileText className="w-3 h-3 text-purple-400" aria-hidden="true" />
                  <span>Описи: <span className="font-semibold text-purple-600">{processEtalons.task}</span></span>
                </span>
                <span className="flex items-center gap-1" aria-label={`Примітки звітів: ${processEtalons.note}`}>
                  <BookOpen className="w-3 h-3 text-amber-400" aria-hidden="true" />
                  <span>Звіти: <span className="font-semibold text-amber-600">{processEtalons.note}</span></span>
                </span>
              </div>
            )}

            {isExpanded && (
              <div className="space-y-1 pl-2">
                {procs.map((procedure) => {
                  const isSelected = selectedProcedure?.procedure_id === procedure.procedure_id;
                  const colors = CATEGORY_COLORS[procedure.category] || CATEGORY_COLORS.operational;
                  const procEtalons = etalonCountMap[procedure.procedure_id];

                  return (
                    <ReferenceListItem
                      key={procedure.procedure_id}
                      tone="purple"
                      isSelected={isSelected}
                      onClick={() => handleSelect(procedure)}
                      ariaLabel={`Еталони: ${procedure.name}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-1', colors.dot)} />
                        <div className="flex-1 min-w-0">
                          <span className={cn('text-sm font-medium line-clamp-2', isSelected ? 'text-purple-900' : 'text-slate-800')}>
                            {procedure.name}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={cn('text-2xs px-1.5 py-0.5 rounded inline-block', colors.bg, colors.text)}>
                              {CATEGORY_LABELS[procedure.category]}
                            </span>
                            {procEtalons && (procEtalons.task > 0 || procEtalons.note > 0) && (
                              <span className="flex items-center gap-1.5 text-2xs text-slate-400">
                                {procEtalons.task > 0 && (
                                  <span className="flex items-center gap-0.5" title="Описи задач">
                                    <FileText className="w-2.5 h-2.5" aria-hidden="true" />
                                    <span>{procEtalons.task}</span>
                                  </span>
                                )}
                                {procEtalons.note > 0 && (
                                  <span className="flex items-center gap-0.5" title="Примітки звітів">
                                    <BookOpen className="w-2.5 h-2.5" aria-hidden="true" />
                                    <span>{procEtalons.note}</span>
                                  </span>
                                )}
                              </span>
                            )}
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
        <div className="flex items-center gap-3 text-slate-500">
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-purple-600" aria-hidden="true" />
            <span className="text-sm">Процедур: {procedures.length}</span>
          </span>
          {etalonCounts.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span>|</span>
              <span>Еталонів: {etalonCounts.reduce((sum, r) => sum + r.task_count + r.note_count, 0)}</span>
            </span>
          )}
        </div>
      }
    />
  );

  // Right panel — etalons for selected procedure
  const rightPanel = selectedProcedure ? (
    <GradientDetailCard
      modeLabel="Еталони"
      isEditing={false}
      canEdit={false}
      gradientClassName="from-purple-400/80 to-indigo-400/80"
      headerIcon={<Sparkles />}
      onClose={handleClose}
    >
      <DetailSection title={selectedProcedure.name} colorScheme="purple" titleIcon={<Target className="w-4 h-4" aria-hidden="true" />}>
        {selectedProcedure.description && (
          <p className="text-xs text-slate-500 mb-2">{selectedProcedure.description}</p>
        )}
      </DetailSection>

      <DetailSection title="Еталони" colorScheme="purple" titleIcon={<Sparkles className="w-4 h-4" aria-hidden="true" />}>
        <ProcedureEtalons
          procedureId={selectedProcedure.procedure_id}
          procedureName={selectedProcedure.name}
          canCreate={canCreate}
          canDelete={canDelete}
        />
      </DetailSection>
    </GradientDetailCard>
  ) : (
    <ReferenceDetailsEmptyState
      icon={<Sparkles className="h-16 w-16" aria-hidden="true" />}
      title="Оберіть процедуру"
      description="Натисніть на процедуру зліва, щоб переглянути та управляти еталонами"
    />
  );

  return (
    <TwoPanelLayout
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      isDrawerOpen={isDrawerOpen}
      onDrawerClose={handleClose}
      rightPanelClassName={cn('overscroll-contain', selectedProcedure ? 'bg-purple-50/30' : 'bg-transparent')}
    />
  );
}
