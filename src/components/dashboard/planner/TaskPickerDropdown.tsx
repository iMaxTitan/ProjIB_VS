'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ClipboardList, Clock, Briefcase, FileEdit, ChevronLeft, Plus, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import logger from '@/lib/shared/logger';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TemplateItem {
  id: string;
  title: string;
  content: string;
}

interface TaskItem {
  daily_task_id: string;
  title?: string | null;
  description: string;
  source?: string | null;
}

interface TaskPickerData {
  templates: TemplateItem[];
  incomplete: TaskItem[];
  chief: TaskItem[];
  drafts: TaskItem[];
}

export type SelectPayload =
  | { type: 'template'; templateId: string; title: string; content: string; monthlyPlanId?: string }
  | { type: 'existing'; dailyTaskId: string }
  | { type: 'new'; monthlyPlanId: string }
  | { type: 'procedure-only'; monthlyPlanId: string };

interface PlanOption {
  monthlyPlanId: string;
  planName: string;
  processName: string;
}

interface TaskPickerDropdownProps {
  monthlyPlanId?: string;
  /** For external entries — show plan list first */
  procedures?: PlanOption[];
  /** When true, selecting a plan immediately fires procedure-only (no task step) */
  planOnly?: boolean;
  entryDate: string;
  durationMinutes: number;
  anchorRect: DOMRect | null;
  onSelect: (task: SelectPayload) => void;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + '\u2026' : text;
}

/* Section config with color tokens */
const SECTION_CONFIG = {
  tpl: { icon: ClipboardList, label: 'Шаблони', headerBg: 'bg-indigo-50/80', headerText: 'text-indigo-500', iconColor: 'text-indigo-400', hoverBg: 'hover:bg-indigo-50/60' },
  wip: { icon: Clock, label: 'В роботі', headerBg: 'bg-amber-50/80', headerText: 'text-amber-600', iconColor: 'text-amber-400', hoverBg: 'hover:bg-amber-50/60' },
  chief: { icon: Briefcase, label: 'Від керівництва', headerBg: 'bg-purple-50/80', headerText: 'text-purple-600', iconColor: 'text-purple-400', hoverBg: 'hover:bg-purple-50/60' },
  draft: { icon: FileEdit, label: 'Чернетки', headerBg: 'bg-slate-50/80', headerText: 'text-slate-500', iconColor: 'text-slate-400', hoverBg: 'hover:bg-slate-50/60' },
} as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const TaskPickerDropdown: React.FC<TaskPickerDropdownProps> = ({
  monthlyPlanId: initialMonthlyPlanId,
  procedures,
  planOnly,
  entryDate,
  durationMinutes,
  anchorRect,
  onSelect,
  onClose,
}) => {
  // Two-step mode: external events need plan selection first
  const needsPlanStep = !initialMonthlyPlanId && !!procedures?.length;
  const [selectedPlan, setSelectedPlan] = useState<PlanOption | null>(null);

  const monthlyPlanId = selectedPlan?.monthlyPlanId || initialMonthlyPlanId;

  const [data, setData] = useState<TaskPickerData | null>(null);
  const [loading, setLoading] = useState(!needsPlanStep);
  const isDesktop = useMediaQuery('(min-width: 640px)');
  const ref = useRef<HTMLDivElement>(null);

  /* ---- Fetch tasks when plan is known ---- */
  useEffect(() => {
    if (!monthlyPlanId) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      monthly_plan_id: monthlyPlanId,
      entry_date: entryDate,
      duration_minutes: String(durationMinutes),
    });
    fetch(`/api/planner/tasks?${params}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { logger.warn('[TaskPickerDropdown] fetch error', err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [monthlyPlanId, entryDate, durationMinutes]);

  /* ---- Click outside ---- */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  /* ---- Escape ---- */
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); },
    [onClose],
  );
  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  /* ---- Position (desktop) ---- */
  const style: React.CSSProperties = isDesktop && anchorRect
    ? {
        position: 'absolute',
        top: anchorRect.bottom + 6,
        left: Math.max(8, anchorRect.left),
        width: 280,
      }
    : {};

  /* ---- Sections ---- */
  const sections = data ? [
    { key: 'tpl' as const, items: data.templates },
    { key: 'wip' as const, items: data.incomplete },
    { key: 'chief' as const, items: data.chief },
    { key: 'draft' as const, items: data.drafts },
  ].filter((s) => s.items.length > 0) : [];

  const isEmpty = !loading && sections.length === 0;

  /* ---- Render item ---- */
  const renderItem = (sectionKey: string, item: TemplateItem | TaskItem) => {
    const isTemplate = sectionKey === 'tpl';
    const tpl = item as TemplateItem;
    const task = item as TaskItem;
    const cfg = SECTION_CONFIG[sectionKey as keyof typeof SECTION_CONFIG];

    const handleClick = () => {
      if (isTemplate) {
        onSelect({ type: 'template', templateId: tpl.id, title: tpl.title, content: tpl.content, monthlyPlanId: monthlyPlanId || undefined });
      } else {
        onSelect({ type: 'existing', dailyTaskId: task.daily_task_id });
      }
    };

    const label = isTemplate ? tpl.title : (task.title || truncate(task.description, 60));
    const sub = isTemplate ? truncate(tpl.content, 80) : null;
    const source = !isTemplate ? task.source : null;

    return (
      <button
        key={isTemplate ? tpl.id : task.daily_task_id}
        type="button"
        onClick={handleClick}
        aria-label={`Обрати: ${label}`}
        className={cn(
          'w-full text-left px-3 py-2 text-xs transition-all duration-150',
          'cursor-pointer rounded-lg mx-1 my-0.5',
          cfg.hoverBg,
          'focus:outline-none focus:ring-1 focus:ring-indigo-300',
        )}
        style={{ width: 'calc(100% - 8px)' }}
      >
        <span className="block font-semibold text-slate-800 truncate leading-tight">{label}</span>
        {sub && <span className="block text-2xs text-slate-400 truncate mt-0.5 leading-tight">{sub}</span>}
        {(source === 'chief' || source === 'head') && (
          <span className={cn(
            'inline-block text-3xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-1',
            source === 'chief'
              ? 'bg-purple-100 text-purple-600 border border-purple-200'
              : 'bg-teal-100 text-teal-600 border border-teal-200',
          )}>
            {source === 'chief' ? 'CHIEF' : 'HEAD'}
          </span>
        )}
      </button>
    );
  };

  /* ---- Procedure step (for external events) ---- */
  const showPlanStep = needsPlanStep && !selectedPlan;

  /* ---- "New task" handler ---- */
  const handleNewTask = useCallback(() => {
    if (monthlyPlanId) {
      onSelect({ type: 'new', monthlyPlanId });
    }
  }, [monthlyPlanId, onSelect]);

  /* ---- Content ---- */
  const content = (
    <div
      ref={ref}
      role="listbox"
      aria-label="Оберіть задачу"
      style={style}
      className={cn(
        'z-50 border shadow-2xl',
        'bg-white/90 backdrop-blur-xl border-slate-200/80',
        isDesktop
          ? 'rounded-2xl max-h-72 overflow-y-auto w-[280px]'
          : 'fixed bottom-0 left-0 right-0 rounded-t-2xl max-h-[50vh] overflow-y-auto',
      )}
    >
      {/* mobile drag handle */}
      {!isDesktop && (
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-8 h-1 rounded-full bg-slate-300" />
        </div>
      )}

      {/* Step 1: Procedure selection (external events only) */}
      {showPlanStep && (
        <div className="p-1.5 space-y-1">
          <div className={cn(
            'flex items-center gap-1.5 text-3xs font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg',
            'bg-sky-50/80 text-sky-600',
          )}>
            <FolderOpen className="w-3 h-3 text-sky-400" aria-hidden="true" />
            Оберіть план
            <span className="ml-auto text-3xs font-medium opacity-60">{procedures!.length}</span>
          </div>
          {procedures!.map((p) => (
            <button
              key={p.monthlyPlanId}
              type="button"
              onClick={() => {
                if (planOnly) { onSelect({ type: 'procedure-only', monthlyPlanId: p.monthlyPlanId }); return; }
                setSelectedPlan(p);
              }}
              className={cn(
                'w-full text-left px-3 py-2 text-xs transition-all duration-150',
                'cursor-pointer rounded-lg mx-1 my-0.5 hover:bg-sky-50/60',
                'focus:outline-none focus:ring-1 focus:ring-sky-300',
              )}
              style={{ width: 'calc(100% - 8px)' }}
            >
              <span className="block font-semibold text-slate-800 truncate leading-tight">{p.planName}</span>
              {p.processName && (
                <span className="block text-2xs text-slate-400 truncate mt-0.5 leading-tight">{p.processName}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Tasks/Templates (after procedure selected or for plan entries) */}
      {!showPlanStep && (
        <>
          {/* Back button (external events — go back to procedure list) */}
          {needsPlanStep && selectedPlan && (
            <button
              type="button"
              onClick={() => { setSelectedPlan(null); setData(null); }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors w-full border-b border-slate-100"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="truncate">{selectedPlan.planName}</span>
            </button>
          )}

          {/* "Procedure only" — link plan without template */}
          {needsPlanStep && selectedPlan && !loading && (
            <div className="px-1.5 pt-1">
              <button type="button"
                onClick={() => onSelect({ type: 'procedure-only', monthlyPlanId: selectedPlan.monthlyPlanId })}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold',
                  'rounded-lg transition-all duration-150 cursor-pointer',
                  'bg-sky-50/80 text-sky-700 hover:bg-sky-100/80',
                  'focus:outline-none focus:ring-1 focus:ring-sky-300',
                )}>
                <FolderOpen className="w-3.5 h-3.5" />
                Тільки план
              </button>
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" aria-hidden="true" />
            </div>
          )}

          {isEmpty && (
            <div className="py-4">
              <p className="text-center text-xs text-slate-400 pb-3">Немає шаблонів для цього плану</p>
              {monthlyPlanId && (
                <div className="px-1.5">
                  <button
                    type="button"
                    onClick={handleNewTask}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold',
                      'rounded-lg transition-all duration-150 cursor-pointer',
                      'bg-emerald-50/80 text-emerald-700 hover:bg-emerald-100/80',
                      'focus:outline-none focus:ring-1 focus:ring-emerald-300',
                    )}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Нова задача
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="p-1.5 space-y-1">
            {sections.map((s) => {
              const cfg = SECTION_CONFIG[s.key];
              const Icon = cfg.icon;
              return (
                <div key={s.key}>
                  <div className={cn(
                    'flex items-center gap-1.5 text-3xs font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg',
                    cfg.headerBg, cfg.headerText,
                  )}>
                    <Icon className={cn('w-3 h-3', cfg.iconColor)} aria-hidden="true" />
                    {cfg.label}
                    <span className="ml-auto text-3xs font-medium opacity-60">{s.items.length}</span>
                  </div>
                  {s.items.map((item) => renderItem(s.key, item))}
                </div>
              );
            })}

            {!isEmpty && monthlyPlanId && (
              <button
                type="button"
                onClick={handleNewTask}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold',
                  'rounded-lg mx-1 my-0.5 transition-all duration-150 cursor-pointer',
                  'bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100/80',
                  'focus:outline-none focus:ring-1 focus:ring-emerald-300',
                )}
                style={{ width: 'calc(100% - 8px)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                Нова задача
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  /* ---- Portal + backdrop ---- */
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {!isDesktop && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      {content}
    </>,
    document.body,
  );
};

export default TaskPickerDropdown;
