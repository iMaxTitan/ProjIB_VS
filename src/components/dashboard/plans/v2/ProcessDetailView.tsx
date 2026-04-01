'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/shared/utils';
import {
  Target, FileText, FileCheck, Banknote, Lightbulb, CalendarDays,
  ChevronRight, X, Pencil, Check, Trash2, Plus,
  Ellipsis,
} from 'lucide-react';
import { SummaryBox, pctColor, barBg } from '@/components/dashboard/shared';
import type { ProcessNode } from '@/hooks/usePlansV2';
import type { AnnualPlanRow, AnnualBudgetRow, QuarterlyPlanRow, QuarterlyInitiativeRow, ViewLevel } from '@/hooks/usePlansV2';
import type { DailyTask } from '@/types/planning';
import type { BudgetItemOption } from './AnnualViews';

// ── Props ──

interface ProcessDetailViewProps {
  process: ProcessNode;
  viewLevel: ViewLevel;
  year: number;
  quarter: number | null;
  month: number | null;
  // Annual
  annualPlan: AnnualPlanRow | null;
  annualBudgetItems: AnnualBudgetRow[];
  availableBudgetItems?: BudgetItemOption[];
  // Quarterly
  quarterlyPlan: QuarterlyPlanRow | null;
  initiatives: QuarterlyInitiativeRow[];
  // Monthly
  hoursMap: Map<string, { spent: number; tasks: number }>;
  dailyTasks: DailyTask[];
  // Edit
  canEdit?: boolean;
  onRefresh?: () => void;
  onClose?: () => void;
}

// ── Helpers ──

const META_LABEL = 'flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1';

const INIT_STATUS: Record<string, { cls: string; label: string }> = {
  planned: { cls: 'bg-blue-400', label: 'Заплановано' },
  in_progress: { cls: 'bg-amber-400', label: 'В роботі' },
  completed: { cls: 'bg-emerald-400', label: 'Завершено' },
};


async function fetchApi(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Не затверджено', cls: 'bg-amber-100 text-amber-700' },
    active: { label: 'В роботі', cls: 'bg-indigo-100 text-indigo-700' },
    done: { label: 'Виконано', cls: 'bg-emerald-100 text-emerald-700' },
  };
  const s = map[status] || map.pending;
  return <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', s.cls)}>{s.label}</span>;
}

// ── Component ──

export default function ProcessDetailView({
  process, viewLevel, year, quarter, month,
  annualPlan, annualBudgetItems, availableBudgetItems = [],
  quarterlyPlan, initiatives,
  hoursMap, dailyTasks,
  canEdit, onRefresh, onClose,
}: ProcessDetailViewProps) {
  const showQuarterly = viewLevel === 'quarter' || viewLevel === 'month';
  const showMonthly = viewLevel === 'month';

  // ── Budget filtering by scope ──
  const filteredBudgetItems = React.useMemo(() => {
    if (viewLevel === 'year') return annualBudgetItems;
    if (viewLevel === 'quarter' && quarter) {
      const qStart = new Date(year, (quarter - 1) * 3, 1);
      const qEnd = new Date(year, quarter * 3, 0);
      return annualBudgetItems.filter(b => {
        if (!b.payment_date) return false;
        const d = new Date(b.payment_date);
        return d >= qStart && d <= qEnd;
      });
    }
    if (viewLevel === 'month' && month) {
      const mStart = new Date(year, month - 1, 1);
      const mEnd = new Date(year, month, 0);
      return annualBudgetItems.filter(b => {
        if (!b.payment_date) return false;
        const d = new Date(b.payment_date);
        return d >= mStart && d <= mEnd;
      });
    }
    return [];
  }, [annualBudgetItems, viewLevel, year, quarter, month]);

  const totalBudget = filteredBudgetItems.reduce((s, b) => s + Number(b.amount), 0);

  // ── Edit mode ──
  const [editing, setEditing] = useState(false);

  // ── Budget CRUD (annual level) ──
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingBudget, setAddingBudget] = useState(false);
  const [newBudgetItemId, setNewBudgetItemId] = useState('');
  const [newBudgetAmount, setNewBudgetAmount] = useState('');
  const [newBudgetDate, setNewBudgetDate] = useState('');

  // Quarterly note edit
  const [editingNote, setEditingNote] = useState(false);
  const [editNote, setEditNote] = useState('');

  // Initiative add
  const [addingInit, setAddingInit] = useState(false);
  const [newInitTitle, setNewInitTitle] = useState('');

  // Procedure expand (month level)
  const [expandedProcs, setExpandedProcs] = useState<Set<string>>(new Set());
  const toggleProc = useCallback((id: string) => {
    setExpandedProcs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Tasks grouped by procedure → title+source
  const tasksByProc = React.useMemo(() => {
    if (!showMonthly) return new Map<string, { title: string; description?: string; hours: number; source?: string }[]>();
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
    const result = new Map<string, { title: string; description?: string; hours: number; source?: string }[]>();
    for (const [procId, taskMap] of m) {
      result.set(procId, Array.from(taskMap.values()).sort((a, b) => b.hours - a.hours));
    }
    return result;
  }, [dailyTasks, process.procedures, showMonthly]);

  // Budget unused items
  const usedItemIds = new Set(annualBudgetItems.map(b => b.budget_item_id));
  const unusedBudgetItems = availableBudgetItems.filter(bi => !usedItemIds.has(bi.id));

  // ── CRUD handlers ──

  const deletePlan = async () => {
    if (!annualPlan) return;
    setSaving(true);
    try {
      await fetchApi(`/api/plans/annual?id=${annualPlan.annual_id}`, { method: 'DELETE' });
      setConfirmDelete(false);
      onRefresh?.();
    } finally { setSaving(false); }
  };

  const addBudgetEntry = async () => {
    if (!annualPlan || !newBudgetItemId || !newBudgetAmount) return;
    setSaving(true);
    try {
      await fetchApi('/api/plans/annual/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annual_plan_id: annualPlan.annual_id, budget_item_id: newBudgetItemId, amount: Number(newBudgetAmount), payment_date: newBudgetDate || null }),
      });
      setNewBudgetItemId(''); setNewBudgetAmount(''); setNewBudgetDate(''); setAddingBudget(false);
      onRefresh?.();
    } finally { setSaving(false); }
  };

  const deleteBudgetEntry = async (id: string) => {
    await fetchApi(`/api/plans/annual/budget?id=${id}`, { method: 'DELETE' });
    onRefresh?.();
  };

  const saveNote = async () => {
    if (!quarterlyPlan) return;
    setSaving(true);
    try {
      await fetchApi('/api/plans/quarterly', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: quarterlyPlan.quarterly_id, note: editNote }),
      });
      setEditingNote(false);
      onRefresh?.();
    } finally { setSaving(false); }
  };

  const addInitiative = async () => {
    if (!quarterlyPlan || !newInitTitle.trim()) return;
    setSaving(true);
    try {
      await fetchApi('/api/plans/quarterly/initiatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarterly_plan_id: quarterlyPlan.quarterly_id, title: newInitTitle.trim() }),
      });
      setNewInitTitle(''); setAddingInit(false);
      onRefresh?.();
    } finally { setSaving(false); }
  };

  const deleteInitiative = async (id: string) => {
    await fetchApi(`/api/plans/quarterly/initiatives?id=${id}`, { method: 'DELETE' });
    onRefresh?.();
  };

  const pct = process.totalPlanned > 0 ? Math.round((process.totalSpent / process.totalPlanned) * 100) : 0;

  // Plan status for current scope
  const scopePlanStatus: string | null = React.useMemo(() => {
    if (viewLevel === 'year') return annualPlan?.status ?? null;
    if (viewLevel === 'quarter') return quarterlyPlan?.status ?? null;
    // month — aggregate from monthly plans
    const statuses = process.procedures.flatMap(pr => pr.plans.map(p => p.status));
    if (statuses.length === 0) return null;
    if (statuses.every(s => s === 'done')) return 'done';
    if (statuses.some(s => s === 'active' || s === 'done')) return 'active';
    return 'pending';
  }, [viewLevel, annualPlan, quarterlyPlan, process.procedures]);

  const isPending = scopePlanStatus === 'pending';

  const approvePlan = async () => {
    setSaving(true);
    try {
      if (viewLevel === 'year' && annualPlan) {
        await fetchApi('/api/plans/annual', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: annualPlan.annual_id, status: 'active' }),
        });
      } else if (viewLevel === 'quarter' && quarterlyPlan) {
        await fetchApi('/api/plans/quarterly', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: quarterlyPlan.quarterly_id, status: 'active' }),
        });
      }
      onRefresh?.();
    } finally { setSaving(false); }
  };

  const budgetLabel = viewLevel === 'year' ? '' : viewLevel === 'quarter' && quarter ? ` · Q${quarter}` : month ? ` · ${month.toString().padStart(2, '0')}` : '';

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="detail-hdr flex items-center gap-2 px-3 py-2">
        <div className="w-1 h-5 rounded-sm bg-indigo-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-700 line-clamp-2">{process.name}</div>
        </div>
        {canEdit && annualPlan && !editing && (
          <button onClick={() => setEditing(true)} className="cal-action-btn flex-shrink-0" title="Редагувати" aria-label="Редагувати" style={{ color: '#6366f1' }}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {editing && (
          <button onClick={() => { setEditing(false); setAddingBudget(false); }} className="cal-action-btn flex-shrink-0" title="Завершити редагування" aria-label="Завершити" style={{ color: '#10b981' }}>
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
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
          <button onClick={deletePlan} disabled={saving} className="text-[10px] font-bold text-white bg-red-500 px-3 py-1 rounded-lg hover:bg-red-600" aria-label="Підтвердити">Так</button>
          <button onClick={() => setConfirmDelete(false)} className="text-[10px] font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg hover:bg-slate-200" aria-label="Скасувати">Ні</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* ── Description + Mission + Expected result ── */}
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

        {/* ── Budget ── */}
        <div className="px-4 py-2.5 border-b border-slate-100">
          <div className="flex items-center gap-1.5 mb-2">
            <Banknote className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">
              Бюджетні статті{budgetLabel}
            </span>
            {totalBudget > 0 && (
              <span className="ml-auto text-[11px] font-bold text-amber-600">
                {totalBudget.toLocaleString('uk-UA')} ₴
              </span>
            )}
            {editing && unusedBudgetItems.length > 0 && (
              <button onClick={() => setAddingBudget(true)} className="cal-action-btn ml-1" title="Додати" aria-label="Додати бюджетну статтю">
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {addingBudget && (
            <div className="flex flex-col gap-1.5 mb-2 p-2 rounded-lg bg-amber-50/50 border border-amber-200">
              <select value={newBudgetItemId} onChange={e => setNewBudgetItemId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-[11px] focus:ring-2 focus:ring-amber-500" aria-label="Бюджетна стаття">
                <option value="">Оберіть статтю</option>
                {unusedBudgetItems.map(bi => (
                  <option key={bi.id} value={bi.id}>{bi.name}{bi.category_name ? ` (${bi.category_name})` : ''}</option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <input type="number" value={newBudgetAmount} onChange={e => setNewBudgetAmount(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-[11px] focus:ring-2 focus:ring-amber-500" placeholder="Сума, ₴" min="0" aria-label="Сума" />
                <input type="date" value={newBudgetDate} onChange={e => setNewBudgetDate(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-[11px] focus:ring-2 focus:ring-amber-500" aria-label="Дата оплати" />
              </div>
              <div className="flex gap-1.5 justify-end">
                <button onClick={addBudgetEntry} disabled={saving || !newBudgetItemId || !newBudgetAmount} className="cal-action-btn accent" aria-label="Зберегти"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => { setAddingBudget(false); setNewBudgetItemId(''); setNewBudgetAmount(''); setNewBudgetDate(''); }} className="cal-action-btn" aria-label="Скасувати"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}

          {filteredBudgetItems.length > 0 ? (
            <div className="space-y-1.5">
              {filteredBudgetItems.map(b => (
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
                    {editing && (
                      <button onClick={() => deleteBudgetEntry(b.id)} className="cal-action-btn opacity-0 group-hover/budget:opacity-100" title="Видалити" aria-label="Видалити" style={{ color: '#ef4444' }}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 italic py-1">Немає бюджетних статей</div>
          )}
        </div>

        {/* ── Notes (quarter+) ── */}
        {showQuarterly && (
          <div className="px-4 py-2.5 border-b border-slate-100">
            <div className="flex items-center gap-1.5 mb-1">
              <FileCheck className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Примітки</span>
              {editing && quarterlyPlan && !editingNote && (
                <button onClick={() => { setEditNote(quarterlyPlan.note || ''); setEditingNote(true); }} className="cal-action-btn ml-1" title="Редагувати" aria-label="Редагувати">
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
            {editingNote ? (
              <div className="flex flex-col gap-1.5">
                <textarea value={editNote} onChange={e => setEditNote(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-[11px] focus:ring-2 focus:ring-blue-500" rows={2} aria-label="Примітки" />
                <div className="flex gap-1.5 justify-end">
                  <button onClick={saveNote} disabled={saving} className="cal-action-btn accent" aria-label="Зберегти"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditingNote(false)} className="cal-action-btn" aria-label="Скасувати"><X className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-600">{quarterlyPlan?.note || 'Немає приміток'}</div>
            )}
          </div>
        )}

        {/* ── Initiatives (quarter+) ── */}
        {showQuarterly && (() => {
          const visibleInitiatives = showMonthly
            ? initiatives.filter(i => i.status === 'in_progress' || i.status === 'completed')
            : initiatives;
          return (
          <div className="px-4 py-2.5 border-b border-slate-100">
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">
                Ініціативи ({visibleInitiatives.length})
              </span>
              {editing && quarterlyPlan && (
                <button onClick={() => setAddingInit(true)} className="cal-action-btn ml-1" title="Додати" aria-label="Додати ініціативу">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {addingInit && (
              <div className="flex gap-1.5 mb-2">
                <input value={newInitTitle} onChange={e => setNewInitTitle(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-[11px] focus:ring-2 focus:ring-indigo-500"
                  placeholder="Назва ініціативи" aria-label="Назва" onKeyDown={e => e.key === 'Enter' && addInitiative()} />
                <button onClick={addInitiative} disabled={saving || !newInitTitle.trim()} className="cal-action-btn accent" aria-label="Зберегти"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => { setAddingInit(false); setNewInitTitle(''); }} className="cal-action-btn" aria-label="Скасувати"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}
            {visibleInitiatives.length > 0 ? (
              <div className="flex flex-col gap-1">
                {visibleInitiatives.map(init => {
                  const st = INIT_STATUS[init.status] || INIT_STATUS.planned;
                  return (
                    <div key={init.id} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-100 group/init">
                      <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5', st.cls)} title={st.label} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-slate-700 line-clamp-2">{init.title}</div>
                        {init.description && <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{init.description}</div>}
                      </div>
                      {editing && (
                        <button onClick={() => deleteInitiative(init.id)} className="cal-action-btn opacity-0 group-hover/init:opacity-100" title="Видалити" aria-label="Видалити" style={{ color: '#ef4444' }}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <span className="text-[10px] text-slate-300 italic">немає ініціатив</span>
            )}
          </div>
          );
        })()}

        {/* ── Procedures → tasks (month only) ── */}
        {showMonthly && process.procedures.map(pr => {
          const prPct = pr.plannedHours > 0 ? Math.round((pr.spentHours / pr.plannedHours) * 100) : 0;
          const isExpanded = expandedProcs.has(pr.procedureId);
          const taskList = tasksByProc.get(pr.procedureId) || [];
          return (
            <div key={pr.procedureId} className="border-b border-slate-100 last:border-b-0">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/80">
                <button type="button" onClick={() => toggleProc(pr.procedureId)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                  <ChevronRight className={cn('w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform', isExpanded && 'rotate-90')} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 truncate">{pr.name}</div>
                  </div>
                </button>
                <span className="text-xs font-bold text-slate-700">{pr.spentHours}/{pr.plannedHours}</span>
                <span className={cn('text-[10px] font-bold min-w-[28px] text-right', pctColor(prPct))}>{prPct}%</span>
                {canEdit && pr.plans.some(p => p.status === 'pending') && (
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button className="cal-action-btn" style={{ color: '#10b981' }} title="Затвердити" aria-label="Затвердити"
                      onClick={async () => {
                        for (const p of pr.plans.filter(pl => pl.status === 'pending')) {
                          await fetchApi('/api/plans/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.monthly_plan_id, table: 'monthly_plans', status: 'active' }) });
                        }
                        onRefresh?.();
                      }}>
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button className="cal-action-btn" style={{ color: '#ef4444' }} title="Відхилити" aria-label="Відхилити" disabled>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {isExpanded && (taskList.length > 0 ? (
                taskList.map((tg, i) => (
                  <div key={i} className="flex items-start gap-2 px-4 py-1.5 pl-10 border-t border-slate-100/80 hover:bg-slate-50/50 transition-colors">
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
                <div className="px-4 py-1.5 pl-10 text-[10px] text-slate-400 italic border-t border-slate-100/80">Немає задач</div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Approve/Reject bar */}
      {canEdit && isPending && scopePlanStatus && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-50/50 border-t border-amber-200/60">
          <Ellipsis className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <span className="text-[11px] font-medium text-amber-700 flex-1">Очікує затвердження</span>
          <button onClick={approvePlan} disabled={saving}
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold transition-colors"
            aria-label="Затвердити">
            <Check className="w-3.5 h-3.5" /> Затвердити
          </button>
          <button disabled
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-100 text-slate-400 text-[10px] font-bold cursor-not-allowed"
            aria-label="Відхилити">
            <X className="w-3.5 h-3.5" /> Відхилити
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="flex-shrink-0 grid grid-cols-3 gap-1.5 p-2.5 bg-slate-50 border-t border-slate-200">
        <SummaryBox label="Заплановано" value={`${process.totalPlanned} год`} />
        <SummaryBox label="Виконано" value={`${process.totalSpent} год`} colorClass="text-emerald-600" />
        <SummaryBox label="Бюджет" value={totalBudget > 0 ? `${totalBudget.toLocaleString('uk-UA')} ₴` : '—'} colorClass="text-amber-600" />
      </div>
    </div>
  );
}

