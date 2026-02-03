import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MonthlyPlan, getMonthName } from '@/types/planning';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import TaskFileUpload from './TaskFileUpload';
import { getDailyTasksSpentHours } from '@/lib/tasks/task-service';
import { Sparkles, AlertTriangle, Clock, Calendar, FileText, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  monthlyPlanId: string;
  userId: string;
  task?: {
    daily_task_id?: string;
    description?: string;
    spent_hours?: number;
    task_date?: string;
    attachment_url?: string;
    document_number?: string;
  } | null;
  monthlyPlan?: MonthlyPlan;
}

const AddTaskModal: React.FC<AddTaskModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  monthlyPlanId,
  userId,
  task,
  monthlyPlan
}) => {
  const [description, setDescription] = useState('');
  const [spentHours, setSpentHours] = useState(0);
  const [taskDate, setTaskDate] = useState<string | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentText, setDocumentText] = useState<string>('');
  const [dailyHoursUsed, setDailyHoursUsed] = useState(0);
  const [hoursWarning, setHoursWarning] = useState<string | null>(null);
  const [serviceHistory, setServiceHistory] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>('');

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
    }
  }, [isOpen, task]);

  // Проверка суточного лимита часов
  useEffect(() => {
    if (!taskDate || !userId) return;

    const checkDailyHours = async () => {
      const hoursUsed = await getDailyTasksSpentHours(userId, taskDate);
      setDailyHoursUsed(hoursUsed);

      const currentTaskHours = task?.daily_task_id && task?.task_date === taskDate
        ? Number(task.spent_hours) || 0
        : 0;
      const availableHours = hoursUsed - currentTaskHours;

      if (availableHours >= 8) {
        setHoursWarning(`На ${taskDate} уже использовано ${availableHours.toFixed(1)} часов`);
      } else {
        setHoursWarning(null);
      }
    };

    checkDailyHours();
  }, [taskDate, userId, task]);

  // Проверка при изменении spent_hours
  useEffect(() => {
    if (!taskDate || !spentHours) {
      setHoursWarning(null);
      return;
    }

    const currentTaskHours = task?.daily_task_id && task?.task_date === taskDate
      ? Number(task.spent_hours) || 0
      : 0;
    const totalHours = dailyHoursUsed - currentTaskHours + spentHours;

    if (totalHours > 8) {
      setHoursWarning(`Превышен лимит: ${totalHours.toFixed(1)} из 8 часов`);
    } else {
      setHoursWarning(null);
    }
  }, [spentHours, dailyHoursUsed, taskDate, task]);

  // Загружаем историю задач для AI
  useEffect(() => {
    if (!isOpen || !monthlyPlan?.service_name) return;

    const loadServiceHistory = async () => {
      try {
        const { data: plans } = await supabase
          .from('monthly_plans')
          .select('monthly_plan_id')
          .eq('service_name', monthlyPlan.service_name)
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
      } catch (err) {
        console.error('Error loading service history:', err);
        setServiceHistory([]);
      }
    };

    loadServiceHistory();
  }, [isOpen, monthlyPlan?.service_name]);

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
      const currentTaskHours = task?.daily_task_id && task?.task_date === taskDate
        ? Number(task.spent_hours) || 0
        : 0;
      const totalHours = dailyHoursUsed - currentTaskHours + spentHours;

      if (totalHours > 8) {
        throw new Error(`Превышен суточный лимит: ${totalHours.toFixed(1)} из 8 часов`);
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
          });

        if (insertError) throw insertError;
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || `Ошибка при ${task ? 'редактировании' : 'добавлении'} задачи`);
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
                service_name: monthlyPlan.service_name || '',
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
        throw new Error(data.error || 'Помилка AI');
      }

      const match = data.response.match(/"([^"]+)"/);
      if (match) {
        setDescription(match[1]);
      }

      const docNumMatch = data.response.match(/(?:📋\s*)?Номер СЗ:\s*([^\n]+)/i);
      let hasDocNum = false;
      if (docNumMatch) {
        const num = docNumMatch[1].trim();
        if (num.toLowerCase() !== 'не найден' && num.toLowerCase() !== 'не знайдено') {
          setDocumentNumber(num);
          hasDocNum = true;
        }
      }

      if (hasDocNum || !match) {
        setAiResponse(data.response);
      }

    } catch (error: any) {
      setAiResponse(`Ошибка: ${error.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const serviceName = monthlyPlan?.service_name || (monthlyPlan as any)?.title;
  const monthYear = monthlyPlan ? `${getMonthName(monthlyPlan.month, 'ru')} ${monthlyPlan.year}` : '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={task ? 'Редактировать задачу' : 'Новая задача'}>
      <div className="space-y-5">

        {/* Service info chip */}
        {serviceName && (
          <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <FileText className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-indigo-500 font-medium">{monthYear}</p>
              <p className="text-sm text-gray-800 truncate">{serviceName}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
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
                "w-full px-3 py-2.5 text-sm border rounded-xl resize-none transition-all",
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
                <label className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1.5">
                  <Clock className="w-3 h-3 text-gray-400" aria-hidden="true" />
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
                <label className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1.5">
                  <Calendar className="w-3 h-3 text-gray-400" aria-hidden="true" />
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
              <label className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1.5">
                <FileText className="w-3 h-3 text-gray-400" aria-hidden="true" />
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
                placeholder="№ акту, заявки..."
                disabled={loading}
                aria-label="Номер документа"
              />
            </div>
          </div>

          {/* Hours warning */}
          {hoursWarning ? (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{hoursWarning}</span>
            </div>
          ) : taskDate && dailyHoursUsed > 0 && (
            <p className="text-xs text-gray-400 px-1">
              На {taskDate}: {dailyHoursUsed.toFixed(1)} / 8 ч. использовано
            </p>
          )}

          {/* File upload */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
              <Paperclip className="w-4 h-4 text-gray-400" />
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

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
            >
              Отменить
            </Button>
            <Button
              type="submit"
              disabled={loading || !!hoursWarning}
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default AddTaskModal;
