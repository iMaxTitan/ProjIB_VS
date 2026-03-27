'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserInfo } from '@/types/azure';
import { Procedure, ProcedureCategory } from '../../kpi/types';
import { useProcedures, useProcedureOps } from '@/hooks/useProcedures';
import { useProcesses } from '@/hooks/useProcesses';
import { TwoPanelLayout } from '../../shared';
import ProcedureLeftPanel from './ProcedureLeftPanel';
import ProcedureRightPanel, { type ProcedureFormData } from './ProcedureRightPanel';


const NO_PROCESS_KEY = '__NO_PROCESS__';
const NO_PROCESS_LABEL = '\u0411\u0435\u0437 \u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0430';

interface EtalonCount {
  procedure_id: string;
  task_count: number;
  note_count: number;
}

function decodeMojibake(value: string): string {
  if (!value || !/[РСЃ]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(Array.from(value).map((ch) => ch.charCodeAt(0) & 0xff));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return value;
  }
}

// Procedures content with two-panel layout
export default function ProceduresReferenceContent({ user, tabsSlot }: { user: UserInfo; tabsSlot?: React.ReactNode }) {
  // Данные из кеша (staleTime: Infinity)
  const { procedures: rawProcedures, loading: proceduresLoading, error: proceduresError } = useProcedures();
  const { processes, loading: processesLoading } = useProcesses();
  const { mutationError, saveProcedure, deleteProcedure } = useProcedureOps(user.user_id);

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
      actual_value: m.actual_value ?? undefined,
      plans_count: m.plans_count ?? undefined,
      total_hours: m.total_hours ?? undefined,
    })),
    [rawProcedures]
  );

  const { data: etalonCounts = [] } = useQuery<EtalonCount[]>({
    queryKey: ['etalon-counts'],
    queryFn: async () => {
      const res = await fetch('/api/ai/embeddings?mode=counts', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const etalonCountMap = useMemo(() => {
    const map: Record<string, { task: number; note: number }> = {};
    for (const row of etalonCounts) {
      map[row.procedure_id] = { task: row.task_count, note: row.note_count };
    }
    return map;
  }, [etalonCounts]);

  const loading = proceduresLoading || processesLoading;
  const error = mutationError || proceduresError;

  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [detailsMode, setDetailsMode] = useState<'view' | 'create'>('view');
  const [isEditing, setIsEditing] = useState(false);
  const [expandedProcesses, setExpandedProcesses] = useState<Record<string, boolean>>({});
  const canEdit = user.role === 'chief' || user.role === 'head';

  const processNameById = useMemo(
    () => Object.fromEntries(processes.map((process) => [process.process_id, process.process_name])),
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

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    service_name: '',
    process_id: '',
    category: 'operational' as ProcedureCategory,
    target_value: 0,
    target_period: 'year' as 'year' | 'quarter' | 'month'
  });

  // Sync selectedProcedure with updated procedures list and keep its process expanded
  useEffect(() => {
    if (selectedProcedure) {
      const updated = procedures.find(m => m.procedure_id === selectedProcedure.procedure_id);
      if (updated) {
        setSelectedProcedure(updated);
        // Keep the process expanded
        const processKey = getProcessKey(updated);
        setExpandedProcesses(prev => ({ ...prev, [processKey]: true }));
      }
    }
  }, [procedures, selectedProcedure, getProcessKey]);

  // Filter procedures
  const filteredProcedures = procedures;

  // Group by process (include empty processes so users can add procedures to them)
  const proceduresByProcess = useMemo(() => {
    const grouped: Record<string, Procedure[]> = {};

    // Initialize all known processes as empty groups
    processes.forEach(p => {
      grouped[`id:${p.process_id}`] = [];
    });

    filteredProcedures.forEach(m => {
      const processKey = getProcessKey(m);
      if (!grouped[processKey]) {
        grouped[processKey] = [];
      }
      grouped[processKey].push(m);
    });

    // Сортировка процессов по отображаемому имени, "Без процесса" внизу
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      if (a === NO_PROCESS_KEY) return 1;
      if (b === NO_PROCESS_KEY) return -1;
      return getProcessLabel(a).localeCompare(getProcessLabel(b), 'uk');
    });

    const sortedGrouped: Record<string, Procedure[]> = {};
    sortedKeys.forEach(key => {
      sortedGrouped[key] = grouped[key];
    });

    return sortedGrouped;
  }, [filteredProcedures, processes, getProcessKey, getProcessLabel]);

  // Get process keys list
  const processKeys = useMemo(() => Object.keys(proceduresByProcess), [proceduresByProcess]);

  // Toggle process expand/collapse
  const toggleProcess = useCallback((processKey: string) => {
    setExpandedProcesses(prev => ({
      ...prev,
      [processKey]: !prev[processKey]
    }));
  }, []);

  const handleSelectProcedure = (procedure: Procedure) => {
    setSelectedProcedure(procedure);
    setDetailsMode('view');
    setIsEditing(false);
    // Auto-expand the process containing this procedure
    const processKey = getProcessKey(procedure);
    setExpandedProcesses(prev => ({ ...prev, [processKey]: true }));
    setIsDrawerOpen(true);
  };

  const handleCloseDetails = () => {
    setSelectedProcedure(null);
    setDetailsMode('view');
    setIsEditing(false);
    setIsDrawerOpen(false);
  };

  const openNewForm = (processId = '') => {
    setSelectedProcedure(null);
    setFormData({
      name: '',
      description: '',
      service_name: '',
        process_id: processId,
      category: 'operational',
      target_value: 0,
      target_period: 'year'
    });
    setDetailsMode('create');
    setIsEditing(false);
    setIsDrawerOpen(true);
  };

  const openEditForm = (procedure: Procedure) => {
    setSelectedProcedure(procedure);
    setFormData({
      name: procedure.name,
      description: procedure.description || '',
      service_name: procedure.service_name || '',
      process_id: procedure.process_id || '',
      category: procedure.category,
      target_value: procedure.target_value,
      target_period: procedure.target_period
    });
    setIsEditing(true);
    setIsDrawerOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedProcedure) return;
    try {
      await saveProcedure('update', {
        procedure_id: selectedProcedure.procedure_id,
        name: formData.name,
        description: formData.description || null,
        service_name: formData.service_name || null,
        process_id: formData.process_id || null,
        category: formData.category,
        target_value: formData.target_value,
        target_period: formData.target_period,
      });
      setIsEditing(false);
    } catch {
      // error is in mutationError from useProcedureOps
    }
  };

  const handleCreateInline = async () => {
    try {
      await saveProcedure('create', {
        procedure_id: null,
        name: formData.name,
        description: formData.description || null,
        service_name: formData.service_name || null,
        process_id: formData.process_id || null,
        category: formData.category,
        target_value: formData.target_value,
        target_period: formData.target_period,
      });
      const savedProcessKey = formData.process_id ? `id:${formData.process_id}` : NO_PROCESS_KEY;
      setExpandedProcesses(prev => ({ ...prev, [savedProcessKey]: true }));
      setDetailsMode('view');
      setSelectedProcedure(null);
      setIsDrawerOpen(false);
    } catch {
      // error is in mutationError from useProcedureOps
    }
  };

  const handleCancelEdit = () => {
    if (!selectedProcedure) return;
    setFormData({
      name: selectedProcedure.name,
      description: selectedProcedure.description || '',
      service_name: selectedProcedure.service_name || '',
      process_id: selectedProcedure.process_id || '',
      category: selectedProcedure.category,
      target_value: selectedProcedure.target_value,
      target_period: selectedProcedure.target_period
    });
    setIsEditing(false);
  };

  const handleDelete = async (procedureId: string) => {
    await deleteProcedure(procedureId);
    if (selectedProcedure?.procedure_id === procedureId) {
      setSelectedProcedure(null);
    }
  };

  const isCreateMode = detailsMode === 'create';
  const modeLabel = isCreateMode ? 'Создать' : isEditing ? 'Редактирование' : 'Просмотр';

  const handleFormChange = useCallback((updates: Partial<ProcedureFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  return (
    <TwoPanelLayout
      leftPanel={
        <ProcedureLeftPanel
          tabsSlot={tabsSlot}
          loading={loading}
          error={error}
          processKeys={processKeys}
          proceduresByProcess={proceduresByProcess}
          expandedProcesses={expandedProcesses}
          selectedProcedure={selectedProcedure}
          canEdit={canEdit}
          etalonCountMap={etalonCountMap}
          totalProcedures={filteredProcedures.length}
          getProcessLabel={getProcessLabel}
          onToggleProcess={toggleProcess}
          onSelectProcedure={handleSelectProcedure}
          onAddToProcess={openNewForm}
        />
      }
      rightPanel={
        <ProcedureRightPanel
          selectedProcedure={selectedProcedure}
          isCreateMode={isCreateMode}
          isEditing={isEditing}
          canEdit={canEdit}
          modeLabel={modeLabel}
          processes={processes}
          formData={formData}
          onFormChange={handleFormChange}
          onEdit={() => selectedProcedure && openEditForm(selectedProcedure)}
          onSave={isCreateMode ? handleCreateInline : handleSaveEdit}
          onCancel={isCreateMode ? handleCloseDetails : handleCancelEdit}
          onClose={handleCloseDetails}
          onDelete={handleDelete}
          canDeleteEtalons={user.role === 'chief' || user.role === 'head'}
        />
      }
      isDrawerOpen={isDrawerOpen}
      onDrawerClose={handleCloseDetails}
      rightPanelClassName={(selectedProcedure || isCreateMode) ? 'overscroll-contain bg-purple-50/30' : 'overscroll-contain bg-transparent'}
    />
  );
}

// Projects content with two-panel layout
