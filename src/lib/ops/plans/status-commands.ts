import { supabase as db } from '@/lib/shared/db-client';
import { logger } from '@/lib/shared/logger';
import type { PlanStatus } from '@/types/planning';
import type { UserRole } from '@/types/supabase';
import { canChangeStatus } from './status';

/**
 * Изменение статуса месячного плана с проверкой прав и логированием
 *
 * @param currentStatus - текущий статус (пропускает SELECT запрос, который может блокироваться RLS)
 */
export async function changeMonthlyPlanStatus(
  monthlyPlanId: string,
  newStatus: PlanStatus,
  userId: string,
  userRole: UserRole,
  currentStatus?: PlanStatus
): Promise<{ success: boolean; error?: string; oldStatus?: PlanStatus }> {
  logger.debug('[changeMonthlyPlanStatus] Called with:', { monthlyPlanId, newStatus, userId, userRole, currentStatus });

  const oldStatus = currentStatus || 'draft';
  logger.debug('[changeMonthlyPlanStatus] Using status:', oldStatus);

  const check = canChangeStatus(oldStatus, newStatus, userRole, 'monthly');
  logger.debug('[changeMonthlyPlanStatus] canChangeStatus result:', check);
  if (!check.allowed) {
    logger.debug('[changeMonthlyPlanStatus] BLOCKED - transition not allowed');
    return { success: false, error: check.reason, oldStatus };
  }

  const { error: updateError } = await db
    .from('monthly_plans')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('monthly_plan_id', monthlyPlanId);

  if (updateError) {
    return { success: false, error: updateError.message, oldStatus };
  }

  try {
    await db.rpc('log_activity', {
      p_user_id: userId,
      p_action_type: 'status_change',
      p_target_type: 'monthly_plan',
      p_target_id: monthlyPlanId,
      p_details: {
        old_status: oldStatus,
        new_status: newStatus
      }
    });
  } catch (logError: unknown) {
    logger.error('Failed to log status change:', logError);
  }

  return { success: true, oldStatus };
}

/**
 * Изменение статуса квартального плана с проверкой прав и логированием
 */
export async function changeQuarterlyPlanStatus(
  quarterlyId: string,
  newStatus: PlanStatus,
  userId: string,
  userRole: UserRole
): Promise<{ success: boolean; error?: string; oldStatus?: PlanStatus }> {
  const { data: plan, error: fetchError } = await db
    .from('quarterly_plans')
    .select('status, quarter, department_id')
    .eq('quarterly_id', quarterlyId)
    .single();

  if (fetchError || !plan) {
    return { success: false, error: 'План не найден' };
  }

  const oldStatus = plan.status as PlanStatus;

  const check = canChangeStatus(oldStatus, newStatus, userRole, 'quarterly');
  if (!check.allowed) {
    return { success: false, error: check.reason, oldStatus };
  }

  const { error: updateError } = await db
    .from('quarterly_plans')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('quarterly_id', quarterlyId);

  if (updateError) {
    return { success: false, error: updateError.message, oldStatus };
  }

  try {
    await db.rpc('log_activity', {
      p_user_id: userId,
      p_action_type: 'status_change',
      p_target_type: 'quarterly_plan',
      p_target_id: quarterlyId,
      p_details: {
        old_status: oldStatus,
        new_status: newStatus,
        quarter: plan.quarter
      }
    });
  } catch (logError: unknown) {
    logger.error('Failed to log status change:', logError);
  }

  return { success: true, oldStatus };
}

/**
 * Изменение статуса годового плана с проверкой прав и логированием
 */
export async function changeAnnualPlanStatus(
  annualId: string,
  newStatus: PlanStatus,
  userId: string,
  userRole: UserRole
): Promise<{ success: boolean; error?: string; oldStatus?: PlanStatus }> {
  const { data: plan, error: fetchError } = await db
    .from('annual_plans')
    .select('status, year')
    .eq('annual_id', annualId)
    .single();

  if (fetchError || !plan) {
    return { success: false, error: 'План не найден' };
  }

  const oldStatus = plan.status as PlanStatus;

  const check = canChangeStatus(oldStatus, newStatus, userRole, 'annual');
  if (!check.allowed) {
    return { success: false, error: check.reason, oldStatus };
  }

  const { error: updateError } = await db
    .from('annual_plans')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('annual_id', annualId);

  if (updateError) {
    return { success: false, error: updateError.message, oldStatus };
  }

  try {
    await db.rpc('log_activity', {
      p_user_id: userId,
      p_action_type: 'status_change',
      p_target_type: 'annual_plan',
      p_target_id: annualId,
      p_details: {
        old_status: oldStatus,
        new_status: newStatus,
        year: plan.year
      }
    });
  } catch (logError: unknown) {
    logger.error('Failed to log status change:', logError);
  }

  return { success: true, oldStatus };
}
