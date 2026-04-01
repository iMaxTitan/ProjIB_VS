'use client';

import React, { useState, useCallback } from 'react';
import { ChevronRight, Ban, Ellipsis, Loader, CheckCheck, Play, Check } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import type { ProcessNode, ViewLevel, AnnualPlanRow, QuarterlyPlanRow } from '@/hooks/usePlansV2';
import type { MonthlyPlan } from '@/types/planning';

type ProcessStatus = 'none' | 'pending' | 'active' | 'done';

const STATUS_ICON_MAP: Record<ProcessStatus, { Icon: typeof Ban; cls: string; title: string }> = {
  none: { Icon: Ban, cls: 'text-slate-300', title: 'Немає плану' },
  pending: { Icon: Ellipsis, cls: 'text-amber-500', title: 'Не затверджено' },
  active: { Icon: Loader, cls: 'text-indigo-500', title: 'В роботі' },
  done: { Icon: CheckCheck, cls: 'text-emerald-500', title: 'Виконано' },
};

/** Next status transition: pending→active, active→done */
const NEXT_STATUS: Partial<Record<ProcessStatus, { target: ProcessStatus; icon: typeof Play; label: string; cls: string }>> = {
  pending: { target: 'active', icon: Play, label: 'Затвердити', cls: 'text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50' },
  active: { target: 'done', icon: Check, label: 'Виконано', cls: 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50' },
};

function pctColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 40) return 'text-indigo-600';
  return 'text-amber-600';
}

function getProcedureStatus(plans: MonthlyPlan[]): ProcessStatus {
  if (plans.length === 0) return 'none';
  const statuses = plans.map(p => p.status);
  if (statuses.every(s => s === 'done')) return 'done';
  if (statuses.some(s => s === 'active' || s === 'done')) return 'active';
  return 'pending';
}

interface ProcessListPanelProps {
  processTree: ProcessNode[];
  viewLevel: ViewLevel;
  selectedProcessId: string | null;
  selectedProcedureId: string | null;
  onSelectProcess: (id: string) => void;
  onSelectProcedure: (processId: string, procedureId: string) => void;
  resourceHours: number;
  annualPlans: AnnualPlanRow[];
  quarterlyPlans: QuarterlyPlanRow[];
  quarter: number | null;
  canEdit?: boolean;
  onRefresh?: () => void;
}

export default function ProcessListPanel({
  processTree,
  viewLevel,
  selectedProcessId,
  selectedProcedureId,
  onSelectProcess,
  onSelectProcedure,
  resourceHours,
  annualPlans,
  quarterlyPlans,
  quarter,
  canEdit,
  onRefresh,
}: ProcessListPanelProps) {
  const [saving, setSaving] = useState<string | null>(null); // monthly_plan_id being updated

  const changeProcStatus = useCallback(async (monthlyPlanId: string, newStatus: ProcessStatus) => {
    setSaving(monthlyPlanId);
    try {
      await fetch('/api/plans/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: monthlyPlanId, table: 'monthly_plans', status: newStatus }),
      });
      onRefresh?.();
    } finally { setSaving(null); }
  }, [onRefresh]);

  // Determine process status based on scope
  const getProcessStatus = useCallback((processId: string): ProcessStatus => {
    if (viewLevel === 'year') {
      const plan = annualPlans.find(a => a.process_id === processId);
      if (!plan) return 'none';
      return (plan.status as ProcessStatus) || 'pending';
    }
    if (viewLevel === 'quarter' && quarter) {
      const plan = quarterlyPlans.find(q => q.process_id === processId && q.quarter === quarter);
      if (!plan) return 'none';
      return (plan.status as ProcessStatus) || 'pending';
    }
    // month — aggregate from monthly plans (procedures have plans)
    const proc = processTree.find(p => p.processId === processId);
    if (!proc) return 'none';
    const statuses = proc.procedures.flatMap(pr => pr.plans.map(p => p.status));
    if (statuses.length === 0) return 'none';
    if (statuses.every(s => s === 'done')) return 'done';
    if (statuses.some(s => s === 'active' || s === 'done')) return 'active';
    return 'pending';
  }, [viewLevel, annualPlans, quarterlyPlans, quarter, processTree]);

  // All collapsed by default; auto-expand when a procedure inside is selected
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleExpand = useCallback((processId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(processId)) next.delete(processId);
      else next.add(processId);
      return next;
    });
  }, []);

  // Grand totals
  const grandPlanned = processTree.reduce((s, p) => s + p.totalPlanned, 0);
  const grandSpent = processTree.reduce((s, p) => s + p.totalSpent, 0);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Body */}
      <div className="flex-1 overflow-y-auto py-1">
        {processTree.map(proc => {
          const status = getProcessStatus(proc.processId);
          const stIcon = STATUS_ICON_MAP[status];
          const pct = proc.totalPlanned > 0 ? Math.round((proc.totalSpent / proc.totalPlanned) * 100) : 0;
          const isProcessSelected = selectedProcessId === proc.processId && !selectedProcedureId;
          const hasProcSelected = selectedProcessId === proc.processId && !!selectedProcedureId;
          const isExpanded = expanded.has(proc.processId) || hasProcSelected;

          return (
            <div key={proc.processId} className="border-b border-slate-100 last:border-b-0">
              {/* Process header — matches MonthlyUsersView employee row */}
              <button
                type="button"
                onClick={() => {
                  toggleExpand(proc.processId);
                  if (!isProcessSelected) onSelectProcess(proc.processId);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-4 py-2.5 transition-colors cursor-pointer text-left',
                  (isProcessSelected || hasProcSelected) ? 'bg-indigo-50/80 hover:bg-indigo-50' : 'bg-slate-50/80 hover:bg-slate-100/80',
                )}
              >
                <ChevronRight className={cn('w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform', isExpanded && 'rotate-90')} />
                <span className="flex-shrink-0" title={stIcon.title}><stIcon.Icon className={cn('w-3.5 h-3.5', stIcon.cls)} /></span>
                <div className="flex-1 min-w-0">
                  <div className={cn('text-xs font-semibold truncate', isProcessSelected ? 'text-indigo-700' : 'text-slate-800')}>
                    {proc.name}
                  </div>
                </div>
                <span className={cn('text-[10px] font-bold min-w-[28px] text-right flex-shrink-0', pctColor(pct))}>
                  {pct}%
                </span>
              </button>

              {/* Procedure rows — matches MonthlyUsersView child rows */}
              {isExpanded && proc.procedures.map(pr => {
                const isProcSelected = selectedProcedureId === pr.procedureId;
                const prPct = pr.plannedHours > 0 ? Math.round((pr.spentHours / pr.plannedHours) * 100) : 0;
                const isMonth = viewLevel === 'month';
                const prStatus = isMonth ? getProcedureStatus(pr.plans) : null;
                const prStIcon = prStatus ? STATUS_ICON_MAP[prStatus] : null;
                const nextAction = isMonth && canEdit && prStatus ? NEXT_STATUS[prStatus] : null;
                const planId = pr.plans[0]?.monthly_plan_id;
                const isSaving = saving === planId;

                return (
                  <div
                    key={pr.procedureId}
                    className={cn(
                      'flex items-center gap-2 px-4 py-1.5 pl-14 border-t border-slate-100/80 transition-colors',
                      isProcSelected ? 'bg-indigo-50 hover:bg-indigo-50' : 'hover:bg-slate-50/50',
                    )}
                  >
                    {prStIcon && (
                      <span className="flex-shrink-0" title={prStIcon.title}>
                        <prStIcon.Icon className={cn('w-3 h-3', prStIcon.cls)} />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => isProcSelected ? onSelectProcess(proc.processId) : onSelectProcedure(proc.processId, pr.procedureId)}
                      aria-label={`Процедура: ${pr.name}`}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <div className={cn('text-[11px] font-medium truncate', isProcSelected ? 'text-indigo-700' : 'text-slate-600')}>
                        {pr.name}
                      </div>
                    </button>
                    {nextAction && planId && (
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={(e) => { e.stopPropagation(); changeProcStatus(planId, nextAction.target); }}
                        title={nextAction.label}
                        aria-label={nextAction.label}
                        className={cn('flex-shrink-0 p-0.5 rounded transition-colors', nextAction.cls, isSaving && 'opacity-50')}
                      >
                        <nextAction.icon className="w-3 h-3" />
                      </button>
                    )}
                    <span className={cn('text-[11px] font-bold text-slate-700 min-w-[40px] text-right flex-shrink-0')}>
                      {prPct}%
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Summary footer — 3 metrics in one row */}
      <div className="flex-shrink-0 grid grid-cols-3 gap-1.5 p-2.5 bg-slate-50 border-t border-slate-200">
        <FooterMetric label="Процесів" value={`${processTree.length}`} />
        <FooterMetric label="Факт" value={`${grandSpent} год`} />
        <FooterMetric label="План" value={`${grandPlanned} год`} />
      </div>
    </div>
  );
}

function FooterMetric({ label, value, colorClass }: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="px-2 py-1.5 rounded-lg bg-white border border-slate-200/60 text-center">
      <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">{label}</div>
      <div className={cn('text-sm font-extrabold mt-0.5 leading-tight', colorClass || 'text-slate-800')}>{value}</div>
    </div>
  );
}
