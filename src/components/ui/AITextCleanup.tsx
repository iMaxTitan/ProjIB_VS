'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import logger from '@/lib/shared/logger';

type CleanupPhase = 'idle' | 'cleaning' | 'done';
type CleanupCategory = 'task_description' | 'company_report_note';

interface AITextCleanupProps {
  /** Current text to clean up */
  text: string;
  /** Callback with cleaned text */
  onResult: (cleaned: string) => void;
  /** Category determines which AI prompt to use */
  category: CleanupCategory;
  /** Procedure ID for RAG context */
  procedureId?: string;
  /** Procedure name for prompt context */
  procedureName?: string;
  /** Project names for "в рамках проекту" context */
  projectNames?: string[];
  /** Disable the button */
  disabled?: boolean;
  /** Show status text before the button (default: after) */
  statusBefore?: boolean;
  /** Keep "done" status visible indefinitely (default: auto-hide after 3s) */
  persistDone?: boolean;
  /** Additional class for the container */
  className?: string;
}

/**
 * Shared AI text cleanup button + status indicator.
 * Calls /api/ai/task-cleanup with category-aware prompts.
 *
 * Usage:
 * ```tsx
 * <AITextCleanup
 *   text={description}
 *   onResult={setDescription}
 *   category="task_description"
 *   procedureId={procedureId}
 * />
 * ```
 */
export default function AITextCleanup({
  text,
  onResult,
  category,
  procedureId,
  procedureName,
  projectNames,
  disabled = false,
  statusBefore = false,
  persistDone = false,
  className,
}: AITextCleanupProps) {
  const [phase, setPhase] = useState<CleanupPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  // Auto-clear "done" phase after 3s (unless persistDone)
  useEffect(() => {
    if (phase !== 'done' || persistDone) return;
    const timer = setTimeout(() => setPhase('idle'), 3_000);
    return () => clearTimeout(timer);
  }, [phase, persistDone]);

  // Clear "done" when text changes (user started editing)
  useEffect(() => {
    if (phase === 'done') setPhase('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const handleCleanup = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || phase === 'cleaning') return;

    setPhase('cleaning');
    setError(null);

    try {
      const res = await fetch('/api/ai/task-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          description: trimmed,
          procedure_name: procedureName || undefined,
          procedure_id: procedureId || undefined,
          project_names: projectNames?.length ? projectNames : undefined,
          category,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      if (data.cleaned && data.cleaned !== trimmed) {
        onResult(data.cleaned);
        setPhase('done');
      } else {
        setPhase('idle');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка AI';
      setError(msg);
      setPhase('idle');
      logger.error('[AITextCleanup] error:', err);
    }
  }, [text, phase, category, procedureId, procedureName, projectNames, onResult]);

  const isLoading = phase === 'cleaning';
  const buttonDisabled = disabled || isLoading || !text.trim();

  const statusElements = (
    <>
      {phase === 'cleaning' && (
        <span className="text-3xs text-indigo-500 flex items-center gap-1 animate-pulse">
          AI обробляє...
        </span>
      )}
      {phase === 'done' && (
        <span className="text-3xs text-emerald-600 flex items-center gap-1">
          <Check className="w-3 h-3" aria-hidden="true" />
          Покращено
        </span>
      )}
      {error && (
        <span className="text-3xs text-red-500 truncate max-w-[120px]" title={error}>
          {error}
        </span>
      )}
    </>
  );

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {statusBefore && statusElements}
      <button
        type="button"
        onClick={handleCleanup}
        disabled={buttonDisabled}
        aria-label={category === 'company_report_note' ? 'AI: покращити примітку звіту' : 'AI: покращити опис задачі'}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
          'bg-gradient-to-r from-purple-500 to-indigo-500 text-white',
          'hover:from-purple-600 hover:to-indigo-600 hover:shadow-md',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2'
        )}
      >
        <Sparkles className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} aria-hidden="true" />
        {isLoading ? '...' : 'AI'}
      </button>
      {!statusBefore && statusElements}
    </div>
  );
}
