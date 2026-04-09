'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Trash2, Check, ScrollText, Sparkles } from 'lucide-react';
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

// ─── Entry status ────────────────────────────────────────────────────────────

export type EntryStatusKey = 'external' | 'linked' | 'linked-collected' | 'slot' | 'task' | 'collected';

export function entryStatus(entry: CalendarEntry): EntryStatusKey {
  if (entry.source === 'external' && !entry.monthly_plan_id) return 'external';
  if (entry.source === 'external' && entry.monthly_plan_id) {
    return entry.task_completed ? 'linked-collected' : 'linked';
  }
  if (!entry.daily_task_id) return 'slot';
  if (entry.task_completed) return 'collected';
  return 'task';
}

// ─── Display title ───────────────────────────────────────────────────────────

function entryTitle(entry: CalendarEntry): string {
  return entry.task_title || entry.subject || entry.plan_name || '';
}

function entrySubtitle(entry: CalendarEntry): string {
  if (entry.task_title && entry.plan_name) return entry.plan_name;
  if (entry.subject && entry.plan_name) return entry.plan_name;
  return '';
}

// ─── Unified CalendarBlock ───────────────────────────────────────────────────

export function CalendarBlock({ entry, dimmed, readOnly, onDelete, onResize, onSelectEntry, onOpenPicker, onAssignPlan, onClearPlan, layoutColumn = 0, layoutTotal = 1 }: {
  entry: CalendarEntry;
  dimmed?: boolean;
  readOnly?: boolean;
  onDelete: (id: string) => void;
  onResize: (id: string, newDurationMin: number) => void;
  onSelectEntry?: (entry: CalendarEntry) => void;
  onOpenPicker?: (entry: CalendarEntry, rect: DOMRect) => void;
  onAssignPlan?: (entryId: string, monthlyPlanId: string, planName: string) => void;
  onClearPlan?: (entryId: string) => void;
  layoutColumn?: number;
  layoutTotal?: number;
}) {
  const status = entryStatus(entry);
  const isOptimistic = entry.id.startsWith('_optimistic_');
  const canInteract = !isOptimistic && !readOnly;
  const canDrag = canInteract && status !== 'external' && status !== 'linked' && status !== 'linked-collected';
  const canDropPlan = status === 'external' && !entry.monthly_plan_id && onAssignPlan;
  const [dropOver, setDropOver] = useState(false);
  const canResize = canDrag;
  // Plan entries → delete. External with plan → clear plan. External without plan → no delete.
  const canDelete = canInteract && (entry.source === 'plan' || (entry.source === 'external' && !!entry.monthly_plan_id));
  // Plan entries without task → full task picker. External without plan → plan picker only.
  const canOpenPicker = canInteract && entry.source === 'plan' && !entry.daily_task_id && onOpenPicker;
  const canPickPlan = canInteract && entry.source === 'external' && !entry.monthly_plan_id && onOpenPicker;

  const row = timeToRow(entry.start_time);
  const span = durationToRows(entry.duration_minutes);
  const [resizeDelta, setResizeDelta] = useState(0);
  const resizing = useRef(false);
  const justResized = useRef(false);
  const startY = useRef(0);

  const startMin = timeToMinutes(entry.start_time);
  const maxDuration = MAX_MINUTES - (startMin - START_HOUR * 60);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
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
  }, [entry.id, entry.duration_minutes, maxDuration, onResize]);

  if (row < 0 || row >= ROWS) return null;

  const baseHeight = span * ROW_HEIGHT - 2;
  const displayHeight = Math.max(ROW_HEIGHT - 2, baseHeight + resizeDelta);
  const colPct = (layoutColumn / layoutTotal) * 100;
  const widthPct = (1 / layoutTotal) * 100;
  const title = entryTitle(entry);
  const subtitle = entrySubtitle(entry);

  return (
    <div
      draggable={canDrag}
      onDragStart={canDrag ? (e) => {
        e.dataTransfer.setData('application/planner-slot', JSON.stringify({ id: entry.id }));
        e.dataTransfer.effectAllowed = 'move';
      } : undefined}
      onDragOver={canDropPlan ? (e) => {
        if (e.dataTransfer.types.includes('application/planner-procedure')) {
          e.preventDefault(); e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          setDropOver(true);
        }
      } : undefined}
      onDragLeave={canDropPlan ? () => setDropOver(false) : undefined}
      onDrop={canDropPlan ? (e) => {
        setDropOver(false);
        const raw = e.dataTransfer.getData('application/planner-procedure');
        if (raw) {
          e.preventDefault(); e.stopPropagation();
          try {
            const data = JSON.parse(raw);
            onAssignPlan!(entry.id, data.monthlyPlanId, data.planName);
          } catch { /* ignore */ }
        }
      } : undefined}
      onClick={(e) => {
        if (justResized.current) return;
        if ((e.target as HTMLElement).closest('[data-action]')) return;
        // Plan slot without task → task picker
        if (canOpenPicker) { onOpenPicker!(entry, new DOMRect(e.clientX, e.clientY, 0, 0)); return; }
        // External without plan → plan picker
        if (canPickPlan) { onOpenPicker!(entry, new DOMRect(e.clientX, e.clientY, 0, 0)); return; }
        // Only meetings with transcript open details panel
        if (entry.source === 'external' && entry.has_transcript && onSelectEntry) { onSelectEntry(entry); return; }
      }}
      title={[title, subtitle, `${entry.start_time.slice(0, 5)} · ${entry.duration_minutes} хв`].filter(Boolean).join('\n')}
      className={cn(
        `data-cell cal-block st-${status}`,
        canDrag && 'cursor-grab active:cursor-grabbing',
        !canDrag && (status === 'external' || status === 'linked' || status === 'linked-collected') && 'cursor-pointer',
        !canDrag && 'cursor-default',
        isOptimistic && 'opacity-60',
        dimmed && 'dimmed',
        dropOver && 'ring-2 ring-indigo-400/50',
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
      {/* Title */}
      <p className="cal-subj flex items-center gap-0.5">
        {entry.source === 'external' && entry.transcript_summary && <Sparkles className="h-2.5 w-2.5 flex-shrink-0 text-indigo-400 inline" />}
        {entry.source === 'external' && entry.has_transcript && !entry.transcript_summary && <ScrollText className="h-2.5 w-2.5 flex-shrink-0 opacity-60 inline" />}
        <span>{title}</span>
      </p>

      {/* Time range */}
      {displayHeight >= ROW_HEIGHT * 1.8 && (
        <p className="cal-time">
          {entry.start_time.slice(0, 5)} – {(() => {
            const [h, m] = entry.start_time.split(':').map(Number);
            const endMin = h * 60 + m + entry.duration_minutes;
            return `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
          })()}
        </p>
      )}

      {/* Subtitle (plan name when title is task) */}
      {subtitle && <p className="cal-proc">{subtitle}</p>}

      {/* Delete (plan entry) or clear plan (external entry) */}
      {canDelete && (
        <div className="cal-actions">
          <button data-action className="cal-block-act act-del"
            onClick={() => entry.source === 'external' && onClearPlan ? onClearPlan(entry.id) : onDelete(entry.id)}
            aria-label={entry.source === 'external' ? 'Зняти план' : 'Видалити'}
            title={entry.source === 'external' ? 'Зняти план' : 'Видалити'}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Resize handle */}
      {canResize && (
        <div onPointerDown={handleResizeStart} className="cal-resize-handle" />
      )}
    </div>
  );
}

// ─── Ghost block (suggestion) ────────────────────────────────────────────────

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
