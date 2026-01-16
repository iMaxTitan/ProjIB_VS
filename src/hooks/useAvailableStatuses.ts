import { useMemo } from 'react';
import { PlanStatus, PlanStatusInfo, PLAN_STATUSES } from '@/types/planning';
import { UserInfo } from '@/types/azure';

interface UseAvailableStatusesOptions {
  user: UserInfo | null;
  currentStatus: PlanStatus;
  isEditMode: boolean;
  /** Типы планов имеют разные доступные статусы */
  planType: 'annual' | 'quarterly' | 'weekly';
}

/**
 * Хук для определения доступных статусов плана в зависимости от роли пользователя,
 * текущего статуса и режима редактирования
 */
export function useAvailableStatuses({
  user,
  currentStatus,
  isEditMode,
  planType,
}: UseAvailableStatusesOptions): PlanStatusInfo[] {
  return useMemo(() => {
    const isChief = user?.role === 'chief';
    const isHead = user?.role === 'head';

    // Для недельных планов — упрощенный набор статусов
    if (planType === 'weekly') {
      const weeklyStatuses = PLAN_STATUSES.filter(s =>
        ['draft', 'active', 'completed', 'failed'].includes(s.value)
      );

      if (!isEditMode) {
        return weeklyStatuses.filter(s => ['draft', 'active'].includes(s.value));
      }

      if (isChief || isHead) {
        switch (currentStatus) {
          case 'draft':
            return weeklyStatuses.filter(s => ['draft', 'active'].includes(s.value));
          case 'active':
            return weeklyStatuses.filter(s => ['active', 'completed', 'failed'].includes(s.value));
          case 'completed':
          case 'failed':
            return weeklyStatuses.filter(s => ['completed', 'failed'].includes(s.value));
          default:
            return weeklyStatuses;
        }
      }

      return weeklyStatuses.filter(s => s.value === currentStatus);
    }

    // Для годовых и квартальных планов — полный workflow
    if (!isEditMode) {
      return PLAN_STATUSES.filter(s => ['draft', 'submitted'].includes(s.value));
    }

    if (isChief) {
      switch (currentStatus) {
        case 'draft':
          return PLAN_STATUSES.filter(s => ['draft', 'submitted'].includes(s.value));
        case 'submitted':
          return PLAN_STATUSES.filter(s => ['submitted', 'approved', 'returned'].includes(s.value));
        case 'returned':
          return PLAN_STATUSES.filter(s => ['returned', 'draft'].includes(s.value));
        case 'approved':
          return PLAN_STATUSES.filter(s => ['approved', 'active'].includes(s.value));
        case 'active':
          return PLAN_STATUSES.filter(s => ['active', 'completed', 'failed'].includes(s.value));
        default:
          return PLAN_STATUSES;
      }
    }

    if (isHead) {
      switch (currentStatus) {
        case 'draft':
          return PLAN_STATUSES.filter(s => ['draft', 'submitted'].includes(s.value));
        case 'returned':
          return PLAN_STATUSES.filter(s => ['returned', 'draft'].includes(s.value));
        case 'approved':
          return PLAN_STATUSES.filter(s => ['approved', 'active'].includes(s.value));
        default:
          return PLAN_STATUSES.filter(s => s.value === currentStatus);
      }
    }

    // Для остальных ролей — только текущий статус
    return PLAN_STATUSES.filter(s => s.value === currentStatus);
  }, [user, currentStatus, isEditMode, planType]);
}

export default useAvailableStatuses;
