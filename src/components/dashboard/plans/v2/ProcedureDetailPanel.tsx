'use client';

import React from 'react';
import { cn } from '@/lib/shared/utils';
import { MONTH_NAMES_UK } from '@/types/planning';
import type { MonthlyPlanAssignee } from '@/types/planning';
import EmptyState from '@/components/ui/EmptyState';
import { FileSearch, Building2, FolderKanban, BookOpen, ChevronRight, X, Target } from 'lucide-react';
import { SummaryBox, pctColor, barBg } from '@/components/dashboard/shared';
import { usePlansV2Ctx } from './PlansV2Context';
import type { ProcessNode, ProcedureNode, QuarterlyInitiativeRow, ViewLevel } from '@/hooks/usePlansV2';
import type { PlanCompanyInfo, PlanProjectInfo, PlanDocInfo } from '@/hooks/usePlansV2Detail';
import ProcedureView from './ProcedureView';
import { scopeHeaderLabel, DetailHeader, SummaryFooter, TAG_CLS, META_LABEL } from './ProcedureDetailShared';

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
  year: number;
  month: number | null;
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


function statusIcon(pct: number): { char: string; color: string } {
  if (pct >= 100) return { char: '\u2713', color: 'text-emerald-500' };
  if (pct > 0) return { char: '\u25CB', color: 'text-blue-500' };
  return { char: '\u00B7', color: 'text-slate-300' };
}

export default function ProcedureDetailPanel({
  selectedProcess,
  selectedProcedure,
  viewLevel,
  year,
  month,
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
  const { canEdit, isChief, onRefresh } = usePlansV2Ctx();
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
        year={year}
        month={month}
        scopeLabel={scopeLabel}
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
  return <ProcessView proc={selectedProcess} viewLevel={viewLevel} scopeLabel={scopeLabel} scopeMonths={scopeMonths} hoursMap={hoursMap} processGoals={processGoals} onClose={onClose} />;
}

// ── Process view ──────────────────────────────────────────

function ProcessView({
  proc,
  viewLevel,
  scopeLabel,
  scopeMonths,
  hoursMap,
  processGoals,
  onClose,
}: {
  proc: ProcessNode;
  viewLevel: ViewLevel;
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
        title={scopeHeaderLabel(viewLevel, scopeLabel)}
        departmentName={proc.departmentName}
        onClose={onClose}
      />

      {/* Process name */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-slate-100">
        <div className="text-sm font-semibold text-slate-800">{proc.name}</div>
      </div>

      {/* Process description */}
      {proc.description && (
        <div className="flex-shrink-0 px-4 py-2.5 border-b border-slate-100">
          <div className={META_LABEL}><FileSearch className="w-3 h-3" />Опис</div>
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


// ── MetaSection (used by ProcessView) ──

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
        ) : <span className="text-[10px] text-slate-300 italic">не призначено</span>}
      </div>
      <div>
        <div className={META_LABEL}><FolderKanban className="w-3 h-3" />Проєкти ({projects.length})</div>
        {projects.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {projects.map(p => <span key={p.projectId} className={cn(TAG_CLS, 'bg-indigo-50 text-indigo-600')}>{p.projectName}</span>)}
          </div>
        ) : <span className="text-[10px] text-slate-300 italic">не призначено</span>}
      </div>
      <div>
        <div className={META_LABEL}><BookOpen className="w-3 h-3" />Документи БЗ ({kbDocs.length})</div>
        {kbDocs.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {kbDocs.map(d => <span key={d.kbDocumentId} className={cn(TAG_CLS, 'bg-emerald-50 text-emerald-600')}>{d.title}</span>)}
          </div>
        ) : <span className="text-[10px] text-slate-300 italic">не призначено</span>}
      </div>
    </div>
  );
}

