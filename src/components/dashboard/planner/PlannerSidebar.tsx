'use client';

import React, { useState, useMemo } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import type { ActivePlanForSlot, CalendarEntry } from '@/lib/ops/planner/calendar-entries';
import type { SuggestedSlot } from '@/lib/ops/planner/weekly-suggest';
import { STATUS_CONFIG } from '@/lib/ops/plans/planning-utils';

const STATUS_TONE: Record<string, { bg: string; border: string; color: string }> = {
  active:    { bg: 'bg-violet-500/[0.08]', border: 'border-violet-500/20', color: 'text-violet-600' },
  completed: { bg: 'bg-green-600/[0.08]',  border: 'border-green-600/20',  color: 'text-green-600' },
};

function progressColorClass(pct: number): string {
  if (pct >= 100) return 'text-emerald-500';
  if (pct >= 70) return 'text-blue-500';
  if (pct >= 40) return 'text-amber-500';
  if (pct < 1) return 'text-slate-200';
  return 'text-red-500';
}

function DraggableProcedure({ plan, syncedHours, unsyncedHours, suggestedHours, isSelected, isCollected, onSelect, onCollectTasks, totalSlotHours }: {
  plan: ActivePlanForSlot;
  syncedHours: number; unsyncedHours: number; suggestedHours: number;
  isSelected: boolean; isCollected: boolean;
  onSelect: () => void;
  onCollectTasks?: (procedureId: string) => void;
  totalSlotHours: number;
}) {
  const isCompleted = plan.status === 'completed';
  const [isDragging, setIsDragging] = useState(false);

  const totalDist = syncedHours + unsyncedHours + suggestedHours;
  const pct = plan.plannedHours > 0 ? Math.min(999, Math.round((totalDist / plan.plannedHours) * 100)) : 0;
  const [isHovered, setIsHovered] = useState(false);
  const tone = STATUS_TONE[plan.status] || STATUS_TONE.active;
  const deptLabel = plan.departmentCode || '';
  const syncW = plan.plannedHours > 0 ? Math.min(100, Math.round((syncedHours / plan.plannedHours) * 100)) : 0;
  const distW = plan.plannedHours > 0 ? Math.min(100, Math.round((totalDist / plan.plannedHours) * 100)) : 0;

  return (
    <div
      draggable={!isCompleted}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/planner-procedure', JSON.stringify({
          type: 'procedure',
          procedureId: plan.procedureId,
          monthlyPlanId: plan.monthlyPlanId,
          procedureName: plan.procedureName,
        }));
        e.dataTransfer.effectAllowed = 'copy';
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onMouseEnter={() => !isDragging && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-el="L2 element-card · proc-item" data-el-cat="base"
      className={cn(
        'element-card proc-item group/proc',
        isDragging && 'dragging',
        isSelected && !isDragging && 'proc-active',
        isHovered && !isDragging && !isSelected && 'hover',
        isCompleted && 'opacity-70',
      )}
      style={isCompleted ? { cursor: 'default' } : undefined}>

      {/* Row 1: dept badge (color by status) + process + pct% */}
      <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
        {deptLabel && (
          <span className={cn('text-[10px] font-bold py-0.5 px-1.5 rounded-[5px] flex-shrink-0 border', tone.bg, tone.border, tone.color)}>
            {deptLabel}
          </span>
        )}
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-slate-400">
          {plan.processName}
        </span>
        <span className={cn('ml-auto flex-shrink-0 text-[11px] font-bold', progressColorClass(pct))}>
          {pct}%
        </span>
      </div>

      {/* Row 2: procedure name */}
      <p className={cn('text-[13px] font-medium leading-[1.35] mb-1.5', isSelected ? 'text-sky-900' : 'text-slate-700')} style={{
        display: isHovered ? 'block' : '-webkit-box',
        WebkitLineClamp: isHovered ? undefined : 2,
        WebkitBoxOrient: isHovered ? undefined : 'vertical',
        overflow: isHovered ? 'visible' : 'hidden',
      }}>
        {plan.procedureName}
      </p>

      {/* Row 3: Dual progress bar */}
      <div className="h-[5px] rounded-sm bg-slate-200/50 overflow-hidden relative mb-1.5">
        <div className="absolute left-0 top-0 bottom-0 bg-blue-500 opacity-30 rounded-sm transition-[width] duration-300" style={{ width: `${distW}%` }} />
        <div className="absolute left-0 top-0 bottom-0 bg-emerald-500 rounded-sm transition-[width] duration-300" style={{ width: `${syncW}%` }} />
      </div>

      {/* Row 4: Hours breakdown + collect icon */}
      <div className="flex items-center gap-0.5 text-[10px] font-mono">
        <span className="text-emerald-500" title="Синхронізовано">✓{syncedHours.toFixed(1).replace('.0', '')}</span>
        <span className="text-slate-400">·</span>
        {unsyncedHours > 0 && (
          <>
            <span className="text-sky-900" title="Не синхронізовано">+{unsyncedHours.toFixed(1).replace('.0', '')}</span>
            <span className="text-slate-400">·</span>
          </>
        )}
        <span className="text-slate-500" title="Заплановано">/ {plan.plannedHours}г</span>

        {onCollectTasks && !isCompleted && totalSlotHours > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onCollectTasks!(plan.procedureId); }}
            className="cal-action-btn ml-auto"
            title={`Зібрати задачі (${totalSlotHours.toFixed(1)} г)`}>
            <ClipboardCheck className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

interface Props {
  activePlans: ActivePlanForSlot[];
  entries: CalendarEntry[];
  suggestions: SuggestedSlot[];
  selectedProcedureId: string | null;
  collectedProcedureIds: Set<string>;
  onSelectProcedure: (procedureId: string) => void;
  onCollectTasks?: (procedureId: string) => void;
}

export default function PlannerSidebar({ activePlans, entries, suggestions, selectedProcedureId, collectedProcedureIds, onSelectProcedure, onCollectTasks }: Props) {
  const sortedPlans = useMemo(() => {
    return [...activePlans].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return a.procedureName.localeCompare(b.procedureName, 'uk');
    });
  }, [activePlans]);

  const planToProcedure = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of activePlans) map.set(p.monthlyPlanId, p.procedureId);
    return map;
  }, [activePlans]);

  const hoursByProcedure = useMemo(() => {
    const map = new Map<string, { synced: number; unsynced: number; assigned: number; collectable: number }>();
    for (const e of entries) {
      if (!e.monthly_plan_id) continue;
      const procId = planToProcedure.get(e.monthly_plan_id);
      if (!procId) continue;
      const prev = map.get(procId) || { synced: 0, unsynced: 0, assigned: 0, collectable: 0 };
      const hrs = e.duration_minutes / 60;
      if (e.source === 'plan') {
        if (e.outlook_event_id) prev.synced += hrs; else prev.unsynced += hrs;
        if (e.daily_task_id) prev.assigned += hrs;
        if (e.task_template_id && !e.daily_task_id) prev.collectable += hrs;
      } else if (e.source === 'external' && !e.daily_task_id) {
        // External with transcript or template → collectable
        if (e.has_transcript || e.task_template_id) prev.collectable += hrs;
      }
      map.set(procId, prev);
    }
    return map;
  }, [entries, planToProcedure]);

  const suggestedByProcedure = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of suggestions) map.set(s.procedure_id, (map.get(s.procedure_id) || 0) + s.duration_minutes / 60);
    return map;
  }, [suggestions]);

  if (activePlans.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-slate-400">Немає планів на цей період</p>
      </div>
    );
  }

  return (
    <div className="p-1 space-y-1">
      {sortedPlans.map((plan) => {
        const hrs = hoursByProcedure.get(plan.procedureId) || { synced: 0, unsynced: 0, assigned: 0, collectable: 0 };
        return (
          <DraggableProcedure
            key={plan.monthlyPlanId} plan={plan}
            syncedHours={hrs.synced} unsyncedHours={hrs.unsynced}
            suggestedHours={suggestedByProcedure.get(plan.procedureId) || 0}
            isSelected={selectedProcedureId === plan.procedureId}
            isCollected={collectedProcedureIds.has(plan.procedureId)}
            onSelect={() => onSelectProcedure(plan.procedureId)}
            onCollectTasks={onCollectTasks} totalSlotHours={hrs.collectable}
          />
        );
      })}
    </div>
  );
}
