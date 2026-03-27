'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  manageAnnualPlan,
  canDeleteAnnualPlan,
  deleteAnnualPlan,
  changeAnnualPlanStatus,
  manageQuarterlyPlan,
  canDeleteQuarterlyPlan,
  deleteQuarterlyPlan,
  changeQuarterlyPlanStatus,
  type AnnualPlanParams,
  type QuarterlyPlanParams,
} from '@/lib/ops/plans';
import type { PlanStatus } from '@/types/planning';
import type { UserRole } from '@/types/supabase';

const normalizeRole = (role: string | null | undefined): UserRole => {
  if (role === 'chief' || role === 'head' || role === 'employee') return role;
  return 'employee';
};

export function useAnnualPlanOps(
  planId: string,
  userId: string,
  role: string | null | undefined,
  isNew: boolean,
) {
  const [canDelete, setCanDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState<string | undefined>();

  useEffect(() => {
    if (!userId || isNew) { setCanDelete(false); return; }
    canDeleteAnnualPlan(planId, userId, role).then((r) => {
      setCanDelete(r.canDelete);
      setDeleteReason(r.reason);
    });
  }, [planId, userId, role, isNew]);

  const save = useCallback((params: AnnualPlanParams) => manageAnnualPlan(params), []);
  const remove = useCallback(
    () => deleteAnnualPlan(planId, userId, role),
    [planId, userId, role],
  );
  const changeStatus = useCallback(
    (status: PlanStatus) => changeAnnualPlanStatus(planId, status, userId, normalizeRole(role)),
    [planId, userId, role],
  );

  return { canDelete, deleteReason, save, remove, changeStatus };
}

export function useQuarterlyPlanOps(
  planId: string,
  userId: string,
  role: string | null | undefined,
  isNew: boolean,
) {
  const [canDelete, setCanDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

  useEffect(() => {
    if (!userId || isNew) { setCanDelete(false); return; }
    canDeleteQuarterlyPlan(planId, userId, role).then((r) => {
      setCanDelete(r.canDelete);
      setDeleteReason(r.reason || '');
    });
  }, [planId, userId, role, isNew]);

  const save = useCallback((params: QuarterlyPlanParams) => manageQuarterlyPlan(params), []);
  const remove = useCallback(
    () => deleteQuarterlyPlan(planId, userId, role),
    [planId, userId, role],
  );
  const changeStatus = useCallback(
    (status: PlanStatus) => changeQuarterlyPlanStatus(planId, status, userId, normalizeRole(role)),
    [planId, userId, role],
  );

  return { canDelete, deleteReason, save, remove, changeStatus };
}
