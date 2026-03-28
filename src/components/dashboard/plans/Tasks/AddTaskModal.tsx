import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/shared/db-client';
import { MonthlyPlan, getMonthName } from '@/types/planning';
import { Modal } from '@/components/ui/Modal';
import TaskFileUpload from './TaskFileUpload';
import { getWeeklyTasksSpentHours, getTaskCompanies, updateTaskCompanies } from '@/hooks/useTaskOps';
import { useProjectsForTask } from '@/hooks/useProjects';
import { useCompanies } from '@/hooks/useCompanies';
import { AlertTriangle, Clock, Calendar, FileText, Paperclip, Folder, Check, X } from 'lucide-react';
import CompanyDistributionSelector from './CompanyDistributionSelector';
import { cn } from '@/lib/shared/utils';
import { getErrorMessage } from '@/lib/shared/utils/error-message';
import logger from '@/lib/shared/logger';
import type { HourDistributionType } from '@/types/infrastructure';
import { HOUR_DISTRIBUTION_TYPES } from '@/types/infrastructure';
import TaskTemplatePicker from './TaskTemplatePicker';
import AITextCleanup from '@/components/ui/AITextCleanup';

interface CompanyInfra {
  servers_count: number;
  workstations_count: number;
}

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  monthlyPlanId: string;
  userId: string;
  userDepartmentId?: string;
  task?: {
    daily_task_id?: string;
    description?: string;
    title?: string | null;
    source?: string;
    spent_hours?: number;
    task_date?: string;
    attachment_url?: string | null;
    document_number?: string | null;
    project_id?: string | null;
    distribution_type?: string;
    kb_document_id?: string | null;
  } | null;
  monthlyPlan?: MonthlyPlan;
  planCompanyIds?: string[];
  planDistributionType?: HourDistributionType;
  planProjectIds?: string[];
  /** company_id → {servers_count, workstations_count} for % display */
  companyInfraMap?: Map<string, CompanyInfra>;
  /** Role of the creator (chief/head) — written to source when assigning to another user.
   *  Must only be set when the creator is different from the plan owner. */
  creatorRole?: string;
  /** KB documents selected for this plan */
  planDocuments?: { id: string; title: string; source_filename: string }[];
}


const EMPTY_STRING_ARRAY: string[] = [];

interface ServiceHistoryItem {
  description: string;
  spent_hours: number;
  task_date?: string;
}

const AddTaskModal: React.FC<AddTaskModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  monthlyPlanId,
  userId,
  userDepartmentId,
  task,
  monthlyPlan,
  planCompanyIds = EMPTY_STRING_ARRAY,
  planDistributionType = 'even',
  planProjectIds = EMPTY_STRING_ARRAY,
  companyInfraMap,
  creatorRole,
  planDocuments = [],
}) => {
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState<'manual' | 'template' | 'manager' | 'calendar' | 'chief' | 'head'>('manual');
  const [spentHours, setSpentHours] = useState(0);
  const [taskDate, setTaskDate] = useState<string | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [kbDocumentId, setKbDocumentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // documentText extraction disabled
  const [weeklyHoursUsed, setWeeklyHoursUsed] = useState(0);
  const [hoursWarning, setHoursWarning] = useState<string | null>(null);
  const [serviceHistory, setServiceHistory] = useState<ServiceHistoryItem[]>([]);
  const [taskCompanyIds, setTaskCompanyIds] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  // Загрузка справочника компаний для отображения имён
  const { companies: allCompanies } = useCompanies();

  // Загрузка проектов для dropdown (фильтр по департаменту)
  const { options: allProjectOptions, loading: projectsLoading } = useProjectsForTask(userDepartmentId);

  // Фильтрация проектов по разрешённым в плане (пусто = все разрешены)
  const projectOptions = useMemo(() => {
    if (planProjectIds.length === 0) return allProjectOptions;
    return allProjectOptions.filter(p => planProjectIds.includes(p.project_id));
  }, [allProjectOptions, planProjectIds]);

  // Имена компаний плана для отображения чипов
  const planCompaniesInfo = useMemo(() => {
    return planCompanyIds
      .map(id => allCompanies.find(c => c.company_id === id))
      .filter(Boolean) as { company_id: string; company_name: string }[];
  }, [planCompanyIds, allCompanies]);

  // Лейбл distribution type
  const distributionLabel = useMemo(() => {
    return HOUR_DISTRIBUTION_TYPES.find(d => d.type === planDistributionType)?.label || 'Поровну';
  }, [planDistributionType]);

  // % доли компаний — пересчитывается при toggle
  const companyShares = useMemo(() => {
    const shares = new Map<string, number>();
    if (taskCompanyIds.length === 0) return shares;

    if (planDistributionType === 'even') {
      const pct = Math.round(100 / taskCompanyIds.length);
      for (const id of taskCompanyIds) shares.set(id, pct);
      return shares;
    }

    if (!companyInfraMap) return shares;
    const field = planDistributionType === 'by_servers' ? 'servers_count' : 'workstations_count';
    const values = taskCompanyIds.map(id => ({
      id,
      val: companyInfraMap.get(id)?.[field] || 0,
    }));
    const total = values.reduce((s, v) => s + v.val, 0);
    if (total === 0) return shares;
    for (const v of values) shares.set(v.id, Math.round((v.val / total) * 100));
    return shares;
  }, [taskCompanyIds, planDistributionType, companyInfraMap]);

  // Заполнение полей при редактировании задачи
  useEffect(() => {
    if (isOpen && task) {
      setDescription(task.description || '');
      setTitle(task.title || '');
      setSource((task.source as 'manual' | 'template' | 'manager' | 'calendar' | 'chief' | 'head') || 'manual');
      setSpentHours(Number(task.spent_hours) || 0);

      if (task.task_date) {
        const dateObj = new Date(task.task_date);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        setTaskDate(`${year}-${month}-${day}`);
      } else {
        setTaskDate(null);
      }

      setAttachmentUrl(task.attachment_url || '');
      setDocumentNumber(task.document_number || '');
      setProjectId(task.project_id || null);
      setKbDocumentId(task.kb_document_id || null);

      // Edit mode: load task companies from DB
      if (task.daily_task_id) {
        getTaskCompanies(task.daily_task_id).then(ids => {
          setTaskCompanyIds(ids);
        });
      } else {
        setTaskCompanyIds([...planCompanyIds]);
      }
    } else if (isOpen && !task) {
      setDescription('');
      setTitle('');
      setSource((creatorRole === 'chief' || creatorRole === 'head') ? creatorRole : 'manual');
      setSpentHours(0);
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      setTaskDate(`${year}-${month}-${day}`);
      setAttachmentUrl('');
      setDocumentNumber('');
      setProjectId(null);
      setKbDocumentId(null);
      // Create mode: default to all plan companies
      setTaskCompanyIds([...planCompanyIds]);
    }
    // Reset UI state when modal opens/closes
    if (isOpen) {
      setError(null);
    }
  }, [isOpen, task, planCompanyIds, creatorRole]);

  // Проверка недельного лимита часов (40 часов/неделя)
  useEffect(() => {
    if (!taskDate || !userId) return;

    const checkWeeklyHours = async () => {
      const hoursUsed = await getWeeklyTasksSpentHours(userId, taskDate);
      setWeeklyHoursUsed(hoursUsed);

      // Вычитаем часы текущей редактируемой задачи, если она в той же неделе
      const currentTaskHours = task?.daily_task_id && task?.task_date
        ? Number(task.spent_hours) || 0
        : 0;
      const availableHours = hoursUsed - currentTaskHours;

      if (availableHours >= 40) {
        setHoursWarning(`На этой неделе уже использовано ${availableHours.toFixed(1)} часов`);
      } else {
        setHoursWarning(null);
      }
    };

    checkWeeklyHours();
  }, [taskDate, userId, task]);

  // Проверка при изменении spent_hours (недельный лимит 40 часов)
  useEffect(() => {
    if (!taskDate || !spentHours) {
      setHoursWarning(null);
      return;
    }

    // Вычитаем часы текущей редактируемой задачи, если она в той же неделе
    const currentTaskHours = task?.daily_task_id && task?.task_date
      ? Number(task.spent_hours) || 0
      : 0;
    const totalHours = weeklyHoursUsed - currentTaskHours + spentHours;

    if (totalHours > 40) {
      setHoursWarning(`Превышен лимит: ${totalHours.toFixed(1)} из 40 часов/неделя`);
    } else {
      setHoursWarning(null);
    }
  }, [spentHours, weeklyHoursUsed, taskDate, task]);

  // Загружаем историю задач для AI (по процедуре)
  useEffect(() => {
    if (!isOpen || !monthlyPlan?.procedure_id) return;

    const loadProcedureHistory = async () => {
      try {
        const { data: plans } = await supabase
          .from('monthly_plans')
          .select('monthly_plan_id')
          .eq('procedure_id', monthlyPlan.procedure_id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (plans && plans.length > 0) {
          const planIds = plans.map(p => p.monthly_plan_id);

          const { data: tasks } = await supabase
            .from('daily_tasks')
            .select('description, spent_hours, task_date')
            .in('monthly_plan_id', planIds)
            .order('task_date', { ascending: false })
            .limit(30);

          setServiceHistory((tasks ?? []) as ServiceHistoryItem[]);
        }
      } catch (err: unknown) {
        logger.error('Error loading procedure history:', err);
        setServiceHistory([]);
      }
    };

    loadProcedureHistory();
  }, [isOpen, monthlyPlan?.procedure_id]);

  // Document text auto-generation disabled

  const saveTask = useCallback(async (finalDescription: string) => {
    if (task?.daily_task_id) {
      const updatedType = spentHours > 0 ? 'completed' : 'incomplete';
      const { error: updateError } = await supabase
        .from('daily_tasks')
        .update({
          description: finalDescription,
          title: title || null,
          task_type: updatedType,
          ...(updatedType === 'completed' ? { completed_at: new Date().toISOString() } : { completed_at: null }),
          spent_hours: spentHours,
          task_date: taskDate,
          attachment_url: attachmentUrl || null,
          document_number: documentNumber || null,
          project_id: projectId || null,
          kb_document_id: kbDocumentId || null,
          distribution_type: planDistributionType,
        })
        .eq('daily_task_id', task.daily_task_id);

      if (updateError) throw updateError;
      // Update task companies
      await updateTaskCompanies(task.daily_task_id, taskCompanyIds);
    } else {
      const taskType = spentHours > 0 ? 'completed' : 'incomplete';
      const { data: inserted, error: insertError } = await supabase
        .from('daily_tasks')
        .insert({
          monthly_plan_id: monthlyPlanId,
          user_id: userId,
          description: finalDescription,
          title: title || null,
          source,
          task_type: taskType,
          ...(taskType === 'completed' ? { completed_at: new Date().toISOString() } : {}),
          spent_hours: spentHours,
          task_date: taskDate,
          attachment_url: attachmentUrl || null,
          document_number: documentNumber || null,
          project_id: projectId || null,
          kb_document_id: kbDocumentId || null,
          distribution_type: planDistributionType,
        })
        .select('daily_task_id')
        .single();

      if (insertError) throw insertError;
      // Save task companies
      if (inserted?.daily_task_id) {
        await updateTaskCompanies(inserted.daily_task_id, taskCompanyIds);
      }
    }
  }, [task, title, source, spentHours, taskDate, attachmentUrl, documentNumber, projectId, kbDocumentId, monthlyPlanId, userId, planDistributionType, taskCompanyIds]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // cleanup usage removed

    try {
      // Weekly hours check
      const currentTaskHours = task?.daily_task_id && task?.task_date
        ? Number(task.spent_hours) || 0
        : 0;
      const totalHours = weeklyHoursUsed - currentTaskHours + spentHours;

      if (totalHours > 40) {
        throw new Error(`Превышен недельный лимит: ${totalHours.toFixed(1)} из 40 часов`);
      }

      // Save as-is — AI cleanup only via explicit AI button click
      const finalDescription = description.trim();

      await saveTask(finalDescription);

      // Auto-save to RAG (fire-and-forget, only new tasks with procedure)
      const shouldSaveRAG = !task?.daily_task_id && finalDescription.length >= 10 && !!monthlyPlan?.procedure_id;
      logger.info('[RAG] condition:', shouldSaveRAG, { hasTask: !!task?.daily_task_id, len: finalDescription.length, procId: monthlyPlan?.procedure_id });
      if (shouldSaveRAG) {
        fetch('/api/ai/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            content: finalDescription,
            category: 'task_description',
            procedure_id: monthlyPlan!.procedure_id,
            source: 'auto',
          }),
        }).then(r => {
          if (!r.ok) r.text().then(t => logger.error('[RAG] FAILED:', r.status, t));
          else logger.info('[RAG] OK — saved to vector DB');
        }).catch(err => logger.error('[RAG] ERROR:', err));
      }

      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err) || `Ошибка при ${task ? 'редактировании' : 'добавлении'} задачи`);
    } finally {
      setLoading(false);
    }
  };

  const procedureName = monthlyPlan?.procedure_name;
  const monthYear = monthlyPlan ? `${getMonthName(monthlyPlan.month, 'ru')} ${monthlyPlan.year}` : '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={task ? 'Редактировать задачу' : 'Новая задача'}
      headerVariant="gradient-indigo"
      showCloseButton={false}
      headerActions={
        <>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors backdrop-blur-sm disabled:opacity-50"
            aria-label="Отмена"
            disabled={loading}
          >
            <X className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors backdrop-blur-sm disabled:opacity-50"
            aria-label="Сохранить"
            disabled={loading || !!hoursWarning}
          >
            <Check className="w-5 h-5" />
          </button>
        </>
      }
    >
      <div className="space-y-5">

        {/* Procedure info chip */}
        {procedureName && (
          <div className="flex items-center gap-3 px-3 py-2 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm border border-indigo-100">
              <FileText className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-0.5">{monthYear}</p>
              <p className="text-xs font-medium text-slate-700 truncate">{procedureName}</p>
            </div>
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">
              Назва задачі
            </label>
            <input
              type="text"
              className={cn(
                "w-full px-3 py-2 text-xs border border-slate-200 rounded-xl transition-colors",
                "placeholder:text-slate-400",
                "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
                "disabled:bg-slate-50 disabled:text-slate-500"
              )}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Коротка назва (необов'язково)"
              maxLength={200}
              disabled={loading}
              aria-label="Назва задачі"
            />
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider pl-1">
                Опис задачі <span className="text-red-500">*</span>
              </label>
              <AITextCleanup
                text={description}
                onResult={setDescription}
                category="task_description"
                procedureId={monthlyPlan?.procedure_id || undefined}
                procedureName={monthlyPlan?.procedure_name || undefined}
                projectNames={projectId ? [projectOptions.find(p => p.project_id === projectId)?.project_name].filter(Boolean) as string[] : undefined}
                disabled={loading}
                statusBefore
                persistDone
              />
            </div>
            <textarea
              className={cn(
                "w-full px-3 py-2.5 text-xs border rounded-xl resize-none transition-colors",
                "placeholder:text-slate-400",
                "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
                "disabled:bg-slate-50 disabled:text-slate-500"
              )}
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              required
              disabled={loading}
              placeholder="Опишите выполненную работу..."
            />
            {/* Template suggestions */}
            <TaskTemplatePicker
              procedureId={monthlyPlan?.procedure_id || undefined}
              onSelect={(content, templateTitle) => {
                setDescription(content);
                setTitle(templateTitle);
                setSource('template');
              }}
            />
          </div>

          {/* Companies */}
          {planCompaniesInfo.length > 0 && (
            <CompanyDistributionSelector
              companies={planCompaniesInfo}
              selectedIds={taskCompanyIds}
              onToggle={(companyId) => setTaskCompanyIds(prev =>
                prev.includes(companyId)
                  ? prev.filter(id => id !== companyId)
                  : [...prev, companyId]
              )}
              distributionLabel={distributionLabel}
              companyShares={companyShares}
              disabled={loading}
            />
          )}

          {/* Hours, Date & Document - responsive layout */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
            {/* Hours and Date row on mobile */}
            <div className="flex gap-2">
              <div className="flex-shrink-0">
                <label className="flex items-center gap-1.5 text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  Часы
                </label>
                <input
                  type="number"
                  className={cn(
                    "w-20 sm:w-16 px-2 py-2.5 sm:py-2 text-sm text-center border rounded-xl transition-colors",
                    "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
                    hoursWarning ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
                  )}
                  value={spentHours}
                  onChange={e => setSpentHours(Number(e.target.value))}
                  onFocus={e => e.target.select()}
                  min={0}
                  max={40}
                  step={0.5}
                  disabled={loading}
                  aria-label="Количество часов"
                />
                {hoursWarning ? (
                  <div className="w-20 sm:w-16 mt-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-2xs text-center" role="alert">
                    {hoursWarning}
                  </div>
                ) : taskDate && weeklyHoursUsed > 0 && (
                  <div className="w-20 sm:w-16 mt-1 py-px bg-amber-50 text-amber-600 border border-amber-200 rounded-md text-3xs text-center whitespace-nowrap">
                    {weeklyHoursUsed.toFixed(1)}/40ч
                  </div>
                )}
              </div>

              <div className="flex-1 sm:w-32 sm:flex-shrink-0 sm:flex-grow-0">
                <label className="flex items-center gap-1.5 text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
                  <Calendar className="w-3 h-3" aria-hidden="true" />
                  Дата
                </label>
                <input
                  type="date"
                  className={cn(
                    "w-full px-2 py-2.5 sm:py-2 text-sm border border-slate-200 rounded-xl transition-colors",
                    "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  )}
                  value={taskDate || ''}
                  onChange={e => setTaskDate(e.target.value || null)}
                  disabled={loading}
                  aria-label="Дата задачи"
                />
              </div>
            </div>

            {/* Document number - full width on mobile */}
            <div className="flex-1">
              <label className="flex items-center gap-1.5 text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
                <FileText className="w-3 h-3" aria-hidden="true" />
                № документа
              </label>
              <input
                type="text"
                className={cn(
                  "w-full px-3 py-2.5 sm:py-2 text-sm border border-slate-200 rounded-xl transition-colors",
                  "placeholder:text-slate-400",
                  "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                )}
                value={documentNumber}
                onChange={e => setDocumentNumber(e.target.value)}
                placeholder="№ акта, заявки..."
                disabled={loading}
                aria-label="Номер документа"
              />
            </div>
          </div>

          {/* Project dropdown (optional) */}
          {projectOptions.length > 0 && (
            <div>
              <label className="flex items-center gap-1.5 text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
                <Folder className="w-3 h-3" aria-hidden="true" />
                Проект
              </label>
              <select
                className={cn(
                  "w-full px-3 py-2 text-xs border rounded-xl transition-colors appearance-none bg-white",
                  "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
                  "disabled:bg-slate-50 disabled:text-slate-500",
                  projectId ? "border-emerald-300 text-slate-700" : "border-slate-200 text-slate-500"
                )}
                value={projectId || ''}
                onChange={e => setProjectId(e.target.value || null)}
                disabled={loading || projectsLoading}
                aria-label="Проект"
              >
                <option value="">— не обрано —</option>
                {projectOptions.map(project => (
                  <option key={project.project_id} value={project.project_id}>
                    {project.project_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* KB Document dropdown */}
          {planDocuments.length > 0 && (
            <div>
              <label className="flex items-center gap-1.5 text-3xs font-bold text-blue-400 uppercase tracking-wider mb-1.5 pl-1">
                <FileText className="w-3 h-3" aria-hidden="true" />
                Документ ІБ
              </label>
              <select
                className={cn(
                  "w-full px-3 py-2 text-xs border rounded-xl transition-colors appearance-none bg-white",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400",
                  "disabled:bg-slate-50 disabled:text-slate-500",
                  kbDocumentId ? "border-blue-300 text-slate-700" : "border-slate-200 text-slate-500"
                )}
                value={kbDocumentId || ''}
                onChange={e => setKbDocumentId(e.target.value || null)}
                disabled={loading}
                aria-label="Документ ІБ"
              >
                <option value="">— не обрано —</option>
                {planDocuments.map(doc => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title || doc.source_filename}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* File upload */}
          <div>
            <label className="flex items-center gap-1.5 text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
              <Paperclip className="w-4 h-4" />
              Вложения
            </label>
            <TaskFileUpload
              documentNumber={documentNumber}
              taskId={task?.daily_task_id}
              completedAt={taskDate || undefined}
              onUploadComplete={(url) => setAttachmentUrl(url)}
              onDocumentNumberExtracted={(num) => setDocumentNumber(num)}
              currentUrl={attachmentUrl}
              disabled={loading}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </form>
      </div>
    </Modal>
  );
};

export default AddTaskModal;


