'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ListChecks, Plus, Trash2, Loader2, Sparkles, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Button } from '@/components/ui/Button';
import logger from '@/lib/shared/logger';

interface TaskTemplate {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

interface ProcedureTaskTemplatesProps {
  procedureId: string;
  pendingTemplate?: { title: string; content: string } | null;
  onTemplateConsumed?: () => void;
  canGenerate?: boolean;
  generating?: boolean;
  onGenerate?: () => void;
  canCreate: boolean;
  canDelete: boolean;
  canEdit: boolean;
}

export default function ProcedureTaskTemplates({
  procedureId, pendingTemplate, onTemplateConsumed, canGenerate, generating, onGenerate, canCreate, canDelete, canEdit,
}: ProcedureTaskTemplatesProps) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch templates
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/cabinet/task-templates?procedure_id=${procedureId}`, {
          credentials: 'include', signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setTemplates(res.ok ? await res.json() : []);
      } catch (err) {
        if (controller.signal.aborted) return;
        logger.error('[ProcedureTaskTemplates] Load error:', err);
        setError('Помилка завантаження шаблонів');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [procedureId]);

  // Consume pending template from AI generation
  useEffect(() => {
    if (pendingTemplate) {
      setNewTitle(pendingTemplate.title);
      setNewContent(pendingTemplate.content);
      onTemplateConsumed?.();
    }
  }, [pendingTemplate, onTemplateConsumed]);

  // Add template
  const handleAdd = async () => {
    const title = newTitle.trim();
    const content = newContent.trim();
    if (!title || title.length < 3) { setError('Назва: мінімум 3 символи'); return; }
    if (!content || content.length < 10) { setError('Опис: мінімум 10 символів'); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/cabinet/task-templates', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, procedure_id: procedureId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const created: TaskTemplate = await res.json();
      setTemplates((prev) => [created, ...prev]);
      setNewTitle('');
      setNewContent('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка збереження';
      setError(msg);
      logger.error('[ProcedureTaskTemplates] Add error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Delete template
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/cabinet/task-templates?id=${id}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка видалення';
      setError(msg);
      logger.error('[ProcedureTaskTemplates] Delete error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // Start editing
  const handleEditStart = (t: TaskTemplate) => {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditContent(t.content);
    setError(null);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditTitle('');
    setEditContent('');
  };

  // Save edit
  const handleEditSave = async () => {
    if (!editingId) return;
    const title = editTitle.trim();
    const content = editContent.trim();
    if (!title || title.length < 3) { setError('Назва: мінімум 3 символи'); return; }
    if (!content || content.length < 10) { setError('Опис: мінімум 10 символів'); return; }

    setEditSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/cabinet/task-templates', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, title, content }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const updated: TaskTemplate = await res.json();
      setTemplates((prev) => prev.map((t) => (t.id === editingId ? { ...t, title: updated.title, content: updated.content } : t)));
      handleEditCancel();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка збереження';
      setError(msg);
      logger.error('[ProcedureTaskTemplates] Edit error:', err);
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="space-y-3">
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

      {/* Templates list */}
      {!loading && (
        <div className="space-y-1.5">
          {templates.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-400">
              <ListChecks className="w-5 h-5 mx-auto mb-1 text-slate-300" aria-hidden="true" />
              Шаблонів поки немає
            </div>
          ) : (
            templates.map((template) =>
              editingId === template.id ? (
                <div
                  key={template.id}
                  className={cn(
                    'p-2.5 rounded-xl space-y-2',
                    'bg-purple-100/80 border border-purple-300/80',
                  )}
                >
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => { setEditTitle(e.target.value); if (error) setError(null); }}
                    maxLength={200}
                    aria-label="Назва шаблону"
                    className={cn(
                      'w-full border border-purple-300 rounded-lg px-3 py-1.5 text-sm font-semibold',
                      'bg-white/80 placeholder:text-slate-400',
                      'focus:ring-2 focus:ring-purple-400 focus:border-purple-400 focus:outline-none',
                    )}
                  />
                  <textarea
                    value={editContent}
                    onChange={(e) => { setEditContent(e.target.value); if (error) setError(null); }}
                    rows={3}
                    maxLength={2000}
                    aria-label="Опис шаблону"
                    className={cn(
                      'w-full border border-purple-300 rounded-lg px-3 py-1.5 text-xs',
                      'bg-white/80 placeholder:text-slate-400 resize-none',
                      'focus:ring-2 focus:ring-purple-400 focus:border-purple-400 focus:outline-none',
                    )}
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={handleEditCancel}
                      disabled={editSaving}
                      aria-label="Скасувати редагування"
                      className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={handleEditSave}
                      disabled={editSaving || !editTitle.trim() || !editContent.trim()}
                      aria-label="Зберегти зміни"
                      className={cn(
                        'p-1.5 rounded-md text-purple-600 hover:text-purple-800 hover:bg-purple-100 transition-colors',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                      )}
                    >
                      {editSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={template.id}
                  className={cn(
                    'group flex items-start gap-2 p-2.5 rounded-xl',
                    'bg-purple-50/70 border border-purple-200/60',
                    'transition-colors duration-150',
                  )}
                >
                  <ListChecks className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-purple-400" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 break-words">{template.title}</p>
                    <p className="text-xs text-slate-600 leading-relaxed break-words mt-0.5">{template.content}</p>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-0.5">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleEditStart(template)}
                        aria-label="Редагувати шаблон"
                        className={cn(
                          'p-1 rounded-md',
                          'opacity-0 group-hover:opacity-100',
                          'text-purple-400 hover:text-purple-600 hover:bg-purple-100',
                          'transition-[opacity,background-color] duration-150',
                          'focus:outline-none focus:ring-2 focus:ring-purple-400 focus:opacity-100',
                        )}
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(template.id)}
                        disabled={deletingId === template.id}
                        aria-label="Видалити шаблон"
                        className={cn(
                          'p-1 rounded-md',
                          'opacity-0 group-hover:opacity-100',
                          'text-red-400 hover:text-red-600 hover:bg-red-50',
                          'transition-[opacity,background-color] duration-150',
                          'focus:outline-none focus:ring-2 focus:ring-red-400 focus:opacity-100',
                          'disabled:opacity-50 disabled:cursor-not-allowed',
                        )}
                      >
                        {deletingId === template.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ),
            )
          )}
        </div>
      )}

      {/* Add form */}
      {canCreate && !loading && (
        <div className="space-y-2 pt-1">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => { setNewTitle(e.target.value); if (error) setError(null); }}
            placeholder="Назва шаблону"
            maxLength={200}
            aria-label="Назва нового шаблону"
            className={cn(
              'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm',
              'placeholder:text-slate-400',
              'focus:ring-2 focus:ring-purple-400 focus:border-purple-400 focus:outline-none',
              'transition-colors duration-150',
            )}
          />
          <textarea
            value={newContent}
            onChange={(e) => { setNewContent(e.target.value); if (error) setError(null); }}
            placeholder="Опис задачі (для співробітника та AI)..."
            rows={3}
            maxLength={2000}
            aria-label="Опис нового шаблону"
            className={cn(
              'w-full border border-slate-300 rounded-lg px-3 py-2 text-xs',
              'placeholder:text-slate-400 resize-none',
              'focus:ring-2 focus:ring-purple-400 focus:border-purple-400 focus:outline-none',
              'transition-colors duration-150',
            )}
          />
          <div className="flex justify-end gap-2">
            {onGenerate && (
              <Button
                size="sm"
                onClick={onGenerate}
                disabled={!canGenerate || generating}
                aria-label="Згенерувати шаблон задачі з обраного еталону"
              >
                {generating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                Шаблон
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={saving || !newTitle.trim() || !newContent.trim()}
              aria-label="Додати шаблон завдання"
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
