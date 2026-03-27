'use client';

import React, { useState, useCallback } from 'react';
import { ChevronRight, Ban, Hourglass, Zap, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import type { ProcessNode, ViewLevel, AnnualPlanRow, QuarterlyPlanRow } from '@/hooks/usePlansV2';
import type { MonthlyPlan } from '@/types/planning';

type ProcessStatus = 'none' | 'pending' | 'active' | 'done';

const STATUS_ICON_MAP: Record<ProcessStatus, { Icon: typeof Ban; cls: string; title: string }> = {
  none: { Icon: Ban, cls: 'text-slate-300', title: 'Немає плану' },
  pending: { Icon: Hourglass, cls: 'text-amber-500', title: 'Не затверджено' },
  active: { Icon: Zap, cls: 'text-indigo-500', title: 'В роботі' },
  done: { Icon: CheckCheck, cls: 'text-emerald-500', title: 'Виконано' },
};

function pctColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 40) return 'text-indigo-600';
  return 'text-amber-600';
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
}: ProcessListPanelProps) {
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
              {/* Process header */}
              <div className={cn(
                'flex items-center bg-slate-50/80 hover:bg-slate-100/80 transition-colors',
                (isProcessSelected || hasProcSelected) && 'bg-indigo-50/80 hover:bg-indigo-50',
              )}>
                <button
                  type="button"
                  onClick={() => toggleExpand(proc.processId)}
                  className="flex-shrink-0 p-0.5 pl-1.5"
                  aria-label={isExpanded ? 'Згорнути' : 'Розгорнути'}
                >
                  <ChevronRight className={cn(
                    'w-3.5 h-3.5 text-slate-400 transition-transform duration-200',
                    isExpanded && 'rotate-90',
                  )} />
                </button>
                <button
                  type="button"
                  onClick={() => isProcessSelected ? onSelectProcess('') : onSelectProcess(proc.processId)}
                  aria-label={`Процес: ${proc.name}`}
                  className="flex-1 min-w-0 flex items-center gap-1.5 pr-2 py-1.5 text-left cursor-pointer"
                >
                  <span className="flex-shrink-0" title={stIcon.title}><stIcon.Icon className={cn('w-3.5 h-3.5', stIcon.cls)} /></span>
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      'text-xs font-semibold line-clamp-2',
                      isProcessSelected ? 'text-indigo-700' : 'text-slate-800',
                    )}>
                      {proc.name}
                    </div>
                  </div>
                  {/* Progress */}
                  <span className={cn('text-[10px] font-bold min-w-[28px] text-right flex-shrink-0', pctColor(pct))}>
                    {pct}%
                  </span>
                </button>
              </div>

              {/* Procedure rows — collapsible */}
              {isExpanded && proc.procedures.map(pr => {
                const isProcSelected = selectedProcedureId === pr.procedureId;
                const prPct = pr.plannedHours > 0 ? Math.round((pr.spentHours / pr.plannedHours) * 100) : 0;

                return (
                  <button
                    key={pr.procedureId}
                    type="button"
                    onClick={() => isProcSelected ? onSelectProcess(proc.processId) : onSelectProcedure(proc.processId, pr.procedureId)}
                    aria-label={`Процедура: ${pr.name}`}
                    className={cn(
                      'w-full flex items-center gap-1.5 px-2 py-1.5 pl-7 text-left border-t border-slate-100/80 transition-colors cursor-pointer',
                      isProcSelected
                        ? 'bg-indigo-50 hover:bg-indigo-50'
                        : 'hover:bg-slate-50',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className={cn(
                          'text-[11px] font-medium truncate',
                          isProcSelected ? 'text-indigo-700' : 'text-slate-700',
                        )}
                      >
                        {pr.name}
                      </div>
                    </div>
                    <span className={cn('text-[10px] font-bold min-w-[28px] text-right flex-shrink-0', pctColor(prPct))}>
                      {prPct}%
                    </span>
                  </button>
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
