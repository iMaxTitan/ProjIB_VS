'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Star, Plus, Trash2, Loader2, BookOpen, FileText } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Button } from '@/components/ui/Button';
import logger from '@/lib/shared/logger';
import AITextCleanup from '@/components/ui/AITextCleanup';

interface Etalon {
  id: string;
  content: string;
  category: 'task_description' | 'company_report_note';
  source: string;
  created_at: string;
}

type Category = 'task_description' | 'company_report_note';

const CATEGORY_CONFIG: Record<Category, { label: string; icon: React.ReactNode; placeholder: string }> = {
  task_description: {
    label: 'Описи задач',
    icon: <FileText className="w-3.5 h-3.5" aria-hidden="true" />,
    placeholder: 'Напр.: Забезпечено моніторинг подій ІБ засобами SIEM...',
  },
  company_report_note: {
    label: 'Примітки звітів',
    icon: <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />,
    placeholder: 'Напр.: Забезпечено безперервний моніторинг подій ІБ протягом звітного періоду...',
  },
};

interface ProcedureEtalonsProps {
  procedureId: string;
  procedureName?: string;
  procedureDescription?: string;
  canCreate: boolean;
  canDelete: boolean;
  onEtalonSelect?: (content: string | null) => void;
}

export type { Etalon as ProcedureEtalon };

export default function ProcedureEtalons({ procedureId, procedureName, procedureDescription, canCreate, canDelete, onEtalonSelect }: ProcedureEtalonsProps) {
  const [etalons, setEtalons] = useState<Etalon[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Category>('task_description');
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Selected etalon for template generation (communicated to parent)
  const [selectedEtalonId, setSelectedEtalonId] = useState<string | null>(null);

  // Fetch etalons for both categories with AbortController
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const opts = { credentials: 'include' as const, signal: controller.signal };
        const [taskRes, noteRes] = await Promise.all([
          fetch(`/api/ai/embeddings?procedure_id=${procedureId}&category=task_description&limit=20`, opts),
          fetch(`/api/ai/embeddings?procedure_id=${procedureId}&category=company_report_note&limit=20`, opts),
        ]);

        if (controller.signal.aborted) return;

        const taskData: Etalon[] = taskRes.ok ? await taskRes.json() : [];
        const noteData: Etalon[] = noteRes.ok ? await noteRes.json() : [];
        setEtalons([...taskData, ...noteData]);
      } catch (err) {
        if (controller.signal.aborted) return;
        logger.error('[ProcedureEtalons] Failed to load:', err);
        setError('Помилка завантаження еталонів');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [procedureId]);

  // Switch tab — clear error and input
  const handleTabChange = (cat: Category) => {
    setActiveTab(cat);
    setError(null);
    setNewContent('');
  };

  // Add new etalon
  const handleAdd = async () => {
    const text = newContent.trim();
    if (!text || text.length < 10) {
      setError('Мінімум 10 символів');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/embeddings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          category: activeTab,
          procedure_id: procedureId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const created: Etalon = await res.json();
      setEtalons((prev) => [created, ...prev]);
      setNewContent('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка збереження';
      setError(msg);
      logger.error('[ProcedureEtalons] Add error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Delete etalon (pessimistic — remove only after success)
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/ai/embeddings?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      setEtalons((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка видалення';
      setError(msg);
      logger.error('[ProcedureEtalons] Delete error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // Notify parent when selection changes
  const handleSelectEtalon = (etalonId: string | null) => {
    setSelectedEtalonId(etalonId);
    if (onEtalonSelect) {
      const etalon = etalonId ? etalons.find((e) => e.id === etalonId) : null;
      onEtalonSelect(etalon?.content ?? null);
    }
  };

  const filteredEtalons = etalons.filter((e) => e.category === activeTab);
  const taskCount = etalons.filter((e) => e.category === 'task_description').length;
  const noteCount = etalons.filter((e) => e.category === 'company_report_note').length;

  return (
    <div className="space-y-3">
      {/* Category tabs */}
      <div className="flex gap-1 p-0.5 bg-purple-100/50 rounded-lg" role="tablist" aria-label="Категорії еталонів">
        {(Object.keys(CATEGORY_CONFIG) as Category[]).map((cat) => {
          const cfg = CATEGORY_CONFIG[cat];
          const count = cat === 'task_description' ? taskCount : noteCount;
          const isActive = activeTab === cat;

          return (
            <button
              key={cat}
              type="button"
              role="tab"
              onClick={() => handleTabChange(cat)}
              aria-label={cfg.label}
              aria-selected={isActive}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-1.5 sm:px-2 py-1.5 text-xs font-medium rounded-md',
                'transition-colors duration-150',
                'focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-1',
                isActive
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-purple-500 hover:text-purple-700 hover:bg-white/50'
              )}
            >
              {cfg.icon}
              <span className="hidden sm:inline">{cfg.label}</span>
              {count > 0 && (
                <span
                  aria-label={`${count} еталонів`}
                  className={cn(
                    'text-2xs px-1.5 py-0.5 rounded-full font-bold',
                    isActive ? 'bg-purple-100 text-purple-700' : 'bg-purple-50 text-purple-400'
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-4 text-purple-400">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          <span className="ml-2 text-xs">Завантаження...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Etalons list */}
      {!loading && (
        <div className="space-y-1.5" role="tabpanel" aria-label={CATEGORY_CONFIG[activeTab].label}>
          {filteredEtalons.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-400">
              <Star className="w-5 h-5 mx-auto mb-1 text-slate-300" aria-hidden="true" />
              Еталонів поки немає
            </div>
          ) : (
            filteredEtalons.map((etalon) => {
              const isSelectable = activeTab === 'task_description' && !!onEtalonSelect;
              const isSelected = etalon.id === selectedEtalonId;

              return (
                <div
                  key={etalon.id}
                  role={isSelectable ? 'button' : undefined}
                  tabIndex={isSelectable ? 0 : undefined}
                  onClick={isSelectable ? () => handleSelectEtalon(isSelected ? null : etalon.id) : undefined}
                  onKeyDown={isSelectable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectEtalon(isSelected ? null : etalon.id); } } : undefined}
                  className={cn(
                    'group flex items-start gap-2 p-2.5 rounded-xl',
                    'transition-colors duration-150',
                    isSelected
                      ? 'bg-violet-100/80 border border-violet-300 ring-1 ring-violet-300'
                      : 'bg-amber-50/70 border border-amber-200/60',
                    isSelectable && !isSelected && 'cursor-pointer hover:bg-amber-100/70',
                  )}
                >
                  <Star className={cn('w-3.5 h-3.5 flex-shrink-0 mt-0.5', isSelected ? 'text-violet-500' : 'text-amber-400')} aria-hidden="true" />
                  <p className="flex-1 text-xs text-slate-700 leading-relaxed break-words">
                    {etalon.content}
                  </p>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(etalon.id); }}
                      disabled={deletingId === etalon.id}
                      aria-label="Видалити еталон"
                      className={cn(
                        'flex-shrink-0 p-1 rounded-md',
                        'opacity-0 group-hover:opacity-100',
                        'text-red-400 hover:text-red-600 hover:bg-red-50',
                        'transition-[opacity,background-color] duration-150',
                        'focus:outline-none focus:ring-2 focus:ring-red-400 focus:opacity-100',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                    >
                      {deletingId === etalon.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Add form */}
      {canCreate && !loading && (
        <div className="space-y-2 pt-1">
          <div className="flex items-end gap-2">
            <textarea
              value={newContent}
              onChange={(e) => {
                setNewContent(e.target.value);
                if (error) setError(null);
              }}
              placeholder={CATEGORY_CONFIG[activeTab].placeholder}
              rows={5}
              maxLength={2000}
              aria-label={`Новий еталон: ${CATEGORY_CONFIG[activeTab].label}`}
              className={cn(
                'flex-1 border border-purple-200 rounded-lg px-3 py-2 text-xs',
                'placeholder:text-slate-400 resize-none',
                'focus:ring-2 focus:ring-purple-400 focus:border-purple-400 focus:outline-none',
                'transition-colors duration-150'
              )}
            />
          </div>
          <div className="flex items-center gap-2">
            <AITextCleanup
              text={newContent}
              onResult={setNewContent}
              category={activeTab}
              procedureId={procedureId}
              procedureName={procedureName}
            />
            <div className="flex-1" />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={saving || !newContent.trim()}
              aria-label={`Додати еталон: ${CATEGORY_CONFIG[activeTab].label}`}
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              Додати
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
