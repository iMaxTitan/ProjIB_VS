'use client';

import React, { useState, useCallback } from 'react';
import { Clock3, Settings2, Target } from 'lucide-react';
import type { Procedure, ProcedureCategory } from '../../kpi/types';
import { GradientDetailCard, DetailSection } from '../../shared';
import ReferenceDetailsEmptyState from '../ReferenceDetailsEmptyState';
import ProcedureEtalons from './ProcedureEtalons';
import ProcedureTaskTemplates from './ProcedureTaskTemplates';
import logger from '@/lib/shared/logger';

const PERIOD_LABELS: Record<string, string> = {
  year: 'в год',
  quarter: 'в квартал',
  month: 'в месяц',
};

export interface ProcedureFormData {
  name: string;
  description: string;
  service_name: string;
  process_id: string;
  category: ProcedureCategory;
  target_value: number;
  target_period: 'year' | 'quarter' | 'month';
}

interface Props {
  selectedProcedure: Procedure | null;
  isCreateMode: boolean;
  isEditing: boolean;
  canEdit: boolean;
  modeLabel: string;
  processes: Array<{ process_id: string; process_name: string }>;
  formData: ProcedureFormData;
  onFormChange: (updates: Partial<ProcedureFormData>) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onClose: () => void;
  onDelete: (procedureId: string) => void;
  canDeleteEtalons: boolean;
}

export default function ProcedureRightPanel({
  selectedProcedure,
  isCreateMode,
  isEditing,
  canEdit,
  modeLabel,
  processes,
  formData,
  onFormChange,
  onEdit,
  onSave,
  onCancel,
  onClose,
  onDelete,
  canDeleteEtalons,
}: Props) {
  const editingMode = isEditing || isCreateMode;

  // Selected etalon content for generation (from ProcedureEtalons)
  const [selectedEtalonContent, setSelectedEtalonContent] = useState<string | null>(null);
  // Generated template flows to ProcedureTaskTemplates
  const [pendingTemplate, setPendingTemplate] = useState<{ title: string; content: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleEtalonSelect = useCallback((content: string | null) => {
    setSelectedEtalonContent(content);
  }, []);

  // Generate template — called from ProcedureTaskTemplates button
  const handleGenerate = useCallback(async () => {
    if (!selectedEtalonContent || !selectedProcedure) return;

    setGenerating(true);
    try {
      const res = await fetch('/api/cabinet/task-templates/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etalon_content: selectedEtalonContent,
          procedure_name: selectedProcedure.name,
          procedure_description: selectedProcedure.description,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const result = await res.json() as { title: string; content: string };
      setPendingTemplate(result);
      setSelectedEtalonContent(null);
    } catch (err) {
      logger.error('[ProcedureRightPanel] Generate error:', err);
    } finally {
      setGenerating(false);
    }
  }, [selectedEtalonContent, selectedProcedure]);

  const handleTemplateConsumed = useCallback(() => {
    setPendingTemplate(null);
  }, []);

  if (!selectedProcedure && !isCreateMode) {
    return (
      <ReferenceDetailsEmptyState
        icon={<Target className="h-16 w-16" aria-hidden="true" />}
        title="Выберите процедуру"
        description="Нажмите на процедуру в списке слева для просмотра деталей"
      />
    );
  }

  return (
    <GradientDetailCard
      modeLabel={modeLabel}
      isEditing={editingMode}
      canEdit={canEdit}
      gradientClassName="from-purple-400/80 to-indigo-400/80"
      headerIcon={<Target />}
      onEdit={selectedProcedure ? onEdit : undefined}
      onSave={onSave}
      onCancel={onCancel}
      onClose={onClose}
      onDelete={selectedProcedure ? () => onDelete(selectedProcedure.procedure_id) : undefined}
      deleteConfirm
    >
      <DetailSection title="Название" colorScheme="purple">
        {editingMode ? (
          <input
            type="text"
            value={formData.name}
            onChange={(e) => onFormChange({ name: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            placeholder="Название"
          />
        ) : (
          <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
            {selectedProcedure?.name || 'Без названия'}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Описание" colorScheme="purple">
        {editingMode ? (
          <textarea
            value={formData.description}
            onChange={(e) => onFormChange({ description: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            rows={3}
            placeholder="Описание"
          />
        ) : (
          <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
            {selectedProcedure?.description || 'Без описания'}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Услуга" colorScheme="purple">
        {editingMode ? (
          <input
            type="text"
            value={formData.service_name}
            onChange={(e) => onFormChange({ service_name: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            placeholder="Назва послуги"
            aria-label="Назва послуги"
          />
        ) : (
          <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
            {selectedProcedure?.service_name || 'Не вказана'}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Процесс" colorScheme="purple">
        {editingMode ? (
          <select
            value={formData.process_id}
            onChange={(e) => onFormChange({ process_id: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
          >
            <option value="">Не выбрано</option>
            {processes.map((p) => (
              <option key={p.process_id} value={p.process_id}>{p.process_name}</option>
            ))}
          </select>
        ) : (
          selectedProcedure?.process_name ? (
            <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-slate-100 text-sm">
              <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                <Settings2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
              </div>
              <span className="font-medium text-slate-700">{selectedProcedure.process_name}</span>
            </div>
          ) : (
            <div className="glass-card p-3 rounded-2xl text-slate-500 bg-white/40 text-sm">Не призначено</div>
          )
        )}
      </DetailSection>

      <DetailSection title="Часы" colorScheme="purple">
        {editingMode ? (
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              min="0"
              value={formData.target_value}
              onChange={(e) => onFormChange({ target_value: parseInt(e.target.value, 10) || 0 })}
              onFocus={(e) => e.target.select()}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              placeholder="План часов"
            />
            <select
              value={formData.target_period}
              onChange={(e) => onFormChange({ target_period: e.target.value as 'year' | 'quarter' | 'month' })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
            >
              <option value="year">На год</option>
              <option value="quarter">На квартал</option>
              <option value="month">На месяц</option>
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-slate-100 text-sm">
            <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
              <Clock3 className="h-4 w-4 text-amber-600" aria-hidden="true" />
            </div>
            <span className="font-medium text-slate-700">
              {selectedProcedure?.target_value ?? 0} ч {selectedProcedure ? PERIOD_LABELS[selectedProcedure.target_period] : ''}
            </span>
          </div>
        )}
      </DetailSection>

      {selectedProcedure && !editingMode && (
        <DetailSection title="Шаблони завдань" colorScheme="purple">
          <ProcedureTaskTemplates
            procedureId={selectedProcedure.procedure_id}
            pendingTemplate={pendingTemplate}
            onTemplateConsumed={handleTemplateConsumed}
            canGenerate={!!selectedEtalonContent}
            generating={generating}
            onGenerate={handleGenerate}
            canCreate={canEdit}
            canDelete={canDeleteEtalons}
            canEdit={canEdit}
          />
        </DetailSection>
      )}

      {selectedProcedure && !editingMode && (
        <DetailSection title="Еталони AI" colorScheme="purple">
          <ProcedureEtalons
            procedureId={selectedProcedure.procedure_id}
            procedureName={selectedProcedure.name}
            procedureDescription={selectedProcedure.description}
            canCreate={canEdit}
            canDelete={canDeleteEtalons}
            onEtalonSelect={handleEtalonSelect}
          />
        </DetailSection>
      )}
    </GradientDetailCard>
  );
}
