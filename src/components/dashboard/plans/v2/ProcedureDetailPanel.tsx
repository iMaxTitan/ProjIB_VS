'use client';

import React from 'react';
import { cn } from '@/lib/shared/utils';
import { MONTH_NAMES_UK } from '@/types/planning';
import type { MonthlyPlanAssignee } from '@/types/planning';
import EmptyState from '@/components/ui/EmptyState';
import { FileSearch, Building2, FolderKanban, BookOpen, BookMarked, Lightbulb, Settings2, Target, ClipboardList, ChevronRight, X } from 'lucide-react';
import type { ProcessNode, ProcedureNode, QuarterlyInitiativeRow, ViewLevel } from '@/hooks/usePlansV2';
import type { PlanCompanyInfo, PlanProjectInfo, PlanDocInfo } from '@/hooks/usePlansV2Detail';

export interface ProcessGoal {
  quarter: number;
  goal: string;
  note: string | null;
  status: string;
  annualGoal: string | null;
  annualBudget: number;
}

interface ProcedureDetailPanelProps {
  selectedProcess: ProcessNode | null;
  selectedProcedure: ProcedureNode | null;
  viewLevel: ViewLevel;
  scopeLabel: string;
  scopeMonths: number[];
  companies: PlanCompanyInfo[];
  projects: PlanProjectInfo[];
  kbDocs: PlanDocInfo[];
  assignees: MonthlyPlanAssignee[];
  rawAssignees: MonthlyPlanAssignee[];
  hoursMap: Map<string, { spent: number; tasks: number }>;
  processGoals?: ProcessGoal[];
  initiatives?: QuarterlyInitiativeRow[];
  onClose?: () => void;
}

function pctColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 40) return 'text-indigo-600';
  return 'text-amber-600';
}

function barBg(pct: number): string {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 40) return 'bg-indigo-500';
  return 'bg-amber-500';
}

function statusIcon(pct: number): { char: string; color: string } {
  if (pct >= 100) return { char: '\u2713', color: 'text-emerald-500' };
  if (pct > 0) return { char: '\u25CB', color: 'text-blue-500' };
  return { char: '\u00B7', color: 'text-slate-300' };
}

export default function ProcedureDetailPanel({
  selectedProcess,
  selectedProcedure,
  viewLevel,
  scopeLabel,
  scopeMonths,
  companies,
  projects,
  kbDocs,
  assignees,
  rawAssignees,
  hoursMap,
  processGoals,
  initiatives,
  onClose,
}: ProcedureDetailPanelProps) {
  if (!selectedProcess) {
    return (
      <EmptyState
        variant="centered"
        icon={<FileSearch className="h-10 w-10" />}
        title="Оберіть процес або процедуру"
        description="Оберіть елемент зліва для перегляду деталей"
      />
    );
  }

  // Procedure selected → show months → employees breakdown
  if (selectedProcedure) {
    return (
      <ProcedureView
        proc={selectedProcess}
        pr={selectedProcedure}
        viewLevel={viewLevel}
        scopeMonths={scopeMonths}
        hoursMap={hoursMap}
        companies={companies}
        projects={projects}
        kbDocs={kbDocs}
        assignees={rawAssignees}
        initiatives={initiatives}
        onClose={onClose}
      />
    );
  }

  // Process selected → show procedures → months breakdown
  return <ProcessView proc={selectedProcess} scopeLabel={scopeLabel} scopeMonths={scopeMonths} hoursMap={hoursMap} processGoals={processGoals} onClose={onClose} />;
}

// ── Process view ──────────────────────────────────────────

function ProcessView({
  proc,
  scopeLabel,
  scopeMonths,
  hoursMap,
  processGoals,
  onClose,
}: {
  proc: ProcessNode;
  scopeLabel: string;
  scopeMonths: number[];
  hoursMap: Map<string, { spent: number; tasks: number }>;
  processGoals?: ProcessGoal[];
  onClose?: () => void;
}) {
  const pct = proc.totalPlanned > 0
    ? Math.round((proc.totalSpent / proc.totalPlanned) * 100)
    : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <DetailHeader
        title={proc.name}
        departmentName={proc.departmentName}
        onClose={onClose}
      />

      {/* Process description */}
      {proc.description && (
        <div className="flex-shrink-0 px-4 py-2.5 border-b border-slate-100">
          <div className="text-[11px] text-slate-600 leading-relaxed">{proc.description}</div>
        </div>
      )}

      {/* Procedures → months */}
      <div className="flex-1 overflow-y-auto">
        {/* Annual goals + quarterly breakdown */}
        {processGoals && processGoals.length > 0 && (
          <div className="border-b-2 border-slate-200">
            {/* Unique annual goals */}
            {(() => {
              const seen = new Set<string>();
              const unique = processGoals.filter(g => {
                if (!g.annualGoal || seen.has(g.annualGoal)) return false;
                seen.add(g.annualGoal);
                return true;
              });
              return unique.map((g, i) => (
                <div key={i} className="flex items-start gap-2 px-4 py-2 border-b border-slate-100 last:border-b-0">
                  <Target className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-slate-700">{g.annualGoal}</div>
                  </div>
                  {g.annualBudget > 0 && (
                    <span className="text-[10px] font-bold text-amber-600 flex-shrink-0">
                      {g.annualBudget.toLocaleString('uk-UA')} ₴
                    </span>
                  )}
                </div>
              ));
            })()}
            {/* Quarterly goals */}
            {processGoals.map((g, i) => (
              <div key={i} className="flex items-start gap-2 px-4 py-1.5 pl-7 border-b border-slate-100/80 last:border-b-0">
                <span className={cn('text-[10px] font-bold flex-shrink-0 min-w-[20px]',
                  g.status === 'active' ? 'text-emerald-600' : g.status === 'draft' ? 'text-slate-400' : 'text-blue-600'
                )}>Q{g.quarter}</span>
                <div className="flex-1 min-w-0 text-[11px] text-slate-600 line-clamp-2">{g.goal}</div>
              </div>
            ))}
          </div>
        )}

        {proc.procedures.map(pr => {
          const prPct = pr.plannedHours > 0
            ? Math.round((pr.spentHours / pr.plannedHours) * 100)
            : 0;
          const icon = statusIcon(prPct);

          // Group plans by month — use actual spent from hoursMap
          const monthBreakdown = scopeMonths
            .map(m => {
              const plan = pr.plans.find(p => p.month === m);
              if (!plan) return null;
              const planned = plan.planned_hours || 0;
              const spent = hoursMap.get(plan.monthly_plan_id)?.spent ?? 0;
              return { month: m, planned, spent };
            })
            .filter(Boolean) as { month: number; planned: number; spent: number }[];

          return (
            <div key={pr.procedureId} className="border-b border-slate-100 last:border-b-0">
              {/* Procedure group header */}
              <div className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50/80">
                <span className={cn('text-sm flex-shrink-0', icon.color)}>{icon.char}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">{pr.name}</div>
                </div>
                <span className="text-xs font-bold text-slate-700">
                  {pr.spentHours}/{pr.plannedHours}
                </span>
                <span className={cn('text-[10px] font-bold', pctColor(prPct))}>{prPct}%</span>
              </div>

              {/* Month rows */}
              {monthBreakdown.map(mb => {
                const mPct = mb.planned > 0 ? Math.round((mb.spent / mb.planned) * 100) : 0;
                const mi = statusIcon(mPct);
                return (
                  <div
                    key={mb.month}
                    className="flex items-center gap-2 px-4 py-1.5 pl-9 border-t border-slate-100/80 hover:bg-slate-50/50 transition-colors"
                  >
                    <span className={cn('text-sm flex-shrink-0 w-4 text-center', mi.color)}>
                      {mi.char}
                    </span>
                    <div className="flex-1 text-[11px] font-medium text-slate-700">
                      {MONTH_NAMES_UK[mb.month - 1]}
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 min-w-[36px] text-right">
                      {mb.spent}/{mb.planned}
                    </span>
                    <span className={cn('text-[10px] font-bold min-w-[28px] text-right', pctColor(mPct))}>
                      {mPct}%
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <SummaryFooter planned={proc.totalPlanned} spent={proc.totalSpent} pct={pct} />
    </div>
  );
}

// ── Procedure view ────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = { process: 'Процесний', operational: 'Операційний', strategic: 'Стратегічний' };
const CATEGORY_COLORS: Record<string, string> = { process: 'text-blue-600 bg-blue-50', operational: 'text-cyan-600 bg-cyan-50', strategic: 'text-purple-600 bg-purple-50' };
const PERIOD_LABELS: Record<string, string> = { month: 'місяць', quarter: 'квартал', year: 'рік' };

function ProcedureView({
  pr,
  viewLevel,
  scopeMonths,
  hoursMap,
  companies,
  projects,
  kbDocs,
  assignees,
  initiatives,
  onClose,
}: {
  proc: ProcessNode;
  pr: ProcedureNode;
  viewLevel: ViewLevel;
  scopeMonths: number[];
  hoursMap: Map<string, { spent: number; tasks: number }>;
  companies: PlanCompanyInfo[];
  projects: PlanProjectInfo[];
  kbDocs: PlanDocInfo[];
  assignees: MonthlyPlanAssignee[];
  initiatives?: QuarterlyInitiativeRow[];
  onClose?: () => void;
}) {
  const pct = pr.plannedHours > 0
    ? Math.round((pr.spentHours / pr.plannedHours) * 100)
    : 0;

  const isYear = viewLevel === 'year';
  const isQuarter = viewLevel === 'quarter';
  const isMonth = viewLevel === 'month';
  const showInitiatives = isQuarter || isMonth;

  // Quarter breakdown for year view
  const quarterBreakdown = React.useMemo(() => {
    if (!isYear) return [];
    const qMap = new Map<number, { planned: number; spent: number; months: { month: number; planned: number; spent: number }[] }>();
    for (const plan of pr.plans) {
      const q = Math.ceil(plan.month / 3);
      let entry = qMap.get(q);
      if (!entry) { entry = { planned: 0, spent: 0, months: [] }; qMap.set(q, entry); }
      const planned = plan.planned_hours || 0;
      const spent = hoursMap.get(plan.monthly_plan_id)?.spent ?? 0;
      entry.planned += planned;
      entry.spent += spent;
      entry.months.push({ month: plan.month, planned, spent });
    }
    return [1, 2, 3, 4].map(q => {
      const entry = qMap.get(q);
      if (!entry) return { quarter: q, planned: 0, spent: 0, months: [] };
      entry.months.sort((a, b) => a.month - b.month);
      return { quarter: q, ...entry };
    }).filter(q => q.planned > 0 || q.spent > 0);
  }, [isYear, pr.plans, hoursMap]);

  // Month breakdown for quarter view
  const monthBreakdown = React.useMemo(() => {
    if (!isQuarter) return [];
    return scopeMonths.map(m => {
      const plan = pr.plans.find(p => p.month === m);
      if (!plan) return null;
      const planned = plan.planned_hours || 0;
      const spent = hoursMap.get(plan.monthly_plan_id)?.spent ?? 0;
      return { month: m, planned, spent };
    }).filter(Boolean) as { month: number; planned: number; spent: number }[];
  }, [isQuarter, pr.plans, scopeMonths, hoursMap]);

  // Unique assignees for quarter view
  const uniqueAssignees = React.useMemo(() => {
    if (!isQuarter) return [];
    const map = new Map<string, MonthlyPlanAssignee>();
    for (const a of assignees) {
      if (!map.has(a.user_id)) map.set(a.user_id, a);
    }
    return Array.from(map.values());
  }, [isQuarter, assignees]);

  // Expanded quarters (year view)
  const [expandedQ, setExpandedQ] = React.useState<Set<number>>(new Set());
  const toggleQ = React.useCallback((q: number) => {
    setExpandedQ(prev => { const n = new Set(prev); if (n.has(q)) n.delete(q); else n.add(q); return n; });
  }, []);

  // Filter initiatives for month level
  const visibleInitiatives = React.useMemo(() => {
    if (!initiatives) return [];
    if (isMonth) return initiatives.filter(i => i.status === 'in_progress' || i.status === 'completed');
    return initiatives;
  }, [initiatives, isMonth]);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <DetailHeader title={pr.name} onClose={onClose} />

      {/* Description + target */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-slate-100">
        {pr.description && (
          <div className="text-[11px] text-slate-600 leading-relaxed">{pr.description}</div>
        )}
        {pr.targetValue != null && pr.targetValue > 0 && (
          <div className={pr.description ? 'mt-1.5' : ''}>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
              <Target className="w-3 h-3" />{pr.targetValue} год/{PERIOD_LABELS[pr.targetPeriod || ''] || pr.targetPeriod}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Послуга ── */}
        <div className="px-4 py-2.5 border-b border-slate-100">
          <div className={META_LABEL}><BookMarked className="w-3 h-3" />Послуга</div>
          {pr.serviceName ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600">
              <Settings2 className="w-3 h-3" />{pr.serviceName}
            </span>
          ) : (
            <span className="text-[10px] text-slate-300 italic">не визначено</span>
          )}
        </div>

        {/* ── Компанії (month only) ── */}
        {isMonth && (
          <div className="px-4 py-2.5 border-b border-slate-100">
            <div className={META_LABEL}>
              <Building2 className="w-3 h-3" />Компанії ({companies.length})
              {(() => {
                const dt = pr.plans[0]?.distribution_type;
                if (!dt || dt === 'even') return null;
                const label = dt === 'by_servers' ? 'по серверам' : dt === 'by_workstations' ? 'по раб. станціям' : dt;
                return <span className="ml-auto text-[9px] font-medium text-slate-400 normal-case tracking-normal">· {label}</span>;
              })()}
            </div>
            {companies.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {companies.map(c => <span key={c.companyId} className={cn(TAG_CLS, 'bg-slate-100 text-slate-600')}>{c.companyName}</span>)}
              </div>
            ) : (
              <span className="text-[10px] text-slate-300 italic">не призначено</span>
            )}
          </div>
        )}

        {/* ── Ініціативи (quarter + month — після компаній) ── */}
        {showInitiatives && (
          <div className="px-4 py-2.5 border-b border-slate-100">
            <div className={META_LABEL}><Lightbulb className="w-3 h-3" />Ініціативи ({visibleInitiatives.length})</div>
            {visibleInitiatives.length > 0 ? (
              <div className="flex flex-col gap-1">
                {visibleInitiatives.map(init => {
                  const stMap: Record<string, { cls: string; label: string }> = {
                    planned: { cls: 'bg-blue-400', label: 'Заплановано' },
                    in_progress: { cls: 'bg-amber-400', label: 'В роботі' },
                    completed: { cls: 'bg-emerald-400', label: 'Завершено' },
                  };
                  const st = stMap[init.status] || stMap.planned;
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
        )}

        {/* ── Проєкти (all scopes) ── */}
        <div className="px-4 py-2.5 border-b border-slate-100">
          <div className={META_LABEL}><FolderKanban className="w-3 h-3" />Проєкти ({projects.length})</div>
          {projects.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {projects.map(p => <span key={p.projectId} className={cn(TAG_CLS, 'bg-indigo-50 text-indigo-600')}>{p.projectName}</span>)}
            </div>
          ) : (
            <span className="text-[10px] text-slate-300 italic">не призначено</span>
          )}
        </div>

        {/* ── Документи БЗ (all scopes) ── */}
        <div className="px-4 py-2.5 border-b border-slate-100">
          <div className={META_LABEL}><BookOpen className="w-3 h-3" />Документи БЗ ({kbDocs.length})</div>
          {kbDocs.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {kbDocs.map(d => <span key={d.kbDocumentId} className={cn(TAG_CLS, 'bg-emerald-50 text-emerald-600')}>{d.title}</span>)}
            </div>
          ) : (
            <span className="text-[10px] text-slate-300 italic">не призначено</span>
          )}
        </div>

        {/* ── Шаблони задач (month only — після документів) ── */}
        {isMonth && (
          <div className="px-4 py-2.5 border-b border-slate-100">
            <div className={META_LABEL}><ClipboardList className="w-3 h-3" />Шаблони задач ({pr.taskTemplates.length})</div>
            {pr.taskTemplates.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {pr.taskTemplates.map(t => (
                  <div key={t.id} className="px-2.5 py-1.5 rounded-lg bg-slate-50/80 border border-slate-100">
                    <div className="text-[11px] font-medium text-slate-700">{t.title}</div>
                    {t.content && <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{t.content}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-slate-300 italic">немає шаблонів</span>
            )}
          </div>
        )}

        {/* ── Квартали → місяці (year — внизу) ── */}
        {isYear && quarterBreakdown.length > 0 && quarterBreakdown.map(q => {
          const qPct = q.planned > 0 ? Math.round((q.spent / q.planned) * 100) : 0;
          const isExp = expandedQ.has(q.quarter);
          return (
            <div key={q.quarter} className="border-b border-slate-100">
              <button type="button" onClick={() => toggleQ(q.quarter)}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 transition-colors text-left">
                <ChevronRight className={cn('w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform', isExp && 'rotate-90')} />
                <span className="text-xs font-semibold text-slate-800">Q{q.quarter}</span>
                <div className="flex-1" />
                <span className="text-xs font-bold text-slate-700">{q.spent}/{q.planned}</span>
                <div className="w-10 h-[3px] rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                  <div className={cn('h-full rounded-full', barBg(qPct))} style={{ width: `${Math.min(qPct, 100)}%` }} />
                </div>
                <span className={cn('text-[10px] font-bold min-w-[28px] text-right', pctColor(qPct))}>{qPct}%</span>
              </button>
              {isExp && q.months.map(mb => {
                const mPct = mb.planned > 0 ? Math.round((mb.spent / mb.planned) * 100) : 0;
                return (
                  <div key={mb.month} className="flex items-center gap-2 px-4 py-1.5 pl-10 border-t border-slate-100/80">
                    <span className="text-[11px] font-medium text-slate-700 flex-1">{MONTH_NAMES_UK[mb.month - 1]}</span>
                    <span className="text-[11px] font-bold text-slate-700">{mb.spent}/{mb.planned}</span>
                    <span className={cn('text-[10px] font-bold min-w-[28px] text-right', pctColor(mPct))}>{mPct}%</span>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* ── Місяці (quarter — внизу) ── */}
        {isQuarter && monthBreakdown.map(mb => {
          const mPct = mb.planned > 0 ? Math.round((mb.spent / mb.planned) * 100) : 0;
          return (
            <div key={mb.month} className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-800 flex-1">{MONTH_NAMES_UK[mb.month - 1]}</span>
              <span className="text-xs font-bold text-slate-700">{mb.spent}/{mb.planned}</span>
              <div className="w-10 h-[3px] rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                <div className={cn('h-full rounded-full', barBg(mPct))} style={{ width: `${Math.min(mPct, 100)}%` }} />
              </div>
              <span className={cn('text-[10px] font-bold min-w-[28px] text-right', pctColor(mPct))}>{mPct}%</span>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <SummaryFooter planned={pr.plannedHours} spent={pr.spentHours} pct={pct} />
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────

function DetailHeader({
  title,
  pct,
  departmentName,
  onClose,
}: {
  title: string;
  pct?: number;
  departmentName?: string | null;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="detail-hdr flex items-center gap-2 px-3 py-2">
        <div className="w-1 h-5 rounded-sm bg-indigo-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-700 line-clamp-2">{title}</div>
        </div>
        {departmentName && (
          <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-600 flex-shrink-0">
            {departmentName}
          </span>
        )}
        {pct != null && (
          <span className={cn('text-[10px] font-bold flex-shrink-0', pctColor(pct))}>
            {pct}%
          </span>
        )}
        {onClose && (
          <button onClick={onClose} className="cal-action-btn flex-shrink-0" title="Закрити" aria-label="Закрити">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="hdr-sep" />
    </>
  );
}

const TAG_CLS = 'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium';
const META_LABEL = 'flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1';

function MetaSection({ companies, projects, kbDocs }: {
  companies: PlanCompanyInfo[]; projects: PlanProjectInfo[]; kbDocs: PlanDocInfo[];
}) {
  return (
    <div className="flex flex-wrap gap-3 px-4 py-2.5 border-b border-slate-100 text-[11px]">
      <div className="min-w-[120px]">
        <div className={META_LABEL}><Building2 className="w-3 h-3" />Компанії ({companies.length})</div>
        {companies.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {companies.map(c => <span key={c.companyId} className={cn(TAG_CLS, 'bg-slate-100 text-slate-600')}>{c.companyName}</span>)}
          </div>
        ) : (
          <span className="text-[10px] text-slate-300 italic">не призначено</span>
        )}
      </div>
      <div>
        <div className={META_LABEL}><FolderKanban className="w-3 h-3" />Проєкти ({projects.length})</div>
        {projects.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {projects.map(p => <span key={p.projectId} className={cn(TAG_CLS, 'bg-indigo-50 text-indigo-600')}>{p.projectName}</span>)}
          </div>
        ) : (
          <span className="text-[10px] text-slate-300 italic">не призначено</span>
        )}
      </div>
      <div>
        <div className={META_LABEL}><BookOpen className="w-3 h-3" />Документи БЗ ({kbDocs.length})</div>
        {kbDocs.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {kbDocs.map(d => <span key={d.kbDocumentId} className={cn(TAG_CLS, 'bg-emerald-50 text-emerald-600')}>{d.title}</span>)}
          </div>
        ) : (
          <span className="text-[10px] text-slate-300 italic">не призначено</span>
        )}
      </div>
    </div>
  );
}

function SummaryFooter({ planned, spent, pct }: { planned: number; spent: number; pct: number }) {
  return (
    <div className="flex-shrink-0 grid grid-cols-3 gap-1.5 p-2.5 bg-slate-50 border-t border-slate-200">
      <SummaryBox label="Заплановано" value={`${planned} год`} />
      <SummaryBox label="Виконано" value={`${spent} год`} colorClass="text-emerald-600" />
      <SummaryBox label="Прогрес" value={`${pct}%`} colorClass={pctColor(pct)} />
    </div>
  );
}

function SummaryBox({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass?: string;
}) {
  return (
    <div className="px-2 py-1.5 rounded-lg bg-white border border-slate-200/60 text-center">
      <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">{label}</div>
      <div className={cn('text-sm font-extrabold mt-0.5 leading-tight', colorClass || 'text-slate-800')}>
        {value}
      </div>
    </div>
  );
}
