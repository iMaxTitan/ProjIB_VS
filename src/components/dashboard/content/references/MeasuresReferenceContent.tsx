'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Check, Clock3, Layers, Pencil, Settings2, Target, Trash2, X } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { Measure, MeasureCategory } from '../kpi/types';
import ReferenceLeftPanelShell from './ReferenceLeftPanelShell';
import ReferenceGroupHeader from './ReferenceGroupHeader';
import ReferenceEmptyState from './ReferenceEmptyState';
import ReferenceDetailsEmptyState from './ReferenceDetailsEmptyState';
import ReferencesTwoPanelLayout from './ReferencesTwoPanelLayout';

// Measures constants
const CATEGORY_LABELS: Record<MeasureCategory, string> = {
  strategic: '\u0421\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u0447\u0435\u0441\u043a\u0438\u0439',
  process: '\u041f\u0440\u043e\u0446\u0435\u0441\u0441\u043d\u044b\u0439',
  operational: '\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439'
};

const CATEGORY_COLORS: Record<MeasureCategory, { bg: string; text: string; border: string }> = {
  strategic: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  process: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  operational: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' }
};

const PERIOD_LABELS: Record<string, string> = {
  year: '\u0432 \u0433\u043e\u0434',
  quarter: '\u0432 \u043a\u0432\u0430\u0440\u0442\u0430\u043b',
  month: '\u0432 \u043c\u0435\u0441\u044f\u0446'
};

interface Process {
  process_id: string;
  process_name: string;
}

const NO_PROCESS_KEY = '__NO_PROCESS__';
const NO_PROCESS_LABEL = '\u0411\u0435\u0437 \u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0430';

function decodeMojibake(value: string): string {
  if (!value || !/[РСЃ]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(Array.from(value).map((ch) => ch.charCodeAt(0) & 0xff));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return value;
  }
}

// Measures content with two-panel layout
export default function MeasuresReferenceContent({ user, tabsSlot }: { user: UserInfo; tabsSlot?: React.ReactNode }) {
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeasure, setSelectedMeasure] = useState<Measure | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [detailsMode, setDetailsMode] = useState<'view' | 'create'>('view');
  const [isEditing, setIsEditing] = useState(false);
  const [expandedProcesses, setExpandedProcesses] = useState<Record<string, boolean>>({});
  const canEdit = user.role === 'chief' || user.role === 'head';

  const processNameById = useMemo(
    () => Object.fromEntries(processes.map((process) => [process.process_id, process.process_name])),
    [processes]
  );

  const getProcessKey = useCallback((measure: Measure) => {
    if (measure.process_id) return `id:${measure.process_id}`;
    const rawName = (measure.process_name || '').trim();
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
    process_id: '',
    category: 'operational' as MeasureCategory,
    target_value: 0,
    target_period: 'year' as 'year' | 'quarter' | 'month'
  });

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: measuresData, error: measuresError } = await supabase
        .from('v_kpi_operational')
        .select('*');

      if (measuresError) throw measuresError;

      const { data: processesData, error: processesError } = await supabase
        .from('processes')
        .select('process_id, process_name')
        .order('process_name');

      if (processesError) throw processesError;

      setMeasures(measuresData?.map(m => ({
        measure_id: m.entity_id,
        process_id: m.process_id,
        name: m.entity_name,
        description: m.description,
        category: m.category,
        target_value: m.target_value,
        target_period: m.target_period,
        is_active: true,
        process_name: m.process_name,
        actual_value: m.actual_value,
        plans_count: m.plans_count,
        total_hours: m.total_hours
      })) || []);
      setProcesses(processesData || []);
    } catch (err: unknown) {
      setError('\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync selectedMeasure with updated measures list and keep its process expanded
  useEffect(() => {
    if (selectedMeasure) {
      const updated = measures.find(m => m.measure_id === selectedMeasure.measure_id);
      if (updated) {
        setSelectedMeasure(updated);
        // Keep the process expanded
        const processKey = getProcessKey(updated);
        setExpandedProcesses(prev => ({ ...prev, [processKey]: true }));
      }
    }
  }, [measures, getProcessKey]);

  // Filter measures
  const filteredMeasures = measures;

  // Group by process
  const measuresByProcess = useMemo(() => {
    const grouped: Record<string, Measure[]> = {};

    filteredMeasures.forEach(m => {
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

    const sortedGrouped: Record<string, Measure[]> = {};
    sortedKeys.forEach(key => {
      sortedGrouped[key] = grouped[key];
    });

    return sortedGrouped;
  }, [filteredMeasures, getProcessKey, getProcessLabel]);

  // Get process keys list
  const processKeys = useMemo(() => Object.keys(measuresByProcess), [measuresByProcess]);

  // Toggle process expand/collapse
  const toggleProcess = useCallback((processKey: string) => {
    setExpandedProcesses(prev => ({
      ...prev,
      [processKey]: !prev[processKey]
    }));
  }, []);

  const handleSelectMeasure = (measure: Measure) => {
    setSelectedMeasure(measure);
    setDetailsMode('view');
    setIsEditing(false);
    // Auto-expand the process containing this measure
    const processKey = getProcessKey(measure);
    setExpandedProcesses(prev => ({ ...prev, [processKey]: true }));
    setIsDrawerOpen(true);
  };

  const handleCloseDetails = () => {
    setSelectedMeasure(null);
    setDetailsMode('view');
    setIsEditing(false);
    setIsDrawerOpen(false);
  };

  const openNewForm = (processId = '') => {
    setSelectedMeasure(null);
    setFormData({
      name: '',
      description: '',
      process_id: processId,
      category: 'operational',
      target_value: 0,
      target_period: 'year'
    });
    setDetailsMode('create');
    setIsEditing(false);
    setIsDrawerOpen(true);
  };

  const openEditForm = (measure: Measure) => {
    setSelectedMeasure(measure);
    setFormData({
      name: measure.name,
      description: measure.description || '',
      process_id: measure.process_id || '',
      category: measure.category,
      target_value: measure.target_value,
      target_period: measure.target_period
    });
    setIsEditing(true);
    setIsDrawerOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedMeasure) return;
    try {
      const { data, error } = await supabase.rpc('manage_measure', {
        p_action: 'update',
        p_measure_id: selectedMeasure.measure_id,
        p_name: formData.name,
        p_description: formData.description || null,
        p_process_id: formData.process_id || null,
        p_category: formData.category,
        p_target_value: formData.target_value,
        p_target_period: formData.target_period,
        p_user_id: user.user_id
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Ошибка сохранения');

      setIsEditing(false);
      await fetchData();
    } catch (err: unknown) {
      setError('Ошибка сохранения: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCreateInline = async () => {
    try {
      const { data, error } = await supabase.rpc('manage_measure', {
        p_action: 'create',
        p_measure_id: null,
        p_name: formData.name,
        p_description: formData.description || null,
        p_process_id: formData.process_id || null,
        p_category: formData.category,
        p_target_value: formData.target_value,
        p_target_period: formData.target_period,
        p_user_id: user.user_id
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Ошибка сохранения');

      const savedProcessKey = formData.process_id ? `id:${formData.process_id}` : NO_PROCESS_KEY;
      setExpandedProcesses(prev => ({ ...prev, [savedProcessKey]: true }));
      setDetailsMode('view');
      setSelectedMeasure(null);
      setIsDrawerOpen(false);
      await fetchData();
    } catch (err: unknown) {
      setError('Ошибка сохранения: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleCancelEdit = () => {
    if (!selectedMeasure) return;
    setFormData({
      name: selectedMeasure.name,
      description: selectedMeasure.description || '',
      process_id: selectedMeasure.process_id || '',
      category: selectedMeasure.category,
      target_value: selectedMeasure.target_value,
      target_period: selectedMeasure.target_period
    });
    setIsEditing(false);
  };

  const handleDelete = async (measureId: string) => {
    if (!confirm('\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u044d\u0442\u043e \u043c\u0435\u0440\u043e\u043f\u0440\u0438\u044f\u0442\u0438\u0435?')) return;
    try {
      const { data, error } = await supabase.rpc('manage_measure', {
        p_action: 'delete',
        p_measure_id: measureId,
        p_user_id: user.user_id
      });

      if (error) throw error;
      if (data && !data.success) {
        throw new Error(data.error || '\u041e\u0448\u0438\u0431\u043a\u0430 \u0443\u0434\u0430\u043b\u0435\u043d\u0438\u044f');
      }

      setMeasures(prev => prev.filter(m => m.measure_id !== measureId));
      if (selectedMeasure?.measure_id === measureId) {
        setSelectedMeasure(null);
      }
    } catch (err: unknown) {
      setError('\u041e\u0448\u0438\u0431\u043a\u0430 \u0443\u0434\u0430\u043b\u0435\u043d\u0438\u044f: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Left panel - measures list
  const leftPanel = (
    <ReferenceLeftPanelShell
      tabsSlot={tabsSlot}
      loading={loading}
      error={error}
      isEmpty={processKeys.length === 0}
      loadingColorClass="border-purple-500"
      bodyClassName="space-y-2"
      emptyState={<ReferenceEmptyState icon={<Target className="h-12 w-12" aria-hidden="true" />} text="Мероприятия не найдены" />}
      body={processKeys.map((processKey) => {
        const processMeasures = measuresByProcess[processKey] || [];
        const isExpanded = expandedProcesses[processKey] ?? false;
        const processIdForCreate =
          (processKey.startsWith('id:') ? processKey.slice(3) : '') ||
          processMeasures.find((measure) => !!measure.process_id)?.process_id ||
          '';
        const processTitle = getProcessLabel(processKey);

        return (
          <div key={processKey} className="space-y-1">
            <ReferenceGroupHeader
              title={processTitle}
              count={processMeasures.length}
              expanded={isExpanded}
              onToggle={() => toggleProcess(processKey)}
              onAdd={canEdit ? () => openNewForm(processIdForCreate) : undefined}
              toggleAriaLabel={`${isExpanded ? 'Свернуть' : 'Развернуть'} процесс ${processTitle}`}
              addAriaLabel={`Добавить мероприятие в процесс ${processTitle}`}
              containerClassName={cn(
                'overflow-hidden bg-gradient-to-r from-purple-100/80 to-purple-50/80 border border-purple-200/50',
                'hover:from-purple-200/80 hover:to-purple-100/80',
                'focus:outline-none focus:ring-2 focus:ring-purple-500',
                'transition-all'
              )}
              chevronClassName="text-purple-400"
              titleClassName="text-purple-700"
              countClassName="text-purple-400 bg-white/60"
              addButtonClassName="border-purple-200 bg-purple-50 text-purple-600 hover:bg-purple-100"
            />

            {isExpanded && (
              <div className="space-y-1 pl-2">
                {processMeasures.map((measure) => {
                  const isSelected = selectedMeasure?.measure_id === measure.measure_id;
                  const percentage = measure.target_value > 0
                    ? Math.round((measure.actual_value || 0) / measure.target_value * 100)
                    : 0;
                  const colors = CATEGORY_COLORS[measure.category] || CATEGORY_COLORS.operational;

                  return (
                    <button
                      key={measure.measure_id}
                      type="button"
                      onClick={() => handleSelectMeasure(measure)}
                      aria-label={`Выбрать ${measure.name}`}
                      aria-current={isSelected ? 'true' : undefined}
                      className={cn(
                        'w-full p-2.5 rounded-lg border text-left transition-all group',
                        'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1',
                        'active:scale-[0.98]',
                        isSelected
                          ? 'bg-purple-50 border-purple-300 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-1', colors.bg.replace('-100', '-500'))} />
                        <div className="flex-1 min-w-0">
                          <span className={cn('text-sm font-medium line-clamp-2', isSelected ? 'text-purple-900' : 'text-slate-800')}>
                            {measure.name}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn('text-2xs px-1.5 py-0.5 rounded', colors.bg, colors.text)}>
                              {CATEGORY_LABELS[measure.category]}
                            </span>
                            <span className="text-2xs text-slate-500">
                              {measure.target_value}/{measure.actual_value || 0}
                            </span>
                            <span className={cn('text-2xs font-bold', percentage >= 100 ? 'text-green-600' : percentage >= 50 ? 'text-amber-600' : 'text-red-500')}>
                              {percentage}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
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
          <span className="text-sm">Всего мероприятий: {filteredMeasures.length}</span>
        </div>
      }
    />
  );

  // Right panel - measure details
  const isCreateMode = detailsMode === 'create';
  const editingMode = isEditing || isCreateMode;
  const modeLabel = isCreateMode ? 'Создать' : isEditing ? 'Редактирование' : 'Просмотр';

  const rightPanel = selectedMeasure || isCreateMode ? (
    <div className="p-4">
      <div className="rounded-3xl shadow-glass border border-white/30 overflow-hidden glass-card max-w-3xl animate-scale">
        <div className="p-4 sm:p-5 bg-gradient-to-r from-purple-400/80 to-indigo-400/80 text-white backdrop-blur-md">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center text-sm px-2.5 py-1 rounded-full font-semibold bg-white/20 text-white backdrop-blur-sm">
                {modeLabel}
              </span>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {editingMode ? (
                  <>
                    <button
                      type="button"
                      onClick={isCreateMode ? handleCloseDetails : handleCancelEdit}
                      aria-label="Отменить редактирование"
                      className="p-2 hover:bg-white/20 rounded-xl transition-all text-white/80 hover:text-white"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={isCreateMode ? handleCreateInline : handleSaveEdit}
                      aria-label="Сохранить"
                      className="p-2 hover:bg-white/20 rounded-xl transition-all text-white"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => selectedMeasure && openEditForm(selectedMeasure)}
                      aria-label="Редактировать"
                      className="p-2 hover:bg-white/20 rounded-xl transition-all text-white/90 hover:text-white"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {selectedMeasure && (
                      <button
                        type="button"
                        onClick={() => handleDelete(selectedMeasure.measure_id)}
                        aria-label="Удалить"
                        className="p-2 hover:bg-red-500/25 rounded-xl transition-all text-white/90 hover:text-white"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          <section>
            <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">Название</h4>
            {editingMode ? (
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                placeholder="Название"
              />
            ) : (
              <p className="text-sm text-slate-700 bg-white/60 rounded-xl border border-gray-100 p-3">
                {selectedMeasure?.name || 'Без названия'}
              </p>
            )}
          </section>

          <section>
            <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">Описание</h4>
            {editingMode ? (
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                rows={3}
                placeholder="Описание"
              />
            ) : (
              <p className="text-sm text-slate-700 bg-white/60 rounded-xl border border-gray-100 p-3">
                {selectedMeasure?.description || 'Без описания'}
              </p>
            )}
          </section>

          <section>
            <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Параметры мероприятия</h4>
            {editingMode ? (
              <div className="space-y-3">
                <select
                  value={formData.category}
                  onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value as MeasureCategory }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                >
                  <option value="strategic">Стратегический</option>
                  <option value="process">Процессный</option>
                  <option value="operational">Операционный</option>
                </select>
                <select
                  value={formData.process_id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, process_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                >
                  <option value="">Не выбрано</option>
                  {processes.map((p) => (
                    <option key={p.process_id} value={p.process_id}>{p.process_name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-gray-100 text-sm">
                  <div className="p-2 bg-violet-100 rounded-lg flex-shrink-0">
                    <Layers className="h-4 w-4 text-violet-600" aria-hidden="true" />
                  </div>
                  <span className="font-medium text-slate-700">{selectedMeasure ? (CATEGORY_LABELS[selectedMeasure.category] || 'Операционный') : '-'}</span>
                </div>
                {selectedMeasure?.process_name && (
                  <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-gray-100 text-sm">
                    <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                      <Settings2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
                    </div>
                    <span className="font-medium text-slate-700">{selectedMeasure?.process_name}</span>
                  </div>
                )}
              </div>
            )}
          </section>

          <section>
            <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">Часы</h4>
            {editingMode ? (
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min="0"
                  value={formData.target_value}
                  onChange={(e) => setFormData((prev) => ({ ...prev, target_value: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="План часов"
                />
                <select
                  value={formData.target_period}
                  onChange={(e) => setFormData((prev) => ({ ...prev, target_period: e.target.value as 'year' | 'quarter' | 'month' }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                >
                  <option value="year">На год</option>
                  <option value="quarter">На квартал</option>
                  <option value="month">На месяц</option>
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-gray-100 text-sm">
                <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
                  <Clock3 className="h-4 w-4 text-amber-600" aria-hidden="true" />
                </div>
                <span className="font-medium text-slate-700">
                  {selectedMeasure?.target_value ?? 0} ч {selectedMeasure ? PERIOD_LABELS[selectedMeasure.target_period] : ''}
                </span>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  ) : (
    <ReferenceDetailsEmptyState
      icon={<Target className="h-16 w-16" aria-hidden="true" />}
      title="Выберите мероприятие"
      description="Нажмите на мероприятие в списке слева для просмотра деталей"
    />
  );

  return (
    <>
      <ReferencesTwoPanelLayout
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        isDrawerOpen={isDrawerOpen}
        onDrawerClose={handleCloseDetails}
        rightPanelClassName={cn('overscroll-contain', (selectedMeasure || isCreateMode) ? 'bg-purple-50/30' : 'bg-transparent')}
        mobileDrawerContentClassName="p-3 pb-6"
        resizerClassName="hover:bg-purple-300/50 active:bg-purple-400/50"
      />
    </>
  );
}

// Projects content with two-panel layout

