'use client';

import React from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { ImportProgress } from '@/hooks/useLawImport';

interface Props {
  progress: ImportProgress;
  onClose: () => void;
}

export default function LawImportProgress({ progress, onClose }: Props) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const isDone = progress.done === progress.total;

  return (
    <div className="element-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700">
          {isDone ? 'Імпорт завершено' : 'Імпорт документів...'}
        </h3>
        {isDone && (
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            Закрити
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-xs text-slate-500">
        {isDone
          ? `Оброблено ${progress.done} з ${progress.total}`
          : `${progress.done}/${progress.total} — ${progress.current}`}
      </p>

      {/* Results list */}
      {progress.results.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white overflow-hidden max-h-40 overflow-y-auto">
          {progress.results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 text-sm">
              {r.error ? (
                <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              ) : r.documentId ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              ) : (
                <Loader2 className="h-4 w-4 text-slate-400 animate-spin flex-shrink-0" />
              )}
              <span className="flex-1 truncate text-slate-700">{r.title}</span>
              {r.error && <span className="text-xs text-red-500 flex-shrink-0">{r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
