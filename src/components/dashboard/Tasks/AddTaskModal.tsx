import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { MonthlyPlan, getMonthName } from '@/types/planning';
import { Modal } from '@/components/ui/Modal';
import TaskFileUpload from './TaskFileUpload';
import { getWeeklyTasksSpentHours } from '@/lib/tasks/task-service';
import { useProjectsForTask } from '@/hooks/useProjects';
import { Sparkles, AlertTriangle, Clock, Calendar, FileText, Paperclip, Folder, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/lib/utils/error-message';
import logger from '@/lib/logger';

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
    spent_hours?: number;
    task_date?: string;
    attachment_url?: string | null;
    document_number?: string | null;
    project_id?: string | null;
  } | null;
  monthlyPlan?: MonthlyPlan;
}


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
  monthlyPlan
}) => {
  const [description, setDescription] = useState('');
  const [spentHours, setSpentHours] = useState(0);
  const [taskDate, setTaskDate] = useState<string | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentText, setDocumentText] = useState<string>('');
  const [weeklyHoursUsed, setWeeklyHoursUsed] = useState(0);
  const [hoursWarning, setHoursWarning] = useState<string | null>(null);
  const [serviceHistory, setServiceHistory] = useState<ServiceHistoryItem[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>('');
  const formRef = useRef<HTMLFormElement>(null);

  // Загрузка проектов для dropdown (фильтр по департаменту)
  const { options: projectOptions, loading: projectsLoading } = useProjectsForTask(userDepartmentId);

  // Заполнение полей при редактировании задачи
  useEffect(() => {
    if (isOpen && task) {
      setDescription(task.description || '');
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
    } else if (isOpen && !task) {
      setDescription('');
      setSpentHours(0);
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      setTaskDate(`${year}-${month}-${day}`);
      setAttachmentUrl('');
      setDocumentNumber('');
      setProjectId(null);
    }
  }, [isOpen, task]);

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

  // Загружаем историю задач для AI (по мероприятию)
  useEffect(() => {
    if (!isOpen || !monthlyPlan?.measure_id) return;

    const loadMeasureHistory = async () => {
      try {
        const { data: plans } = await supabase
          .from('monthly_plans')
          .select('monthly_plan_id')
          .eq('measure_id', monthlyPlan.measure_id)
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

          setServiceHistory(tasks || []);
        }
      } catch (err: unknown) {
        logger.error('Error loading measure history:', err);
        setServiceHistory([]);
      }
    };

    loadMeasureHistory();
  }, [isOpen, monthlyPlan?.measure_id]);

  // Автогенерация при загрузке документа
  useEffect(() => {
    if (documentText && documentText.length > 50 && !aiLoading && !description) {
      handleAIGenerate();
    }
  }, [documentText]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Вычитаем часы текущей редактируемой задачи, если она в той же неделе
      const currentTaskHours = task?.daily_task_id && task?.task_date
        ? Number(task.spent_hours) || 0
        : 0;
      const totalHours = weeklyHoursUsed - currentTaskHours + spentHours;

      if (totalHours > 40) {
        throw new Error(`Превышен недельный лимит: ${totalHours.toFixed(1)} из 40 часов`);
      }

      if (task?.daily_task_id) {
        const { error: updateError } = await supabase
          .from('daily_tasks')
          .update({
            description,
            spent_hours: spentHours,
            task_date: taskDate,
            attachment_url: attachmentUrl || null,
            document_number: documentNumber || null,
            project_id: projectId || null,
          })
          .eq('daily_task_id', task.daily_task_id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('daily_tasks')
          .insert({
            monthly_plan_id: monthlyPlanId,
            user_id: userId,
            description,
            spent_hours: spentHours,
            task_date: taskDate,
            attachment_url: attachmentUrl || null,
            document_number: documentNumber || null,
            project_id: projectId || null,
          });

        if (insertError) throw insertError;
      }

      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err) || `Ошибка при ${task ? 'редактировании' : 'добавлении'} задачи`);
    } finally {
      setLoading(false);
    }
  };

  const handleAIGenerate = async () => {
    if (aiLoading) return;

    setAiLoading(true);
    setAiResponse('');

    try {
      const userMessage = description.trim()
        ? `Улучши описание: ${description}`
        : 'сгенерируй';

      const response = await fetch('/api/ai/task-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: userMessage }],
          context: {
            currentInput: description,
            planHierarchy: {
              monthly: monthlyPlan ? {
                measure_name: monthlyPlan.measure_name || '',
                month_number: monthlyPlan.month || 1,
                year: monthlyPlan.year
              } : undefined,
            },
            userHistory: serviceHistory,
            processDescription: monthlyPlan?.quarterly_plan?.goal,
            documentText,
          }
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка AI');
      }

      const match = data.response.match(/"([^"]+)"/);
      if (match) {
        setDescription(match[1]);
      }

      const docNumMatch = data.response.match(/(?:📋\s*)?Номер СЗ:\s*([^\n]+)/i);
      let hasDocNum = false;
      if (docNumMatch) {
        const num = docNumMatch[1].trim();
        if (num.toLowerCase() !== 'не найден' && num.toLowerCase() !== 'не найдено') {
          setDocumentNumber(num);
          hasDocNum = true;
        }
      }

      if (hasDocNum || !match) {
        setAiResponse(data.response);
      }

    } catch (error: unknown) {
      setAiResponse(`Ошибка: ${getErrorMessage(error)}`);
    } finally {
      setAiLoading(false);
    }
  };

  const measureName = monthlyPlan?.measure_name;
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
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-all backdrop-blur-sm disabled:opacity-50"
            aria-label="Отмена"
            disabled={loading}
          >
            <X className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-all backdrop-blur-sm disabled:opacity-50"
            aria-label="Сохранить"
            disabled={loading || !!hoursWarning}
          >
            <Check className="w-5 h-5" />
          </button>
        </>
      }
    >
      <div className="space-y-5">

        {/* Measure info chip */}
        {measureName && (
          <div className="flex items-center gap-3 px-3 py-2 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm border border-indigo-100">
              <FileText className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-0.5">{monthYear}</p>
              <p className="text-xs font-medium text-slate-700 truncate">{measureName}</p>
            </div>
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
                Описание задачи <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleAIGenerate}
                disabled={loading || aiLoading}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                  "bg-gradient-to-r from-purple-500 to-indigo-500 text-white",
                  "hover:from-purple-600 hover:to-indigo-600 hover:shadow-md",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                )}
              >
                <Sparkles className={cn("w-3.5 h-3.5", aiLoading && "animate-spin")} />
                {aiLoading ? 'Генерация...' : 'AI'}
              </button>
            </div>
            <textarea
              className={cn(
                "w-full px-3 py-2.5 text-xs border rounded-xl resize-none transition-all",
                "placeholder:text-gray-400",
                "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
                "disabled:bg-gray-50 disabled:text-gray-500"
              )}
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              required
              disabled={loading}
              placeholder="Опишите выполненную работу..."
            />
            {aiResponse && (
              <div className="mt-2 p-3 bg-purple-50 border border-purple-100 rounded-xl">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{aiResponse}</p>
                </div>
              </div>
            )}
          </div>

          {/* Hours, Date & Document - responsive layout */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
            {/* Hours and Date row on mobile */}
            <div className="flex gap-2">
              <div className="w-20 sm:w-16 flex-shrink-0">
                <label className="flex items-center gap-1.5 text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  Часы
                </label>
                <input
                  type="number"
                  className={cn(
                    "w-full px-2 py-2.5 sm:py-2 text-sm text-center border rounded-xl transition-all",
                    "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
                    hoursWarning ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                  )}
                  value={spentHours}
                  onChange={e => setSpentHours(Number(e.target.value))}
                  min={0}
                  max={8}
                  step={0.5}
                  disabled={loading}
                  aria-label="Количество часов"
                />
              </div>

              <div className="flex-1 sm:w-32 sm:flex-shrink-0 sm:flex-grow-0">
                <label className="flex items-center gap-1.5 text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
                  <Calendar className="w-3 h-3" aria-hidden="true" />
                  Дата
                </label>
                <input
                  type="date"
                  className={cn(
                    "w-full px-2 py-2.5 sm:py-2 text-sm border border-gray-200 rounded-xl transition-all",
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
                  "w-full px-3 py-2.5 sm:py-2 text-sm border border-gray-200 rounded-xl transition-all",
                  "placeholder:text-gray-400",
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
                Проект (опционально)
              </label>
              <select
                className={cn(
                  "w-full px-3 py-2.5 sm:py-2 text-sm border border-gray-200 rounded-xl transition-all",
                  "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400",
                  "bg-white",
                  !projectId && "text-gray-400"
                )}
                value={projectId || ''}
                onChange={e => setProjectId(e.target.value || null)}
                disabled={loading || projectsLoading}
                aria-label="Выберите проект"
              >
                <option value="">- Без проекта -</option>
                {projectOptions.map(project => (
                  <option key={project.project_id} value={project.project_id}>
                    {project.project_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Hours warning */}
          {hoursWarning ? (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{hoursWarning}</span>
            </div>
          ) : taskDate && weeklyHoursUsed > 0 && (
            <p className="text-xs text-gray-400 px-1">
              На этой неделе: {weeklyHoursUsed.toFixed(1)} / 40 ч. использовано
            </p>
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
              onTextExtracted={(text) => setDocumentText(text)}
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



