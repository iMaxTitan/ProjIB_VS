'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/shared/utils';
import { Building2, Users, ChevronRight, Check, X, Plus, Copy, Lightbulb } from 'lucide-react';
import Image from 'next/image';
import { SummaryBox, STATUS_ICON_MAP, type PlanStatus } from '@/components/dashboard/shared';
import type { ProcessNode } from '@/hooks/usePlansV2';
import type { MonthlyPlan } from '@/types/planning';
import { MONTH_NAMES_UK } from '@/types/planning';

// ── Types ──

export interface CompanyProcHours {
  procedureId: string;
  hours: number;
}

export interface CompanyHoursRow {
  companyId: string;
  companyName: string;
  hours: number;
  procedures: CompanyProcHours[];
}

export interface UserProcHoursRow {
  userId: string;
  procedureId: string;
  hours: number;
}

// ── MonthlyCompaniesView (средняя панель) ──

interface MonthlyCompaniesViewProps {
  companyHours: CompanyHoursRow[];
  processTree: ProcessNode[];
  scopeLabel: string;
}

export function MonthlyCompaniesView({ companyHours, processTree, scopeLabel }: MonthlyCompaniesViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Procedure → service name map (послуга)
  const procServiceMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const proc of processTree) {
      for (const pr of proc.procedures) {
        m.set(pr.procedureId, pr.serviceName || pr.name);
      }
    }
    return m;
  }, [processTree]);

  const totalHours = companyHours.reduce((s, c) => s + c.hours, 0);
  const maxHours = companyHours.length > 0 ? companyHours[0].hours : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="detail-hdr flex items-center gap-2 px-3 py-2">
        <div className="w-1 h-5 rounded-sm bg-emerald-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-700">Компанії · {scopeLabel}</div>
        </div>
      </div>
      <div className="hdr-sep" />

      <div className="flex-1 overflow-y-auto">
        {companyHours.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-[11px] text-slate-400">
            Немає даних за цей місяць
          </div>
        ) : (
          companyHours.map(c => {
            const barPct = maxHours > 0 ? (c.hours / maxHours) * 100 : 0;
            const isExpanded = expanded.has(c.companyId);
            return (
              <div key={c.companyId} className="border-b border-slate-100 last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggle(c.companyId)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50/50 transition-colors text-left"
                >
                  <ChevronRight className={cn('w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform', isExpanded && 'rotate-90')} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-slate-800 truncate">{c.companyName}</div>
                    <div className="mt-1 h-[3px] rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-700 flex-shrink-0 min-w-[48px] text-right">
                    {c.hours} год
                  </span>
                </button>

                {isExpanded && c.procedures.map(pr => (
                  <div key={pr.procedureId} className="flex items-center gap-2 px-4 py-1.5 pl-10 border-t border-slate-100/80 hover:bg-slate-50/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-slate-600 truncate">{procServiceMap.get(pr.procedureId) || pr.procedureId.slice(0, 8)}</div>
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 min-w-[40px] text-right">{pr.hours} год</span>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>

      <div className="flex-shrink-0 grid grid-cols-2 gap-1.5 p-2.5 bg-slate-50 border-t border-slate-200">
        <SummaryBox label="Компаній" value={String(companyHours.length)} />
        <SummaryBox label="Факт годин" value={`${Math.round(totalHours * 10) / 10}`} colorClass="text-emerald-600" />
      </div>
    </div>
  );
}

// ── MonthlyUsersView (правая панель) ──

interface MonthlyUsersViewProps {
  userProcHours: UserProcHoursRow[];
  processTree: ProcessNode[];
  monthlyAssignees?: { user_id: string; monthly_plan_id: string }[];
  scopeLabel: string;
}

export function MonthlyUsersView({ userProcHours, processTree, monthlyAssignees = [], scopeLabel }: MonthlyUsersViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = useCallback((uid: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  // Build procedure → service name map (послуга)
  const procNameMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const proc of processTree) {
      for (const pr of proc.procedures) {
        m.set(pr.procedureId, pr.serviceName || pr.name);
      }
    }
    return m;
  }, [processTree]);

  // Group by user — include assignees (even without hours) + users with hours
  const users = React.useMemo(() => {
    const map = new Map<string, { userId: string; totalHours: number; procedures: { name: string; hours: number }[] }>();

    // Add assignees first (0 hours placeholder)
    for (const a of monthlyAssignees) {
      if (!map.has(a.user_id)) {
        map.set(a.user_id, { userId: a.user_id, totalHours: 0, procedures: [] });
      }
    }

    // Add actual hours
    for (const r of userProcHours) {
      let u = map.get(r.userId);
      if (!u) {
        u = { userId: r.userId, totalHours: 0, procedures: [] };
        map.set(r.userId, u);
      }
      u.totalHours += r.hours;
      const name = procNameMap.get(r.procedureId) || r.procedureId;
      const existing = u.procedures.find(p => p.name === name);
      if (existing) existing.hours += r.hours;
      else u.procedures.push({ name, hours: r.hours });
    }
    return Array.from(map.values())
      .map(u => ({
        ...u,
        totalHours: Math.round(u.totalHours * 10) / 10,
        procedures: u.procedures
          .sort((a, b) => b.hours - a.hours)
          .map(p => ({ ...p, hours: Math.round(p.hours * 10) / 10 })),
      }));
  }, [userProcHours, procNameMap, monthlyAssignees]);

  // Fetch user names
  const [userNames, setUserNames] = React.useState<Map<string, { name: string; photo?: string }>>(new Map());
  React.useEffect(() => {
    const ids = users.map(u => u.userId);
    if (ids.length === 0) return;
    import('@/lib/shared/db-client').then(({ supabase }) => {
      supabase
        .from('user_profiles')
        .select('user_id, full_name, photo_base64')
        .in('user_id', ids)
        .then(({ data }) => {
          const m = new Map<string, { name: string; photo?: string }>();
          for (const p of data || []) {
            m.set(p.user_id, { name: p.full_name || p.user_id, photo: p.photo_base64 || undefined });
          }
          setUserNames(m);
        });
    });
  }, [users]);

  // Sort users alphabetically by name
  const sortedUsers = React.useMemo(() =>
    [...users].sort((a, b) => {
      const na = userNames.get(a.userId)?.name ?? '';
      const nb = userNames.get(b.userId)?.name ?? '';
      return na.localeCompare(nb, 'uk');
    }),
  [users, userNames]);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="detail-hdr flex items-center gap-2 px-3 py-2">
        <div className="w-1 h-5 rounded-sm bg-purple-500 flex-shrink-0" />
        <span className="text-xs font-semibold text-slate-700 flex-1 min-w-0">Виконавці</span>
      </div>
      <div className="hdr-sep" />

      <div className="flex-1 overflow-y-auto">
        {users.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-[11px] text-slate-400">
            Немає даних
          </div>
        ) : (
          sortedUsers.map((u, idx) => {
            const info = userNames.get(u.userId);
            const name = info?.name || u.userId.slice(0, 8);
            const initials = name.split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
            const isExpanded = expanded.has(u.userId);

            return (
              <div key={u.userId} className="border-b border-slate-100 last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggle(u.userId)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer text-left"
                >
                  <ChevronRight className={cn('w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform', isExpanded && 'rotate-90')} />
                  {info?.photo ? (
                    <Image src={info.photo} alt={name} width={28} height={28} className="rounded-full flex-shrink-0 object-cover" unoptimized />
                  ) : (
                    <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0', AVATAR_COLORS[idx % AVATAR_COLORS.length])}>
                      {initials}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 truncate">{name}</div>
                  </div>
                  <span className="text-xs font-bold text-slate-700">{u.totalHours} год</span>
                </button>

                {isExpanded && u.procedures.map((pr, prIdx) => (
                  <div key={prIdx} className="flex items-center gap-2 px-4 py-1.5 pl-14 border-t border-slate-100/80 hover:bg-slate-50/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-slate-600 truncate">{pr.name}</div>
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 min-w-[40px] text-right">{pr.hours} год</span>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>

      <div className="flex-shrink-0 grid grid-cols-2 gap-1.5 p-2.5 bg-slate-50 border-t border-slate-200">
        <SummaryBox label="Виконавців" value={String(users.length)} />
        <SummaryBox label="Факт годин" value={`${Math.round(users.reduce((s, u) => s + u.totalHours, 0) * 10) / 10}`} colorClass="text-emerald-600" />
      </div>
    </div>
  );
}

// ── MonthlyPlansListView (middle panel — month, nothing selected) ──

async function fetchApi(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
  return res.json();
}


interface MonthlyPlansListViewProps {
  processTree: ProcessNode[];
  monthlyPlans: MonthlyPlan[];
  quarterlyPlans?: { quarterly_id: string; process_id: string | null }[];
  companyHours?: CompanyHoursRow[];
  hoursMap?: Map<string, { spent: number; tasks: number }>;
  year: number;
  month: number;
  canEdit?: boolean;
  isChief?: boolean;
  scopeLabel: string;
  onRefresh?: () => void;
  onSelectProcedure?: (processId: string, procedureId: string) => void;
}

const STATUS_BADGE: Record<PlanStatus, { label: string; cls: string }> = {
  none: { label: 'Немає плану', cls: 'bg-slate-100 text-slate-500' },
  pending: { label: 'Не затверджено', cls: 'bg-amber-100 text-amber-700' },
  active: { label: 'В роботі', cls: 'bg-indigo-100 text-indigo-700' },
  done: { label: 'Виконано', cls: 'bg-emerald-100 text-emerald-700' },
};

export function MonthlyPlansListView({ processTree, monthlyPlans, quarterlyPlans = [], companyHours, hoursMap, year, month, canEdit, isChief, scopeLabel, onRefresh, onSelectProcedure }: MonthlyPlansListViewProps) {
  // procedure → companies map
  const procCompanies = React.useMemo(() => {
    const m = new Map<string, { name: string; hours: number }[]>();
    if (!companyHours) return m;
    for (const c of companyHours) {
      for (const pr of c.procedures) {
        let list = m.get(pr.procedureId);
        if (!list) { list = []; m.set(pr.procedureId, list); }
        list.push({ name: c.companyName, hours: pr.hours });
      }
    }
    return m;
  }, [companyHours]);

  // Build flat list of plan cards
  type ListItem = { proc: ProcessNode; pr: typeof processTree[0]['procedures'][0]; plan: MonthlyPlan | null; status: PlanStatus; isInitiative?: boolean };
  const items = React.useMemo(() => {
    const planMap = new Map<string, MonthlyPlan>();
    for (const p of monthlyPlans.filter(p => p.month === month)) {
      if (p.procedure_id) planMap.set(p.procedure_id, p);
    }
    const result: ListItem[] = [];
    // Procedure-based: from processTree (includes "none" cards for procedures without plans)
    for (const proc of processTree) {
      for (const pr of proc.procedures) {
        const plan = planMap.get(pr.procedureId) || null;
        const status: PlanStatus = !plan ? 'none' : (plan.status as PlanStatus) || 'pending';
        result.push({ proc, pr, plan, status });
      }
    }

    // Initiative-based: from monthlyPlans directly (plan_name, process_id come from view)
    const processMap = new Map(processTree.map(p => [p.processId, p]));
    for (const p of monthlyPlans.filter(mp => mp.month === month && mp.initiative_id && !mp.procedure_id)) {
      const proc = p.process_id ? processMap.get(p.process_id) : undefined;
      if (!proc) continue;
      const initHrs = hoursMap?.get(p.monthly_plan_id);
      const initPr = {
        procedureId: p.initiative_id!,
        name: p.plan_name || 'Ініціатива',
        description: p.plan_description,
        processId: proc.processId,
        taskTemplates: [],
        plannedHours: p.planned_hours || 0,
        spentHours: initHrs?.spent ?? 0,
        plans: [p],
      };
      result.push({ proc, pr: initPr, plan: p, status: (p.status as PlanStatus) || 'pending', isInitiative: true });
    }

    // Plans first (by status: pending → active → done), then none
    const order: Record<PlanStatus, number> = { pending: 0, active: 1, done: 2, none: 3 };
    result.sort((a, b) => order[a.status] - order[b.status]);
    return result;
  }, [processTree, monthlyPlans, month]);

  const totalPlans = items.filter(i => i.plan).length;
  const totalHours = items.reduce((s, i) => s + (i.plan ? i.pr.plannedHours : 0), 0);
  const totalSpent = items.reduce((s, i) => s + i.pr.spentHours, 0);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="detail-hdr flex items-center gap-2 px-3 py-2">
        <div className="w-1 h-5 rounded-sm bg-indigo-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-700">Плани місяця · {scopeLabel}</div>
        </div>
      </div>
      <div className="hdr-sep" />

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-[11px] text-slate-400">
            Немає процедур
          </div>
        ) : items.map(({ proc, pr, plan, status, isInitiative }) => {
          const st = STATUS_ICON_MAP[status];
          const badge = STATUS_BADGE[status];
          const pct = pr.plannedHours > 0 ? Math.round((pr.spentHours / pr.plannedHours) * 100) : 0;

          return (
            <div
              key={pr.procedureId}
              onClick={() => {
                if (!plan) return;
                // For procedures use procedureId (found in tree), for initiatives use monthly_plan_id
                const selId = isInitiative ? plan.monthly_plan_id : pr.procedureId;
                onSelectProcedure?.(proc.processId, selId);
              }}
              role={plan ? 'button' : undefined} tabIndex={plan ? 0 : undefined} aria-label={`Обрати ${pr.name}`}
              onKeyDown={e => {
                if (e.key !== 'Enter' || !plan) return;
                const selId = isInitiative ? plan.monthly_plan_id : pr.procedureId;
                onSelectProcedure?.(proc.processId, selId);
              }}
              className={cn(
                'border border-slate-200/80 rounded-xl px-3.5 py-2.5 transition-colors',
                status === 'none' ? 'border-dashed' : 'hover:bg-slate-50/50 cursor-pointer',
              )}
            >
              <div className="flex gap-3">
                {/* Left: content */}
                <div className="flex-1 min-w-0 flex gap-2">
                  <span className="flex-shrink-0 mt-0.5" title={isInitiative ? 'Ініціатива' : st.title}>
                    {isInitiative ? <Lightbulb className="w-3.5 h-3.5 text-indigo-500" /> : <st.Icon className={cn('w-3.5 h-3.5', st.cls)} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 line-clamp-2">{pr.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{proc.name}{isInitiative ? ' · ініціатива' : ''}</div>
                    {(pr.description || plan?.description) && (
                      <div className="mt-1 space-y-0.5">
                        {pr.description && <div className="text-[11px] text-slate-600 line-clamp-2">{pr.description}</div>}
                        {plan?.description && plan.description !== pr.description && (
                          <div className="text-[10px] text-slate-400 line-clamp-2 italic">{plan.description}</div>
                        )}
                      </div>
                    )}
                    {(() => {
                      const companies = procCompanies.get(pr.procedureId);
                      return companies && companies.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {companies.map(c => (
                            <span key={c.name} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100/60">
                              {c.name} · {c.hours} год
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>
                {/* Right: badge + buttons + hours */}
                <div className="flex-shrink-0 w-[120px] flex flex-col items-end gap-1" onClick={e => e.stopPropagation()}>
                  <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', badge.cls)}>
                    {badge.label}
                  </span>
                  {canEdit && (
                    <div className="flex items-center gap-0.5">
                      {!plan && !isInitiative ? (
                        <>
                          <button className="cal-action-btn" style={{ color: '#10b981' }} title="Створити план" aria-label="Створити"
                            onClick={async () => { await fetchApi('/api/plans/monthly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ procedure_id: pr.procedureId, year, month }) }); onRefresh?.(); }}>
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button className="cal-action-btn" style={{ color: '#6366f1' }} title={`Копіювати з ${MONTH_NAMES_UK[month - 2] || MONTH_NAMES_UK[11]}`} aria-label="Копіювати"
                            onClick={async () => { const prevM = month > 1 ? month - 1 : 0; await fetchApi('/api/plans/monthly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ procedure_id: pr.procedureId, year, month, copy_from_month: prevM }) }); onRefresh?.(); }}>
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : plan && status !== 'done' ? (
                        <>
                          <button className="cal-action-btn" style={{ color: '#10b981' }}
                            title={status === 'pending' ? 'Затвердити' : 'Прийняти'} aria-label="Затвердити"
                            onClick={async () => { const next = status === 'pending' ? 'active' : 'done'; await fetchApi('/api/plans/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: plan.monthly_plan_id, table: 'monthly_plans', status: next }) }); onRefresh?.(); }}>
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          {isChief && (
                            <button className="cal-action-btn" style={{ color: '#ef4444' }}
                              title={status === 'pending' ? 'Видалити план' : 'Повернути'} aria-label={status === 'pending' ? 'Видалити' : 'Повернути'}
                              onClick={async () => {
                                try {
                                  await fetchApi(`/api/plans/monthly?id=${plan.monthly_plan_id}`, { method: 'DELETE' });
                                } catch (e: unknown) {
                                  const err = e as { message?: string };
                                  if (err.message?.includes('Підтвердіть видалення')) {
                                    if (confirm(`${err.message}\nЗадачі будуть видалені. Продовжити?`)) {
                                      await fetchApi(`/api/plans/monthly?id=${plan.monthly_plan_id}&force=true`, { method: 'DELETE' });
                                    } else return;
                                  } else throw e;
                                }
                                onRefresh?.();
                              }}>
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      ) : plan && isChief ? (
                        <button className="cal-action-btn" style={{ color: '#ef4444' }} title="Повернути" aria-label="Повернути"
                          onClick={async () => { await fetchApi('/api/plans/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: plan.monthly_plan_id, table: 'monthly_plans', status: 'active' }) }); onRefresh?.(); }}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex-shrink-0 grid grid-cols-3 gap-1.5 p-2.5 bg-slate-50 border-t border-slate-200">
        <SummaryBox label="Планів" value={`${totalPlans} / ${items.length}`} />
        <SummaryBox label="План" value={`${totalHours} год`} />
        <SummaryBox label="Факт" value={`${totalSpent} год`} colorClass="text-emerald-600" />
      </div>
    </div>
  );
}

// ── Shared ──

const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-purple-500', 'bg-cyan-500',
  'bg-emerald-500', 'bg-amber-500', 'bg-blue-500',
  'bg-rose-500', 'bg-teal-500',
];
