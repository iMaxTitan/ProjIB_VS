'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/shared/utils';
import { Target, FileText, Banknote, Lightbulb, CalendarDays, ChevronRight, X } from 'lucide-react';
import { SummaryBox, pctColor, barBg } from '@/components/dashboard/shared';
import type { ProcessNode } from '@/hooks/usePlansV2';
import type { AnnualPlanRow, AnnualBudgetRow, QuarterlyInitiativeRow } from '@/hooks/usePlansV2';
import type { DailyTask } from '@/types/planning';

interface MonthlyProcessViewProps {
  process: ProcessNode;
  annualPlan: AnnualPlanRow | null;
  annualBudgetItems: AnnualBudgetRow[];
  initiatives: QuarterlyInitiativeRow[];
  quarter: number | null;
  year: number;
  month: number;
  hoursMap: Map<string, { spent: number; tasks: number }>;
  dailyTasks: DailyTask[];
  onClose?: () => void;
}

const META_LABEL = 'flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1';

const INIT_STATUS: Record<string, { cls: string; label: string }> = {
  planned: { cls: 'bg-blue-400', label: 'Заплановано' },
  in_progress: { cls: 'bg-amber-400', label: 'В роботі' },
  completed: { cls: 'bg-emerald-400', label: 'Завершено' },
};


export default function MonthlyProcessView({
  process,
  annualPlan,
  annualBudgetItems,
  initiatives,
  quarter,
  year,
  month,
  hoursMap,
  dailyTasks,
  onClose,
}: MonthlyProcessViewProps) {
  const [expandedProcs, setExpandedProcs] = useState<Set<string>>(new Set());
  const toggleProc = useCallback((id: string) => {
    setExpandedProcs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Budget filtered by quarter
  const quarterBudgetItems = React.useMemo(() => {
    if (!quarter) return [];
    const qStart = new Date(year, (quarter - 1) * 3, 1);
    const qEnd = new Date(year, quarter * 3, 0);
    return annualBudgetItems.filter(b => {
      if (!b.payment_date) return false;
      const d = new Date(b.payment_date);
      return d >= qStart && d <= qEnd;
    });
  }, [annualBudgetItems, quarter, year]);

  const totalBudget = quarterBudgetItems.reduce((s, b) => s + Number(b.amount), 0);

  // Tasks grouped by procedure → by title+source
  const tasksByProc = React.useMemo(() => {
    const m = new Map<string, Map<string, { title: string; description?: string; hours: number; source?: string }>>();
    for (const t of dailyTasks) {
      const procId = process.procedures.find(pr => pr.plans.some(p => p.monthly_plan_id === t.monthly_plan_id))?.procedureId;
      if (!procId) continue;
      let procTasks = m.get(procId);
      if (!procTasks) { procTasks = new Map(); m.set(procId, procTasks); }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tAny = t as any;
      const title = (tAny.title as string) || 'Без назви';
      const source = (tAny.source as string) || '';
      const key = `${title}::${source}`;
      const existing = procTasks.get(key);
      if (existing) existing.hours += (t.spent_hours || 0);
      else procTasks.set(key, { title, description: t.description || undefined, hours: t.spent_hours || 0, source: source || undefined });
    }
    return m;
  }, [dailyTasks, process.procedures]);

  const pct = process.totalPlanned > 0 ? Math.round((process.totalSpent / process.totalPlanned) * 100) : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="detail-hdr flex items-center gap-2 px-3 py-2">
        <div className="w-1 h-5 rounded-sm bg-indigo-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-700 line-clamp-2">{process.name}</div>
        </div>
        {process.departmentName && (
          <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-600 flex-shrink-0">
            {process.departmentName}
          </span>
        )}
        {onClose && (
          <button onClick={onClose} className="cal-action-btn flex-shrink-0" title="Закрити" aria-label="Закрити">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="hdr-sep" />

      <div className="flex-1 overflow-y-auto">
        {/* Description + Mission + Expected result */}
        {(process.description || process.mission || process.expectedResult) && (
          <div className="px-4 py-2.5 border-b border-slate-100">
            {process.description && (
              <div className="mb-1.5">
                <div className={META_LABEL}><FileText className="w-3 h-3" />Опис процесу</div>
                <div className="text-[11px] text-slate-600 leading-relaxed">{process.description}</div>
              </div>
            )}
            {process.mission && (
              <div className="mb-1.5">
                <div className={META_LABEL}><Target className="w-3 h-3" />Місія</div>
                <div className="text-[11px] text-slate-600 leading-relaxed">{process.mission}</div>
              </div>
            )}
            {process.expectedResult && (
              <div>
                <div className={META_LABEL}><Target className="w-3 h-3" />Очікуваний результат</div>
                <div className="text-[11px] text-slate-600 leading-relaxed">{process.expectedResult}</div>
              </div>
            )}
          </div>
        )}

        {/* Budget (quarter) */}
        <div className="px-4 py-2.5 border-b border-slate-100">
          <div className={META_LABEL}>
            <Banknote className="w-3 h-3" />Бюджет{quarter ? ` · Q${quarter}` : ''}
            {totalBudget > 0 && <span className="ml-auto text-[9px] font-bold text-amber-600 normal-case">{totalBudget.toLocaleString('uk-UA')} ₴</span>}
          </div>
          {quarterBudgetItems.length > 0 ? (
            <div className="flex flex-col gap-1">
              {quarterBudgetItems.map(b => (
                <div key={b.id} className="flex items-center gap-2 text-[10px]">
                  <span className="text-slate-600 flex-1 truncate">{b.budget_items?.name || '—'}</span>
                  <span className="font-bold text-amber-600">{Number(b.amount).toLocaleString('uk-UA')} ₴</span>
                  {b.payment_date && (
                    <span className="flex items-center gap-0.5 text-slate-400">
                      <CalendarDays className="w-2.5 h-2.5" />{b.payment_date.slice(5)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-[10px] text-slate-300 italic">немає статей</span>
          )}
        </div>

        {/* Initiatives */}
        <div className="px-4 py-2.5 border-b border-slate-100">
          <div className={META_LABEL}><Lightbulb className="w-3 h-3" />Ініціативи ({initiatives.length})</div>
          {initiatives.length > 0 ? (
            <div className="flex flex-col gap-1">
              {initiatives.map(init => {
                const st = INIT_STATUS[init.status] || INIT_STATUS.planned;
                return (
                  <div key={init.id} className="flex items-center gap-2">
                    <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', st.cls)} title={st.label} />
                    <span className="text-[11px] text-slate-700 line-clamp-2">{init.title}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <span className="text-[10px] text-slate-300 italic">немає ініціатив</span>
          )}
        </div>

        {/* Procedures → expandable tasks */}
        {process.procedures.map(pr => {
          const prPct = pr.plannedHours > 0 ? Math.round((pr.spentHours / pr.plannedHours) * 100) : 0;
          const isExpanded = expandedProcs.has(pr.procedureId);
          const procTasks = tasksByProc.get(pr.procedureId);
          const taskList = procTasks ? Array.from(procTasks.values()).sort((a, b) => b.hours - a.hours) : [];

          return (
            <div key={pr.procedureId} className="border-b border-slate-100 last:border-b-0">
              <button
                type="button"
                onClick={() => toggleProc(pr.procedureId)}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 transition-colors text-left"
              >
                <ChevronRight className={cn('w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform', isExpanded && 'rotate-90')} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">{pr.name}</div>
                </div>
                <span className="text-xs font-bold text-slate-700">{pr.spentHours}/{pr.plannedHours}</span>
                <div className="w-10 h-[3px] rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                  <div className={cn('h-full rounded-full', barBg(prPct))} style={{ width: `${Math.min(prPct, 100)}%` }} />
                </div>
                <span className={cn('text-[10px] font-bold min-w-[28px] text-right', pctColor(prPct))}>{prPct}%</span>
              </button>

              {isExpanded && (taskList.length > 0 ? (
                taskList.map((tg, tgIdx) => (
                  <div key={tgIdx} className="flex items-start gap-2 px-4 py-1.5 pl-10 border-t border-slate-100/80 hover:bg-slate-50/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-slate-700 truncate">{tg.title}</div>
                      {tg.description && <div className="text-[10px] text-slate-500 line-clamp-2">{tg.description}</div>}
                    </div>
                    {tg.source && tg.source !== 'manual' && (
                      <span className={cn('px-1.5 py-0.5 text-[9px] font-bold rounded border flex-shrink-0',
                        tg.source === 'chief' ? 'bg-red-50 text-red-600 border-red-200/60' :
                        tg.source === 'head' ? 'bg-amber-50 text-amber-600 border-amber-200/60' :
                        'bg-slate-100 text-slate-500 border-slate-200/60'
                      )}>
                        {tg.source === 'chief' ? 'ШЕФ' : tg.source === 'head' ? 'КЕР' : tg.source.toUpperCase()}
                      </span>
                    )}
                    <span className="text-[11px] font-bold text-slate-700 min-w-[32px] text-right flex-shrink-0">
                      {Math.round(tg.hours * 10) / 10} год
                    </span>
                  </div>
                ))
              ) : (
                <div className="px-4 py-1.5 pl-10 text-[10px] text-slate-400 italic border-t border-slate-100/80">
                  Немає задач
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 grid grid-cols-3 gap-1.5 p-2.5 bg-slate-50 border-t border-slate-200">
        <SummaryBox label="Заплановано" value={`${process.totalPlanned} год`} />
        <SummaryBox label="Виконано" value={`${process.totalSpent} год`} colorClass="text-emerald-600" />
        <SummaryBox label="Прогрес" value={`${pct}%`} colorClass={pctColor(pct)} />
      </div>
    </div>
  );
}

