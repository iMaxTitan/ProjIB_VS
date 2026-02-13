import { useMemo } from 'react';
import { PlanStatus, PlanStatusInfo, PLAN_STATUSES, MONTHLY_PLAN_STATUSES } from '@/types/planning';
import { UserInfo } from '@/types/azure';
import { UserRole } from '@/types/supabase';
import { getAvailableStatusTransitions } from '@/lib/plans/plan-service';

interface UseAvailableStatusesOptions {
  user: UserInfo | null;
  currentStatus: PlanStatus;
  isEditMode?: boolean;
  /** Типы планов имеют разные доступные статусы */
  planType: 'annual' | 'quarterly' | 'monthly';
}

/**
 * Хук для определения доступных статусов плана в зависимости
 * от роли пользователя и текущего статуса.
 *
 * Для месячных планов: упрощенный workflow
 * - Только 4 статуса: draft, active, completed, failed
 * - И head, и chief могут менять статусы
 *
 * Для годовых/квартальных планов: полный workflow
 * - draft -> submitted (Head отправляет на рассмотрение)
 * - submitted -> approved/returned (Chief утверждает или возвращает)
 * - returned -> submitted (Head исправляет и отправляет повторно)
 * - approved -> active (Head запускает в работу)
 * - active -> completed/failed (Chief завершает план)
 */
export function useAvailableStatuses({
  user,
  currentStatus,
  planType,
}: UseAvailableStatusesOptions): PlanStatusInfo[] {
  return useMemo(() => {
    if (!user?.role) {
      return [];
    }

    // Получаем допустимые переходы из сервиса (с учетом типа плана)
    const availableTransitions = getAvailableStatusTransitions(
      currentStatus,
      user.role as UserRole,
      planType
    );

    // Добавляем текущий статус в список (чтобы он отображался как выбранный)
    const availableStatuses = new Set([currentStatus, ...availableTransitions]);

    // Для месячных планов используем урезанный список статусов
    const statusList = planType === 'monthly' ? MONTHLY_PLAN_STATUSES : PLAN_STATUSES;

    // Фильтруем по допустимым переходам
    return statusList.filter(s => availableStatuses.has(s.value));
  }, [user?.role, currentStatus, planType]);
}

/**
 * Получить описание действия для перехода статуса
 */
export function getStatusActionLabel(fromStatus: PlanStatus, toStatus: PlanStatus): string {
  const actions: Record<string, string> = {
    // Стандартный workflow (годовые/квартальные)
    'draft_submitted': 'Отправить на рассмотрение',
    'submitted_approved': 'Утвердить',
    'submitted_returned': 'Вернуть на доработку',
    'returned_submitted': 'Отправить повторно',
    'approved_active': 'Запустить в работу',
    'active_completed': 'Отметить как выполненный',
    'active_failed': 'Отметить как невыполненный',
    // Упрощенный workflow (месячные)
    'draft_active': 'Запустить в работу',
    'active_draft': 'Вернуть в черновик',
    'completed_active': 'Переоткрыть',
    'failed_active': 'Переоткрыть',
  };

  const key = `${fromStatus}_${toStatus}`;
  return actions[key] || `Изменить на "${toStatus}"`;
}

/**
 * Проверить, может ли пользователь изменять статус плана
 */
export function canUserChangeStatus(
  user: UserInfo | null,
  currentStatus: PlanStatus,
  planType: 'annual' | 'quarterly' | 'monthly' = 'quarterly'
): boolean {
  if (!user?.role) return false;

  const availableTransitions = getAvailableStatusTransitions(
    currentStatus,
    user.role as UserRole,
    planType
  );
  return availableTransitions.length > 0;
}

export default useAvailableStatuses;
