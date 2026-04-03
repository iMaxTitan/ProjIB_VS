'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Trash2, Check, ScrollText, Sparkles, AlertTriangle, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import type { CalendarEntry } from '@/lib/ops/planner/calendar-entries';
import type { SuggestedSlot } from '@/lib/ops/planner/weekly-suggest';

// ─── Shared constants
export const START_HOUR = 9;
export const END_HOUR = 18;
export const SLOT_STEP = 30;
export const ROWS = ((END_HOUR - START_HOUR) * 60) / SLOT_STEP;
export const ROW_HEIGHT = 32;
const MIN_DURATION = 30;
const MAX_MINUTES = (END_HOUR - START_HOUR) * 60;

export function timeLabel(rowIdx: number): string {
  const totalMin = START_HOUR * 60 + rowIdx * SLOT_STEP;
  return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
}

export function timeToRow(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return ((h - START_HOUR) * 60 + m) / SLOT_STEP;
}

export function durationToRows(minutes: number): number {
  return minutes / SLOT_STEP;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Returns the status key for CSS class st-{status} */
export function entryStatus(entry: CalendarEntry): string {
  if (entry.daily_task_id) return 'collected';
  if (entry.outlook_modified) return 'returned';
  if (entry.task_template_id) return 'templated';
  if (entry.outlook_event_id && entry.needs_push) return 'modified';
  if (entry.outlook_event_id) return 'synced';
  if (entry.source === 'external') return 'external';
  return 'distributed';
}

// ─── Calendar block (plan + external) — uses CSS classes: data-cell cal-block st-*

export function CalendarBlock({ entry, dimmed, readOnly, onDelete, onResize, onSelectEntry, onOpenPicker, onClearTemplate, onClearProcedure, layoutColumn = 0, layoutTotal = 1 }: {
  entry: CalendarEntry;
  dimmed?: boolean;
  readOnly?: boolean;
  onDelete: (id: string) => void;
  onResize: (id: string, newDurationMin: number) => void;
  onSelectEntry?: (entry: CalendarEntry) => void;
  onOpenPicker?: (entry: CalendarEntry, rect: DOMRect) => void;
  onClearTemplate?: (entryId: string) => void;
  onClearProcedure?: (entryId: string) => void;
  layoutColumn?: number;
  layoutTotal?: number;
}) {
  const isPlan = entry.source === 'plan';
  const isExternal = entry.source === 'external';
  const row = timeToRow(entry.start_time);
  const span = durationToRows(entry.duration_minutes);
  const status = entryStatus(entry);
  const [resizeDelta, setResizeDelta] = useState(0);
  const resizing = useRef(false);
  const justResized = useRef(false);
  const startY = useRef(0);
  const isOptimistic = entry.id.startsWith('_optimistic_');
  const canDrag = isPlan && !isOptimistic && !readOnly;

  const startMin = timeToMinutes(entry.start_time);
  const maxDuration = MAX_MINUTES - (startMin - START_HOUR * 60);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    if (!isPlan) return;
    e.preventDefault();
    e.stopPropagation();
    resizing.current = true;
    justResized.current = true;
    startY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    let lastDy = 0;
    const onMove = (ev: PointerEvent) => {
      lastDy = ev.clientY - startY.current;
      setResizeDelta(Math.round(lastDy / ROW_HEIGHT) * ROW_HEIGHT);
    };
    const onUp = () => {
      resizing.current = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const deltaRows = Math.round(lastDy / ROW_HEIGHT);
      const newDuration = entry.duration_minutes + deltaRows * SLOT_STEP;
      const clamped = Math.max(MIN_DURATION, Math.min(newDuration, maxDuration));
      if (clamped !== entry.duration_minutes) onResize(entry.id, clamped);
      setResizeDelta(0);
      setTimeout(() => { justResized.current = false; }, 100);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [isPlan, entry.id, entry.duration_minutes, maxDuration, onResize]);

  if (row < 0 || row >= ROWS) return null;

  const baseHeight = span * ROW_HEIGHT - 2;
  const displayHeight = Math.max(ROW_HEIGHT - 2, baseHeight + resizeDelta);
  const colPct = (layoutColumn / layoutTotal) * 100;
  const widthPct = (1 / layoutTotal) * 100;

  return (
    <div
      draggable={canDrag}
      onDragStart={canDrag ? (e) => {
        e.dataTransfer.setData('application/planner-slot', JSON.stringify({ id: entry.id }));
        e.dataTransfer.effectAllowed = 'move';
      } : undefined}
      onClick={(e) => {
        if (justResized.current) return;
        if ((e.target as HTMLElement).closest('[data-action]')) return;
        if (isExternal && onSelectEntry) onSelectEntry(entry);
        if (isPlan && !readOnly && !isOptimistic && onOpenPicker) {
          onOpenPicker(entry, new DOMRect(e.clientX, e.clientY, 0, 0));
        }
      }}
      title={[
        entry.template_title || entry.subject || entry.plan_name,
        entry.template_title ? entry.plan_name : (entry.plan_name && entry.subject ? entry.plan_name : ''),
        `${entry.start_time.slice(0, 5)} · ${entry.duration_minutes} хв`,
      ].filter(Boolean).join('\n')}
      className={cn(
        `data-cell cal-block st-${status}`,
        canDrag && 'cursor-grab active:cursor-grabbing',
        isPlan && readOnly && 'cursor-default',
        isExternal && onSelectEntry && 'cursor-pointer',
        isOptimistic && 'opacity-60',
        dimmed && 'dimmed',
        resizeDelta !== 0 && 'ring-2 ring-indigo-300/50',
      )}
      style={{
        top: row * ROW_HEIGHT + 1,
        left: `calc(${colPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        height: displayHeight,
        transition: resizeDelta !== 0 ? 'none' : undefined,
      }}
    >
      {/* cal-subj */}
      <p className="cal-subj flex items-center gap-0.5">
        {isExternal && entry.transcript_summary && <Sparkles className="h-2.5 w-2.5 flex-shrink-0 text-indigo-400 inline" />}
        {isExternal && entry.has_transcript && !entry.transcript_summary && <ScrollText className="h-2.5 w-2.5 flex-shrink-0 opacity-60 inline" />}
        {entry.outlook_modified && <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0 text-amber-500 inline" />}
        <span>{entry.template_title || entry.subject || entry.plan_name}</span>
      </p>

      {/* cal-time */}
      {displayHeight >= ROW_HEIGHT * 1.8 && (
        <p className="cal-time">
          {entry.start_time.slice(0, 5)} – {(() => {
            const [h, m] = entry.start_time.split(':').map(Number);
            const endMin = h * 60 + m + entry.duration_minutes;
            return `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
          })()}
        </p>
      )}

      {/* cal-proc */}
      {entry.plan_name && <p className="cal-proc">{entry.plan_name}</p>}

      {/* Top-right badge: template picker (no template) or clear (has template) */}
      {!isOptimistic && onOpenPicker && !entry.task_template_id && !entry.daily_task_id && (
        <button data-action className="cal-badge-btn text-indigo-400"
          onClick={(e) => {
            onOpenPicker(entry, new DOMRect(e.clientX, e.clientY, 0, 0));
          }}
          aria-label="Обрати шаблон задачі" title="Обрати шаблон задачі">
          <ClipboardList className="h-3 w-3" />
        </button>
      )}

      {/* cal-actions: delete plan entry or clear template */}
      {!isOptimistic && !readOnly && isPlan && !entry.task_template_id && (
        <div className="cal-actions">
          <button data-action className="cal-block-act act-del"
            onClick={() => onDelete(entry.id)}
            aria-label="Видалити" title="Видалити">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
      {!isOptimistic && !readOnly && isPlan && entry.task_template_id && onClearTemplate && (
        <div className="cal-actions">
          <button data-action className="cal-block-act act-del"
            onClick={() => onClearTemplate(entry.id)}
            aria-label="Зняти шаблон" title="Зняти шаблон">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* cal-actions for external with procedure: clear template first, then procedure */}
      {!isOptimistic && !readOnly && isExternal && entry.monthly_plan_id && !entry.daily_task_id && (
        <div className="cal-actions">
          <button data-action className="cal-block-act act-del"
            onClick={() => {
              if (entry.task_template_id && onClearTemplate) onClearTemplate(entry.id);
              else if (onClearProcedure) onClearProcedure(entry.id);
            }}
            aria-label={entry.task_template_id ? 'Зняти шаблон' : 'Зняти процедуру'}
            title={entry.task_template_id ? 'Зняти шаблон' : 'Зняти процедуру'}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* cal-resize-handle */}
      {isPlan && !isOptimistic && !readOnly && (
        <div onPointerDown={handleResizeStart} className="cal-resize-handle" />
      )}
    </div>
  );
}

// ─── Ghost block (suggestion)

export function GhostBlock({ suggestion, onAccept, onDismiss, onResize, layoutColumn = 0, layoutTotal = 1 }: {
  suggestion: SuggestedSlot;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onResize: (id: string, newDurationMin: number) => void;
  layoutColumn?: number;
  layoutTotal?: number;
}) {
  const row = timeToRow(suggestion.start_time);
  const span = durationToRows(suggestion.duration_minutes);
  const sgId = suggestion._id || '';
  const [resizeDelta, setResizeDelta] = useState(0);
  const resizing = useRef(false);
  const startY = useRef(0);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `suggestion-${sgId}`,
    data: { type: 'suggestion', suggestionId: sgId, planName: suggestion.plan_name },
  });

  const startMin = timeToMinutes(suggestion.start_time);
  const maxDuration = MAX_MINUTES - (startMin - START_HOUR * 60);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = true;
    startY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    let lastDy = 0;
    const onMove = (ev: PointerEvent) => {
      lastDy = ev.clientY - startY.current;
      setResizeDelta(Math.round(lastDy / ROW_HEIGHT) * ROW_HEIGHT);
    };
    const onUp = () => {
      resizing.current = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const deltaRows = Math.round(lastDy / ROW_HEIGHT);
      const newDuration = suggestion.duration_minutes + deltaRows * SLOT_STEP;
      const clamped = Math.max(MIN_DURATION, Math.min(newDuration, maxDuration));
      if (clamped !== suggestion.duration_minutes) onResize(sgId, clamped);
      setResizeDelta(0);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [sgId, suggestion.duration_minutes, maxDuration, onResize]);

  if (row < 0 || row >= ROWS) return null;

  const baseHeight = span * ROW_HEIGHT - 2;
  const displayHeight = Math.max(ROW_HEIGHT - 2, baseHeight + resizeDelta);
  const colPct = (layoutColumn / layoutTotal) * 100;
  const widthPct = (1 / layoutTotal) * 100;

  return (
    <div
      ref={setDragRef} {...listeners} {...attributes}
      className={cn(
        'absolute select-none cursor-grab active:cursor-grabbing rounded-lg py-1.5 px-2',
        'border border-dashed border-violet-500/50 border-l-[3px] border-l-violet-500',
        'bg-violet-500/[0.08] text-violet-800 backdrop-blur-lg',
        'hover:opacity-85 hover:shadow-[0_4px_16px_rgba(139,92,246,0.15)] hover:z-30',
        isDragging && 'pointer-events-none',
        resizeDelta !== 0 && 'ring-2 ring-violet-300/50',
      )}
      title={`${suggestion.plan_name}\n${suggestion.start_time} · ${suggestion.duration_minutes} хв`}
      style={{
        top: row * ROW_HEIGHT + 1,
        left: `calc(${colPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        height: displayHeight,
        overflow: 'hidden',
        opacity: isDragging ? 0.25 : 0.6,
        zIndex: isDragging ? 0 : undefined,
        boxShadow: '0 2px 8px rgba(139,92,246,0.08)',
        transition: resizeDelta !== 0 ? 'none' : 'all 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <p className="text-[11px] font-semibold leading-[1.3] text-violet-700">
        {suggestion.plan_name}
      </p>
      {displayHeight >= ROW_HEIGHT * 1.8 && (
        <p className="cal-time">{suggestion.start_time} · {suggestion.duration_minutes} хв</p>
      )}

      <div className="cal-actions">
        <button className="cal-block-act" onClick={() => onAccept(sgId)}
          aria-label="Прийняти" title="Прийняти">
          <Check className="h-3 w-3" />
        </button>
        <button className="cal-block-act act-del" onClick={() => onDismiss(sgId)}
          aria-label="Відхилити" title="Відхилити">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <div onPointerDown={handleResizeStart} className="cal-resize-handle" />
    </div>
  );
}
