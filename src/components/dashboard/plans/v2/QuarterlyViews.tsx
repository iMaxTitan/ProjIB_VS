'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/shared/utils';
import { Target, Lightbulb, FileCheck, FileText, Pencil, Check, X, Trash2, ShieldCheck, Plus, Copy, Banknote, CalendarDays, Ban, Ellipsis, Loader, CheckCheck } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import type { ProcessNode, QuarterlyPlanRow, QuarterlyInitiativeRow, AnnualPlanRow, AnnualBudgetRow } from '@/hooks/usePlansV2';

const INIT_STATUS_ICON: Record<string, { cls: string; label: string }> = {
  planned: { cls: 'bg-indigo-400', label: 'Заплановано' },
  in_progress: { cls: 'bg-indigo-600', label: 'В роботі' },
  completed: { cls: 'bg-emerald-400', label: 'Завершено' },
};

const STATUS_ICON_MAP: Record<string, { Icon: typeof Ban; cls: string; title: string }> = {
  none: { Icon: Ban, cls: 'text-slate-300', title: 'Немає плану' },
  pending: { Icon: Ellipsis, cls: 'text-amber-500', title: 'Не затверджено' },
  active: { Icon: Loader, cls: 'text-indigo-500', title: 'В роботі' },
  done: { Icon: CheckCheck, cls: 'text-emerald-500', title: 'Виконано' },
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  none: { label: 'Немає плану', cls: 'bg-slate-100 text-slate-500' },
  pending: { label: 'Не затверджено', cls: 'bg-amber-100 text-amber-700' },
  active: { label: 'В роботі', cls: 'bg-indigo-100 text-indigo-700' },
  done: { label: 'Виконано', cls: 'bg-emerald-100 text-emerald-700' },
  planned: { label: 'Заплановано', cls: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'В роботі', cls: 'bg-amber-100 text-amber-700' },
};

function statusBadge(status: string) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.pending;
  return <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', s.cls)}>{s.label}</span>;
}

async function fetchApi(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const INIT_STATUSES = ['planned', 'in_progress', 'completed'] as const;

// ── QuarterlyListView ── Quarter selected, no process

interface QuarterlyListViewProps {
  quarterlyPlans: QuarterlyPlanRow[];
  processTree: ProcessNode[];
  annualPlans?: AnnualPlanRow[];
  quarterlyBudgetSumMap?: Map<string, number>;
  quarterlyBudgetItemsMap?: Map<string, { name: string; amount: number }[]>;
  quarterlyInitiativesMap?: Map<string, QuarterlyInitiativeRow[]>;
  quarter: number;
  year: number;
  canEdit?: boolean;
  isChief?: boolean;
  onSelectProcess: (id: string) => void;
  onRefresh?: () => void;
}

export function QuarterlyListView({ quarterlyPlans, processTree, annualPlans = [], quarterlyBudgetSumMap, quarterlyBudgetItemsMap, quarterlyInitiativesMap, quarter, year, canEdit, isChief, onSelectProcess, onRefresh }: QuarterlyListViewProps) {
  const qPlans = quarterlyPlans.filter(q => q.quarter === quarter);
  const items = processTree.map(proc => {
    const plan = qPlans.find(q => q.process_id === proc.processId);
    const annualPlan = annualPlans.find(a => a.process_id === proc.processId);
    const budget = annualPlan ? (quarterlyBudgetSumMap?.get(annualPlan.annual_id) || 0) : 0;
    const initiatives = plan ? (quarterlyInitiativesMap?.get(plan.quarterly_id) || []) : [];
    return { proc, plan, annualPlan, budget, initiatives };
  });
  const totalBudget = items.reduce((s, i) => s + i.budget, 0);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="detail-hdr flex items-center gap-2 px-3 py-2">
        <div className="w-1 h-5 rounded-sm bg-blue-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-700">Плани кварталу · Q{quarter} {year}</div>
        </div>
      </div>
      <div className="hdr-sep" />

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
        {items.length === 0 ? (
          <EmptyState variant="centered" icon={<Target className="h-10 w-10" />} title="Немає процесів" description="Процеси не знайдено" />
        ) : (
          items.map(({ proc, plan, annualPlan, budget, initiatives }) => {
            const status = plan?.status || 'none';
            const st = STATUS_ICON_MAP[status] || STATUS_ICON_MAP.none;
            const badge = STATUS_BADGE[status] || STATUS_BADGE.none;
            return (
              <div key={proc.processId} onClick={() => onSelectProcess(proc.processId)}
                className={cn(
                  'border border-slate-200/80 rounded-xl px-3.5 py-2.5 hover:bg-slate-50/50 transition-colors cursor-pointer',
                  !plan && 'border-dashed',
                )}
                role="button" tabIndex={0} aria-label={`Обрати ${proc.name}`}
                onKeyDown={e => e.key === 'Enter' && onSelectProcess(proc.processId)}>
                <div className="flex gap-3">
                  {/* Left: content */}
                  <div className="flex-1 min-w-0 flex gap-2">
                    <span className="flex-shrink-0 mt-0.5" title={st.title}><st.Icon className={cn('w-3.5 h-3.5', st.cls)} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-800 line-clamp-2">{proc.name}</div>
                      {proc.mission && (
                        <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                          <span className="text-slate-400">Місія: </span>{proc.mission}
                        </div>
                      )}
                      {initiatives.length > 0 && (
                        <div className="flex flex-col gap-0.5 mt-1">
                          {initiatives.map(init => {
                            const initSt = INIT_STATUS_ICON[init.status] || INIT_STATUS_ICON.planned;
                            return (
                              <div key={init.id} className="flex items-center gap-1.5">
                                <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', initSt.cls)} title={initSt.label} />
                                <span className="text-[10px] text-slate-600 line-clamp-2">{init.title}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Right: badge + buttons + hours + budget */}
                  <div className="flex-shrink-0 w-[120px] flex flex-col items-end gap-1" onClick={e => e.stopPropagation()}>
                    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', badge.cls)}>
                      {badge.label}
                    </span>
                    {canEdit && (
                      <div className="flex items-center gap-0.5">
                        {!plan ? (
                          <>
                            <button className="cal-action-btn" style={{ color: '#10b981' }} title="Створити план" aria-label="Створити"
                              onClick={async (e) => { e.stopPropagation(); await fetchApi('/api/plans/quarterly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ process_id: proc.processId, year, quarter }) }); onRefresh?.(); }}>
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button className="cal-action-btn" style={{ color: '#6366f1' }} title="Копіювати з попереднього кварталу" aria-label="Копіювати"
                              onClick={async (e) => { e.stopPropagation(); const prevQ = quarter > 1 ? quarter - 1 : 4; const prevY = quarter > 1 ? year : year - 1; await fetchApi('/api/plans/quarterly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ process_id: proc.processId, year, quarter, copy_from_year: prevY, copy_from_quarter: prevQ }) }); onRefresh?.(); }}>
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            {plan.status !== 'done' && (
                              <button className="cal-action-btn" style={{ color: '#10b981' }}
                                title={plan.status === 'pending' ? 'Затвердити' : 'Прийняти'} aria-label="Затвердити"
                                onClick={async (e) => { e.stopPropagation(); const next = plan.status === 'pending' ? 'active' : 'done'; await fetchApi('/api/plans/quarterly', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: plan.quarterly_id, status: next }) }); onRefresh?.(); }}>
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isChief && (
                              <button className="cal-action-btn" style={{ color: '#ef4444' }}
                                title={plan.status === 'pending' ? 'Видалити план' : 'Повернути'} aria-label="Повернути"
                                onClick={async (e) => { e.stopPropagation(); if (plan.status === 'pending') { await fetchApi(`/api/plans/quarterly?id=${plan.quarterly_id}`, { method: 'DELETE' }); } else { const prev = plan.status === 'active' ? 'pending' : plan.status === 'done' ? 'active' : null; if (prev) await fetchApi('/api/plans/quarterly', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: plan.quarterly_id, status: prev }) }); } onRefresh?.(); }}>
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* Budget items — full width rows */}
                {annualPlan && (() => {
                  const items = quarterlyBudgetItemsMap?.get(annualPlan.annual_id);
                  return items && items.length > 0 ? (
                    <div className="flex flex-col gap-0.5 mt-1 pl-5.5">
                      {items.map((bi, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] text-amber-600 flex-1 line-clamp-1">{bi.name}</span>
                          <span className="text-[10px] font-bold text-amber-600 flex-shrink-0">{bi.amount.toLocaleString('uk-UA')} ₴</span>
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}
              </div>
            );
          })
        )}
      </div>

      <div className="flex-shrink-0 p-2.5 bg-slate-50 border-t border-slate-200">
        <div className="px-2 py-1.5 rounded-lg bg-white border border-slate-200/60 text-center">
          <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">Планів</div>
          <div className="text-sm font-extrabold text-slate-800 mt-0.5">{qPlans.length} / {processTree.length}</div>
        </div>
      </div>
    </div>
  );
}

// ── QuarterlyDetailView ── Quarter + process selected

interface QuarterlyDetailViewProps {
  process: ProcessNode;
  plan: QuarterlyPlanRow | null;
  initiatives: QuarterlyInitiativeRow[];
  annualPlan?: AnnualPlanRow | null;
  annualBudgetItems?: AnnualBudgetRow[];
  quarter: number;
  year: number;
  canEdit?: boolean;
  onRefresh?: () => void;
  onClose?: () => void;
}

export function QuarterlyDetailView({ process, plan, initiatives, quarter, year, canEdit, onRefresh, onClose, annualPlan, annualBudgetItems = [] }: QuarterlyDetailViewProps) {
  // Filter budget items by quarter date
  const qStart = new Date(year, (quarter - 1) * 3, 1);
  const qEnd = new Date(year, quarter * 3, 0); // last day of quarter
  const quarterBudgetItems = annualBudgetItems.filter(b => {
    if (!b.payment_date) return false;
    const d = new Date(b.payment_date);
    return d >= qStart && d <= qEnd;
  });
  const noDateBudgetItems = annualBudgetItems.filter(b => !b.payment_date);

  const [editing, setEditing] = useState(false);
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newInitTitle, setNewInitTitle] = useState('');
  const [addingInit, setAddingInit] = useState(false);

  const startEdit = () => {
    setEditNote(plan?.note || '');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      await fetchApi('/api/plans/quarterly', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plan.quarterly_id, note: editNote }),
      });
      setEditing(false);
      onRefresh?.();
    } finally { setSaving(false); }
  };

  const toggleApprove = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      await fetchApi('/api/plans/quarterly', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plan.quarterly_id, status: plan.status === 'active' ? 'pending' : 'active' }),
      });
      onRefresh?.();
    } finally { setSaving(false); }
  };

  const deletePlan = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      await fetchApi(`/api/plans/quarterly?id=${plan.quarterly_id}`, { method: 'DELETE' });
      setConfirmDelete(false);
      onRefresh?.();
    } finally { setSaving(false); }
  };

  const addInitiative = async () => {
    if (!plan || !newInitTitle.trim()) return;
    setSaving(true);
    try {
      await fetchApi('/api/plans/quarterly/initiatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarterly_plan_id: plan.quarterly_id, title: newInitTitle.trim() }),
      });
      setNewInitTitle('');
      setAddingInit(false);
      onRefresh?.();
    } finally { setSaving(false); }
  };

  const cycleInitStatus = async (init: QuarterlyInitiativeRow) => {
    const idx = INIT_STATUSES.indexOf(init.status as typeof INIT_STATUSES[number]);
    const next = INIT_STATUSES[(idx + 1) % INIT_STATUSES.length];
    await fetchApi('/api/plans/quarterly/initiatives', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: init.id, status: next }),
    });
    onRefresh?.();
  };

  const deleteInitiative = async (id: string) => {
    await fetchApi(`/api/plans/quarterly/initiatives?id=${id}`, { method: 'DELETE' });
    onRefresh?.();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="detail-hdr flex items-center gap-2 px-3 py-2">
        <div className="w-1 h-5 rounded-sm bg-blue-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-700 line-clamp-2">{process.name}</div>
        </div>
        {plan && canEdit && !editing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={startEdit} className="cal-action-btn" title="Редагувати" aria-label="Редагувати">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={toggleApprove} className="cal-action-btn accent" title={plan.status === 'active' ? 'Повернути' : 'Затвердити'} aria-label="Затвердити" disabled={saving}>
              <ShieldCheck className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setConfirmDelete(true)} className="cal-action-btn" title="Видалити" aria-label="Видалити" style={{ color: '#ef4444' }}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {plan && statusBadge(plan.status)}
        {onClose && (
          <button onClick={onClose} className="cal-action-btn flex-shrink-0" title="Закрити" aria-label="Закрити">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="hdr-sep" />

      {confirmDelete && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200">
          <span className="text-[11px] text-red-700 font-medium flex-1">Видалити квартальний план?</span>
          <button onClick={deletePlan} disabled={saving} className="text-[10px] font-bold text-white bg-red-500 px-3 py-1 rounded-lg hover:bg-red-600" aria-label="Підтвердити">Так</button>
          <button onClick={() => setConfirmDelete(false)} className="text-[10px] font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg hover:bg-slate-200" aria-label="Скасувати">Ні</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Description + Mission + Expected result */}
        {(process.description || process.mission || process.expectedResult) && (
          <div className="px-4 py-2.5 border-b border-slate-100">
            {process.description && (
              <div className="mb-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Опис процесу</span>
                </div>
                <div className="text-[11px] text-slate-600 leading-relaxed">{process.description}</div>
              </div>
            )}
            {process.mission && (
              <div className="mb-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Target className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Місія процесу</span>
                </div>
                <div className="text-[11px] text-slate-600 leading-relaxed">{process.mission}</div>
              </div>
            )}
            {process.expectedResult && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <FileCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Очікуваний результат</span>
                </div>
                <div className="text-[11px] text-slate-600 leading-relaxed">{process.expectedResult}</div>
              </div>
            )}
          </div>
        )}

        {/* Budget for this quarter */}
        {(quarterBudgetItems.length > 0 || noDateBudgetItems.length > 0) && (
          <div className="px-4 py-2.5 border-b border-slate-200 bg-amber-50/30">
            <div className="flex items-center gap-1.5 mb-1">
              <Banknote className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">
                Бюджет · Q{quarter} ({quarterBudgetItems.reduce((s, b) => s + Number(b.amount), 0).toLocaleString('uk-UA')} ₴)
              </span>
            </div>
            <div className="space-y-1">
              {quarterBudgetItems.map(b => (
                <div key={b.id} className="flex items-center gap-2 text-[10px]">
                  <span className="text-slate-600 flex-1 truncate">{b.budget_items?.name || '—'}</span>
                  <span className="font-bold text-amber-600">{Number(b.amount).toLocaleString('uk-UA')} ₴</span>
                  <span className="flex items-center gap-0.5 text-slate-400">
                    <CalendarDays className="w-2.5 h-2.5" />{b.payment_date}
                  </span>
                </div>
              ))}
              {noDateBudgetItems.length > 0 && (
                <>
                  <div className="text-[9px] text-slate-400 uppercase mt-1">Без дати</div>
                  {noDateBudgetItems.map(b => (
                    <div key={b.id} className="flex items-center gap-2 text-[10px] opacity-60">
                      <span className="text-slate-600 flex-1 truncate">{b.budget_items?.name || '—'}</span>
                      <span className="font-bold text-amber-600">{Number(b.amount).toLocaleString('uk-UA')} ₴</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* Quarterly note */}
        <div className="px-4 py-2.5 border-b border-slate-100">
          <div className="flex items-center gap-1.5 mb-1">
            <FileCheck className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Примітки · Q{quarter}</span>
          </div>
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea value={editNote} onChange={e => setEditNote(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-[11px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={2} aria-label="Примітки кварталу" placeholder="Примітки кварталу" />
              <div className="flex gap-1.5 justify-end">
                <button onClick={saveEdit} disabled={saving} className="cal-action-btn accent" title="Зберегти" aria-label="Зберегти"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setEditing(false)} className="cal-action-btn" title="Скасувати" aria-label="Скасувати"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-600 leading-relaxed">{plan?.note || 'Немає приміток'}</div>
          )}
        </div>

        {/* Initiatives */}
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Lightbulb className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">
              Ініціативи ({initiatives.length})
            </span>
            {canEdit && plan && (
              <button onClick={() => setAddingInit(true)} className="cal-action-btn ml-auto" title="Додати ініціативу" aria-label="Додати ініціативу">
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {addingInit && (
            <div className="flex gap-1.5 mb-2">
              <input value={newInitTitle} onChange={e => setNewInitTitle(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-[11px] focus:ring-2 focus:ring-indigo-500"
                placeholder="Назва ініціативи" aria-label="Назва ініціативи"
                onKeyDown={e => e.key === 'Enter' && addInitiative()} />
              <button onClick={addInitiative} disabled={saving || !newInitTitle.trim()} className="cal-action-btn accent" aria-label="Зберегти"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => { setAddingInit(false); setNewInitTitle(''); }} className="cal-action-btn" aria-label="Скасувати"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {initiatives.length === 0 && !addingInit ? (
            <div className="text-[11px] text-slate-400 italic py-2">Немає ініціатив</div>
          ) : (
            <div className="space-y-1.5">
              {initiatives.map(init => (
                <div key={init.id} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-100 group/init">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-slate-700">{init.title}</div>
                    {init.description && <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{init.description}</div>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {canEdit && (
                      <>
                        <button onClick={() => cycleInitStatus(init)} className="cal-action-btn" title="Змінити статус" aria-label="Змінити статус">
                          {statusBadge(init.status)}
                        </button>
                        <button onClick={() => deleteInitiative(init.id)}
                          className="cal-action-btn opacity-0 group-hover/init:opacity-100" title="Видалити" aria-label="Видалити ініціативу"
                          style={{ color: '#ef4444' }}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    {!canEdit && statusBadge(init.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!plan && (
          <div className="px-4 py-6 text-center">
            <div className="text-[11px] text-slate-400 italic">Квартальний план для цього процесу не створено</div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 grid grid-cols-3 gap-1.5 p-2.5 bg-slate-50 border-t border-slate-200">
        <div className="px-2 py-1.5 rounded-lg bg-white border border-slate-200/60 text-center">
          <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">Статус</div>
          <div className="text-sm font-extrabold text-slate-800 mt-0.5">{plan ? (plan.status === 'active' ? 'В роботі' : plan.status === 'done' ? 'Виконано' : 'Не затверджено') : '—'}</div>
        </div>
        <div className="px-2 py-1.5 rounded-lg bg-white border border-slate-200/60 text-center">
          <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">Бюджет</div>
          <div className="text-sm font-extrabold text-amber-600 mt-0.5">{quarterBudgetItems.length > 0 ? `${quarterBudgetItems.reduce((s, b) => s + Number(b.amount), 0).toLocaleString('uk-UA')} ₴` : '—'}</div>
        </div>
        <div className="px-2 py-1.5 rounded-lg bg-white border border-slate-200/60 text-center">
          <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">Ініціативи</div>
          <div className="text-sm font-extrabold text-indigo-600 mt-0.5">{initiatives.length}</div>
        </div>
      </div>
    </div>
  );
}
