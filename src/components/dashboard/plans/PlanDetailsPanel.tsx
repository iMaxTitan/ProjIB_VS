'use client';

import React from 'react';
import type { AnnualPlan, QuarterlyPlan, MonthlyPlan } from '@/types/planning';
import type { UserInfo } from '@/types/azure';
import AnnualPlanDetails from './details/AnnualPlanDetails';
import QuarterlyPlanDetails from './details/QuarterlyPlanDetails';
import MonthlyPlanDetails from './details/MonthlyPlanDetails';
import EmptyState from '@/components/ui/EmptyState';

type PlanType = 'annual' | 'quarterly' | 'monthly';

interface PlanDetailsPanelProps {
  selectedType: PlanType | null;
  selectedPlan: AnnualPlan | QuarterlyPlan | MonthlyPlan | null;
  user: UserInfo;
  canEdit: boolean;
  annualPlans: AnnualPlan[];
  quarterlyPlans: QuarterlyPlan[];
  monthlyPlans: MonthlyPlan[];
  onClose: () => void;
  onSuccess: (newId?: string) => void;
}

export default function PlanDetailsPanel({
  selectedType,
  selectedPlan,
  user,
  canEdit,
  annualPlans,
  quarterlyPlans,
  monthlyPlans,
  onClose,
  onSuccess,
}: PlanDetailsPanelProps) {
  if (!selectedPlan || !selectedType) {
    return (
      <EmptyState
        title="Выберите план"
        description="Кликните на план в дереве слева для просмотра деталей"
        variant="centered"
      />
    );
  }

  if (selectedType === 'annual') {
    return (
      <AnnualPlanDetails
        plan={selectedPlan as AnnualPlan}
        onClose={onClose}
        onUpdate={onSuccess}
        canEdit={canEdit}
        quarterlyPlans={quarterlyPlans}
      />
    );
  }

  if (selectedType === 'quarterly') {
    return (
      <QuarterlyPlanDetails
        plan={selectedPlan as QuarterlyPlan}
        user={user}
        onClose={onClose}
        onUpdate={onSuccess}
        canEdit={canEdit}
        annualPlans={annualPlans}
        monthlyPlans={monthlyPlans}
      />
    );
  }

  if (selectedType === 'monthly') {
    return (
      <MonthlyPlanDetails
        plan={selectedPlan as MonthlyPlan}
        user={user}
        onClose={onClose}
        onUpdate={onSuccess}
        canEdit={canEdit}
        quarterlyPlans={quarterlyPlans}
      />
    );
  }

  return null;
}
