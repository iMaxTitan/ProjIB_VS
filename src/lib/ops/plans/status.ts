import { logger } from '@/lib/shared/logger';
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
  failed: [],
  // V2
  pending: [
    { allowedNext: ['active'], allowedRoles: ['chief'] }
  ],
  done: [],
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


