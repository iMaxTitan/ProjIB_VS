'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/shared/utils';
import { Target, Banknote, CalendarDays, FileCheck, FileText, Pencil, Check, X, Trash2, ShieldCheck, Plus, Copy } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import type { ProcessNode, AnnualPlanRow, AnnualBudgetRow } from '@/hooks/usePlansV2';

export interface BudgetItemOption {
  id: string;
  name: string;
  category_name: string | null;
}

// ── Shared helpers ──

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Не затверджено', cls: 'bg-amber-100 text-amber-700' },
    active: { label: 'В роботі', cls: 'bg-indigo-100 text-indigo-700' },
    done: { label: 'Виконано', cls: 'bg-emerald-100 text-emerald-700' },
  };
  const s = map[status] || map.pending;
  return <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', s.cls)}>{s.label}</span>;
}

async function fetchApi(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── AnnualListView ── Year selected, no process

interface AnnualListViewProps {
  annualPlans: AnnualPlanRow[];
  processTree: ProcessNode[];
  year: number;
  annualBudgetSumMap?: Map<string, number>;
  canEdit?: boolean;
  isChief?: boolean;
  onSelectProcess: (id: string) => void;
  onRefresh?: () => void;
}

export function AnnualListView({ annualPlans, processTree, year, annualBudgetSumMap, canEdit, isChief, onSelectProcess, onRefresh }: AnnualListViewProps) {
  const items = processTree.map(proc => {
    const plan = annualPlans.find(a => a.process_id === proc.processId);
    return { proc, plan };
  });

  const totalBudget = annualPlans.reduce((s, a) => s + (annualBudgetSumMap?.get(a.annual_id) || 0), 0);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="detail-hdr flex items-center gap-2 px-3 py-2">
        <div className="w-1 h-5 rounded-sm bg-amber-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-700">Плани року · {year}</div>
        </div>
        {totalBudget > 0 && (
          <span className="text-[10px] font-bold text-amber-600">
            {totalBudget.toLocaleString('uk-UA')} ₴
          </span>
        )}
      </div>
      <div className="hdr-sep" />

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState variant="centered" icon={<Target className="h-10 w-10" />} title="Немає процесів" description="Процеси не знайдено" />
        ) : (
          items.map(({ proc, plan }) => (
            <div
              key={proc.processId}
              onClick={() => onSelectProcess(proc.processId)}
              className="w-full text-left border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors px-4 py-3 cursor-pointer"
              role="button" tabIndex={0} aria-label={`Обрати ${proc.name}`}
              onKeyDown={e => e.key === 'Enter' && onSelectProcess(proc.processId)}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-800 mb-1">{proc.name}</div>
                  {proc.mission && (
                    <div className="text-[11px] text-slate-500 line-clamp-1 mb-0.5">
                      <span className="text-slate-400">Місія: </span>{proc.mission}
                    </div>
                  )}
                  {proc.expectedResult && (
                    <div className="text-[11px] text-slate-600 line-clamp-1">
                      <span className="text-slate-400">Результат: </span>{proc.expectedResult}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {plan ? statusBadge(plan.status) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-dashed border-slate-300">
                      Немає плану
                    </span>
                  )}
                  {plan && (annualBudgetSumMap?.get(plan.annual_id) || 0) > 0 && (
                    <span className="text-[10px] font-bold text-amber-600">
                      {(annualBudgetSumMap?.get(plan.annual_id) || 0).toLocaleString('uk-UA')} ₴
                    </span>
                  )}
                  {canEdit && (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      {!plan ? (
                        <>
                          <button className="cal-action-btn" style={{ color: '#10b981' }} title="Створити план" aria-label="Створити"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await fetchApi('/api/plans/annual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ process_id: proc.processId, year }) });
                              onRefresh?.();
                            }}>
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button className="cal-action-btn" style={{ color: '#6366f1' }} title="Копіювати з попереднього року" aria-label="Копіювати"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await fetchApi('/api/plans/annual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ process_id: proc.processId, year, copy_from_year: year - 1 }) });
                              onRefresh?.();
                            }}>
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="cal-action-btn"
                            style={{ color: plan.status !== 'done' ? '#10b981' : '#cbd5e1' }}
                            title={plan.status === 'pending' ? 'Затвердити' : plan.status === 'active' ? 'Прийняти' : 'Виконано'}
                            aria-label="Затвердити"
                            disabled={plan.status === 'done'}
                            onClick={async (e) => {
                              e.stopPropagation();
                              const next = plan.status === 'pending' ? 'active' : plan.status === 'active' ? 'done' : null;
                              if (!next) return;
                              await fetchApi('/api/plans/annual', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: plan.annual_id, status: next }) });
                              onRefresh?.();
                            }}>
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="cal-action-btn"
                            style={{ color: isChief ? '#ef4444' : '#ef4444', opacity: isChief ? 1 : 0.4 }}
                            title={plan.status === 'pending' ? 'Видалити план' : plan.status === 'active' ? 'Повернути на затвердження' : 'Повернути в роботу'}
                            aria-label="Повернути"
                            disabled={!isChief}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!isChief) return;
                              if (plan.status === 'pending') {
                                await fetchApi(`/api/plans/annual?id=${plan.annual_id}`, { method: 'DELETE' });
                              } else {
                                const prev = plan.status === 'active' ? 'pending' : plan.status === 'done' ? 'active' : null;
                                if (prev) await fetchApi('/api/plans/annual', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: plan.annual_id, status: prev }) });
                              }
                              onRefresh?.();
                            }}>
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex-shrink-0 grid grid-cols-2 gap-1.5 p-2.5 bg-slate-50 border-t border-slate-200">
        <div className="px-2 py-1.5 rounded-lg bg-white border border-slate-200/60 text-center">
          <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">Процесів</div>
          <div className="text-sm font-extrabold text-slate-800 mt-0.5">{processTree.length}</div>
        </div>
        <div className="px-2 py-1.5 rounded-lg bg-white border border-slate-200/60 text-center">
          <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">Бюджет</div>
          <div className="text-sm font-extrabold text-amber-600 mt-0.5">{totalBudget > 0 ? `${totalBudget.toLocaleString('uk-UA')} ₴` : '—'}</div>
        </div>
      </div>
    </div>
  );
}

// ── AnnualDetailView ── Year + process selected

interface AnnualDetailViewProps {
  process: ProcessNode;
  plan: AnnualPlanRow | null;
  budgetItems: AnnualBudgetRow[];
  availableBudgetItems?: BudgetItemOption[];
  year: number;
  canEdit?: boolean;
  onRefresh?: () => void;
  onClose?: () => void;
}

export function AnnualDetailView({ process, plan, budgetItems, year, canEdit, onRefresh, onClose, availableBudgetItems = [] }: AnnualDetailViewProps) {
  const totalBudget = budgetItems.reduce((s, b) => s + Number(b.amount), 0);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingBudget, setAddingBudget] = useState(false);
  const [newBudgetItemId, setNewBudgetItemId] = useState('');
  const [newBudgetAmount, setNewBudgetAmount] = useState('');
  const [newBudgetDate, setNewBudgetDate] = useState('');

  const toggleApprove = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      await fetchApi('/api/plans/annual', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plan.annual_id, status: plan.status === 'active' ? 'pending' : 'active' }),
      });
      onRefresh?.();
    } finally { setSaving(false); }
  };

  const deletePlan = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      await fetchApi(`/api/plans/annual?id=${plan.annual_id}`, { method: 'DELETE' });
      setConfirmDelete(false);
      onRefresh?.();
    } finally { setSaving(false); }
  };

  const addBudgetEntry = async () => {
    if (!plan || !newBudgetItemId || !newBudgetAmount) return;
    setSaving(true);
    try {
      await fetchApi('/api/plans/annual/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annual_plan_id: plan.annual_id, budget_item_id: newBudgetItemId, amount: Number(newBudgetAmount), payment_date: newBudgetDate || null }),
      });
      setNewBudgetItemId('');
      setNewBudgetAmount('');
      setNewBudgetDate('');
      setAddingBudget(false);
      onRefresh?.();
    } finally { setSaving(false); }
  };

  const deleteBudgetEntry = async (id: string) => {
    await fetchApi(`/api/plans/annual/budget?id=${id}`, { method: 'DELETE' });
    onRefresh?.();
  };

  // Budget items not yet added to this plan
  const usedItemIds = new Set(budgetItems.map(b => b.budget_item_id));
  const unusedBudgetItems = availableBudgetItems.filter(bi => !usedItemIds.has(bi.id));

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="detail-hdr flex items-center gap-2 px-3 py-2">
        <div className="w-1 h-5 rounded-sm bg-amber-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-700 line-clamp-2">{process.name}</div>
        </div>
        {plan && canEdit && (
          <div className="flex items-center gap-1 flex-shrink-0">
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

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200">
          <span className="text-[11px] text-red-700 font-medium flex-1">Видалити річний план?</span>
          <button onClick={deletePlan} disabled={saving} className="text-[10px] font-bold text-white bg-red-500 px-3 py-1 rounded-lg hover:bg-red-600" aria-label="Підтвердити видалення">Так</button>
          <button onClick={() => setConfirmDelete(false)} className="text-[10px] font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg hover:bg-slate-200" aria-label="Скасувати видалення">Ні</button>
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

        {/* Budget items */}
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Banknote className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">
              Бюджетні статті ({budgetItems.length})
            </span>
            {totalBudget > 0 && (
              <span className="ml-auto text-[11px] font-bold text-amber-600">
                {totalBudget.toLocaleString('uk-UA')} ₴
              </span>
            )}
            {canEdit && plan && unusedBudgetItems.length > 0 && (
              <button onClick={() => setAddingBudget(true)} className="cal-action-btn ml-auto" title="Додати статтю" aria-label="Додати бюджетну статтю">
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {addingBudget && (
            <div className="flex flex-col gap-1.5 mb-2 p-2 rounded-lg bg-amber-50/50 border border-amber-200">
              <select value={newBudgetItemId} onChange={e => setNewBudgetItemId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-[11px] focus:ring-2 focus:ring-amber-500"
                aria-label="Бюджетна стаття">
                <option value="">Оберіть статтю</option>
                {unusedBudgetItems.map(bi => (
                  <option key={bi.id} value={bi.id}>{bi.name}{bi.category_name ? ` (${bi.category_name})` : ''}</option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <input type="number" value={newBudgetAmount} onChange={e => setNewBudgetAmount(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-[11px] focus:ring-2 focus:ring-amber-500"
                  placeholder="Сума, ₴" min="0" aria-label="Сума" />
                <input type="date" value={newBudgetDate} onChange={e => setNewBudgetDate(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-[11px] focus:ring-2 focus:ring-amber-500"
                  aria-label="Дата оплати" />
              </div>
              <div className="flex gap-1.5 justify-end">
                <button onClick={addBudgetEntry} disabled={saving || !newBudgetItemId || !newBudgetAmount} className="cal-action-btn accent" aria-label="Зберегти"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => { setAddingBudget(false); setNewBudgetItemId(''); setNewBudgetAmount(''); setNewBudgetDate(''); }} className="cal-action-btn" aria-label="Скасувати"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}

          {budgetItems.length === 0 && !addingBudget ? (
            <div className="text-[11px] text-slate-400 italic py-2">Немає бюджетних статей</div>
          ) : (
            <div className="space-y-1.5">
              {budgetItems.map(b => (
                <div key={b.id} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-100 group/budget">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-slate-700">{b.budget_items?.name || '—'}</div>
                    {b.budget_items?.budget_categories?.name && (
                      <span className="text-[10px] text-slate-400">{b.budget_items.budget_categories.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="flex flex-col items-end">
                      <span className="text-[11px] font-bold text-amber-600">{Number(b.amount).toLocaleString('uk-UA')} ₴</span>
                      {b.payment_date && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <CalendarDays className="w-3 h-3 text-slate-400" />
                          <span className="text-[10px] text-slate-500">{b.payment_date}</span>
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <button onClick={() => deleteBudgetEntry(b.id)}
                        className="cal-action-btn opacity-0 group-hover/budget:opacity-100" title="Видалити" aria-label="Видалити статтю"
                        style={{ color: '#ef4444' }}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!plan && (
          <div className="px-4 py-6 text-center">
            <div className="text-[11px] text-slate-400 italic">Річний план для цього процесу не створено</div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 grid grid-cols-2 gap-1.5 p-2.5 bg-slate-50 border-t border-slate-200">
        <div className="px-2 py-1.5 rounded-lg bg-white border border-slate-200/60 text-center">
          <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">Статус</div>
          <div className="text-sm font-extrabold text-slate-800 mt-0.5">{plan ? (plan.status === 'active' ? 'В роботі' : plan.status === 'done' ? 'Виконано' : 'Не затверджено') : '—'}</div>
        </div>
        <div className="px-2 py-1.5 rounded-lg bg-white border border-slate-200/60 text-center">
          <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">Бюджет</div>
          <div className="text-sm font-extrabold text-amber-600 mt-0.5">{totalBudget > 0 ? `${totalBudget.toLocaleString('uk-UA')} ₴` : '—'}</div>
        </div>
      </div>
    </div>
  );
}
