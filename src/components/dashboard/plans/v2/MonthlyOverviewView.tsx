'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/shared/utils';
import { Building2, Users, ChevronRight, Check, X, Plus, Copy, Ban, Hourglass, Zap, CheckCheck } from 'lucide-react';
import Image from 'next/image';
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
        <FooterMetric label="Компаній" value={String(companyHours.length)} />
        <FooterMetric label="Факт годин" value={`${Math.round(totalHours * 10) / 10}`} colorClass="text-emerald-600" />
      </div>
    </div>
  );
}

// ── MonthlyUsersView (правая панель) ──

interface MonthlyUsersViewProps {
  userProcHours: UserProcHoursRow[];
  processTree: ProcessNode[];
  scopeLabel: string;
}

export function MonthlyUsersView({ userProcHours, processTree, scopeLabel }: MonthlyUsersViewProps) {
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

  // Group by user
  const users = React.useMemo(() => {
    const map = new Map<string, { userId: string; totalHours: number; procedures: { name: string; hours: number }[] }>();
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
      .sort((a, b) => b.totalHours - a.totalHours)
      .map(u => ({
        ...u,
        totalHours: Math.round(u.totalHours * 10) / 10,
        procedures: u.procedures
          .sort((a, b) => b.hours - a.hours)
          .map(p => ({ ...p, hours: Math.round(p.hours * 10) / 10 })),
      }));
  }, [userProcHours, procNameMap]);

  // Fetch user names
  const [userNames, setUserNames] = React.useState<Map<string, { name: string; photo?: string }>>(new Map());
  React.useEffect(() => {
    const ids = users.map(u => u.userId);
    if (ids.length === 0) return;
    import('@/lib/shared/supabase').then(({ supabase }) => {
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
          users.map((u, idx) => {
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
        <FooterMetric label="Виконавців" value={String(users.length)} />
        <FooterMetric label="Факт годин" value={`${Math.round(users.reduce((s, u) => s + u.totalHours, 0) * 10) / 10}`} colorClass="text-emerald-600" />
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

const STATUS_ICON_MAP = {
  none: { Icon: Ban, cls: 'text-slate-300', title: 'Немає плану' },
  pending: { Icon: Hourglass, cls: 'text-amber-500', title: 'Не затверджено' },
  active: { Icon: Zap, cls: 'text-indigo-500', title: 'В роботі' },
  done: { Icon: CheckCheck, cls: 'text-emerald-500', title: 'Виконано' },
} as const;

type PlanStatus = 'none' | 'pending' | 'active' | 'done';

interface MonthlyPlansListViewProps {
  processTree: ProcessNode[];
  monthlyPlans: MonthlyPlan[];
  year: number;
  month: number;
  canEdit?: boolean;
  isChief?: boolean;
  scopeLabel: string;
  onRefresh?: () => void;
}

export function MonthlyPlansListView({ processTree, monthlyPlans, year, month, canEdit, isChief, scopeLabel, onRefresh }: MonthlyPlansListViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = useCallback((id: string) => {
    setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  // Map: procedure_id → monthly plan
  const planMap = React.useMemo(() => {
    const m = new Map<string, MonthlyPlan>();
    for (const p of monthlyPlans.filter(p => p.month === month)) {
      if (p.procedure_id) m.set(p.procedure_id, p);
    }
    return m;
  }, [monthlyPlans, month]);

  const totalPlans = processTree.reduce((s, proc) => s + proc.procedures.filter(pr => planMap.has(pr.procedureId)).length, 0);
  const totalProcs = processTree.reduce((s, proc) => s + proc.procedures.length, 0);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="detail-hdr flex items-center gap-2 px-3 py-2">
        <div className="w-1 h-5 rounded-sm bg-indigo-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-700">Плани місяця · {scopeLabel}</div>
        </div>
      </div>
      <div className="hdr-sep" />

      <div className="flex-1 overflow-y-auto">
        {processTree.map(proc => {
          const isExp = expanded.has(proc.processId);
          const procPlansCount = proc.procedures.filter(pr => planMap.has(pr.procedureId)).length;

          return (
            <div key={proc.processId} className="border-b border-slate-100 last:border-b-0">
              <button type="button" onClick={() => toggle(proc.processId)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50/80 hover:bg-slate-100/80 transition-colors text-left">
                <ChevronRight className={cn('w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform', isExp && 'rotate-90')} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-slate-800 line-clamp-2">{proc.name}</div>
                </div>
                <span className="text-[10px] text-slate-400 flex-shrink-0">{procPlansCount}/{proc.procedures.length}</span>
              </button>

              {isExp && proc.procedures.map(pr => {
                const plan = planMap.get(pr.procedureId);
                const status: PlanStatus = !plan ? 'none' : (plan.status as PlanStatus) || 'pending';
                const st = STATUS_ICON_MAP[status];

                return (
                  <div key={pr.procedureId} className="flex items-center gap-2 px-3 py-1.5 pl-8 border-t border-slate-100/80 hover:bg-slate-50/50 transition-colors">
                    <span className="flex-shrink-0" title={st.title}><st.Icon className={cn('w-3.5 h-3.5', st.cls)} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-slate-700 truncate">{pr.name}</div>
                    </div>
                    {plan && (
                      <span className="text-[10px] font-bold text-slate-500 flex-shrink-0">{pr.plannedHours} год</span>
                    )}
                    {canEdit && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {!plan ? (
                          <>
                            <button className="cal-action-btn" style={{ color: '#10b981' }} title="Створити план" aria-label="Створити"
                              onClick={async () => {
                                await fetchApi('/api/plans/monthly', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ procedure_id: pr.procedureId, year, month }) });
                                onRefresh?.();
                              }}>
                              <Plus className="w-3 h-3" />
                            </button>
                            <button className="cal-action-btn" style={{ color: '#6366f1' }} title={`Копіювати з ${MONTH_NAMES_UK[month - 2] || MONTH_NAMES_UK[11]}`} aria-label="Копіювати"
                              onClick={async () => {
                                const prevM = month > 1 ? month - 1 : 0;
                                await fetchApi('/api/plans/monthly', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ procedure_id: pr.procedureId, year, month, copy_from_month: prevM }) });
                                onRefresh?.();
                              }}>
                              <Copy className="w-3 h-3" />
                            </button>
                          </>
                        ) : status !== 'done' ? (
                          <button className="cal-action-btn" style={{ color: '#10b981' }}
                            title={status === 'pending' ? 'Затвердити' : 'Прийняти'} aria-label="Затвердити"
                            onClick={async () => {
                              const next = status === 'pending' ? 'active' : 'done';
                              await fetchApi('/api/plans/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: plan.monthly_plan_id, table: 'monthly_plans', status: next }) });
                              onRefresh?.();
                            }}>
                            <Check className="w-3 h-3" />
                          </button>
                        ) : null}
                        {isChief && plan && (
                          <button className="cal-action-btn" style={{ color: '#ef4444' }}
                            title={status === 'pending' ? 'Видалити' : 'Повернути'}  aria-label="Повернути"
                            onClick={async () => {
                              if (status === 'pending') {
                                await fetchApi(`/api/plans/monthly?id=${plan.monthly_plan_id}`, { method: 'DELETE' });
                              } else {
                                const prev = status === 'active' ? 'pending' : status === 'done' ? 'active' : null;
                                if (prev) await fetchApi('/api/plans/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: plan.monthly_plan_id, table: 'monthly_plans', status: prev }) });
                              }
                              onRefresh?.();
                            }}>
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex-shrink-0 grid grid-cols-2 gap-1.5 p-2.5 bg-slate-50 border-t border-slate-200">
        <FooterMetric label="Планів" value={`${totalPlans} / ${totalProcs}`} />
        <FooterMetric label="Місяць" value={scopeLabel} />
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

function FooterMetric({ label, value, colorClass }: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="px-2 py-1.5 rounded-lg bg-white border border-slate-200/60 text-center">
      <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">{label}</div>
      <div className={cn('text-sm font-extrabold mt-0.5 leading-tight', colorClass || 'text-slate-800')}>{value}</div>
    </div>
  );
}
