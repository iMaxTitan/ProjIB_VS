'use client';

import React, { useState, useMemo } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { SummaryBox, PanelFooter, pctColor, WEEKLY_CAPACITY } from '@/components/dashboard/shared';
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

function DraggablePlan({ plan, syncedHours, unsyncedHours, suggestedHours, isSelected, isCollected, onSelect, onCollectTasks, totalSlotHours }: {
  plan: ActivePlanForSlot;
  syncedHours: number; unsyncedHours: number; suggestedHours: number;
  isSelected: boolean; isCollected: boolean;
  onSelect: () => void;
  onCollectTasks?: (monthlyPlanId: string) => void;
  totalSlotHours: number;
}) {
  const isCompleted = plan.status === 'done';
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
          monthlyPlanId: plan.monthlyPlanId,
          planName: plan.planName,
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

      {/* Row 1: dept badge (color by status) + process/initiative label + pct% */}
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

      {/* Row 2: plan name */}
      <p className={cn('text-[13px] font-medium leading-[1.35] mb-1.5', isSelected ? 'text-sky-900' : 'text-slate-700')} style={{
        display: isHovered ? 'block' : '-webkit-box',
        WebkitLineClamp: isHovered ? undefined : 2,
        WebkitBoxOrient: isHovered ? undefined : 'vertical',
        overflow: isHovered ? 'visible' : 'hidden',
      }}>
        {plan.initiativeId ? '💡' : '📋'} {plan.planName}
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
            onClick={(e) => { e.stopPropagation(); onCollectTasks!(plan.monthlyPlanId); }}
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
  selectedPlanId: string | null;
  collectedPlanIds: Set<string>;
  onSelectPlan: (monthlyPlanId: string) => void;
  onCollectTasks?: (monthlyPlanId: string) => void;
}

export default function PlannerSidebar({ activePlans, entries, suggestions, selectedPlanId, collectedPlanIds, onSelectPlan, onCollectTasks }: Props) {
  const sortedPlans = useMemo(() => {
    return [...activePlans].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return a.planName.localeCompare(b.planName, 'uk');
    });
  }, [activePlans]);

  const hoursByPlan = useMemo(() => {
    const map = new Map<string, { synced: number; unsynced: number; assigned: number; collectable: number }>();
    for (const e of entries) {
      if (!e.monthly_plan_id) continue;
      const prev = map.get(e.monthly_plan_id) || { synced: 0, unsynced: 0, assigned: 0, collectable: 0 };
      const hrs = e.duration_minutes / 60;
      if (e.source === 'plan') {
        if (e.outlook_event_id) prev.synced += hrs; else prev.unsynced += hrs;
        if (e.task_type === 'completed' || e.task_type === 'pending_approval') prev.assigned += hrs;
        else if (e.daily_task_id && e.task_type === 'incomplete') prev.collectable += hrs;
        else if (!e.daily_task_id) prev.collectable += hrs;
      } else if (e.source === 'external' && e.daily_task_id && e.task_type === 'incomplete') {
        prev.collectable += hrs;
      }
      map.set(e.monthly_plan_id, prev);
    }
    return map;
  }, [entries]);

  const suggestedByPlan = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of suggestions) {
      if (s.monthly_plan_id) map.set(s.monthly_plan_id, (map.get(s.monthly_plan_id) || 0) + s.duration_minutes / 60);
    }
    return map;
  }, [suggestions]);

  // ─── Footer stats
  const fmt = (n: number) => n.toFixed(1).replace('.0', '');
  const calStats = useMemo(() => {
    let planHours = 0, syncedHours = 0, externalHours = 0;
    for (const e of entries) {
      const hrs = e.duration_minutes / 60;
      if (e.source === 'plan') { planHours += hrs; if (e.outlook_event_id) syncedHours += hrs; }
      else if (e.source === 'external') externalHours += hrs;
    }
    const coverage = WEEKLY_CAPACITY > 0 ? Math.round((planHours / WEEKLY_CAPACITY) * 100) : 0;
    return { planHours, syncedHours, externalHours, coverage };
  }, [entries]);

  if (activePlans.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-slate-400">Немає планів на цей період</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Body */}
      <div className="flex-1 overflow-y-auto p-1 space-y-1">
        {sortedPlans.map((plan) => {
          const hrs = hoursByPlan.get(plan.monthlyPlanId) || { synced: 0, unsynced: 0, assigned: 0, collectable: 0 };
          return (
            <DraggablePlan
              key={plan.monthlyPlanId} plan={plan}
              syncedHours={hrs.synced} unsyncedHours={hrs.unsynced}
              suggestedHours={suggestedByPlan.get(plan.monthlyPlanId) || 0}
              isSelected={selectedPlanId === plan.monthlyPlanId}
              isCollected={collectedPlanIds.has(plan.monthlyPlanId)}
              onSelect={() => onSelectPlan(plan.monthlyPlanId)}
              onCollectTasks={onCollectTasks} totalSlotHours={hrs.collectable}
            />
          );
        })}
      </div>

      {/* Footer */}
      <PanelFooter>
        <SummaryBox label="Планів" value={String(sortedPlans.length)} />
        <SummaryBox label="Факт" value={`${fmt(calStats.planHours)} год`} colorClass="text-blue-600" />
        <SummaryBox label="Покриття" value={`${calStats.coverage}%`} colorClass={pctColor(calStats.coverage)} />
      </PanelFooter>
    </div>
  );
}
