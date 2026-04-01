'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { X, Check, Clock, Calendar, FileText, Paperclip, Folder, Building2, BookOpen, ListChecks } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Spinner } from '@/components/ui/Spinner';
import { useCreateTask, useUpdateTask, usePlanTasks, type PlanTaskItem } from '@/hooks/usePlannerTasks';
import { useCollectTasks } from '@/hooks/usePlanner';
import { projectsQueryOptions } from '@/lib/ops/reference-queries';
import TaskFileUpload from './TaskFileUpload';
import type { ActivePlanForSlot, CalendarEntry } from '@/lib/ops/planner/calendar-entries';

// ─── Types ──────────────────────────────────────────────────────────────────

export type TasksModalState =
  | null
  | { mode: 'create'; plan: ActivePlanForSlot }
  | { mode: 'edit'; plan: ActivePlanForSlot; task: PlanTaskItem }
  | { mode: 'collect'; plan: ActivePlanForSlot; entries: CalendarEntry[]; totalHours: number; latestDate: string };

interface Props {
  state: TasksModalState;
  weekStart: string;
  onClose: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDay(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
}

function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

const INPUT_STYLE: React.CSSProperties = { width: '100%', padding: '5px 10px', fontSize: 12, borderRadius: 8 };

// ─── Template List (overlay) ─────────────────────────────────────────────────

function TemplateList({ procedureId, onSelect }: { procedureId: string; onSelect: (content: string, title: string) => void }) {
  const [templates, setTemplates] = useState<{ id: string; title: string; content: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!procedureId) { setLoading(false); return; }
    let cancelled = false;
    fetch(`/api/planner/templates?procedure_id=${procedureId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) setTemplates(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [procedureId]);

  return (
    <div className="absolute left-0 top-full mt-1 z-10 w-full rounded-lg border border-slate-200/60 bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
      {loading && <div className="py-3 text-center text-[11px] text-slate-400">Завантаження...</div>}
      {!loading && templates.length === 0 && (
        <div className="py-3 text-center text-[11px] text-slate-400">Шаблонів немає</div>
      )}
      {templates.map(t => (
        <button key={t.id} type="button"
          className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors flex items-center gap-1.5 border-b border-slate-100 last:border-b-0"
          onClick={() => onSelect(t.content, t.title)}
          title={t.content}
        >
          <ListChecks className="h-3 w-3 flex-shrink-0 text-violet-400" />
          <span className="truncate font-medium">{t.title}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function TasksModal({ state, weekStart, onClose }: Props) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState(0);
  const [date, setDate] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [kbDocumentId, setKbDocumentId] = useState<string | null>(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const collectTasks = useCollectTasks();
  const isPending = createTask.isPending || updateTask.isPending || collectTasks.isPending;

  const planId = state?.plan.monthlyPlanId;
  const { data: planData } = usePlanTasks(planId);
  const planInfo = planData?.planInfo;

  const companyIds = planInfo?.companyIds ?? [];
  const companies = planInfo?.companies ?? [];
  const planDocuments = planInfo?.planDocuments ?? [];

  // All active projects from reference
  const { data: allProjects = [] } = useQuery(projectsQueryOptions);
  const projectOptions = useMemo(() =>
    allProjects.filter(p => p.is_active).map(p => ({ id: p.project_id, name: p.project_name })),
    [allProjects],
  );

  // Entries summary for collect mode
  const entriesByDay = useMemo(() => {
    if (!state || state.mode !== 'collect') return [];
    const map = new Map<string, { count: number; hours: number }>();
    for (const e of state.entries) {
      const existing = map.get(e.date) || { count: 0, hours: 0 };
      existing.count++;
      existing.hours += e.duration_minutes / 60;
      map.set(e.date, existing);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, info]) => ({ date: d, ...info }));
  }, [state]);

  // Pre-fill fields when state changes
  useEffect(() => {
    if (!state) return;
    setError(null);

    if (state.mode === 'edit') {
      setTitle(state.task.title || '');
      setDescription(state.task.description || '');
      setHours(Number(state.task.spent_hours) || 0);
      setDate(state.task.task_date || todayStr());
      setDocumentNumber(state.task.document_number || '');
      setProjectId(state.task.project_id || null);
      setKbDocumentId(null);
      setSelectedCompanyIds(companyIds);
      setAttachmentUrl('');
    } else if (state.mode === 'collect') {
      // Pre-fill from external meeting entries: subject → title, summary → description
      const meetingEntry = state.entries.find(e => e.source === 'external' && e.subject);
      const summaryEntry = state.entries.find(e => e.transcript_summary);
      setTitle(meetingEntry?.subject || '');
      setDescription(summaryEntry?.transcript_summary
        ? summaryEntry.transcript_summary.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
        : state.plan.procedureName);
      setHours(state.totalHours);
      setDate(state.latestDate);
      setDocumentNumber('');
      setProjectId(null);
      setKbDocumentId(null);
      setSelectedCompanyIds(companyIds);
      setAttachmentUrl('');
    } else {
      setTitle('');
      setDescription('');
      setHours(0);
      setDate(todayStr());
      setDocumentNumber('');
      setProjectId(null);
      setKbDocumentId(null);
      setSelectedCompanyIds(companyIds);
      setAttachmentUrl('');
    }
  }, [state, companyIds]);

  // Close on Escape
  useEffect(() => {
    if (!state) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [state, onClose]);

  // Close on overlay click
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
  }, [onClose]);

  const handleTemplateSelect = useCallback((content: string, tplTitle: string) => {
    setDescription(content);
    setTitle(tplTitle);
    setShowTemplates(false);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state || isPending) return;
    setError(null);

    const desc = description.trim();
    if (!desc) { setError('Опис обов\'язковий'); return; }

    try {
      if (state.mode === 'edit') {
        await updateTask.mutateAsync({
          id: state.task.daily_task_id,
          title: title || undefined,
          description: desc,
          spent_hours: hours,
          task_date: date,
        });
      } else {
        await createTask.mutateAsync({
          monthly_plan_id: state.plan.monthlyPlanId,
          title: title || desc.slice(0, 100),
          description: desc,
          task_date: date,
          spent_hours: hours,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка збереження');
    }
  }, [state, isPending, description, title, hours, date, weekStart, createTask, updateTask, collectTasks, onClose]);

  if (!state) return null;

  const modalTitle = state.mode === 'edit' ? 'Редагувати задачу'
    : state.mode === 'collect' ? 'Зібрати задачі'
    : 'Нова задача';

  const isCreate = state.mode === 'create';
  const procedureId = state.plan.procedureId;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/[0.18] backdrop-blur-[4px]"
      onClick={handleOverlayClick}
    >
      <div
        ref={panelRef}
        className="rounded-2xl w-full max-w-lg mx-4 shadow-xl border border-slate-200/60"
        style={{ maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', background: '#fff' }}
      >
        {/* ── Header ── */}
        <div className="detail-hdr" style={{ padding: '8px 14px' }}>
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-[18px] rounded-sm bg-indigo-500 flex-shrink-0" />
            <span className="text-[13px] font-semibold text-slate-800 flex-1">{modalTitle}</span>
            <span className="text-[10px] text-slate-500 flex-shrink-0 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">{state.plan.procedureName}</span>
            <button className="cal-action-btn" onClick={onClose} aria-label="Закрити" type="button">
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              className="cal-action-btn"
              onClick={() => formRef.current?.requestSubmit()}
              disabled={isPending || !description.trim()}
              aria-label="Зберегти" type="button"
            >
              {isPending ? <Spinner size="xs" /> : <Check className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className="hdr-sep" />

        {/* ── Collect entries summary ── */}
        {state.mode === 'collect' && entriesByDay.length > 0 && (
          <div className="px-3.5 py-1.5 flex-shrink-0 border-b border-slate-200/30 bg-slate-50/30">
            <span className="sec-label mb-0.5 block">
              Записи ({state.entries.length})
            </span>
            {entriesByDay.map(({ date: d, count, hours: h }) => (
              <div key={d} className="flex items-center justify-between py-px">
                <span className="text-[11px] text-slate-500">{formatDay(d)}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">{count} зап.</span>
                  <span className="text-[11px] font-semibold text-indigo-500">{h.toFixed(1)}г</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Scrollable body ── */}
        <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
          <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Templates toggle (create mode only) */}
            {isCreate && (
              <div className="relative">
                <button type="button"
                  className="sec-label flex items-center gap-1 cursor-pointer hover:text-violet-500 transition-colors"
                  onClick={() => setShowTemplates(v => !v)}
                >
                  <ListChecks className="h-3 w-3" />
                  Шаблони
                </button>
                {showTemplates && (
                  <TemplateList procedureId={procedureId} onSelect={handleTemplateSelect} />
                )}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="sec-label" style={{ marginBottom: 2, display: 'block' }}>Назва</label>
              <input type="text" className="glass-input" style={INPUT_STYLE}
                value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Коротка назва (необов'язково)" maxLength={200} disabled={isPending} />
            </div>

            {/* Description */}
            <div>
              <label className="sec-label" style={{ marginBottom: 2, display: 'block' }}>
                Опис <span className="text-red-500">*</span>
              </label>
              <textarea className="glass-input"
                style={{ ...INPUT_STYLE, resize: 'none', minHeight: 48 }}
                value={description} onChange={e => setDescription(e.target.value)}
                rows={2} required disabled={isPending} placeholder="Опис виконаної роботи..." />
            </div>

            {/* Companies (toggleable chips from plan) */}
            {companies.length > 0 && (
              <div>
                <label className="sec-label" style={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Building2 className="h-3 w-3" /> Компанії
                </label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {companies.map((name, i) => {
                    const cid = companyIds[i];
                    const selected = selectedCompanyIds.includes(cid);
                    return (
                      <button key={cid} type="button" disabled={isPending}
                        onClick={() => setSelectedCompanyIds(prev =>
                          selected ? prev.filter(id => id !== cid) : [...prev, cid]
                        )}
                        className={cn(
                          'text-[10px] py-0.5 px-1.5 rounded font-medium cursor-pointer border transition-all duration-150',
                          selected
                            ? 'bg-indigo-500/[0.12] text-indigo-500 border-indigo-500/25'
                            : 'bg-transparent text-slate-400 border-slate-400/25 line-through',
                        )}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hours + Date + Document row */}
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flexShrink: 0 }}>
                <label className="sec-label" style={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Clock className="h-3 w-3" /> Години
                </label>
                <input type="number" className="glass-input"
                  style={{ width: 64, padding: '5px 6px', fontSize: 12, borderRadius: 8, textAlign: 'center' }}
                  value={hours} onChange={e => setHours(Number(e.target.value))}
                  onFocus={e => e.target.select()} min={0} max={40} step={0.5} disabled={isPending} />
              </div>
              <div style={{ flex: '0 1 130px' }}>
                <label className="sec-label" style={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Calendar className="h-3 w-3" /> Дата
                </label>
                <input type="date" className="glass-input"
                  style={{ width: '100%', padding: '5px 6px', fontSize: 12, borderRadius: 8 }}
                  value={date} onChange={e => setDate(e.target.value)} disabled={isPending} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="sec-label" style={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <FileText className="h-3 w-3" /> № документа
                </label>
                <input type="text" className="glass-input" style={INPUT_STYLE}
                  value={documentNumber} onChange={e => setDocumentNumber(e.target.value)}
                  placeholder="№ акта, заявки..." disabled={isPending} />
              </div>
            </div>

            {/* Project + KB Document row */}
            <div style={{ display: 'flex', gap: 6 }}>
              {projectOptions.length > 0 && (
                <div style={{ flex: 1 }}>
                  <label className="sec-label" style={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Folder className="h-3 w-3" /> Проект
                  </label>
                  <select className="glass-input" style={{ ...INPUT_STYLE, appearance: 'none' }}
                    value={projectId || ''} onChange={e => setProjectId(e.target.value || null)}
                    disabled={isPending}>
                    <option value="">— не обрано —</option>
                    {projectOptions.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {planDocuments.length > 0 && (
                <div style={{ flex: 1 }}>
                  <label className="sec-label" style={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <BookOpen className="h-3 w-3" /> Документ ІБ
                  </label>
                  <select className="glass-input" style={{ ...INPUT_STYLE, appearance: 'none' }}
                    value={kbDocumentId || ''} onChange={e => setKbDocumentId(e.target.value || null)}
                    disabled={isPending}>
                    <option value="">— не обрано —</option>
                    {planDocuments.map(doc => (
                      <option key={doc.id} value={doc.id}>{doc.title || doc.source_filename}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* File upload */}
            <div>
              <label className="sec-label" style={{ marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Paperclip className="h-3 w-3" /> Вложення
              </label>
              <TaskFileUpload
                documentNumber={documentNumber}
                onUploadComplete={(url) => setAttachmentUrl(url)}
                onDocumentNumberExtracted={(num) => setDocumentNumber(num)}
                currentUrl={attachmentUrl}
                disabled={isPending}
              />
            </div>
          </form>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="px-3.5 py-1.5 bg-red-500/[0.06] border-t border-red-500/15 flex-shrink-0">
            <span className="text-[11px] text-red-500">{error}</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
