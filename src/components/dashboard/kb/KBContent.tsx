'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Upload, Shield, Trash2 } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import { cn } from '@/lib/shared/utils';
import { Button } from '@/components/ui/Button';
import KBDocumentList from './KBDocumentList';
import KBUploadModal from './KBUploadModal';

interface Props {
  user: UserInfo;
  tabsSlot?: React.ReactNode;
  autoOpenUpload?: boolean;
  onAutoOpenUploadHandled?: () => void;
}

interface KBCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
}

interface KBDocument {
  id: string;
  title: string;
  source_filename: string;
  category_id: string;
  process_id: string | null;
  chunk_count: number;
  content_length?: number;
  chunks_total_length?: number;
  status: 'processing' | 'ready' | 'error';
  error_message: string | null;
  created_at: string;
  kb_categories: { name: string; slug: string; icon: string } | null;
}


export default function KBContent({ user, tabsSlot, autoOpenUpload, onAutoOpenUploadHandled }: Props) {
  const qc = useQueryClient();
  const canUpload = user.role === 'chief' || user.role === 'head'; // KB_MANAGERS
  const canDelete = user.role === 'chief'; // chief only

  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Auto-open upload modal when triggered from Validator tab
  useEffect(() => {
    if (autoOpenUpload && canUpload) {
      setUploadOpen(true);
      onAutoOpenUploadHandled?.();
    }
  }, [autoOpenUpload, canUpload, onAutoOpenUploadHandled]);
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: categories = [] } = useQuery<KBCategory[]>({
    queryKey: ['kb-categories'],
    queryFn: async () => {
      const r = await fetch('/api/kb/categories', { credentials: 'include' });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: Infinity,
  });

  const { data: documents = [], isLoading } = useQuery<KBDocument[]>({
    queryKey: ['kb-documents', selectedSlug],
    queryFn: async () => {
      const url = selectedSlug
        ? `/api/kb/documents?category=${selectedSlug}`
        : '/api/kb/documents';
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 30_000,
  });

  // Start polling for any processing documents from previous sessions
  useEffect(() => {
    const processing = documents.filter(d => d.status === 'processing');
    if (processing.length > 0) {
      setPollingIds(prev => {
        const next = new Set(prev);
        processing.forEach(d => next.add(d.id));
        return next;
      });
    }
  }, [documents]);

  // ─── Polling loop ─────────────────────────────────────────────────────────

  const pollDocument = useCallback(
    async (documentId: string) => {
      const MAX_POLLS = 120; // 2 min
      let polls = 0;
      while (polls < MAX_POLLS) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          const r = await fetch(`/api/kb/documents/${documentId}`, { credentials: 'include' });
          const doc = await r.json();
          if (doc.status !== 'processing') {
            setPollingIds(prev => {
              const next = new Set(prev);
              next.delete(documentId);
              return next;
            });
            qc.invalidateQueries({ queryKey: ['kb-documents'] });
            return;
          }
        } catch {
          // network error — continue polling
        }
        polls++;
      }
      // Timeout — stop polling, refresh list anyway
      setPollingIds(prev => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
      qc.invalidateQueries({ queryKey: ['kb-documents'] });
    },
    [qc],
  );

  // ─── Delete mutation ──────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/kb/documents/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) {
        const json = await r.json();
        throw new Error(json.error || 'Delete failed');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-documents'] });
    },
  });

  // ─── Bulk delete mutation ─────────────────────────────────────────────────

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const r = await fetch('/api/kb/documents', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) {
        const json = await r.json();
        throw new Error(json.error || 'Bulk delete failed');
      }
    },
    onSuccess: () => {
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ['kb-documents'] });
    },
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const handleDelete = (doc: KBDocument) => {
    if (!confirm(`Видалити документ «${doc.title}»? Чанки буде видалено автоматично.`)) return;
    deleteMutation.mutate(doc.id);
  };

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }, []);

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    const msg = `Видалити ${selectedIds.length} документ(ів)? Чанки буде видалено автоматично.`;
    if (!confirm(msg)) return;
    bulkDeleteMutation.mutate(selectedIds);
  };

  const readyDocIds = useMemo(
    () => documents.filter(d => d.status !== 'processing').map(d => d.id),
    [documents],
  );

  const allSelected = readyDocIds.length > 0 && readyDocIds.every(id => selectedIds.includes(id));

  const handleSelectAll = () => {
    setSelectedIds(allSelected ? [] : readyDocIds);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      {tabsSlot}

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-100 rounded-xl">
                <BookOpen className="h-5 w-5 text-indigo-600" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-slate-900">База знань</h2>
                <p className="text-xs text-slate-500 hidden sm:block">
                  Нормативні документи для AI-помічника
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canDelete && selectedIds.length > 0 && (
                <Button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  aria-label={`Видалити ${selectedIds.length} обраних документів`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden xs:inline">Видалити</span>
                  <span className="tabular-nums">({selectedIds.length})</span>
                </Button>
              )}
              {canUpload && (
                <Button
                  onClick={() => setUploadOpen(true)}
                  aria-label="Завантажити документи до бази знань"
                  className="gap-2"
                  size="sm"
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden xs:inline">Завантажити</span>
                </Button>
              )}
            </div>
          </div>

          {/* Category filter */}
          {categories.length > 0 && (
            <div
              className="flex gap-2 flex-wrap"
              role="group"
              aria-label="Фільтр по категорії"
            >
              <button
                onClick={() => setSelectedSlug('')}
                aria-pressed={selectedSlug === ''}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                  selectedSlug === ''
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                Всі
              </button>
              {categories.map(cat => (
                <button
                  key={cat.slug}
                  onClick={() => setSelectedSlug(cat.slug)}
                  aria-pressed={selectedSlug === cat.slug}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                    selectedSlug === cat.slug
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {cat.icon} {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* Select all + Document list */}
          {canDelete && documents.length > 0 && !isLoading && (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSelectAll}
                aria-label={allSelected ? 'Зняти вибір з усіх' : 'Обрати всі документи'}
                className={cn(
                  'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                  allSelected
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-slate-300 hover:border-indigo-400',
                )}
              >
                {allSelected && (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <span className="text-xs text-slate-500">
                {selectedIds.length > 0
                  ? `Обрано ${selectedIds.length} з ${documents.length}`
                  : 'Обрати всі'}
              </span>
            </div>
          )}

          <KBDocumentList
            documents={documents}
            isLoading={isLoading}
            canDelete={canDelete}
            canUpload={canUpload}
            pollingIds={pollingIds}
            isPendingDelete={deleteMutation.isPending || bulkDeleteMutation.isPending}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onDelete={handleDelete}
            formatDate={formatDate}
          />

          {/* Access notice for employees */}
          {!canUpload && (
            <div className="flex items-center gap-2 text-xs text-slate-400 pt-2">
              <Shield className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span>Завантаження документів доступне керівникам та начальнику</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Upload Modal ─────────────────────────────────────────────── */}
      <KBUploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        categories={categories}
        onUploadsComplete={(uploadedIds) => {
          setPollingIds(prev => new Set([...prev, ...uploadedIds]));
          uploadedIds.forEach(id => pollDocument(id));
          qc.invalidateQueries({ queryKey: ['kb-documents'] });
        }}
      />
    </div>
  );
}
