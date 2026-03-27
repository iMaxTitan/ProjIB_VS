/**
 * Handlers hook for MonthlyPlanDetails.
 * Handles: save, delete, cancel, status change, task operations, company/assignee toggles.
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/shared/supabase';
import {
  manageMonthlyPlan,
  deleteMonthlyPlan,
  changeMonthlyPlanStatus,
} from '@/lib/ops/plans';
import {
  updateMonthlyPlanCompanies,
  updateMonthlyPlanProjects,
} from '@/lib/ops/plans/monthly-plan-helpers';
import { getErrorMessage } from '@/lib/shared/utils/error-message';
import logger from '@/lib/shared/logger';
import type { MonthlyPlan, PlanStatus } from '@/types/planning';
import type { UserInfo } from '@/types/azure';
import type { UserRole } from '@/types/supabase';
import type { HourDistributionType } from '@/types/infrastructure';
import type { PlanTask } from './useMonthlyPlanData';

const normalizeRole = (role: string | null | undefined): UserRole => {
  if (role === 'chief' || role === 'head' || role === 'employee') return role;
  return 'employee';
};

async function sendPlanNotification(isNewPlan: boolean, targetId: string | undefined, newId: string | undefined, editAssigneeIds: string[], prevIds: string[]) {
  if (isNewPlan && newId) {
    fetch('/api/telegram/notify/plan-created', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyPlanId: newId }),
    }).catch(() => {});
    return;
  }
  if (!isNewPlan && targetId) {
    const newlyAdded = editAssigneeIds.filter(id => !prevIds.includes(id));
    if (newlyAdded.length > 0) {
      fetch('/api/telegram/notify/plan-created', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyPlanId: targetId, notifyUserIds: newlyAdded }),
      }).catch(() => {});
    }
  }
}

interface Params {
  plan: MonthlyPlan;
  user: UserInfo;
  isNewPlan: boolean;
  currentStatus: PlanStatus;
  editMonth: number;
  editPlannedHours: number;
  editQuarterlyId: string;
  editProcedureId: string;
  editAssigneeIds: string[];
  editCompanyIds: string[];
  distributionType: HourDistributionType;
  editProjectIds: string[];
  editDocIds: string[];
  initialAssigneeIdsRef: React.MutableRefObject<string[]>;
  setCurrentStatus: (s: PlanStatus) => void;
  setEditMonth: (m: number) => void;
  setEditPlannedHours: (h: number) => void;
  setEditProcedureId: (id: string) => void;
  setIsEditing: (v: boolean) => void;
  setSaving: (v: boolean) => void;
  setIsTaskModalOpen: (v: boolean) => void;
  setTaskToEdit: (t: PlanTask | null) => void;
  setTasksRefreshTrigger: React.Dispatch<React.SetStateAction<number>>;
  setDistributionType: (t: HourDistributionType) => void;
  onUpdate?: (newId?: string) => void;
  onClose: () => void;
}

export function useMonthlyPlanHandlers(params: Params) {
  const {
    plan, user, isNewPlan, currentStatus, editMonth, editPlannedHours,
    editQuarterlyId, editProcedureId, editAssigneeIds, editCompanyIds,
    distributionType, editProjectIds, editDocIds, initialAssigneeIdsRef,
    setCurrentStatus, setEditMonth, setEditPlannedHours, setEditProcedureId,
    setIsEditing, setSaving, setIsTaskModalOpen, setTaskToEdit,
    setTasksRefreshTrigger, setDistributionType, onUpdate, onClose,
  } = params;

  const handleDelete = useCallback(async () => {
    const result = await deleteMonthlyPlan(plan.monthly_plan_id, user.user_id, user.role);
    if (result.success) { onUpdate?.(); onClose(); }
    else toast.error(result.error || 'Ошибка при удалении');
  }, [plan.monthly_plan_id, user.user_id, user.role, onUpdate, onClose]);

  const onStatusChangeHandler = useCallback(async (newStatus: PlanStatus) => {
    if (isNewPlan) return;
    const oldStatus = currentStatus;
    try {
      setCurrentStatus(newStatus);
      const result = await changeMonthlyPlanStatus(
        plan.monthly_plan_id, newStatus, user.user_id, normalizeRole(user.role), oldStatus
      );
      if (!result.success) throw new Error(result.error || 'Ошибка изменения статуса');
      onUpdate?.();
    } catch (e: unknown) {
      logger.error('Status Change Error:', e);
      setCurrentStatus(oldStatus);
      toast.error(`Ошибка при изменении статуса: ${getErrorMessage(e)}`);
    }
  }, [isNewPlan, currentStatus, plan.monthly_plan_id, user.user_id, user.role, setCurrentStatus, onUpdate]);

  const handleSave = useCallback(async () => {
    if (!editProcedureId) { toast.warning('Выберите процедуру'); return; }
    if (!editQuarterlyId) { toast.warning('Выберите квартальный план'); return; }
    if (editCompanyIds.length === 0) { toast.warning('Виберіть хоча б одне підприємство'); return; }
    setSaving(true);
    try {
      const result = await manageMonthlyPlan({
        action: isNewPlan ? 'create' : 'update',
        monthlyPlanId: isNewPlan ? undefined : plan.monthly_plan_id,
        quarterlyId: editQuarterlyId,
        procedureId: editProcedureId,
        year: plan.year,
        month: editMonth,
        plannedHours: editPlannedHours,
        status: currentStatus,
        assignees: editAssigneeIds,
        userId: user.user_id,
        distributionType,
      });
      const newId = (typeof result === 'string' ? result : result?.monthly_plan_id) ?? undefined;
      const targetId = isNewPlan ? newId : plan.monthly_plan_id;
      if (targetId && targetId !== 'new') {
        await updateMonthlyPlanCompanies(targetId, editCompanyIds);
        await updateMonthlyPlanProjects(targetId, editProjectIds);
        // Save KB documents
        await supabase.from('monthly_plan_documents').delete().eq('monthly_plan_id', targetId);
        if (editDocIds.length > 0) {
          await supabase.from('monthly_plan_documents').insert(
            editDocIds.map(docId => ({ monthly_plan_id: targetId, kb_document_id: docId }))
          );
        }
      }
      setIsEditing(false);
      await sendPlanNotification(isNewPlan, targetId, newId, editAssigneeIds, initialAssigneeIdsRef.current);
      if (!isNewPlan && targetId) {
        const newlyAdded = editAssigneeIds.filter(id => !initialAssigneeIdsRef.current.includes(id));
        if (newlyAdded.length > 0) initialAssigneeIdsRef.current = [...editAssigneeIds];
      }
      onUpdate?.(newId);
    } catch (error: unknown) {
      logger.error('Failed to save plan:', error);
      toast.error(`Ошибка при сохранении: ${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }, [
    editProcedureId, editQuarterlyId, editCompanyIds, editAssigneeIds, editProjectIds, editDocIds,
    editMonth, editPlannedHours, currentStatus, distributionType, isNewPlan,
    plan.monthly_plan_id, plan.year, user.user_id, initialAssigneeIdsRef,
    setSaving, setIsEditing, onUpdate,
  ]);

  const handleCancel = useCallback(() => {
    if (isNewPlan) { onClose(); return; }
    setEditMonth(plan.month);
    setEditPlannedHours(plan.planned_hours);
    setEditProcedureId(plan.procedure_id || '');
    setIsEditing(false);
  }, [isNewPlan, plan.month, plan.planned_hours, plan.procedure_id, onClose, setEditMonth, setEditPlannedHours, setEditProcedureId, setIsEditing]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      const { error } = await supabase.from('daily_tasks').delete().eq('daily_task_id', taskId);
      if (error) throw error;
      setTasksRefreshTrigger(prev => prev + 1);
      onUpdate?.();
    } catch (err: unknown) { logger.error('Error deleting task:', err); }
  }, [onUpdate, setTasksRefreshTrigger]);

  const handleAcceptTask = useCallback(async (taskId: string) => {
    try {
      const { error } = await supabase.from('daily_tasks').update({
        task_type: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('daily_task_id', taskId);
      if (error) throw error;
      setTasksRefreshTrigger(prev => prev + 1);
      onUpdate?.();
    } catch (err: unknown) { logger.error('Error accepting task:', err); }
  }, [onUpdate, setTasksRefreshTrigger]);

  const handleRejectTask = useCallback(async (taskId: string) => {
    try {
      const { error } = await supabase.from('daily_tasks').update({
        task_type: 'draft',
        completed_at: null,
      }).eq('daily_task_id', taskId);
      if (error) throw error;
      setTasksRefreshTrigger(prev => prev + 1);
      onUpdate?.();
    } catch (err: unknown) { logger.error('Error rejecting task:', err); }
  }, [onUpdate, setTasksRefreshTrigger]);

  return {
    handleDelete,
    onStatusChangeHandler,
    handleSave,
    handleCancel,
    handleDeleteTask,
    handleAcceptTask,
    handleRejectTask,
    toggleAssignee: useCallback((id: string) => {
      // Note: caller must manage editAssigneeIds state directly; this is provided as convenience
    }, []),
    handleAddTask: useCallback(() => { setTaskToEdit(null); setIsTaskModalOpen(true); }, [setTaskToEdit, setIsTaskModalOpen]),
    handleEditTask: useCallback((task: PlanTask) => { setTaskToEdit(task); setIsTaskModalOpen(true); }, [setTaskToEdit, setIsTaskModalOpen]),
    handleTaskSuccess: useCallback(() => {
      setIsTaskModalOpen(false); setTaskToEdit(null); setTasksRefreshTrigger(prev => prev + 1); onUpdate?.();
    }, [setIsTaskModalOpen, setTaskToEdit, setTasksRefreshTrigger, onUpdate]),
    handleDistributionTypeChange: useCallback((type: HourDistributionType) => setDistributionType(type), [setDistributionType]),
  };
}
