import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { PlanStatus } from '@/types/planning';
import type { UserRole } from '@/types/supabase';

const STATUS_TRANSITIONS: Record<PlanStatus, { allowedNext: PlanStatus[]; allowedRoles: UserRole[] }[]> = {
  draft: [
    { allowedNext: ['submitted'], allowedRoles: ['head'] }  // Только Head отправляет на рассмотрение
  ],
  submitted: [
    { allowedNext: ['approved', 'returned'], allowedRoles: ['chief'] }  // Только Chief утверждает/возвращает
  ],
  approved: [
    { allowedNext: ['active'], allowedRoles: ['head'] }  // Только Head запускает в работу
  ],
  returned: [
    { allowedNext: ['submitted'], allowedRoles: ['head'] }  // Только Head повторно отправляет
  ],
  active: [
    { allowedNext: ['completed', 'failed'], allowedRoles: ['chief'] }  // Только Chief завершает
  ],
  completed: [],
  failed: []
};

/**
 * Упрощённая матрица переходов для МЕСЯЧНЫХ планов
 *
 * Только 4 статуса: draft, active, completed, failed
 * И head и chief могут менять статусы свободно
 *
 * Workflow:
 * draft ↔ active (начать/вернуть в черновик)
 * active → completed/failed (завершить)
 * completed/failed → active (переоткрыть при необходимости)
 */
type MonthlyStatus = 'draft' | 'active' | 'completed' | 'failed';
const MONTHLY_STATUS_TRANSITIONS: Record<MonthlyStatus, { allowedNext: MonthlyStatus[]; allowedRoles: UserRole[] }[]> = {
  draft: [
    { allowedNext: ['active'], allowedRoles: ['head', 'chief'] }  // Запустить в работу
  ],
  active: [
    { allowedNext: ['draft', 'completed', 'failed'], allowedRoles: ['head', 'chief'] }  // Вернуть/завершить
  ],
  completed: [
    { allowedNext: ['active'], allowedRoles: ['head', 'chief'] }  // Переоткрыть
  ],
  failed: [
    { allowedNext: ['active'], allowedRoles: ['head', 'chief'] }  // Переоткрыть
  ]
};

/**
 * Получить допустимые переходы статуса для роли пользователя
 *
 * @param currentStatus - текущий статус плана
 * @param userRole - роль пользователя
 * @param planType - тип плана (monthly использует упрощённую матрицу)
 */

export function getAvailableStatusTransitions(
  currentStatus: PlanStatus,
  userRole: UserRole,
  planType: 'annual' | 'quarterly' | 'monthly' = 'quarterly'
): PlanStatus[] {
  // Для месячных планов используем упрощённую матрицу
  if (planType === 'monthly') {
    const monthlyStatus = currentStatus as MonthlyStatus;
    // Проверяем, что статус допустим для месячных планов
    if (!['draft', 'active', 'completed', 'failed'].includes(currentStatus)) {
      logger.debug('[getAvailableStatusTransitions] Monthly plan has non-monthly status:', currentStatus);
      // Для legacy статусов возвращаем возможность перейти в active
      return ['active'];
    }
    const transitions = MONTHLY_STATUS_TRANSITIONS[monthlyStatus] || [];
    const available: PlanStatus[] = [];

    for (const transition of transitions) {
      if (transition.allowedRoles.includes(userRole)) {
        available.push(...transition.allowedNext);
      }
    }

    logger.debug('[getAvailableStatusTransitions] Monthly result:', available);
    return available;
  }

  // Для остальных планов - стандартная матрица
  const transitions = STATUS_TRANSITIONS[currentStatus] || [];
  const available: PlanStatus[] = [];

  logger.debug('[getAvailableStatusTransitions] Input:', { currentStatus, userRole, planType });
  logger.debug('[getAvailableStatusTransitions] Transitions for status:', transitions);

  for (const transition of transitions) {
    logger.debug('[getAvailableStatusTransitions] Checking transition:', transition, 'userRole in allowedRoles:', transition.allowedRoles.includes(userRole));
    if (transition.allowedRoles.includes(userRole)) {
      available.push(...transition.allowedNext);
    }
  }

  logger.debug('[getAvailableStatusTransitions] Result:', available);
  return available;
}

/**
 * Проверить, может ли пользователь сменить статус
 */
export function canChangeStatus(
  currentStatus: PlanStatus,
  newStatus: PlanStatus,
  userRole: UserRole,
  planType: 'annual' | 'quarterly' | 'monthly' = 'quarterly'
): { allowed: boolean; reason?: string } {
  logger.debug('[canChangeStatus] Input:', { currentStatus, newStatus, userRole, planType });
  const availableTransitions = getAvailableStatusTransitions(currentStatus, userRole, planType);
  logger.debug('[canChangeStatus] Available transitions:', availableTransitions);
  logger.debug('[canChangeStatus] newStatus in availableTransitions:', availableTransitions.includes(newStatus));

  if (!availableTransitions.includes(newStatus)) {
    // Формируем понятное сообщение об ошибке
    if (availableTransitions.length === 0) {
      logger.debug('[canChangeStatus] BLOCKED - no transitions available for this role');
      return {
        allowed: false,
        reason: `Статус "${currentStatus}" не может быть изменен вашей ролью`
      };
    }
    logger.debug('[canChangeStatus] BLOCKED - newStatus not in allowed transitions');
    return {
      allowed: false,
      reason: `Переход из "${currentStatus}" в "${newStatus}" недопустим. Доступные статусы: ${availableTransitions.join(', ')}`
    };
  }

  logger.debug('[canChangeStatus] ALLOWED');
  return { allowed: true };
}

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

  // Используем переданный текущий статус (обходим RLS на SELECT)
  const oldStatus = currentStatus || 'draft';
  logger.debug('[changeMonthlyPlanStatus] Using status:', oldStatus);

  // 2. Проверяем допустимость перехода (используем упрощённую матрицу для monthly)
  const check = canChangeStatus(oldStatus, newStatus, userRole, 'monthly');
  logger.debug('[changeMonthlyPlanStatus] canChangeStatus result:', check);
  if (!check.allowed) {
    logger.debug('[changeMonthlyPlanStatus] BLOCKED - transition not allowed');
    return { success: false, error: check.reason, oldStatus };
  }

  // 3. Обновляем статус
  const { error: updateError } = await supabase
    .from('monthly_plans')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('monthly_plan_id', monthlyPlanId);

  if (updateError) {
    return { success: false, error: updateError.message, oldStatus };
  }

  // 4. Логируем действие
  try {
    await supabase.rpc('log_activity', {
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
    // Логирование не должно блокировать операцию
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
  // 1. Получаем текущий план
  const { data: plan, error: fetchError } = await supabase
    .from('quarterly_plans')
    .select('status, quarter, department_id')
    .eq('quarterly_id', quarterlyId)
    .single();

  if (fetchError || !plan) {
    return { success: false, error: 'План не найден' };
  }

  const oldStatus = plan.status as PlanStatus;

  // 2. Проверяем допустимость перехода (quarterly использует полный workflow)
  const check = canChangeStatus(oldStatus, newStatus, userRole, 'quarterly');
  if (!check.allowed) {
    return { success: false, error: check.reason, oldStatus };
  }

  // 3. Обновляем статус
  const { error: updateError } = await supabase
    .from('quarterly_plans')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('quarterly_id', quarterlyId);

  if (updateError) {
    return { success: false, error: updateError.message, oldStatus };
  }

  // 4. Логируем действие
  try {
    await supabase.rpc('log_activity', {
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
  // 1. Получаем текущий план
  const { data: plan, error: fetchError } = await supabase
    .from('annual_plans')
    .select('status, year')
    .eq('annual_id', annualId)
    .single();

  if (fetchError || !plan) {
    return { success: false, error: 'План не найден' };
  }

  const oldStatus = plan.status as PlanStatus;

  // 2. Проверяем допустимость перехода (annual использует полный workflow)
  const check = canChangeStatus(oldStatus, newStatus, userRole, 'annual');
  if (!check.allowed) {
    return { success: false, error: check.reason, oldStatus };
  }

  // 3. Обновляем статус
  const { error: updateError } = await supabase
    .from('annual_plans')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('annual_id', annualId);

  if (updateError) {
    return { success: false, error: updateError.message, oldStatus };
  }

  // 4. Логируем действие
  try {
    await supabase.rpc('log_activity', {
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

