'use client';

import React, { useState, useEffect } from 'react';
import { Lightbulb } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { GradientDetailCard, DetailSection } from '../../shared';
import type { Initiative } from '@/hooks/useInitiatives';

interface Props {
  initiative: Initiative;
  processes: { process_id: string; process_name: string }[];
  canEdit: boolean;
  onSave: (data: Partial<Initiative>) => Promise<void>;
  onDelete: () => Promise<void>;
}

export default function InitiativeRightPanel({ initiative, processes, canEdit, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initiative.title);
  const [description, setDescription] = useState(initiative.description ?? '');
  const [isActive, setIsActive] = useState(initiative.is_active);
  const [processId, setProcessId] = useState<string | null>(initiative.process_id ?? null);

  useEffect(() => {
    setTitle(initiative.title);
    setDescription(initiative.description ?? '');
    setIsActive(initiative.is_active);
    setProcessId(initiative.process_id ?? null);
    setEditing(false);
  }, [initiative]);

  const handleSave = async () => {
    await onSave({ title, description: description || null, is_active: isActive, process_id: processId });
    setEditing(false);
  };

  const handleCancel = () => {
    setTitle(initiative.title);
    setDescription(initiative.description ?? '');
    setIsActive(initiative.is_active);
    setProcessId(initiative.process_id ?? null);
    setEditing(false);
  };

  const processName = processes.find(p => p.process_id === initiative.process_id)?.process_name;

  return (
    <GradientDetailCard
      modeLabel={editing ? 'Редагування' : initiative.title}
      isEditing={editing}
      canEdit={canEdit}
      gradientClassName="from-amber-400/80 to-orange-400/80"
      headerIcon={<Lightbulb />}
      onEdit={() => setEditing(true)}
      onSave={handleSave}
      onCancel={handleCancel}
      onDelete={() => onDelete()}
      deleteConfirm
    >
      <DetailSection title="Назва" colorScheme="amber">
        {editing ? (
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            placeholder="Назва ініціативи" />
        ) : (
          <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
            {initiative.title}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Опис" colorScheme="amber">
        {editing ? (
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
            rows={4} placeholder="Опис ініціативи" />
        ) : (
          <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
            {initiative.description || 'Без опису'}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Процес" colorScheme="amber">
        {editing ? (
          <select value={processId ?? ''} onChange={e => setProcessId(e.target.value || null)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
            <option value="">Не визначено</option>
            {processes.map(p => <option key={p.process_id} value={p.process_id}>{p.process_name}</option>)}
          </select>
        ) : (
          <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
            {processName || 'Не визначено'}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Статус" colorScheme="amber">
        {editing ? (
          <button onClick={() => setIsActive(!isActive)}
            className={cn('text-xs font-medium px-3 py-1.5 rounded-full transition-colors',
              isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
            {isActive ? 'Активна' : 'Неактивна'}
          </button>
        ) : (
          <span className={cn('text-xs font-medium px-3 py-1.5 rounded-full inline-block',
            initiative.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
            {initiative.is_active ? 'Активна' : 'Неактивна'}
          </span>
        )}
      </DetailSection>

      <div className="px-4 py-2 text-[10px] text-slate-400">
        Створено: {new Date(initiative.created_at).toLocaleDateString('uk-UA')}
        {initiative.source !== 'planned' && ` · ${initiative.source}`}
      </div>
    </GradientDetailCard>
  );
}
