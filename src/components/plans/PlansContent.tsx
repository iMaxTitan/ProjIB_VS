'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { UserInfo } from '@/types/azure';
import { AnnualPlan, QuarterlyPlan, MonthlyPlan, PlanStatus, canCreateAnnualPlans } from '@/types/planning';
import { usePlans } from '@/hooks/usePlans';
import { usePlanNavigation } from '@/hooks/planning/usePlanNavigation';
import { usePlanFilters } from '@/hooks/planning/usePlanFilters';
import { FileText } from 'lucide-react';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { supabase } from '@/lib/supabase';

// Components
import { TwoPanelLayout } from '@/components/dashboard/content/shared';
import PlanTreeHeader from './tree/PlanTreeHeader';
import AnnualPlanDetails from './details/AnnualPlanDetails';
import QuarterlyPlanDetails from './details/QuarterlyPlanDetails';
import MonthlyPlanDetails from './details/MonthlyPlanDetails';
import AddTaskModal from '@/components/dashboard/Tasks/AddTaskModal';
import { cn } from '@/lib/utils';
import { getPlanStatusText } from '@/types/planning';
import { GroupHeader } from '@/components/dashboard/content/shared';
import PlanTileCard from './PlanTileCard';
import { Spinner } from '@/components/ui/Spinner';

interface PlansContentProps {
  user: UserInfo;
  fetchPlanCounts?: () => void;
}

type PlanType = 'annual' | 'quarterly' | 'monthly';
const NO_PLAN_TITLE = 'Нет названия плана';

export default function PlansContent({ user, fetchPlanCounts }: PlansContentProps) {
  const statusOrder: PlanStatus[] = ['active', 'submitted', 'draft', 'approved', 'returned', 'completed', 'failed'];
  // State
  const [selectedType, setSelectedType] = useState<PlanType | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<AnnualPlan | QuarterlyPlan | MonthlyPlan | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [expandedStatusGroups, setExpandedStatusGroups] = useState<Record<string, boolean>>({});

  // Task modal state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalPlan, setTaskModalPlan] = useState<MonthlyPlan | null>(null);
  const [assignedPlanIds, setAssignedPlanIds] = useState<string[]>([]);

  // Mobile detection
  const isMobile = useIsMobile();
  const isEmployee = user.role === 'employee';

  // Data
  const {
    annualPlans,
    quarterlyPlans,
    monthlyPlans,
    loading,
    error,
    refreshPlans,
    fetchAnnualPlans,
    fetchQuarterlyPlans,
    fetchMonthlyPlans,
    handlePlanSuccess
  } = usePlans();

  // Initial Load
  useEffect(() => {
    // Для сотрудников - загружаем все планы сразу (включая месячные)
    if (user.role === 'employee') {
      refreshPlans();
    } else {
      fetchAnnualPlans();
    }
  }, [fetchAnnualPlans, refreshPlans, user.role]);


  // Hooks
  const {
    selectedYear, setSelectedYear,
    selectedQuarter, setSelectedQuarter,
    selectedMonth, setSelectedMonth,
    // selectedWeekNumber, setSelectedWeekNumber, // Deprecated
    availableYears
  } = usePlanNavigation(annualPlans);

  const {
    filteredAnnualPlans,
    filteredQuarterlyPlans,
    filteredMonthlyPlans: roleFilteredMonthlyPlans
  } = usePlanFilters(annualPlans, quarterlyPlans, monthlyPlans, selectedYear, selectedQuarter, user);

  // Lazy Load Quarterly Plans
  useEffect(() => {
    if (selectedYear) {
      fetchQuarterlyPlans(selectedYear);
    }
  }, [selectedYear, fetchQuarterlyPlans]);

  // Lazy Load Monthly Plans
  useEffect(() => {
    if (selectedYear && selectedQuarter && quarterlyPlans.length > 0) {
      fetchMonthlyPlans(selectedQuarter);
    }
  }, [selectedYear, selectedQuarter, quarterlyPlans, fetchMonthlyPlans]);

  // Fetch user's assigned monthly plans
  useEffect(() => {
    if (!user?.user_id) return;

    const fetchAssignments = async () => {
      const { data } = await supabase
        .from('monthly_plan_assignees')
        .select('monthly_plan_id')
        .eq('user_id', user.user_id);

      if (data) {
        setAssignedPlanIds(data.map(d => d.monthly_plan_id));
      }
    };

    fetchAssignments();
  }, [user?.user_id]);

  // Handlers
  const handleSelectPlan = (type: PlanType, plan: AnnualPlan | QuarterlyPlan | MonthlyPlan) => {
    setSelectedType(type);
    setSelectedPlan(plan);
    // На мобильных открываем drawer с деталями
    if (isMobile) {
      setIsDrawerOpen(true);
    }
  };

  const handleDrawerClose = () => {
    setIsDrawerOpen(false);
  };

  const toggleStatusGroup = useCallback((groupKey: string) => {
    setExpandedStatusGroups((prev) => ({
      ...prev,
      [groupKey]: !(prev[groupKey] ?? false),
    }));
  }, []);

  const isGroupExpanded = useCallback((groupKey: string) => {
    // Группы сотрудника развёрнуты по умолчанию
    const defaultExpanded = groupKey.startsWith('employee-');
    return expandedStatusGroups[groupKey] ?? defaultExpanded;
  }, [expandedStatusGroups]);

  const getVisiblePlansCount = useCallback((): number => {
    if (isEmployee) {
      return monthlyPlans.filter(
        p => assignedPlanIds.includes(p.monthly_plan_id) && p.status === 'active'
      ).length;
    }
    if (selectedMonth !== null) {
      const monthNum = selectedMonth + 1;
      return roleFilteredMonthlyPlans.filter((m) => m.month === monthNum).length;
    }
    if (selectedQuarter) return filteredQuarterlyPlans.length;
    return filteredAnnualPlans.length;
  }, [
    isEmployee,
    monthlyPlans,
    assignedPlanIds,
    selectedMonth,
    roleFilteredMonthlyPlans,
    selectedQuarter,
    filteredQuarterlyPlans,
    filteredAnnualPlans,
  ]);

  // Закрытие деталей плана (и drawer на мобильном)
  const handleCloseDetails = () => {
    setSelectedPlan(null);
    setSelectedType(null);
    setIsDrawerOpen(false);
  };

  const handleCreatePlan = (type: PlanType, parentId?: string | null) => {
    // Inline creation for Annual Plans
    if (type === 'annual') {
      const newPlan: AnnualPlan = {
        annual_id: 'new',
        year: selectedYear || new Date().getFullYear(),
        goal: '',
        expected_result: '',
        budget: 0,
        status: 'draft',
        user_id: user.user_id,
        author_name: user.displayName || user.name || '',
      };
      setSelectedType('annual');
      setSelectedPlan(newPlan);
      return;
    }

    // Inline creation for Quarterly Plans
    if (type === 'quarterly') {
      const newPlan: QuarterlyPlan = {
        quarterly_id: 'new',
        annual_plan_id: parentId || null,
        department_id: null,
        department_name: '',
        quarter: selectedQuarter || Math.ceil((new Date().getMonth() + 1) / 3),
        goal: '',
        expected_result: '',
        status: 'draft',
      };
      setSelectedType('quarterly');
      setSelectedPlan(newPlan);
      return;
    }

    // Inline creation for Monthly Plans
    if (type === 'monthly') {
      let effectiveParentId = parentId;

      // If no explicit parent provided, check if we have a selected Quarterly Plan
      if (!effectiveParentId && selectedType === 'quarterly' && selectedPlan) {
        effectiveParentId = (selectedPlan as QuarterlyPlan).quarterly_id;
      }

      const parentQuarterly = quarterlyPlans.find(q => q.quarterly_id === effectiveParentId);

      // Determine default month based on selected context or quarter
      let defaultMonth = new Date().getMonth() + 1; // 1-indexed
      if (selectedMonth !== null) {
        defaultMonth = selectedMonth + 1;
      } else if (selectedQuarter) {
        // First month of the quarter
        defaultMonth = (selectedQuarter - 1) * 3 + 1;
      }

      const newPlan: MonthlyPlan = {
        monthly_plan_id: 'new',
        quarterly_id: effectiveParentId || null,
        measure_id: null,
        year: selectedYear || new Date().getFullYear(),
        month: defaultMonth,
        description: '',
        status: 'draft',
        planned_hours: 160,
        department_id: parentQuarterly?.department_id || user.department_id || undefined,
        department_name: parentQuarterly?.department_name || '',
        process_id: parentQuarterly?.process_id || undefined,
        process_name: parentQuarterly?.process_name,
      };

      setSelectedType('monthly');
      setSelectedPlan(newPlan);
    }
  };

  const handleSuccess = useCallback(async (newPlanId?: string) => {
    await refreshPlans();
    handlePlanSuccess();
    fetchPlanCounts?.();

    if (newPlanId && selectedPlan) {
      if (selectedType === 'annual' && 'annual_id' in selectedPlan && selectedPlan.annual_id === 'new') {
        setSelectedPlan({
          ...selectedPlan,
          annual_id: newPlanId,
        });
      } else if (selectedType === 'quarterly' && 'quarterly_id' in selectedPlan && selectedPlan.quarterly_id === 'new') {
        setSelectedPlan({
          ...selectedPlan,
          quarterly_id: newPlanId,
        });
      } else if (selectedType === 'monthly' && 'monthly_plan_id' in selectedPlan && selectedPlan.monthly_plan_id === 'new') {
        setSelectedPlan({
          ...selectedPlan,
          monthly_plan_id: newPlanId,
        });
      }
    }
  }, [refreshPlans, handlePlanSuccess, fetchPlanCounts, selectedPlan, selectedType]);

  // Update selectedPlan when plans data changes (after edit/save)
  useEffect(() => {
    if (!selectedPlan || !selectedType) return;

    if (selectedType === 'annual') {
      const planId = (selectedPlan as AnnualPlan).annual_id;
      if (planId && planId !== 'new') {
        const updated = annualPlans.find(p => p.annual_id === planId);
        if (updated) setSelectedPlan(updated);
      }
    } else if (selectedType === 'quarterly') {
      const planId = (selectedPlan as QuarterlyPlan).quarterly_id;
      if (planId && planId !== 'new') {
        const updated = quarterlyPlans.find(p => p.quarterly_id === planId);
        if (updated) setSelectedPlan(updated);
      }
    } else if (selectedType === 'monthly') {
      const planId = (selectedPlan as MonthlyPlan).monthly_plan_id;
      if (planId && planId !== 'new') {
        const updated = monthlyPlans.find(p => p.monthly_plan_id === planId);
        if (updated) setSelectedPlan(updated);
      }
    }
  }, [annualPlans, quarterlyPlans, monthlyPlans, selectedPlan, selectedType]);

  // Task modal handlers
  const handleAddTaskFromTile = useCallback((plan: MonthlyPlan) => {
    setTaskModalPlan(plan);
    setIsTaskModalOpen(true);
  }, []);

  const handleTaskModalSuccess = useCallback(() => {
    setIsTaskModalOpen(false);
    setTaskModalPlan(null);
    refreshPlans();
  }, [refreshPlans]);

  const canCreate = canCreateAnnualPlans(user);
  const canEdit = user.role === 'chief' || user.role === 'head';

  // --- Render Left Panel Content ---
  const renderTreeContent = () => {
    // Для сотрудников - только активные планы, к которым они назначены
    if (isEmployee) {
      const myActivePlans = monthlyPlans.filter(
        p => p.status === 'active' && assignedPlanIds.includes(p.monthly_plan_id)
      );

      if (loading) {
        return (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        );
      }

      if (myActivePlans.length === 0) {
        return (
          <div className="text-center py-8 text-gray-400 text-sm">
            <p>У вас нет активных планов</p>
            <p className="text-xs mt-1">Обратитесь к руководителю для назначения</p>
          </div>
        );
      }

      // Группировка по процессу
      const NO_PROCESS = 'Без процесса';
      const plansByProcess: Record<string, MonthlyPlan[]> = {};
      myActivePlans.forEach(plan => {
        const proc = plan.process_name?.trim() || NO_PROCESS;
        (plansByProcess[proc] ??= []).push(plan);
      });
      const processKeys = Object.keys(plansByProcess).sort((a, b) => {
        if (a === NO_PROCESS) return 1;
        if (b === NO_PROCESS) return -1;
        return a.localeCompare(b, 'ru');
      });

      return (
        <div className="space-y-1">
          <div className="text-2xs font-medium text-gray-400 uppercase tracking-wide px-2 py-1 flex justify-between">
            <span>Мої активні плани</span>
            <span>({myActivePlans.length})</span>
          </div>
          {processKeys.map(proc => {
            const groupPlans = plansByProcess[proc];
            const expandKey = `employee-process-${proc}`;
            const expanded = isGroupExpanded(expandKey);

            return (
              <div key={expandKey} className="space-y-1.5">
                <GroupHeader
                  tone="indigo"
                  title={proc}
                  count={groupPlans.length}
                  expanded={expanded}
                  onToggle={() => toggleStatusGroup(expandKey)}
                  toggleAriaLabel={`${expanded ? 'Свернуть' : 'Развернуть'} ${proc}`}
                />
                {expanded && (
                  <div className="space-y-1.5 pl-2">
                    {groupPlans.map(monthPlan => {
                      const isSelected = selectedPlan && selectedType === 'monthly' && (selectedPlan as MonthlyPlan).monthly_plan_id === monthPlan.monthly_plan_id;
                      const qPlan = quarterlyPlans.find(q => q.quarterly_id === monthPlan.quarterly_id);
                      const spentHours = monthPlan.total_spent_hours || 0;
                      const plannedHours = monthPlan.planned_hours || 0;
                      const completionPct = monthPlan.completion_percentage || 0;
                      const monthName = new Date(2024, monthPlan.month - 1, 1).toLocaleString('ru-RU', { month: 'short' });

                      return (
                        <PlanTileCard
                          key={monthPlan.monthly_plan_id}
                          variant="monthly"
                          isSelected={!!isSelected}
                          onClick={() => handleSelectPlan('monthly', monthPlan)}
                          title={monthPlan.measure_name || 'Мероприятие не выбрано'}
                          subtitle={`${monthName} ${monthPlan.year}${qPlan?.department_name ? ' • ' + qPlan.department_name : ''}`}
                          status={monthPlan.status}
                          spentHours={spentHours}
                          plannedHours={plannedHours}
                          completionPct={completionPct}
                          actionButton={{ label: "Добавить задачу", onClick: () => handleAddTaskFromTile(monthPlan) }}
                          ariaLabel={`Месячный план: ${monthPlan.measure_name || 'Без мероприятия'}, ${completionPct}%`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }
    if (loading) {
      return (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      );
    }
    if (error) {
      return <div className="text-center py-8 text-red-500"><p className="text-sm">Ошибка загрузки</p></div>;
    }

    // Monthly Plans List (Filtered by Month)
    if (selectedMonth !== null) { // 0 is falsy, check for null
      const monthNum = selectedMonth + 1; // selectedMonth is 0-indexed, monthly_plans.month is 1-indexed
      const filteredMonthlyPlans = roleFilteredMonthlyPlans.filter(m => m.month === monthNum);
      const monthName = new Date(2024, selectedMonth, 1).toLocaleString('ru-RU', { month: 'long' });

      if (filteredMonthlyPlans.length === 0) {
        return <div className="text-center py-8 text-gray-400 text-sm">Месячные планы за {monthName} не найдены</div>;
      }

      // Группировка по отделу + процессу
      const NO_PROCESS = 'Без процесса';
      const NO_DEPT = 'Без отдела';
      const plansByGroup: Record<string, MonthlyPlan[]> = {};
      filteredMonthlyPlans.forEach(plan => {
        const dept = plan.department_name?.trim() || NO_DEPT;
        const proc = plan.process_name?.trim() || NO_PROCESS;
        const key = `${dept} — ${proc}`;
        (plansByGroup[key] ??= []).push(plan);
      });
      const groupKeys = Object.keys(plansByGroup).sort((a, b) => {
        const aNoProc = a.endsWith(NO_PROCESS);
        const bNoProc = b.endsWith(NO_PROCESS);
        if (aNoProc && !bNoProc) return 1;
        if (!aNoProc && bNoProc) return -1;
        return a.localeCompare(b, 'ru');
      });

      return (
        <div className="space-y-1">
          {groupKeys.map(gk => {
            const groupPlans = plansByGroup[gk];
            const expandKey = `monthly-${monthNum}-process-${gk}`;
            const expanded = isGroupExpanded(expandKey);

            return (
              <div key={expandKey} className="space-y-1.5">
                <GroupHeader
                  tone="indigo"
                  title={gk}
                  count={groupPlans.length}
                  expanded={expanded}
                  onToggle={() => toggleStatusGroup(expandKey)}
                  toggleAriaLabel={`${expanded ? 'Свернуть' : 'Развернуть'} ${gk}`}
                />
                {expanded && (
                  <div className="space-y-1.5 pl-2">
                    {groupPlans.map(monthPlan => {
                      const isSelected = selectedPlan && selectedType === 'monthly' && (selectedPlan as MonthlyPlan).monthly_plan_id === monthPlan.monthly_plan_id;
                      const spentHours = monthPlan.total_spent_hours || 0;
                      const plannedHours = monthPlan.planned_hours || 0;
                      const completionPct = monthPlan.completion_percentage || 0;
                      const canAddTask = assignedPlanIds.includes(monthPlan.monthly_plan_id);

                      return (
                        <PlanTileCard
                          key={monthPlan.monthly_plan_id}
                          variant="monthly"
                          isSelected={!!isSelected}
                          onClick={() => handleSelectPlan('monthly', monthPlan)}
                          title={monthPlan.measure_name || 'Мероприятие не выбрано'}
                          status={monthPlan.status}
                          spentHours={spentHours}
                          plannedHours={plannedHours}
                          completionPct={completionPct}
                          actionButton={canAddTask ? { label: "Добавить задачу", onClick: () => handleAddTaskFromTile(monthPlan) } : undefined}
                          ariaLabel={`Месячный план: ${monthPlan.measure_name || 'Без мероприятия'}, ${completionPct}%`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // Quarterly List

    if (selectedQuarter) {
      return (
        <div className="space-y-1">
          {filteredQuarterlyPlans.length > 0 ? (
            <>
              {statusOrder
                .map((status) => ({ status, items: filteredQuarterlyPlans.filter((p) => p.status === status) }))
                .filter((group) => group.items.length > 0)
                .map((group) => {
                  const groupKey = `quarterly-${selectedQuarter}-${group.status}`;
                  const expanded = isGroupExpanded(groupKey);
                  return (
                    <div key={groupKey} className="space-y-1.5">
                      <GroupHeader
                        tone="purple"
                        title={getPlanStatusText(group.status)}
                        count={group.items.length}
                        expanded={expanded}
                        onToggle={() => toggleStatusGroup(groupKey)}
                        toggleAriaLabel={`${expanded ? 'Свернуть' : 'Развернуть'} группу ${getPlanStatusText(group.status)}`}
                      />
                      {expanded && (
                        <div className="space-y-1.5 pl-2">
                          {group.items.map(plan => {
                            const planMonths = monthlyPlans.filter(m => m.quarterly_id === plan.quarterly_id);
                            const isSelected = selectedPlan && selectedType === 'quarterly' && (selectedPlan as QuarterlyPlan).quarterly_id === plan.quarterly_id;
                            const totalSpent = planMonths.reduce((sum, m) => sum + (m.total_spent_hours || 0), 0);
                            const totalPlanned = planMonths.reduce((sum, m) => sum + (m.planned_hours || 0), 0);
                            const completionPct = totalPlanned > 0 ? Math.round((totalSpent / totalPlanned) * 100) : 0;
                            return (
                              <PlanTileCard
                                key={plan.quarterly_id}
                                variant="quarterly"
                                isSelected={!!isSelected}
                                onClick={() => handleSelectPlan('quarterly', plan)}
                                title={plan.goal?.trim() || NO_PLAN_TITLE}
                                subtitle={plan.department_name}
                                status={plan.status}
                                spentHours={totalSpent}
                                plannedHours={totalPlanned}
                                completionPct={completionPct}
                                actionButton={canCreate ? { label: "Создать месячный план", onClick: () => handleCreatePlan('monthly', plan.quarterly_id) } : undefined}
                                ariaLabel={`Квартальный план: ${plan.goal?.trim() || NO_PLAN_TITLE}, ${completionPct}%`}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </>
          ) : (
            <div className="text-center py-8 text-gray-400 text-sm">Планы не найдены</div>
          )}
        </div>
      );
    }

    // Annual List
    return (
      <div className="space-y-1">
        {filteredAnnualPlans.length > 0 ? (
          <>
            {statusOrder
              .map((status) => ({ status, items: filteredAnnualPlans.filter((p) => p.status === status) }))
              .filter((group) => group.items.length > 0)
              .map((group) => {
                const groupKey = `annual-${selectedYear}-${group.status}`;
                const expanded = isGroupExpanded(groupKey);
                return (
                  <div key={groupKey} className="space-y-1.5">
                    <GroupHeader
                      tone="amber"
                      title={getPlanStatusText(group.status)}
                      count={group.items.length}
                      expanded={expanded}
                      onToggle={() => toggleStatusGroup(groupKey)}
                      toggleAriaLabel={`${expanded ? 'Свернуть' : 'Развернуть'} группу ${getPlanStatusText(group.status)}`}
                    />
                    {expanded && (
                      <div className="space-y-1.5 pl-2">
                        {group.items.map(plan => {
                          const planQuarters = quarterlyPlans.filter(q => q.annual_plan_id === plan.annual_id);
                          const isSelected = selectedPlan && selectedType === 'annual' && (selectedPlan as AnnualPlan).annual_id === plan.annual_id;
                          const quarterIds = planQuarters.map(q => q.quarterly_id);
                          const yearMonthlyPlans = monthlyPlans.filter(m => quarterIds.includes(m.quarterly_id || ''));
                          const totalSpent = yearMonthlyPlans.reduce((sum, m) => sum + (m.total_spent_hours || 0), 0);
                          const totalPlanned = yearMonthlyPlans.reduce((sum, m) => sum + (m.planned_hours || 0), 0);
                          const completionPct = totalPlanned > 0 ? Math.round((totalSpent / totalPlanned) * 100) : 0;
                          return (
                            <PlanTileCard
                              key={plan.annual_id}
                              variant="annual"
                              isSelected={!!isSelected}
                              onClick={() => handleSelectPlan('annual', plan)}
                              title={plan.goal?.trim() || NO_PLAN_TITLE}
                              subtitle={plan.author_name}
                              status={plan.status}
                              spentHours={totalSpent}
                              plannedHours={totalPlanned}
                              completionPct={completionPct}
                              actionButton={canCreate ? { label: "Создать квартальный план", onClick: () => handleCreatePlan('quarterly', plan.annual_id) } : undefined}
                              ariaLabel={`Годовой план: ${plan.goal?.trim() || NO_PLAN_TITLE}, ${completionPct}%`}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </>
        ) : (
          <div className="text-center py-8 text-gray-400 text-sm">Планы не найдены</div>
        )}
      </div>
    );
  };

  // --- Render Right Panel Content ---
  const renderDetailsContent = () => {
    if (!selectedPlan || !selectedType) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <p className="text-lg mb-2">Выберите план</p>
            <p className="text-sm">Кликните на план в дереве слева для просмотра деталей</p>
          </div>
        </div>
      );
    }

    if (selectedType === 'annual') {
      return (
        <AnnualPlanDetails
          plan={selectedPlan as AnnualPlan}
          onClose={handleCloseDetails}
          onUpdate={handleSuccess}
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
          onClose={handleCloseDetails}
          onUpdate={handleSuccess}
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
          onClose={handleCloseDetails}
          onUpdate={handleSuccess}
          canEdit={canEdit}
          quarterlyPlans={quarterlyPlans}
        />
      );
    }

    return null;
  };

  return (
    <>
      <TwoPanelLayout
        isDrawerOpen={isDrawerOpen}
        onDrawerClose={handleDrawerClose}
        rightPanelClassName={
          selectedType === 'monthly' ? 'bg-indigo-50/30' :
          selectedType === 'quarterly' ? 'bg-purple-50/30' :
          selectedType === 'annual' ? 'bg-amber-50/30' : 'bg-transparent'
        }
        resizerClassName="hover:bg-indigo-300/50 active:bg-indigo-400/50"
        leftPanel={
          <div className="h-full min-h-0 flex flex-col">
            {/* Фильтры - только для chief и head */}
            {!isEmployee && (
              <PlanTreeHeader
                availableYears={availableYears}
                selectedYear={selectedYear}
                selectedQuarter={selectedQuarter}
                selectedMonth={selectedMonth}
                annualPlans={annualPlans}
                quarterlyPlans={quarterlyPlans}
                onSelectYear={setSelectedYear}
                onSelectQuarter={setSelectedQuarter}
                onSelectMonth={setSelectedMonth}
                onCreatePlan={handleCreatePlan}
                canCreate={canCreate}
                onDoubleClickYear={(plan) => handleSelectPlan('annual', plan)}
                user={user}
              />
            )}
            <div className={cn(
              "flex-1 min-h-0 overflow-y-auto p-3 space-y-4",
              isEmployee ? "bg-indigo-50/20" :
                selectedMonth !== null ? "bg-indigo-50/20" :
                  selectedQuarter ? "bg-purple-50/20" :
                    selectedYear ? "bg-amber-50/20" : "bg-slate-50/20"
            )}>
              {renderTreeContent()}
            </div>
            <div className="sticky bottom-0 z-10 flex items-center gap-2 px-3 py-2 border-t border-slate-200/70 text-slate-500 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
              <FileText
                className={cn(
                  "h-4 w-4",
                  isEmployee ? "text-indigo-600" :
                    selectedMonth !== null ? "text-indigo-600" :
                      selectedQuarter ? "text-purple-600" :
                        selectedYear ? "text-amber-600" : "text-slate-500"
                )}
                aria-hidden="true"
              />
              <span className="text-sm">Всего планов: {getVisiblePlansCount()}</span>
            </div>
          </div>
        }
        rightPanel={renderDetailsContent()}
      />

      {/* Task Modal - for adding tasks from plan tiles */}
      {taskModalPlan && (
        <AddTaskModal
          isOpen={isTaskModalOpen}
          onClose={() => {
            setIsTaskModalOpen(false);
            setTaskModalPlan(null);
          }}
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
