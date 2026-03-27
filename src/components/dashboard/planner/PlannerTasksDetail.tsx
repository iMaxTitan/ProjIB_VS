'use client';

import React, { useState } from 'react';
import { Plus, X, Trash2, ArrowRight, Send, Check, RotateCcw, Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Spinner } from '@/components/ui/Spinner';
import { usePlanTasks, useDeleteTask, useAssignDraftToplan, useChangeTaskStatus, type PlanTaskItem, type PlanTaskDraft } from '@/hooks/usePlannerTasks';
import { useTemplates } from '@/hooks/useTaskTemplates';
import type { ActivePlanForSlot } from '@/lib/ops/planner/calendar-entries';

interface Props {
  plan: ActivePlanForSlot;
  onClose: () => void;
  onAddTask?: () => void;
  onEditTask?: (task: PlanTaskItem) => void;
  onAddFromTemplate?: (template: { title: string; content: string }) => void;
  readOnly?: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

function TaskCheckbox({ taskType }: { taskType: string }) {
  if (taskType === 'completed') {
    return (
      <div className="pp-task-check done" title="Узгоджено">
        <svg width="10" height="10" fill="none" stroke="white" strokeWidth="3" viewBox="0 0 24 24">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
    );
  }
  if (taskType === 'pending_approval') {
    return <div className="pp-task-check approval" title="На узгодженні" />;
  }
  if (taskType === 'rejected') {
    return (
      <div className="pp-task-check rejected" title="Відхилено">
        <svg width="10" height="10" fill="none" stroke="#ef4444" strokeWidth="3" viewBox="0 0 24 24">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </div>
    );
  }
  if (taskType === 'incomplete') {
    return <div className="pp-task-check" title="В роботі" />;
  }
  return <div className="pp-task-check draft" title="Чернетка" />;
}

function statusLabel(taskType: string): { text: string; colorClass: string } | null {
  if (taskType === 'pending_approval') return { text: 'на узгодженні', colorClass: 'text-amber-600' };
  if (taskType === 'rejected') return { text: 'відхилено', colorClass: 'text-red-500' };
  if (taskType === 'completed') return { text: 'узгоджено', colorClass: 'text-emerald-600' };
  return null;
}

function sourceBadge(source: string, createdByRole: string | null) {
  const role = createdByRole || source;
  if (role === 'chief') return { label: 'CHIEF', classes: 'text-violet-600 bg-violet-500/10 border-violet-500/25' };
  if (role === 'head') return { label: 'HEAD', classes: 'text-blue-600 bg-blue-500/10 border-blue-500/25' };
  return null;
}

function TaskRow({ task, userRole, onDelete, onChangeStatus, onEdit, readOnly }: {
  task: PlanTaskItem; userRole: string;
  onDelete: (id: string) => void;
  onChangeStatus: (id: string, taskType: string) => void;
  onEdit?: (task: PlanTaskItem) => void;
  readOnly?: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const badge = sourceBadge(task.source, task.created_by_role);
  const status = statusLabel(task.task_type);
  const isManager = userRole === 'chief' || userRole === 'head';
  const isFromManager = task.source === 'chief' || task.source === 'head';

  return (
    <div className="task-row pp-task-row group/task hover:bg-slate-50/50">
      <TaskCheckbox taskType={task.task_type} />
      {badge && (
        <span className={cn('text-[9px] font-bold py-px px-1.5 rounded border flex-shrink-0', badge.classes)}>
          {badge.label}
        </span>
      )}
      <span className="draft-date">{formatDate(task.task_date)}</span>
      <span className={cn('flex-1 min-w-0 overflow-hidden', task.task_type === 'completed' && 'line-through opacity-60')}>
        {task.title && (
          <span className="block text-xs font-semibold text-slate-900 truncate">{task.title}</span>
        )}
        <span className={cn('block truncate', task.title ? 'text-slate-600' : 'font-medium text-slate-800')} style={{ fontSize: task.title ? 10 : 12 }}>
          {task.description}
        </span>
      </span>
      {status && (
        <span className={cn('text-[9px] font-semibold flex-shrink-0', status.colorClass)}>
          {status.text}
        </span>
      )}
      <span className={cn('draft-hours', task.task_type === 'completed' ? 'text-emerald-600 bg-emerald-500/10' : 'text-slate-500 bg-slate-500/[0.08]')}>
        {task.spent_hours}г
      </span>
      {!readOnly && <div className="row-actions" onClick={e => e.stopPropagation()}>
        {confirmDelete ? (
          <>
            <button onClick={() => { onDelete(task.daily_task_id); setConfirmDelete(false); }}
              className="action-btn-small text-red-500" title="Підтвердити видалення">
              <Check className="h-3 w-3" />
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="action-btn-small text-emerald-500" title="Скасувати">
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <>
            {!isManager && !isFromManager && (task.task_type === 'incomplete' || task.task_type === 'rejected') && (
              <button onClick={() => onChangeStatus(task.daily_task_id, 'pending_approval')}
                className="action-btn-small text-amber-500" title="На узгодження">
                <Send className="h-3 w-3" />
              </button>
            )}
            {isManager && task.task_type === 'pending_approval' && (
              <button onClick={() => onChangeStatus(task.daily_task_id, 'completed')}
                className="action-btn-small text-emerald-500" title="Узгодити">
                <Check className="h-3 w-3" />
              </button>
            )}
            {isManager && task.task_type === 'pending_approval' && (
              <button onClick={() => onChangeStatus(task.daily_task_id, 'rejected')}
                className="action-btn-small act-del" title="Відхилити">
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
            {onEdit && task.task_type !== 'completed' && (
              <button onClick={() => onEdit(task)} className="action-btn-small" aria-label="Редагувати" title="Редагувати">
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {!isFromManager && task.task_type !== 'completed' && (
              <button onClick={() => setConfirmDelete(true)} className="action-btn-small act-del" aria-label="Видалити">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </>
        )}
      </div>}
    </div>
  );
}

function DraftRow({ draft, onAssign, isPending }: { draft: PlanTaskDraft; onAssign: (id: string) => void; isPending: boolean }) {
  return (
    <div className="task-row pp-task-row group/task hover:bg-slate-50/50">
      <div className="pp-task-check draft" title="Чернетка без плану" />
      <span className="draft-date">{formatDate(draft.task_date)}</span>
      <span className="draft-desc">{draft.description}</span>
      <span className="draft-hours text-amber-700 bg-amber-500/10">
        {draft.spent_hours}г
      </span>
      <div className="row-actions">
        <button onClick={() => onAssign(draft.daily_task_id)} disabled={isPending}
          className="action-btn-small" title="Прив'язати до плану">
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Collapsible group ─────────────────────────────────────────────────────────

function TaskGroup({ icon, name, subtitle, count, accentClass, children, defaultOpen = true, action }: {
  icon: string;
  name: string;
  subtitle: string;
  count: number;
  accentClass?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;

  return (
    <div className="border-b border-slate-200/40 last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v); } }}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-100/80 border-y border-slate-200/60 hover:bg-slate-200/60 transition-colors sticky top-0 z-[1] cursor-pointer select-none"
      >
        <span className="text-sm flex-shrink-0">{icon}</span>
        {open
          ? <ChevronDown className="h-3 w-3 text-slate-500 flex-shrink-0" />
          : <ChevronRight className="h-3 w-3 text-slate-500 flex-shrink-0" />}
        <div className="flex-1 min-w-0 text-left">
          <span className="text-[12px] font-bold text-slate-800">{name}</span>
          <span className="text-[10px] text-slate-400 ml-1.5">{subtitle}</span>
        </div>
        <span className={cn('text-xs font-bold tabular-nums', accentClass || 'text-slate-500')}>
          {count}
        </span>
        {action && <span onClick={e => e.stopPropagation()}>{action}</span>}
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function PlannerTasksDetail({ plan, onClose, onAddTask, onEditTask, onAddFromTemplate, readOnly }: Props) {
  const { data, isLoading } = usePlanTasks(plan.monthlyPlanId);
  const deleteMut = useDeleteTask();
  const assignMut = useAssignDraftToplan();
  const statusMut = useChangeTaskStatus();
  const { data: templates } = useTemplates(plan.procedureId);

  const handleAssignDraft = (draftId: string) => {
    assignMut.mutate({ draftId, monthlyPlanId: plan.monthlyPlanId });
  };

  const handleChangeStatus = (id: string, taskType: string) => {
    statusMut.mutate({ id, taskType });
  };

  const allTasks = data?.tasks ?? [];
  const drafts = data?.drafts ?? [];

  // Group tasks
  const incompleteTasks = allTasks.filter(t =>
    t.task_type === 'incomplete' && t.source !== 'chief' && t.source !== 'head'
  );
  const managerTasks = allTasks.filter(t =>
    (t.source === 'chief' || t.source === 'head') && t.task_type !== 'completed'
  );
  const completedTasks = allTasks.filter(t => t.task_type === 'completed');
  // Own pending/rejected tasks that are not from managers
  const ownPendingTasks = allTasks.filter(t =>
    (t.task_type === 'pending_approval' || t.task_type === 'rejected') &&
    t.source !== 'chief' && t.source !== 'head'
  );
  // All incomplete = own incomplete + own pending/rejected
  const allIncompleteTasks = [...incompleteTasks, ...ownPendingTasks];

  const summary = data?.summary ?? { total: 0, completed: 0, totalHours: 0 };
  const planInfo = data?.planInfo;
  const userRole = data?.currentUserRole ?? 'employee';

  const activeTemplates = (templates ?? []).filter(t => t.is_active);

  const MONTH_NAMES = ['','Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
  const monthLabel = planInfo?.month ? `${MONTH_NAMES[planInfo.month]} ${planInfo.year}` : '';
  const pct = planInfo?.plannedHours ? Math.round((summary.totalHours / planInfo.plannedHours) * 100) : 0;

  return (
    <div className="detail-wrap flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="detail-hdr px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-sm bg-indigo-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-slate-700 flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {plan.procedureName}
          </span>
          {!readOnly && (
            <button className="action-btn" aria-label="Додати задачу" onClick={onAddTask}>
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          <button className="action-btn" onClick={onClose} aria-label="Закрити">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="hdr-sep" />

      {/* Plan info */}
      {(planInfo?.description || (planInfo?.companies && planInfo.companies.length > 0)) && (
        <div className="px-4 py-2 flex-shrink-0 border-b border-slate-200/30 bg-slate-50/30">
          {planInfo?.description && (
            <div className={cn('text-[11px] text-amber-700 leading-normal px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200/60', planInfo?.companies?.length ? 'mb-1.5' : '')}>
              {planInfo.description}
            </div>
          )}
          {planInfo?.companies && planInfo.companies.length > 0 && (
            <div className="detail-companies flex items-center gap-1 flex-wrap">
              <span className="text-[10px] text-slate-400 font-medium">Компанії:</span>
              {planInfo.companies.map(name => (
                <span key={name} className="company-chip text-[10px] py-0.5 px-1.5 rounded bg-indigo-500/[0.08] text-indigo-500 font-medium">
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tasks scroll — grouped */}
      <div className="tasks-scroll custom-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Spinner size="sm" /></div>
        ) : (
          <>
            {/* 1. Незавершені задачі */}
            <TaskGroup icon="○" name="Незавершені задачі" subtitle="потребують часу"
              count={allIncompleteTasks.length} accentClass="text-blue-600"
              action={!readOnly ? (
                <button className="action-btn-small" onClick={onAddTask} title="Додати задачу">
                  <Plus className="h-3 w-3" />
                </button>
              ) : undefined}>
              {allIncompleteTasks.map(task => (
                <TaskRow key={task.daily_task_id} task={task} userRole={userRole}
                  onDelete={(id) => deleteMut.mutate(id)} onChangeStatus={handleChangeStatus}
                  onEdit={onEditTask} readOnly={readOnly} />
              ))}
            </TaskGroup>

            {/* 2. Задачі керівництва */}
            <TaskGroup icon="⏳" name="Задачі керівництва" subtitle="призначені chief / head"
              count={managerTasks.length} accentClass="text-amber-600">
              {managerTasks.map(task => (
                <TaskRow key={task.daily_task_id} task={task} userRole={userRole}
                  onDelete={(id) => deleteMut.mutate(id)} onChangeStatus={handleChangeStatus}
                  onEdit={onEditTask} readOnly={readOnly} />
              ))}
            </TaskGroup>

            {/* 3. Чернетки */}
            {!readOnly && (
              <TaskGroup icon="📝" name="Чернетки" subtitle="збережені з нарад"
                count={drafts.length} accentClass="text-slate-700"
                action={
                  <button className="action-btn-small" title="Нова чернетка">
                    <Plus className="h-3 w-3" />
                  </button>
                }>
                {drafts.map(draft => (
                  <DraftRow key={draft.daily_task_id} draft={draft} onAssign={handleAssignDraft} isPending={assignMut.isPending} />
                ))}
              </TaskGroup>
            )}

            {/* 4. Шаблони задач */}
            <TaskGroup icon="📋" name="Шаблони задач" subtitle="швидке створення"
              count={activeTemplates.length} accentClass="text-slate-700"
              defaultOpen={false}>
              {activeTemplates.map(tpl => (
                <div key={tpl.id}
                  className="task-row pp-task-row group/task hover:bg-slate-50/50 cursor-grab active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/planner-template', JSON.stringify({
                      type: 'template',
                      templateId: tpl.id,
                      title: tpl.title,
                      monthlyPlanId: plan.monthlyPlanId,
                      durationMinutes: 60,
                      procedureName: plan.procedureName,
                    }));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => onAddFromTemplate?.({ title: tpl.title, content: tpl.content })}>
                  <div className="pp-task-check" style={{ borderColor: '#a5b4fc', borderStyle: 'dashed' }} title="Перетягніть у календар" />
                  <span className="flex-1 min-w-0 overflow-hidden">
                    <span className="block text-xs font-semibold text-slate-800 truncate">{tpl.title}</span>
                    <span className="block text-[10px] text-slate-500 truncate">{tpl.content}</span>
                  </span>
                  <div className="row-actions">
                    <button className="action-btn-small text-indigo-500" title="Створити задачу з шаблону">
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </TaskGroup>

            {/* 5. Завершені */}
            <TaskGroup icon="✓" name="Завершені" subtitle="узгоджені задачі"
              count={completedTasks.length} accentClass="text-emerald-600"
              defaultOpen={false}>
              {completedTasks.map(task => (
                <TaskRow key={task.daily_task_id} task={task} userRole={userRole}
                  onDelete={(id) => deleteMut.mutate(id)} onChangeStatus={handleChangeStatus}
                  onEdit={onEditTask} readOnly={readOnly} />
              ))}
            </TaskGroup>

            {allTasks.length === 0 && drafts.length === 0 && activeTemplates.length === 0 && (
              <div className="text-center py-5">
                <p className="text-[13px] text-slate-400">Задач ще немає</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer: grouped summary */}
      <div className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border-t border-slate-200/60 bg-slate-50 flex-wrap">
        <div className="flex-1 min-w-[50px]">
          <div className="text-[9px] text-slate-400">Незаверш</div>
          <div className="text-sm font-extrabold text-blue-600">{allIncompleteTasks.length}</div>
        </div>
        <div className="flex-1 min-w-[50px]">
          <div className="text-[9px] text-slate-400">Керівн</div>
          <div className="text-sm font-extrabold text-amber-600">{managerTasks.length}</div>
        </div>
        <div className="flex-1 min-w-[50px]">
          <div className="text-[9px] text-slate-400">Чернетки</div>
          <div className="text-sm font-extrabold text-slate-800">{drafts.length}</div>
        </div>
        <div className="flex-1 min-w-[50px]">
          <div className="text-[9px] text-slate-400">Шаблони</div>
          <div className="text-sm font-extrabold text-slate-800">{activeTemplates.length}</div>
        </div>
        <div className="border-l border-slate-200 pl-2 ml-1">
          {monthLabel && <span className="text-[10px] font-semibold text-slate-400">{monthLabel} </span>}
          <span className="text-[11px] font-semibold text-slate-800">
            {summary.totalHours}/{planInfo?.plannedHours ?? plan.plannedHours} год
          </span>
          {pct > 0 && (
            <span className={cn('text-[10px] font-bold ml-1', pct >= 100 ? 'text-emerald-600' : pct >= 70 ? 'text-blue-500' : 'text-amber-500')}>
              {pct}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
