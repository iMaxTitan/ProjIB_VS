'use client';

import React from 'react';
import { FileText, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/ui/EmptyState';

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

const STATUS_BADGE: Record<string, { label: string; variant: 'emerald' | 'amber' | 'red'; icon: React.ReactNode }> = {
  ready: {
    label: 'Готово',
    variant: 'emerald',
    icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  processing: {
    label: 'Обробка…',
    variant: 'amber',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />,
  },
  error: {
    label: 'Помилка',
    variant: 'red',
    icon: <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />,
  },
};

function coveragePct(doc: KBDocument): number | null {
  if (doc.status !== 'ready' || !doc.content_length) return null;
  return Math.round((doc.chunks_total_length ?? 0) / doc.content_length * 100);
}

interface Props {
  documents: KBDocument[];
  isLoading: boolean;
  canDelete: boolean;
  canUpload: boolean;
  pollingIds: Set<string>;
  isPendingDelete: boolean;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onDelete: (doc: KBDocument) => void;
  formatDate: (iso: string) => string;
}

export default function KBDocumentList({
  documents,
  isLoading,
  canDelete,
  canUpload,
  pollingIds,
  isPendingDelete,
  selectedIds,
  onToggleSelect,
  onDelete,
  formatDate,
}: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-400" aria-label="Завантаження" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-10 w-10" aria-hidden="true" />}
        title="Документів не знайдено"
        description={canUpload ? 'Натисніть «Завантажити» щоб додати перший документ' : undefined}
      />
    );
  }

  const selectionMode = selectedIds.length > 0 || canDelete;

  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
      {documents.map(doc => {
        const badge = STATUS_BADGE[doc.status] ?? STATUS_BADGE.error;
        const isPolling = pollingIds.has(doc.id);
        const isSelected = selectedIds.includes(doc.id);
        const cov = coveragePct(doc);
        return (
          <div
            key={doc.id}
            className={cn(
              'flex items-start gap-3 p-3 sm:p-4 transition-colors duration-100',
              isSelected ? 'bg-indigo-50/60' : 'hover:bg-slate-50',
            )}
          >
            {/* Checkbox or file icon */}
            <div className="flex-shrink-0 mt-0.5">
              {canDelete && selectionMode ? (
                <button
                  type="button"
                  onClick={() => onToggleSelect(doc.id)}
                  aria-label={isSelected ? `Зняти вибір: ${doc.title}` : `Обрати: ${doc.title}`}
                  className={cn(
                    'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                    isSelected
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-300 hover:border-indigo-400',
                  )}
                >
                  {isSelected && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ) : (
                <FileText className="h-5 w-5 text-indigo-400" aria-hidden="true" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <span className="font-medium text-sm text-slate-900 truncate">
                  {doc.title}
                </span>
                {/* Status badge */}
                <Badge variant={badge.variant} className="gap-1 font-medium">
                  {isPolling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    badge.icon
                  )}
                  {isPolling ? 'Обробка…' : badge.label}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                {doc.kb_categories && (
                  <span>
                    {doc.kb_categories.icon} {doc.kb_categories.name}
                  </span>
                )}
                <span>{doc.source_filename}</span>
                {doc.status === 'ready' && (
                  <span>
                    {doc.chunk_count} фрагм.
                    {cov != null && <span className={cn(
                      'ml-1',
                      cov >= 90 ? 'text-emerald-500' : cov >= 60 ? 'text-amber-500' : 'text-red-500',
                    )}>
                      · {cov}%
                    </span>}
                  </span>
                )}
                <span>{formatDate(doc.created_at)}</span>
              </div>

              {doc.status === 'error' && doc.error_message && (
                <p className="text-xs text-red-500 mt-1 truncate">{doc.error_message}</p>
              )}
            </div>

            {/* Delete button (single) — shown only when no selection active */}
            {canDelete && selectedIds.length === 0 && (
              <button
                onClick={() => onDelete(doc)}
                aria-label={`Видалити документ «${doc.title}»`}
                disabled={isPendingDelete}
                className={cn(
                  'flex-shrink-0 p-1.5 rounded-lg text-slate-400',
                  'hover:bg-red-50 hover:text-red-500',
                  'focus:outline-none focus:ring-2 focus:ring-red-400',
                  'transition-colors duration-150',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                )}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
