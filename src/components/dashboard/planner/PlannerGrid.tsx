'use client';

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/shared/utils';
import { SummaryBox, PanelFooter, pctColor, WEEKLY_CAPACITY } from '@/components/dashboard/shared';
import type { CalendarEntry, ActivePlanForSlot } from '@/lib/ops/planner/calendar-entries';
import type { SuggestedSlot } from '@/lib/ops/planner/weekly-suggest';
import { START_HOUR, END_HOUR, SLOT_STEP, ROWS, ROW_HEIGHT, timeLabel, CalendarBlock, GhostBlock, entryStatus, type EntryStatusKey } from './PlannerBlocks';
import { computeOverlapLayout } from './planner-helpers';
import TaskPickerDropdown, { type SelectPayload } from './TaskPickerDropdown';

const LUNCH_DURATION_HR = 1;
const DAY_NAMES = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ'];

const LEGEND_ITEMS: { key: EntryStatusKey; label: string }[] = [
  { key: 'slot',              label: 'Слот плану' },
  { key: 'task',              label: 'Можна зібрати' },
  { key: 'collected',         label: 'Зібрано' },
  { key: 'external',          label: 'Зовнішня подія' },
  { key: 'linked',            label: 'Зовнішня · до збору' },
  { key: 'linked-collected',  label: 'Зовнішня · зібрано' },
];

export interface TemplateDragData {
  type: 'template';
  templateId: string;
  title: string;
  monthlyPlanId: string;
  durationMinutes: number;
  planName?: string;
}

export interface PlanDragData {
  type: 'procedure';
  monthlyPlanId: string;
  planName: string;
}

export interface TaskDragData {
  type: 'task';
  dailyTaskId: string;
  title: string;
  monthlyPlanId: string;
  durationMinutes: number;
  planName?: string;
}

function GridCell({ rowIdx, dateStr, lunchStartHour, onTemplateDrop, onTaskDrop, onProcedureDrop, onSlotDrop }: {
  rowIdx: number; dateStr: string; lunchStartHour: number;
  onTemplateDrop?: (date: string, startTime: string, data: TemplateDragData) => void;
  onTaskDrop?: (date: string, startTime: string, data: TaskDragData) => void;
  onProcedureDrop?: (date: string, startTime: string, data: PlanDragData) => void;
  onSlotDrop?: (date: string, startTime: string, entryId: string) => void;
}) {
  const time = timeLabel(rowIdx);
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${dateStr}-${time}`, data: { type: 'cell', date: dateStr, start_time: time },
  });
  const totalMin = START_HOUR * 60 + rowIdx * SLOT_STEP;
  const lunchStartMin = lunchStartHour * 60;
  const isLunchZone = totalMin >= lunchStartMin && totalMin < lunchStartMin + LUNCH_DURATION_HR * 60;
  const isOddRow = rowIdx % 2 !== 0;
  const [nativeOver, setNativeOver] = useState(false);
  return (
    <div ref={setNodeRef}
      className={cn(
        'cal-slot-line',
        isLunchZone && 'cal-lunch-zone',
        (isOver || nativeOver) && 'drop-target',
      )}
      style={{
        height: ROW_HEIGHT,
        borderBottom: isOddRow ? '1px solid rgba(203,213,225,0.55)' : '1px dashed rgba(203,213,225,0.35)',
        borderRight: '1px solid rgba(203,213,225,0.55)',
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/planner-template') ||
            e.dataTransfer.types.includes('application/planner-task') ||
            e.dataTransfer.types.includes('application/planner-procedure') ||
            e.dataTransfer.types.includes('application/planner-slot')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/planner-slot') ? 'move' : 'copy';
          setNativeOver(true);
        }
      }}
      onDragLeave={() => setNativeOver(false)}
      onDrop={(e) => {
        setNativeOver(false);
        const slotRaw = e.dataTransfer.getData('application/planner-slot');
        if (slotRaw) {
          e.preventDefault();
          try { const d = JSON.parse(slotRaw); onSlotDrop?.(dateStr, time, d.id); } catch { /* ignore */ }
          return;
        }
        const taskRaw = e.dataTransfer.getData('application/planner-task');
        if (taskRaw) {
          e.preventDefault();
          try { onTaskDrop?.(dateStr, time, JSON.parse(taskRaw)); } catch { /* ignore */ }
          return;
        }
        const tplRaw = e.dataTransfer.getData('application/planner-template');
        if (tplRaw) {
          e.preventDefault();
          try { onTemplateDrop?.(dateStr, time, JSON.parse(tplRaw)); } catch { /* ignore */ }
          return;
        }
        const procRaw = e.dataTransfer.getData('application/planner-procedure');
        if (procRaw) {
          e.preventDefault();
          try { onProcedureDrop?.(dateStr, time, JSON.parse(procRaw)); } catch { /* ignore */ }
        }
      }}
    />
  );
}

function NowLine() {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const h = now.getHours(), m = now.getMinutes();
      if (h < START_HOUR || h >= END_HOUR) { setTop(null); return; }
      setTop(((h - START_HOUR) * 60 + m) / SLOT_STEP * ROW_HEIGHT);
    };
    update();
    const iv = setInterval(update, 60_000);
    return () => clearInterval(iv);
  }, []);
  if (top === null) return null;
  return <div className="cal-now-line" style={{ top }} />;
}

interface Props {
  weekDates: string[];
  entries: CalendarEntry[];
  activePlans: ActivePlanForSlot[];
  suggestions: SuggestedSlot[];
  lunchStart: string;
  selectedPlanId: string | null;
  vacationDays?: Set<string>;
  onDeleteEntry: (id: string) => void;
  onResizeEntry: (id: string, newDurationMin: number) => void;
  onAcceptSuggestion: (id: string) => void;
  onDismissSuggestion: (id: string) => void;
  onResizeSuggestion: (id: string, newDurationMin: number) => void;
  onSelectEntry?: (entry: CalendarEntry) => void;
  onLinkTask?: (entryId: string, task: SelectPayload) => void;
  onAssignPlan?: (entryId: string, monthlyPlanId: string, planName: string) => void;
  onClearPlan?: (entryId: string) => void;
  onTemplateDrop?: (date: string, startTime: string, data: TemplateDragData) => void;
  onTaskDrop?: (date: string, startTime: string, data: TaskDragData) => void;
  onProcedureDrop?: (date: string, startTime: string, data: PlanDragData) => void;
  onSlotDrop?: (date: string, startTime: string, entryId: string) => void;
}

export default function PlannerGrid({
  weekDates, entries, activePlans, suggestions, lunchStart,
  selectedPlanId, vacationDays,
  onDeleteEntry, onResizeEntry,
  onAcceptSuggestion, onDismissSuggestion, onResizeSuggestion,
  onSelectEntry, onLinkTask, onAssignPlan, onClearPlan, onTemplateDrop, onTaskDrop, onProcedureDrop, onSlotDrop,
}: Props) {
  const [pickerEntry, setPickerEntry] = useState<CalendarEntry | null>(null);
  const [pickerRect, setPickerRect] = useState<DOMRect | null>(null);
  const handleOpenPicker = useCallback((entry: CalendarEntry, rect: DOMRect) => { setPickerEntry(entry); setPickerRect(rect); }, []);
  const handlePickerSelect = useCallback((task: SelectPayload) => {
    if (pickerEntry && onLinkTask) onLinkTask(pickerEntry.id, task);
    setPickerEntry(null);
  }, [pickerEntry, onLinkTask]);
  const handlePickerClose = useCallback(() => setPickerEntry(null), []);

  const completedPlanIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of activePlans) if (p.status === 'done') set.add(p.monthlyPlanId);
    return set;
  }, [activePlans]);

  // planId set for quick lookup
  const activePlanIds = useMemo(() => new Set(activePlans.map(p => p.monthlyPlanId)), [activePlans]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) { const l = map.get(e.date) || []; l.push(e); map.set(e.date, l); }
    return map;
  }, [entries]);

  const lunchStartHour = useMemo(() => {
    const [h, m] = lunchStart.split(':').map(Number);
    return h + m / 60;
  }, [lunchStart]);

  const suggestionsByDate = useMemo(() => {
    const map = new Map<string, SuggestedSlot[]>();
    for (const s of suggestions) { const l = map.get(s.date) || []; l.push(s); map.set(s.date, l); }
    return map;
  }, [suggestions]);

  const layoutByDate = useMemo(() => {
    const map = new Map<string, Map<string, { column: number; totalColumns: number }>>();
    for (const dateStr of weekDates) {
      const items: { id: string; startMin: number; endMin: number }[] = [];
      for (const e of entriesByDate.get(dateStr) || []) {
        const [h, m] = e.start_time.split(':').map(Number);
        const sm = h * 60 + m;
        items.push({ id: e.id, startMin: sm, endMin: sm + e.duration_minutes });
      }
      for (const sg of suggestionsByDate.get(dateStr) || []) {
        const [h, m] = sg.start_time.split(':').map(Number);
        const sm = h * 60 + m;
        items.push({ id: sg._id || `sg-${sg.date}-${sg.start_time}`, startMin: sm, endMin: sm + sg.duration_minutes });
      }
      map.set(dateStr, computeOverlapLayout(items));
    }
    return map;
  }, [weekDates, entriesByDate, suggestionsByDate]);

  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  useEffect(() => {
    const suppress = (e: Event) => { if (document.body.style.cursor === 'ns-resize') e.preventDefault(); };
    document.addEventListener('selectstart', suppress);
    return () => document.removeEventListener('selectstart', suppress);
  }, []);

  const gridHeight = ROWS * ROW_HEIGHT;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div style={{ minWidth: 420 }} className="flex flex-col min-h-0 flex-1">
        {/* Day headers */}
        <div className="grid grid-cols-[48px_repeat(5,1fr)] flex-shrink-0 sticky top-0 z-10" data-el="L2 day-headers" data-el-cat="detail"
          style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(203,213,225,0.55)' }}>
          <div style={{ width: 48 }} />
          {weekDates.map((dateStr, i) => {
            const d = new Date(dateStr);
            const dayNum = d.getDate();
            const isToday = dateStr === today;
            const isVacation = vacationDays?.has(dateStr);
            return (
              <div key={dateStr} className="text-center" style={{
                padding: '6px 4px',
                borderLeft: '1px solid rgba(203,213,225,0.5)',
                ...(isToday && !isVacation ? { background: 'rgba(99,102,241,0.06)' } : {}),
              }}>
                <div className={cn('sec-label', isVacation ? 'text-amber-600' : isToday ? 'text-indigo-500' : 'text-slate-400')}>
                  {DAY_NAMES[i]}
                </div>
                <div className={cn(
                  'text-lg font-bold leading-[1.2]',
                  isVacation ? 'text-amber-600' : isToday ? 'text-indigo-600' : 'text-slate-700',
                  isToday && !isVacation && 'bg-indigo-500/10 rounded-lg px-2 py-px inline-block',
                  isVacation && 'bg-amber-400/10 rounded-lg px-2 py-px inline-block',
                )}>
                  {dayNum}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scrollable area: grid + legend */}
        <div className="overflow-y-auto overflow-x-hidden custom-scroll" style={{ flex: 1, minHeight: 0 }}>
          <div className="grid grid-cols-[48px_repeat(5,1fr)]">
            <div>
              {Array.from({ length: ROWS }, (_, r) => (
                <div key={r} className="flex items-start justify-end" style={{
                  height: ROW_HEIGHT, paddingRight: 8,
                  borderBottom: r % 2 === 0 ? '1px dashed rgba(203,213,225,0.35)' : '1px solid rgba(203,213,225,0.55)',
                  borderRight: '1px solid rgba(203,213,225,0.55)',
                }}>
                  {r % 2 === 0 && (
                    <span className="text-[10px] font-medium text-slate-400 leading-none pt-0.5">{timeLabel(r)}</span>
                  )}
                </div>
              ))}
            </div>

            {weekDates.map((dateStr) => (
              <div key={dateStr} className="relative cal-day-col-wrap" style={{
                minHeight: gridHeight,
                background: vacationDays?.has(dateStr) ? 'rgba(251,191,36,0.04)' : undefined,
              }}>
                {Array.from({ length: ROWS }, (_, r) => (
                  <GridCell key={r} rowIdx={r} dateStr={dateStr} lunchStartHour={lunchStartHour} onTemplateDrop={onTemplateDrop} onTaskDrop={onTaskDrop} onProcedureDrop={onProcedureDrop} onSlotDrop={onSlotDrop} />
                ))}
                {dateStr === today && <NowLine />}
                {(entriesByDate.get(dateStr) || []).map((entry) => {
                  const lay = layoutByDate.get(dateStr)?.get(entry.id);
                  // Dim plan entries and linked externals that belong to a different plan; unlinked externals stay as-is
                  const isDimmed = !!selectedPlanId && !!entry.monthly_plan_id && entry.monthly_plan_id !== selectedPlanId;
                  return (
                    <CalendarBlock key={entry.id} entry={entry} dimmed={isDimmed}
                      readOnly={entry.task_type === 'completed' || entry.task_type === 'pending_approval'}
                      onDelete={onDeleteEntry} onResize={onResizeEntry}
                      onSelectEntry={onSelectEntry}
                      onOpenPicker={onLinkTask ? handleOpenPicker : undefined}
                      onAssignPlan={onAssignPlan}
                      onClearPlan={onClearPlan}
                      layoutColumn={lay?.column} layoutTotal={lay?.totalColumns} />
                  );
                })}
                {(suggestionsByDate.get(dateStr) || []).map((sg) => {
                  const sgId = sg._id || `sg-${sg.date}-${sg.start_time}`;
                  const lay = layoutByDate.get(dateStr)?.get(sgId);
                  return (
                    <GhostBlock key={sg._id || `ghost-${sg.date}-${sg.start_time}`} suggestion={sg}
                      onAccept={onAcceptSuggestion} onDismiss={onDismissSuggestion} onResize={onResizeSuggestion}
                      layoutColumn={lay?.column} layoutTotal={lay?.totalColumns} />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend — scrolls with grid */}
          {(() => {
            const activeStatuses = new Set(entries.map(e => entryStatus(e)));
            const visible = LEGEND_ITEMS.filter(l => activeStatuses.has(l.key));
            if (visible.length === 0) return null;
            return (
              <div className="cal-footer" data-el="L2 cal-footer · legend" data-el-cat="extend">
                {visible.map(({ key, label }) => (
                  <div key={key} className={`cal-legend-chip data-cell st-${key}`}>
                    {label}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Stats footer */}
      {(() => {
        let planHrs = 0, syncHrs = 0, extHrs = 0;
        for (const e of entries) {
          const h = e.duration_minutes / 60;
          if (e.source === 'plan') { planHrs += h; if (e.outlook_event_id) syncHrs += h; }
          else if (e.source === 'external') extHrs += h;
        }
        const cov = WEEKLY_CAPACITY > 0 ? Math.round((planHrs / WEEKLY_CAPACITY) * 100) : 0;
        const fmt = (n: number) => n.toFixed(1).replace('.0', '');
        return (
          <PanelFooter columns={4}>
            <SummaryBox label="Розподілено" value={`${fmt(planHrs)}/${WEEKLY_CAPACITY}`} colorClass="text-blue-600" />
            <SummaryBox label="Синхронізовано" value={`${fmt(syncHrs)} г`} colorClass="text-emerald-600" />
            <SummaryBox label="Зовнішніх" value={`${fmt(extHrs)} г`} />
            <SummaryBox label="Покриття" value={`${cov}%`} colorClass={pctColor(cov)} />
          </PanelFooter>
        );
      })()}

      {pickerEntry && (() => {
        // External entries always show plan list; plan entries inherit sidebar selection
        const planId = pickerEntry.source === 'external'
          ? (pickerEntry.monthly_plan_id ?? undefined)
          : (pickerEntry.monthly_plan_id ?? selectedPlanId ?? undefined);

        const planList = !planId ? activePlans.map(p => ({
          monthlyPlanId: p.monthlyPlanId,
          planName: p.planName, processName: p.processName,
        })) : undefined;

        if (!planId && (!planList || planList.length === 0)) return null;

        return (
          <TaskPickerDropdown
            monthlyPlanId={planId}
            procedures={planList}
            planOnly={pickerEntry.source === 'external'}
            entryDate={pickerEntry.date} durationMinutes={pickerEntry.duration_minutes}
            anchorRect={pickerRect} onSelect={handlePickerSelect} onClose={handlePickerClose}
          />
        );
      })()}
    </div>
  );
}
