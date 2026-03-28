'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { UserInfo } from '@/types/azure';
import { AnnualPlan, QuarterlyPlan, MonthlyPlan, canCreateAnnualPlans } from '@/types/planning';
import { usePlans } from '@/hooks/usePlans';
import { usePlanNavigation } from '@/hooks/planning/usePlanNavigation';
import { usePlanFilters } from '@/hooks/planning/usePlanFilters';
import { FileText } from 'lucide-react';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { supabase } from '@/lib/shared/db-client';
import { TwoPanelLayout } from '@/components/dashboard/shared';
import PlanTreeHeader from './tree/PlanTreeHeader';
import AddTaskModal from '@/components/dashboard/plans/Tasks/AddTaskModal';
import { cn } from '@/lib/shared/utils';
import PlanTreeContent from './PlanTreeContent';
import PlanDetailsPanel from './PlanDetailsPanel';
import {
  createNewAnnualPlan,
  createNewQuarterlyPlan,
  createNewMonthlyPlan,
} from '@/lib/ops/plans/plan-factories';

interface PlansContentProps {
  user: UserInfo;
  fetchPlanCounts?: () => void;
}

type PlanType = 'annual' | 'quarterly' | 'monthly';
export default function PlansContent({ user, fetchPlanCounts }: PlansContentProps) {
  const [selectedType, setSelectedType] = useState<PlanType | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<AnnualPlan | QuarterlyPlan | MonthlyPlan | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [expandedStatusGroups, setExpandedStatusGroups] = useState<Record<string, boolean>>({});
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalPlan, setTaskModalPlan] = useState<MonthlyPlan | null>(null);
  const [assignedPlanIds, setAssignedPlanIds] = useState<string[]>([]);

  const isMobile = useIsMobile();
  const isEmployee = user.role === 'employee';

  const { annualPlans, quarterlyPlans, monthlyPlans, loading, error, refreshPlans, fetchAnnualPlans, fetchQuarterlyPlans, fetchMonthlyPlans } = usePlans();
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (user.role === 'employee') refreshPlans(currentYear);
    else fetchAnnualPlans();
  }, [fetchAnnualPlans, refreshPlans, user.role, currentYear]);

  const { selectedYear, setSelectedYear, selectedQuarter, setSelectedQuarter, selectedMonth, setSelectedMonth, availableYears } = usePlanNavigation(annualPlans);
  const { filteredAnnualPlans, filteredQuarterlyPlans, filteredMonthlyPlans: roleFilteredMonthlyPlans } = usePlanFilters(annualPlans, quarterlyPlans, monthlyPlans, selectedYear, selectedQuarter, user);

  useEffect(() => {
    if (selectedYear) fetchQuarterlyPlans(selectedYear);
  }, [selectedYear, fetchQuarterlyPlans]);

  useEffect(() => {
    if (selectedYear && selectedQuarter && quarterlyPlans.length > 0) fetchMonthlyPlans(selectedQuarter);
  }, [selectedYear, selectedQuarter, quarterlyPlans, fetchMonthlyPlans]);

  useEffect(() => {
    if (!user?.user_id) return;
    supabase.from('monthly_plan_assignees').select('monthly_plan_id').eq('user_id', user.user_id)
      .then(({ data }) => { if (data) setAssignedPlanIds(data.map(d => d.monthly_plan_id)); });
  }, [user?.user_id]);

  const handleSelectPlan = (type: PlanType, plan: AnnualPlan | QuarterlyPlan | MonthlyPlan) => {
    setSelectedType(type);
    setSelectedPlan(plan);
    if (isMobile) setIsDrawerOpen(true);
  };

  const toggleStatusGroup = useCallback((groupKey: string) => {
    setExpandedStatusGroups((prev) => ({ ...prev, [groupKey]: !(prev[groupKey] ?? false) }));
  }, []);

  const isGroupExpanded = useCallback((groupKey: string) => {
    return expandedStatusGroups[groupKey] ?? groupKey.startsWith('employee-');
  }, [expandedStatusGroups]);

  const getVisiblePlansCount = useCallback((): number => {
    if (isEmployee) return monthlyPlans.filter(p => assignedPlanIds.includes(p.monthly_plan_id) && p.status === 'active').length;
    if (selectedMonth !== null) return roleFilteredMonthlyPlans.filter((m) => m.month === selectedMonth + 1).length;
    if (selectedQuarter) return filteredQuarterlyPlans.length;
    return filteredAnnualPlans.length;
  }, [isEmployee, monthlyPlans, assignedPlanIds, selectedMonth, roleFilteredMonthlyPlans, selectedQuarter, filteredQuarterlyPlans, filteredAnnualPlans]);

  const handleCloseDetails = () => { setSelectedPlan(null); setSelectedType(null); setIsDrawerOpen(false); };

  const handleCreatePlan = (type: PlanType, parentId?: string | null) => {
    if (type === 'annual') {
      setSelectedType('annual');
      setSelectedPlan(createNewAnnualPlan(user, selectedYear || currentYear));
      return;
    }
    if (type === 'quarterly') {
      setSelectedType('quarterly');
      setSelectedPlan(createNewQuarterlyPlan(parentId, selectedQuarter || Math.ceil((new Date().getMonth() + 1) / 3)));
      return;
    }
    if (type === 'monthly') {
      let effectiveParentId = parentId;
      if (!effectiveParentId && selectedType === 'quarterly' && selectedPlan) {
        effectiveParentId = (selectedPlan as QuarterlyPlan).quarterly_id;
      }
      let defaultMonth = new Date().getMonth() + 1;
      if (selectedMonth !== null) defaultMonth = selectedMonth + 1;
      else if (selectedQuarter) defaultMonth = (selectedQuarter - 1) * 3 + 1;
      setSelectedType('monthly');
      setSelectedPlan(createNewMonthlyPlan({
        parentId: effectiveParentId,
        selectedYear: selectedYear || currentYear,
        defaultMonth,
        parentQuarterly: quarterlyPlans.find(q => q.quarterly_id === effectiveParentId),
        user,
      }));
    }
  };

  const handleSuccess = useCallback(async (newPlanId?: string) => {
    await refreshPlans(selectedYear || currentYear);
    fetchPlanCounts?.();
    if (newPlanId && selectedPlan) {
      if (selectedType === 'annual' && 'annual_id' in selectedPlan && selectedPlan.annual_id === 'new') {
        setSelectedPlan({ ...selectedPlan, annual_id: newPlanId });
      } else if (selectedType === 'quarterly' && 'quarterly_id' in selectedPlan && selectedPlan.quarterly_id === 'new') {
        setSelectedPlan({ ...selectedPlan, quarterly_id: newPlanId });
      } else if (selectedType === 'monthly' && 'monthly_plan_id' in selectedPlan && selectedPlan.monthly_plan_id === 'new') {
        setSelectedPlan({ ...selectedPlan, monthly_plan_id: newPlanId });
      }
    }
  }, [refreshPlans, fetchPlanCounts, selectedPlan, selectedType, selectedYear, currentYear]);

  useEffect(() => {
    if (!selectedPlan || !selectedType) return;
    if (selectedType === 'annual') {
      const planId = (selectedPlan as AnnualPlan).annual_id;
      if (planId && planId !== 'new') { const updated = annualPlans.find(p => p.annual_id === planId); if (updated) setSelectedPlan(updated); }
    } else if (selectedType === 'quarterly') {
      const planId = (selectedPlan as QuarterlyPlan).quarterly_id;
      if (planId && planId !== 'new') { const updated = quarterlyPlans.find(p => p.quarterly_id === planId); if (updated) setSelectedPlan(updated); }
    } else if (selectedType === 'monthly') {
      const planId = (selectedPlan as MonthlyPlan).monthly_plan_id;
      if (planId && planId !== 'new') { const updated = monthlyPlans.find(p => p.monthly_plan_id === planId); if (updated) setSelectedPlan(updated); }
    }
  }, [annualPlans, quarterlyPlans, monthlyPlans, selectedPlan, selectedType]);

  const handleAddTaskFromTile = useCallback((plan: MonthlyPlan) => { setTaskModalPlan(plan); setIsTaskModalOpen(true); }, []);
  const handleTaskModalSuccess = useCallback(() => { setIsTaskModalOpen(false); setTaskModalPlan(null); refreshPlans(selectedYear || currentYear); }, [refreshPlans, selectedYear, currentYear]);

  const canCreate = canCreateAnnualPlans(user);
  const canEdit = user.role === 'chief' || user.role === 'head';

  return (
    <>
      <TwoPanelLayout
        isDrawerOpen={isDrawerOpen} onDrawerClose={() => setIsDrawerOpen(false)}
        rightPanelClassName={
          selectedType === 'monthly' ? 'bg-indigo-50/30' :
          selectedType === 'quarterly' ? 'bg-purple-50/30' :
          selectedType === 'annual' ? 'bg-amber-50/30' : 'bg-transparent'
        }
        leftPanel={
          <div className="h-full min-h-0 flex flex-col">
            {!isEmployee && (
              <PlanTreeHeader
                availableYears={availableYears} selectedYear={selectedYear} selectedQuarter={selectedQuarter}
                selectedMonth={selectedMonth} annualPlans={annualPlans} quarterlyPlans={quarterlyPlans}
                onSelectYear={setSelectedYear} onSelectQuarter={setSelectedQuarter} onSelectMonth={setSelectedMonth}
                onCreatePlan={handleCreatePlan} canCreate={canCreate}
                onDoubleClickYear={(plan) => handleSelectPlan('annual', plan)} user={user}
              />
            )}
            <div className={cn('flex-1 min-h-0 overflow-y-auto p-3 space-y-4',
              isEmployee ? 'bg-indigo-50/20' :
                selectedMonth !== null ? 'bg-indigo-50/20' :
                  selectedQuarter ? 'bg-purple-50/20' :
                    selectedYear ? 'bg-amber-50/20' : 'bg-slate-50/20')}>
              <PlanTreeContent
                user={user} loading={loading} error={error}
                monthlyPlans={monthlyPlans} quarterlyPlans={quarterlyPlans}
                filteredAnnualPlans={filteredAnnualPlans} filteredQuarterlyPlans={filteredQuarterlyPlans}
                roleFilteredMonthlyPlans={roleFilteredMonthlyPlans} assignedPlanIds={assignedPlanIds}
                selectedPlan={selectedPlan} selectedType={selectedType}
                selectedMonth={selectedMonth} selectedQuarter={selectedQuarter} selectedYear={selectedYear}
                isGroupExpanded={isGroupExpanded} toggleStatusGroup={toggleStatusGroup}
                canCreate={canCreate} onSelectPlan={handleSelectPlan}
                onCreatePlan={handleCreatePlan} onAddTask={handleAddTaskFromTile}
              />
            </div>
            <div className="sticky bottom-0 z-10 flex items-center gap-2 px-3 py-2 border-t border-slate-200/70 text-slate-500 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
              <FileText className={cn('h-4 w-4', isEmployee ? 'text-indigo-600' : selectedMonth !== null ? 'text-indigo-600' : selectedQuarter ? 'text-purple-600' : selectedYear ? 'text-amber-600' : 'text-slate-500')} aria-hidden="true" />
              <span className="text-sm">Всего планов: {getVisiblePlansCount()}</span>
            </div>
          </div>
        }
        rightPanel={
          <PlanDetailsPanel
            selectedType={selectedType} selectedPlan={selectedPlan}
            user={user} canEdit={canEdit}
            annualPlans={annualPlans} quarterlyPlans={quarterlyPlans} monthlyPlans={monthlyPlans}
            onClose={handleCloseDetails} onSuccess={handleSuccess}
          />
        }
      />

      {taskModalPlan && (
        <AddTaskModal
          isOpen={isTaskModalOpen}
          onClose={() => { setIsTaskModalOpen(false); setTaskModalPlan(null); }}
          onSuccess={handleTaskModalSuccess}
          monthlyPlanId={taskModalPlan.monthly_plan_id}
          userId={user.user_id}
          userDepartmentId={user.department_id || undefined}
          monthlyPlan={taskModalPlan}
        />
      )}
    </>
  );
}
