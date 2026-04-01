import { useState, useEffect, useCallback } from 'react';
import { supabase as db } from '@/lib/shared/db-client';
import { getWeeklyTasksSpentHours, getTaskCompanies, updateTaskCompanies } from '@/hooks/useTaskOps';
import logger from '@/lib/shared/logger';
import type { HourDistributionType } from '@/types/infrastructure';

export interface ServiceHistoryItem {
  description: string;
  spent_hours: number;
  task_date?: string;
}

interface SaveTaskParams {
  dailyTaskId?: string;
  monthlyPlanId: string;
  userId: string;
  description: string;
  title: string;
  source: string;
  spentHours: number;
  taskDate: string | null;
  attachmentUrl: string;
  documentNumber: string;
  projectId: string | null;
  kbDocumentId: string | null;
  planDistributionType: HourDistributionType;
  taskCompanyIds: string[];
}

export function useProcedureHistory(isOpen: boolean, procedureId?: string) {
  const [serviceHistory, setServiceHistory] = useState<ServiceHistoryItem[]>([]);

  useEffect(() => {
    if (!isOpen || !procedureId) return;

    const load = async () => {
      try {
        const { data: plans } = await db
          .from('monthly_plans')
          .select('monthly_plan_id')
          .eq('procedure_id', procedureId)
          .order('created_at', { ascending: false })
          .limit(10);

        if (plans && plans.length > 0) {
          const planIds = plans.map(p => p.monthly_plan_id);
          const { data: tasks } = await db
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

    load();
  }, [isOpen, procedureId]);

  return serviceHistory;
}

export function useWeeklyHoursCheck(
  userId: string,
  taskDate: string | null,
  spentHours: number,
  editingTaskHours: number
) {
  const [weeklyHoursUsed, setWeeklyHoursUsed] = useState(0);
  const [hoursWarning, setHoursWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!taskDate || !userId) return;
    getWeeklyTasksSpentHours(userId, taskDate).then(setWeeklyHoursUsed);
  }, [taskDate, userId]);

  useEffect(() => {
    if (!taskDate || !spentHours) {
      setHoursWarning(null);
      return;
    }
    const totalHours = weeklyHoursUsed - editingTaskHours + spentHours;
    if (totalHours > 40) {
      setHoursWarning(`Превышен лимит: ${totalHours.toFixed(1)} из 40 часов/неделя`);
    } else {
      setHoursWarning(null);
    }
  }, [spentHours, weeklyHoursUsed, taskDate, editingTaskHours]);

  return { weeklyHoursUsed, hoursWarning };
}

export function useTaskCompanyIds(
  isOpen: boolean,
  dailyTaskId?: string,
  planCompanyIds: string[] = []
) {
  const [taskCompanyIds, setTaskCompanyIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    if (dailyTaskId) {
      getTaskCompanies(dailyTaskId).then(setTaskCompanyIds);
    } else {
      setTaskCompanyIds([...planCompanyIds]);
    }
  }, [isOpen, dailyTaskId, planCompanyIds]);

  const toggleCompany = useCallback((companyId: string) => {
    setTaskCompanyIds(prev =>
      prev.includes(companyId) ? prev.filter(id => id !== companyId) : [...prev, companyId]
    );
  }, []);

  return { taskCompanyIds, setTaskCompanyIds, toggleCompany };
}

export function useSaveTask() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveTask = useCallback(async (params: SaveTaskParams) => {
    setLoading(true);
    setError(null);

    try {
      if (params.dailyTaskId) {
        const updatedType = params.spentHours > 0 ? 'completed' : 'incomplete';
        const { error: updateError } = await db
          .from('daily_tasks')
          .update({
            description: params.description,
            title: params.title || null,
            task_type: updatedType,
            ...(updatedType === 'completed' ? { completed_at: new Date().toISOString() } : { completed_at: null }),
            spent_hours: params.spentHours,
            task_date: params.taskDate,
            attachment_url: params.attachmentUrl || null,
            document_number: params.documentNumber || null,
            project_id: params.projectId || null,
            kb_document_id: params.kbDocumentId || null,
            distribution_type: params.planDistributionType,
          })
          .eq('daily_task_id', params.dailyTaskId);

        if (updateError) throw updateError;
        await updateTaskCompanies(params.dailyTaskId, params.taskCompanyIds);
      } else {
        const taskType = params.spentHours > 0 ? 'completed' : 'incomplete';
        const { data: inserted, error: insertError } = await db
          .from('daily_tasks')
          .insert({
            monthly_plan_id: params.monthlyPlanId,
            user_id: params.userId,
            description: params.description,
            title: params.title || null,
            source: params.source,
            task_type: taskType,
            ...(taskType === 'completed' ? { completed_at: new Date().toISOString() } : {}),
            spent_hours: params.spentHours,
            task_date: params.taskDate,
            attachment_url: params.attachmentUrl || null,
            document_number: params.documentNumber || null,
            project_id: params.projectId || null,
            kb_document_id: params.kbDocumentId || null,
            distribution_type: params.planDistributionType,
          })
          .select('daily_task_id')
          .single();

        if (insertError) throw insertError;
        if (inserted?.daily_task_id) {
          await updateTaskCompanies(inserted.daily_task_id, params.taskCompanyIds);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { saveTask, loading, error, setError };
}
