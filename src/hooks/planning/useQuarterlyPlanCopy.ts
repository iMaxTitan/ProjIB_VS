/**
 * Hook for quarterly plan copy state and handler.
 * Extracted from QuarterlyPlanDetails.tsx.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/shared/supabase';
import { manageQuarterlyPlan } from '@/lib/ops/plans';
import { getErrorMessage } from '@/lib/shared/utils/error-message';
import type { AnnualPlan, QuarterlyPlan } from '@/types/planning';
import type { UserInfo } from '@/types/azure';

interface UseQuarterlyPlanCopyParams {
  plan: QuarterlyPlan;
  user: UserInfo;
  isNewPlan: boolean;
  activeAnnualPlans: AnnualPlan[];
  onSuccess: (newId?: string) => void;
}

export function useQuarterlyPlanCopy({
  plan,
  user,
  isNewPlan,
  activeAnnualPlans,
  onSuccess,
}: UseQuarterlyPlanCopyParams) {
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [copyAnnualId, setCopyAnnualId] = useState(plan.annual_plan_id || '');
  const [copyQuarter, setCopyQuarter] = useState<number>(plan.quarter);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCopyModalOpen) return;
    const defaultAnnualId = plan.annual_plan_id && activeAnnualPlans.some(a => a.annual_id === plan.annual_plan_id)
      ? plan.annual_plan_id
      : (activeAnnualPlans[0]?.annual_id || plan.annual_plan_id || '');
    setCopyAnnualId(defaultAnnualId);
    setCopyQuarter(plan.quarter);
    setCopyError(null);
  }, [isCopyModalOpen, plan.annual_plan_id, plan.quarter, activeAnnualPlans]);

  const handleCopy = async () => {
    if (isNewPlan) return;
    setCopying(true);
    setCopyError(null);
    try {
      if (!copyAnnualId) throw new Error('Выберите годовой план');
      const departmentId = plan.department_id || user?.department_id || '';
      const { data: existing, error: existingError } = await supabase
        .from('quarterly_plans')
        .select('quarterly_id')
        .eq('annual_plan_id', copyAnnualId)
        .eq('quarter', copyQuarter)
        .eq('department_id', departmentId)
        .limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length > 0) {
        throw new Error('Квартальный план для выбранного года и квартала уже существует');
      }
      const result = await manageQuarterlyPlan({
        action: 'create',
        annualPlanId: copyAnnualId,
        departmentId,
        quarter: copyQuarter,
        goal: plan.goal,
        expectedResult: plan.expected_result,
        status: 'draft',
        process_id: plan.process_id || '',
        userId: user?.user_id || '',
      });
      const newId = typeof result === 'string' ? result : (result?.quarterly_id || result?.id);
      setIsCopyModalOpen(false);
      onSuccess(newId);
    } catch (e: unknown) {
      setCopyError(getErrorMessage(e));
    } finally {
      setCopying(false);
    }
  };

  const closeCopyModal = () => {
    if (!copying) {
      setIsCopyModalOpen(false);
      setCopyError(null);
    }
  };

  return {
    isCopyModalOpen,
    setIsCopyModalOpen,
    copyAnnualId,
    setCopyAnnualId,
    copyQuarter,
    setCopyQuarter,
    copying,
    copyError,
    handleCopy,
    closeCopyModal,
  };
}
