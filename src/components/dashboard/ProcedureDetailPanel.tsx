'use client';

import React from 'react';
import { cn } from '@/lib/shared/utils';
import { MONTH_NAMES_UK } from '@/types/planning';
import type { MonthlyPlanAssignee } from '@/types/planning';
import EmptyState from '@/components/ui/EmptyState';
import { FileSearch, Building2, FolderKanban, BookOpen, BookMarked, CalendarDays, Settings2, Target, ClipboardList } from 'lucide-react';
import type { ProcessNode, ProcedureNode } from '@/hooks/usePlansV2';
import type { PlanCompanyInfo, PlanProjectInfo, PlanDocInfo } from '@/hooks/usePlansV2Detail';

interface ProcedureDetailPanelProps {
  selectedProcess: ProcessNode | null;
  selectedProcedure: ProcedureNode | null;
  scopeLabel: string;
  scopeMonths: number[];
  companies: PlanCompanyInfo[];
  projects: PlanProjectInfo[];
  kbDocs: PlanDocInfo[];
  assignees: MonthlyPlanAssignee[];
  rawAssignees: MonthlyPlanAssignee[];
  hoursMap: Map<string, { spent: number; tasks: number }>;
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
  scopeLabel,
  scopeMonths,
  companies,
  projects,
  kbDocs,
  assignees,
  rawAssignees,
  hoursMap,
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
        scopeLabel={scopeLabel}
        scopeMonths={scopeMonths}
        companies={companies}
        projects={projects}
        kbDocs={kbDocs}
        rawAssignees={rawAssignees}
        hoursMap={hoursMap}
      />
    );
  }

  // Process selected → show procedures → months breakdown
  return <ProcessView proc={selectedProcess} scopeLabel={scopeLabel} scopeMonths={scopeMonths} hoursMap={hoursMap} />;
}

// ── Process view ──────────────────────────────────────────

function ProcessView({
  proc,
  scopeLabel,
  scopeMonths,
  hoursMap,
}: {
  proc: ProcessNode;
  scopeLabel: string;
  scopeMonths: number[];
  hoursMap: Map<string, { spent: number; tasks: number }>;
}) {
  const pct = proc.totalPlanned > 0
    ? Math.round((proc.totalSpent / proc.totalPlanned) * 100)
    : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <DetailHeader
        crumb={scopeLabel}
        title={proc.name}
        subtitle={`${proc.procedures.length} процедур`}
        planned={proc.totalPlanned}
        spent={proc.totalSpent}
        pct={pct}
      />

      {/* Procedures → months */}
      <div className="flex-1 overflow-y-auto">
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
  proc,
  pr,
  scopeLabel,
  scopeMonths,
  companies,
  projects,
  kbDocs,
  rawAssignees,
  hoursMap,
}: {
  proc: ProcessNode;
  pr: ProcedureNode;
  scopeLabel: string;
  scopeMonths: number[];
  companies: PlanCompanyInfo[];
  projects: PlanProjectInfo[];
  kbDocs: PlanDocInfo[];
  rawAssignees: MonthlyPlanAssignee[];
  hoursMap: Map<string, { spent: number; tasks: number }>;
}) {
  const pct = pr.plannedHours > 0
    ? Math.round((pr.spentHours / pr.plannedHours) * 100)
    : 0;

  // Month breakdown — use actual spent from hoursMap
  const monthBreakdown = scopeMonths
    .map(m => {
      const plan = pr.plans.find(p => p.month === m);
      if (!plan) return null;
      const planned = plan.planned_hours || 0;
      const spent = hoursMap.get(plan.monthly_plan_id)?.spent ?? 0;
      return { month: m, planned, spent, planId: plan.monthly_plan_id };
    })
    .filter(Boolean) as { month: number; planned: number; spent: number; planId: string }[];

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <DetailHeader
        crumb={`${proc.name} \u00B7 ${scopeLabel}`}
        title={pr.name}
        subtitle={pr.description || ''}
        planned={pr.plannedHours}
        spent={pr.spentHours}
        pct={pct}
      />

      <div className="flex-1 overflow-y-auto">
        {/* ── СЕКЦІЯ 1: ДОВІДНИК ПРОЦЕДУРИ ── */}
        <div className="border-b-2 border-slate-200">
          <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-1">
            <BookMarked className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide">
              Довідник процедури
            </span>
          </div>

          <div className="px-4 pb-3 flex flex-col gap-2">
            {/* Опис */}
            {pr.description && (
              <div className="text-[12px] text-slate-600 leading-relaxed px-3 py-2 bg-slate-50 rounded-lg border-l-3 border-indigo-400">
                {pr.description}
              </div>
            )}

            {/* Сервіс + Категорія + Ціль */}
            <div className="flex flex-wrap gap-1.5">
              {pr.serviceName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600">
                  <Settings2 className="w-3 h-3" />{pr.serviceName}
                </span>
              )}
              {pr.category && (
                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium', CATEGORY_COLORS[pr.category] || 'bg-slate-100 text-slate-600')}>
                  {CATEGORY_LABELS[pr.category] || pr.category}
                </span>
              )}
              {pr.targetValue != null && pr.targetValue > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                  <Target className="w-3 h-3" />{pr.targetValue} год/{PERIOD_LABELS[pr.targetPeriod || ''] || pr.targetPeriod}
                </span>
              )}
            </div>

            {/* Шаблони задач */}
            {pr.taskTemplates.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                  <ClipboardList className="w-3 h-3" />Шаблони задач ({pr.taskTemplates.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {pr.taskTemplates.map(t => (
                    <span key={t.id} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                      {t.title}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── СЕКЦІЯ 2: ДАНІ ПЛАНУ ── */}
        <div>
          <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-1">
            <CalendarDays className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wide">
              Дані плану &middot; {scopeLabel}
            </span>
          </div>

          {/* Компанії, проєкти, документи БЗ */}
          <MetaSection companies={companies} projects={projects} kbDocs={kbDocs} />

          {/* Місяці → виконавці */}
          {monthBreakdown.map(mb => {
            const mPct = mb.planned > 0 ? Math.round((mb.spent / mb.planned) * 100) : 0;
            const mi = statusIcon(mPct);

            return (
              <div key={mb.month} className="border-b border-slate-100 last:border-b-0">
                <div className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-50/80">
                  <span className={cn('text-sm flex-shrink-0', mi.color)}>{mi.char}</span>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-slate-800">
                      {MONTH_NAMES_UK[mb.month - 1]}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-700">
                    {mb.spent}/{mb.planned}
                  </span>
                  <div className="w-12 h-[3px] rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                    <div
                      className={cn('h-full rounded-full', barBg(mPct))}
                      style={{ width: `${Math.min(mPct, 100)}%` }}
                    />
                  </div>
                  <span className={cn('text-[10px] font-bold', pctColor(mPct))}>{mPct}%</span>
                </div>

                {/* Assignees filtered by month plan */}
                {(() => {
                  const monthAssignees = rawAssignees.filter(a => a.monthly_plan_id === mb.planId);
                  return monthAssignees.length > 0 ? (
                    monthAssignees.map(a => (
                      <div
                        key={a.user_id}
                        className="flex items-center gap-2 px-4 py-1.5 pl-9 border-t border-slate-100/80 hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[9px] font-bold text-indigo-600 flex-shrink-0">
                          {(a.full_name || '??').split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0 text-[11px] font-medium text-slate-700 truncate">
                          {a.full_name || a.email || 'Невідомий'}
                        </div>
                        {a.role && (
                          <span className="text-[9px] font-semibold text-slate-400 uppercase">
                            {a.role}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-1.5 pl-9 text-[10px] text-slate-400 italic border-t border-slate-100/80">
                      Немає призначених виконавців
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <SummaryFooter planned={pr.plannedHours} spent={pr.spentHours} pct={pct} />
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────

function DetailHeader({
  title,
  subtitle,
  planned,
  spent,
  pct,
}: {
  crumb: string;
  title: string;
  subtitle: string;
  planned: number;
  spent: number;
  pct: number;
}) {
  return (
    <>
      <div className="detail-hdr flex items-center gap-2 px-3 py-2">
        <div className="w-1 h-5 rounded-sm bg-indigo-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-700 truncate">{title}</div>
          {subtitle && <div className="text-[10px] text-slate-400 truncate">{subtitle}</div>}
        </div>
        <span className={cn('text-[10px] font-bold flex-shrink-0', pctColor(pct))}>
          {spent}/{planned} · {pct}%
        </span>
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
  if (companies.length === 0 && projects.length === 0 && kbDocs.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3 px-4 py-2.5 border-b border-slate-100 text-[11px]">
      {companies.length > 0 && (
        <div className="min-w-[120px]">
          <div className={META_LABEL}><Building2 className="w-3 h-3" />Компанії ({companies.length})</div>
          <div className="flex flex-wrap gap-1">
            {companies.map(c => <span key={c.companyId} className={cn(TAG_CLS, 'bg-slate-100 text-slate-600')}>{c.companyName}</span>)}
          </div>
        </div>
      )}
      {projects.length > 0 && (
        <div>
          <div className={META_LABEL}><FolderKanban className="w-3 h-3" />Проєкти ({projects.length})</div>
          <div className="flex flex-wrap gap-1">
            {projects.map(p => <span key={p.projectId} className={cn(TAG_CLS, 'bg-indigo-50 text-indigo-600')}>{p.projectName}</span>)}
          </div>
        </div>
      )}
      {kbDocs.length > 0 && (
        <div>
          <div className={META_LABEL}><BookOpen className="w-3 h-3" />Документи БЗ ({kbDocs.length})</div>
          <div className="flex flex-wrap gap-1">
            {kbDocs.map(d => <span key={d.kbDocumentId} className={cn(TAG_CLS, 'bg-emerald-50 text-emerald-600')}>{d.title}</span>)}
          </div>
        </div>
      )}
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
