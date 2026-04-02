'use client';

import React from 'react';
import { cn } from '@/lib/shared/utils';
import { MONTH_NAMES_UK } from '@/types/planning';
import type { MonthlyPlanAssignee } from '@/types/planning';
import { FileSearch, Building2, FolderKanban, BookOpen, BookMarked, Lightbulb, Settings2, Target, ClipboardList, ChevronRight, X, Plus, Check, Ellipsis, Copy, Trash2 } from 'lucide-react';
import { SummaryBox, pctColor, barBg } from '@/components/dashboard/shared';
import type { ProcessNode, ProcedureNode, QuarterlyInitiativeRow, ViewLevel } from '@/hooks/usePlansV2';
import type { PlanCompanyInfo, PlanProjectInfo, PlanDocInfo } from '@/hooks/usePlansV2Detail';
import { usePlanRelations } from '@/hooks/usePlanRelations';
import { usePlansV2Ctx } from './PlansV2Context';
import { scopeHeaderLabel, DetailHeader, InlineDropdown, SummaryFooter, TAG_CLS, META_LABEL } from './ProcedureDetailShared';

const PERIOD_LABELS: Record<string, string> = { month: 'місяць', quarter: 'квартал', year: 'рік' };

export interface ProcedureViewProps {
  proc: ProcessNode;
  pr: ProcedureNode;
  viewLevel: ViewLevel;
  year: number;
  month: number | null;
  scopeLabel: string;
  scopeMonths: number[];
  hoursMap: Map<string, { spent: number; tasks: number }>;
  companies: PlanCompanyInfo[];
  projects: PlanProjectInfo[];
  kbDocs: PlanDocInfo[];
  assignees: MonthlyPlanAssignee[];
  initiatives?: QuarterlyInitiativeRow[];
  onClose?: () => void;
}

export default function ProcedureView({
  proc,
  pr,
  viewLevel,
  year,
  month,
  scopeLabel,
  scopeMonths,
  hoursMap,
  companies,
  projects,
  kbDocs,
  assignees,
  initiatives,
  onClose,
}: ProcedureViewProps) {
  const { canEdit: canEditProp, isChief, onRefresh } = usePlansV2Ctx();
  const pct = pr.plannedHours > 0
    ? Math.round((pr.spentHours / pr.plannedHours) * 100)
    : 0;

  const isYear = viewLevel === 'year';
  const isQuarter = viewLevel === 'quarter';
  const isMonth = viewLevel === 'month';
  const showInitiatives = isQuarter || isMonth;

  // Editing: only month + pending
  const monthlyPlan = isMonth ? pr.plans[0] : null;
  const monthlyPlanId = monthlyPlan?.monthly_plan_id ?? null;
  const editing = isMonth && canEditProp && monthlyPlan?.status === 'pending';

  // Relations hook
  const { allCompanies, allDocuments, allProjects, addRelation: addRel, removeRelation: removeRel } = usePlanRelations(monthlyPlanId, !!editing);
  const addRelation = React.useCallback(async (type: string, id: string) => { await addRel(type, id); onRefresh?.(); }, [addRel, onRefresh]);
  const removeRelation = React.useCallback(async (type: string, id: string) => { await removeRel(type, id); onRefresh?.(); }, [removeRel, onRefresh]);

  const [showProjectDropdown, setShowProjectDropdown] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  // Plan actions
  const [saving, setSaving] = React.useState(false);

  const changePlanStatus = React.useCallback(async (newStatus: string) => {
    if (!monthlyPlanId) return;
    setSaving(true);
    try {
      await fetch('/api/plans/status', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: monthlyPlanId, table: 'monthly_plans', status: newStatus }),
      });
      onRefresh?.();
    } finally { setSaving(false); }
  }, [monthlyPlanId, onRefresh]);

  const createPlan = React.useCallback(async (copyFromMonth?: number) => {
    if (!isMonth || !month) return;
    setSaving(true);
    try {
      const res = await fetch('/api/plans/monthly', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ procedure_id: pr.procedureId, year, month, ...(copyFromMonth != null ? { copy_from_month: copyFromMonth } : {}) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onRefresh?.();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ProcedureView] createPlan error:', err);
    } finally { setSaving(false); }
  }, [isMonth, month, year, pr.procedureId, onRefresh]);

  const deletePlan = React.useCallback(async () => {
    if (!monthlyPlanId) return;
    setSaving(true);
    try {
      await fetch(`/api/plans/monthly?id=${monthlyPlanId}`, { method: 'DELETE', credentials: 'include' });
      onRefresh?.();
    } finally { setSaving(false); }
  }, [monthlyPlanId, onRefresh]);

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

  const [expandedQ, setExpandedQ] = React.useState<Set<number>>(new Set());
  const toggleQ = React.useCallback((q: number) => {
    setExpandedQ(prev => { const n = new Set(prev); if (n.has(q)) n.delete(q); else n.add(q); return n; });
  }, []);

  const visibleInitiatives = React.useMemo(() => {
    if (!initiatives) return [];
    if (isMonth) return initiatives.filter(i => i.status === 'in_progress' || i.status === 'completed');
    return initiatives;
  }, [initiatives, isMonth]);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <DetailHeader title={scopeHeaderLabel(viewLevel, scopeLabel)} onClose={onClose} />

      <div className="flex-shrink-0 px-4 py-2 border-b border-slate-100">
        <div className="text-sm font-semibold text-slate-800">{pr.name}</div>
      </div>

      {(pr.description || (pr.targetValue != null && pr.targetValue > 0)) && (
        <div className="flex-shrink-0 px-4 py-2.5 border-b border-slate-100">
          {pr.description && (
            <>
              <div className={META_LABEL}><FileSearch className="w-3 h-3" />Опис</div>
              <div className="text-[11px] text-slate-600 leading-relaxed">{pr.description}</div>
            </>
          )}
          {pr.targetValue != null && pr.targetValue > 0 && (
            <div className={pr.description ? 'mt-1.5' : ''}>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                <Target className="w-3 h-3" />{pr.targetValue} год/{PERIOD_LABELS[pr.targetPeriod || ''] || pr.targetPeriod}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Послуга */}
        <div className="px-4 py-2.5 border-b border-slate-100">
          <div className={META_LABEL}><BookMarked className="w-3 h-3" />Послуга</div>
          {pr.serviceName ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600">
              <Settings2 className="w-3 h-3" />{pr.serviceName}
            </span>
          ) : <span className="text-[10px] text-slate-300 italic">не визначено</span>}
        </div>

        {/* Компанії (month only) */}
        {isMonth && (
          <div className="px-4 py-2.5 border-b border-slate-100">
            <div className={META_LABEL}>
              <Building2 className="w-3 h-3" />Компанії ({companies.length})
              {(() => { const dt = pr.plans[0]?.distribution_type; if (!dt || dt === 'even') return null; const label = dt === 'by_servers' ? 'по серверам' : dt === 'by_workstations' ? 'по раб. станціям' : dt; return <span className="ml-auto text-[9px] font-medium text-slate-400 normal-case tracking-normal">· {label}</span>; })()}
            </div>
            {editing ? (() => {
              const selectedIds = new Set(companies.map(c => c.companyId));
              return (
                <div className="flex flex-wrap gap-1">
                  {allCompanies.map(c => {
                    const selected = selectedIds.has(c.id);
                    return (
                      <button key={c.id} type="button"
                        onClick={() => selected ? removeRelation('company', c.id) : addRelation('company', c.id)}
                        className={cn(TAG_CLS, 'cursor-pointer transition-colors', selected ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-300 line-through')}>
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              );
            })() : companies.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {companies.map(c => <span key={c.companyId} className={cn(TAG_CLS, 'bg-slate-100 text-slate-600')}>{c.companyName}</span>)}
              </div>
            ) : <span className="text-[10px] text-slate-300 italic">не призначено</span>}
          </div>
        )}

        {/* Ініціативи */}
        {showInitiatives && (
          <div className="px-4 py-2.5 border-b border-slate-100">
            <div className={META_LABEL}><Lightbulb className="w-3 h-3" />Ініціативи ({visibleInitiatives.length})</div>
            {visibleInitiatives.length > 0 ? (
              <div className="flex flex-col gap-1">
                {visibleInitiatives.map(init => {
                  const stMap: Record<string, { cls: string; label: string }> = { planned: { cls: 'bg-blue-400', label: 'Заплановано' }, in_progress: { cls: 'bg-amber-400', label: 'В роботі' }, completed: { cls: 'bg-emerald-400', label: 'Завершено' } };
                  const st = stMap[init.status] || stMap.planned;
                  return (
                    <div key={init.id} className="flex items-center gap-2">
                      <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', st.cls)} title={st.label} />
                      <span className="text-[11px] text-slate-700 line-clamp-2">{init.title}</span>
                    </div>
                  );
                })}
              </div>
            ) : <span className="text-[10px] text-slate-300 italic">немає ініціатив</span>}
          </div>
        )}

        {/* Проєкти */}
        <div className="px-4 py-2.5 border-b border-slate-100">
          <div className={META_LABEL}>
            <FolderKanban className="w-3 h-3" />Проєкти ({projects.length})
            {editing && <button onClick={() => setShowProjectDropdown(!showProjectDropdown)} className="cal-action-btn ml-auto" title="Додати" aria-label="Додати проєкт"><Plus className="w-3 h-3" /></button>}
          </div>
          {projects.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {projects.map(p => (
                <span key={p.projectId} className={cn(TAG_CLS, 'bg-indigo-50 text-indigo-600 inline-flex items-center gap-0.5')}>
                  {p.projectName}
                  {editing && <button onClick={() => removeRelation('project', p.projectId)} className="hover:text-red-500 transition-colors" title="Видалити" aria-label="Видалити"><X className="w-2.5 h-2.5" /></button>}
                </span>
              ))}
            </div>
          ) : <span className="text-[10px] text-slate-300 italic">не призначено</span>}
          {showProjectDropdown && (() => {
            const selectedIds = new Set(projects.map(p => p.projectId));
            const available = allProjects.filter(p => !selectedIds.has(p.id));
            return <InlineDropdown items={available} loading={false} onSelect={(id) => { addRelation('project', id); setShowProjectDropdown(false); }} onClose={() => setShowProjectDropdown(false)} />;
          })()}
        </div>

        {/* Документи БЗ */}
        <div className="px-4 py-2.5 border-b border-slate-100">
          <div className={META_LABEL}><BookOpen className="w-3 h-3" />Документи БЗ ({kbDocs.length})</div>
          {editing ? (() => {
            const selectedIds = new Set(kbDocs.map(d => d.kbDocumentId));
            return (
              <div className="flex flex-wrap gap-1">
                {allDocuments.map(d => {
                  const selected = selectedIds.has(d.id);
                  return (
                    <button key={d.id} type="button"
                      onClick={() => selected ? removeRelation('document', d.id) : addRelation('document', d.id)}
                      className={cn(TAG_CLS, 'cursor-pointer transition-colors', selected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300 line-through')}>
                      {d.label}
                    </button>
                  );
                })}
              </div>
            );
          })() : kbDocs.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {kbDocs.map(d => <span key={d.kbDocumentId} className={cn(TAG_CLS, 'bg-emerald-50 text-emerald-600')}>{d.title}</span>)}
            </div>
          ) : <span className="text-[10px] text-slate-300 italic">не призначено</span>}
        </div>

        {/* Шаблони задач (month only) */}
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
            ) : <span className="text-[10px] text-slate-300 italic">немає шаблонів</span>}
          </div>
        )}

        {/* Квартали → місяці (year) */}
        {isYear && quarterBreakdown.map(q => {
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

        {/* Місяці (quarter) */}
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

      {/* Action bar */}
      {isMonth && canEditProp && (() => {
        const status = monthlyPlan?.status;
        const prevMonth = month && month > 1 ? month - 1 : 0;
        const prevLabel = prevMonth ? MONTH_NAMES_UK[prevMonth - 1] : 'Грудень';
        const bgMap: Record<string, string> = { pending: 'rgba(251,191,36,0.08)', active: 'rgba(99,102,241,0.06)', done: 'rgba(16,185,129,0.06)' };
        const iconMap: Record<string, string> = { pending: 'text-amber-500', active: 'text-indigo-500', done: 'text-emerald-500' };
        const textMap: Record<string, string> = { pending: 'text-amber-700', active: 'text-indigo-700', done: 'text-emerald-700' };
        const labelMap: Record<string, string> = { pending: 'Очікує затвердження', active: 'В роботі', done: 'Виконано' };
        const btnPrimary = 'flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold transition-colors';
        const btnSecondary = 'flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 text-[10px] font-bold transition-colors';
        const btnCreate = 'flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-bold transition-colors';

        return (
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-t border-slate-200/60"
            style={{ background: status ? bgMap[status] || bgMap.pending : 'rgba(148,163,184,0.08)' }}>
            <Ellipsis className={cn('w-3.5 h-3.5 flex-shrink-0', status ? iconMap[status] || iconMap.pending : 'text-slate-400')} />
            <span className={cn('text-[11px] font-medium flex-1', status ? textMap[status] || textMap.pending : 'text-slate-500')}>
              {status ? labelMap[status] || status : 'Немає плану'}
            </span>

            {/* Немає плану → Створити / Копіювати */}
            {!status && (
              <>
                <button onClick={() => createPlan()} disabled={saving} className={btnCreate} aria-label="Створити">
                  <Plus className="w-3.5 h-3.5" /> Створити
                </button>
                <button onClick={() => createPlan(prevMonth)} disabled={saving} className={btnSecondary} aria-label="Копіювати">
                  <Copy className="w-3.5 h-3.5" /> З {prevLabel}
                </button>
              </>
            )}

            {/* Pending → Затвердити + Видалити (chief) */}
            {status === 'pending' && (
              <>
                <button onClick={() => changePlanStatus('active')} disabled={saving} className={btnPrimary} aria-label="Затвердити">
                  <Check className="w-3.5 h-3.5" /> Затвердити
                </button>
                {isChief && !confirmDelete && (
                  <button onClick={() => setConfirmDelete(true)} disabled={saving}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 text-[10px] font-bold transition-colors"
                    aria-label="Видалити">
                    <Trash2 className="w-3.5 h-3.5" /> Видалити
                  </button>
                )}
                {isChief && confirmDelete && (
                  <>
                    <button onClick={() => { setConfirmDelete(false); deletePlan(); }} disabled={saving}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold transition-colors"
                      aria-label="Підтвердити видалення">
                      <Trash2 className="w-3.5 h-3.5" /> Підтвердити
                    </button>
                    <button onClick={() => setConfirmDelete(false)}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 text-[10px] font-bold transition-colors"
                      aria-label="Скасувати">
                      Ні
                    </button>
                  </>
                )}
              </>
            )}

            {/* Active → Виконано + Повернути (chief) */}
            {status === 'active' && (
              <>
                <button onClick={() => changePlanStatus('done')} disabled={saving} className={btnPrimary} aria-label="Виконано">
                  <Check className="w-3.5 h-3.5" /> Виконано
                </button>
                {isChief && (
                  <button onClick={() => changePlanStatus('pending')} disabled={saving} className={btnSecondary} aria-label="Повернути">
                    <X className="w-3.5 h-3.5" /> Повернути
                  </button>
                )}
              </>
            )}

            {/* Done → Повернути (chief) */}
            {status === 'done' && isChief && (
              <button onClick={() => changePlanStatus('active')} disabled={saving} className={btnSecondary} aria-label="Повернути">
                <X className="w-3.5 h-3.5" /> Повернути
              </button>
            )}
          </div>
        );
      })()}

      <SummaryFooter planned={pr.plannedHours} spent={pr.spentHours} pct={pct} />
    </div>
  );
}
