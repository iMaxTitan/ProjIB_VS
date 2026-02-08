'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { UserInfo } from '@/types/azure';
import { AnnualPlan, QuarterlyPlan, MonthlyPlan, PlanStatus, canCreateAnnualPlans } from '@/types/planning';
import { usePlans } from '@/hooks/usePlans';
import { usePlanNavigation } from '@/hooks/planning/usePlanNavigation';
import { usePlanFilters } from '@/hooks/planning/usePlanFilters';
import { getWeekNumber, getWeekDateRange, getStatusBgClass } from '@/lib/utils/planning-utils';
import { Plus } from 'lucide-react';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { supabase } from '@/lib/supabase';

// Components
import PlansLayout from './PlansLayout';
import PlanTreeHeader from './tree/PlanTreeHeader';
import AnnualPlanDetails from './details/AnnualPlanDetails';
import QuarterlyPlanDetails from './details/QuarterlyPlanDetails';
import MonthlyPlanDetails from './details/MonthlyPlanDetails';
import AddTaskModal from '@/components/dashboard/Tasks/AddTaskModal';
import { cn } from '@/lib/utils';
import { getPlanStatusText } from '@/types/planning';

interface PlansPageNewProps {
  user: UserInfo;
  fetchPlanCounts?: () => void;
}

type PlanType = 'annual' | 'quarterly' | 'monthly';

export default function PlansPageNew({ user, fetchPlanCounts }: PlansPageNewProps) {
  // State
  const [selectedType, setSelectedType] = useState<PlanType | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<AnnualPlan | QuarterlyPlan | MonthlyPlan | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Parent ID for creating child plans
  const [parentIdForCreate, setParentIdForCreate] = useState<string | null>(null);

  // Task modal state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalPlan, setTaskModalPlan] = useState<MonthlyPlan | null>(null);
  const [assignedPlanIds, setAssignedPlanIds] = useState<string[]>([]);

  // Mobile detection
  const isMobile = useIsMobile();

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
  } = usePlans(user);

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
  } = usePlanNavigation(annualPlans, quarterlyPlans);

  const {
    filteredAnnualPlans,
    filteredQuarterlyPlans
  } = usePlanFilters(annualPlans, quarterlyPlans, selectedYear, selectedQuarter, user);

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

  // Закрытие деталей плана (и drawer на мобильном)
  const handleCloseDetails = () => {
    setSelectedPlan(null);
    setSelectedType(null);
    setIsDrawerOpen(false);
  };

  const handleCreatePlan = (type: PlanType, parentId?: string | null) => {
    setParentIdForCreate(parentId || null);

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
      const parentAnnual = annualPlans.find(a => a.annual_id === parentId);
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

  const handleEditPlan = () => {
    if (!selectedPlan || !selectedType) return;
    setParentIdForCreate(null);
    // All plan types edit inline in their Details components
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
  }, [annualPlans, quarterlyPlans, monthlyPlans]);

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
  const isEmployee = user.role === 'employee';

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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
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

      return (
        <div className="space-y-1">
          <div className="text-2xs font-medium text-gray-400 uppercase tracking-wide px-2 py-1 flex justify-between">
            <span>Мои активные планы</span>
            <span>({myActivePlans.length})</span>
          </div>
          {myActivePlans.map(monthPlan => {
            const isSelected = selectedPlan && selectedType === 'monthly' && (selectedPlan as MonthlyPlan).monthly_plan_id === monthPlan.monthly_plan_id;
            const qPlan = quarterlyPlans.find(q => q.quarterly_id === monthPlan.quarterly_id);
            const spentHours = monthPlan.total_spent_hours || 0;
            const plannedHours = monthPlan.planned_hours || 0;
            const completionPct = monthPlan.completion_percentage || 0;
            const monthName = new Date(2024, monthPlan.month - 1, 1).toLocaleString('ru-RU', { month: 'short' });

            const progressColor = completionPct >= 80 ? 'bg-emerald-500' : completionPct >= 50 ? 'bg-amber-500' : 'bg-blue-500';
            const progressBgColor = isSelected ? 'bg-white/30' : 'bg-gray-200';

            return (
              <div
                key={monthPlan.monthly_plan_id}
                onClick={() => handleSelectPlan('monthly', monthPlan)}
                className={cn(
                  "px-3 py-2 rounded-xl cursor-pointer transition-all border shadow-sm",
                  isSelected ? "bg-gradient-to-r from-indigo-400/80 to-blue-400/80 text-white shadow-md border-white/20 backdrop-blur-md" : "glass-card text-slate-800 bg-white/70 hover:bg-white/90 hover:border-indigo-300"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={cn("w-3 h-3 rounded-full flex-shrink-0", getStatusBgClass(monthPlan.status), isSelected && "ring-2 ring-white")}
                    title={getPlanStatusText(monthPlan.status)}
                    aria-label={getPlanStatusText(monthPlan.status)}
                  />
                  <span className={cn("text-2xs font-bold", isSelected ? "text-indigo-100" : "text-slate-500")}>
                    {monthName} {monthPlan.year}
                  </span>
                  {qPlan?.department_name && (
                    <span className={cn("text-2xs truncate flex-1", isSelected ? "text-indigo-200" : "text-slate-400")}>• {qPlan.department_name}</span>
                  )}
                  <span className={cn("text-2xs font-mono font-black border-l px-2 flex-shrink-0", isSelected ? "text-white border-white/20" : "text-indigo-600 border-indigo-100")}>
                    {spentHours}h / {plannedHours}h
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddTaskFromTile(monthPlan);
                    }}
                    aria-label="Добавить задачу"
                    className={cn(
                      "p-0.5 rounded transition-all",
                      "focus:outline-none focus:ring-2 focus:ring-indigo-500",
                      isSelected
                        ? "text-indigo-200 hover:text-white hover:bg-white/20"
                        : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-100"
                    )}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <p className={cn("text-xs leading-tight line-clamp-2 mb-1", isSelected && "font-semibold")}>{monthPlan.measure_name || 'Мероприятие не выбрано'}</p>

                {/* Прогресс-бар */}
                <div className="flex items-center gap-2">
                  <div className={cn("flex-1 h-1.5 rounded-full overflow-hidden", progressBgColor)}>
                    <div
                      className={cn("h-full rounded-full transition-all", progressColor)}
                      style={{ width: `${Math.min(100, completionPct)}%` }}
                    />
                  </div>
                  <span className={cn("text-2xs font-bold tabular-nums min-w-[32px] text-right", isSelected ? "text-white" : completionPct >= 80 ? "text-emerald-600" : completionPct >= 50 ? "text-amber-600" : "text-blue-600")}>
                    {completionPct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    if (loading) {
      return (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>
      );
    }
    if (error) {
      return <div className="text-center py-8 text-red-500"><p className="text-sm">Ошибка загрузки</p></div>;
    }

    // Monthly Plans List (Filtered by Month)
    if (selectedMonth !== null) { // 0 is falsy, check for null
      const monthNum = selectedMonth + 1; // selectedMonth is 0-indexed, monthly_plans.month is 1-indexed
      const filteredMonthlyPlans = monthlyPlans.filter(m => m.month === monthNum);
      const monthName = new Date(2024, selectedMonth, 1).toLocaleString('ru-RU', { month: 'long' });

      if (filteredMonthlyPlans.length === 0) {
        return <div className="text-center py-8 text-gray-400 text-sm">Месячные планы за {monthName} не найдены</div>;
      }

      return (
        <div className="space-y-1">
          <div className="text-2xs font-medium text-gray-400 uppercase tracking-wide px-2 py-1 flex justify-between">
            <span>Месячные планы - {monthName}</span>
            <span>({filteredMonthlyPlans.length})</span>
          </div>
          {filteredMonthlyPlans.map(monthPlan => {
            const isSelected = selectedPlan && selectedType === 'monthly' && (selectedPlan as MonthlyPlan).monthly_plan_id === monthPlan.monthly_plan_id;
            const qPlan = quarterlyPlans.find(q => q.quarterly_id === monthPlan.quarterly_id);
            const spentHours = monthPlan.total_spent_hours || 0;
            const plannedHours = monthPlan.planned_hours || 0;
            const completionPct = monthPlan.completion_percentage || 0;
            const canAddTask = assignedPlanIds.includes(monthPlan.monthly_plan_id);

            // Цвет прогресса: зеленый ≥80%, желтый 50-80%, синий <50% (начало работы)
            const progressColor = completionPct >= 80 ? 'bg-emerald-500' : completionPct >= 50 ? 'bg-amber-500' : 'bg-blue-500';
            const progressBgColor = isSelected ? 'bg-white/30' : 'bg-gray-200';

            return (
              <div
                key={monthPlan.monthly_plan_id}
                onClick={() => handleSelectPlan('monthly', monthPlan)}
                className={cn(
                  "px-3 py-2 rounded-xl cursor-pointer transition-all border shadow-sm",
                  isSelected ? "bg-gradient-to-r from-indigo-400/80 to-blue-400/80 text-white shadow-md border-white/20 backdrop-blur-md" : "glass-card text-slate-800 bg-white/70 hover:bg-white/90 hover:border-indigo-300"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={cn("w-3 h-3 rounded-full flex-shrink-0", getStatusBgClass(monthPlan.status), isSelected && "ring-2 ring-white")}
                    title={getPlanStatusText(monthPlan.status)}
                    aria-label={getPlanStatusText(monthPlan.status)}
                  />
                  {qPlan?.department_name && (
                    <span className={cn("text-2xs font-bold truncate flex-1", isSelected ? "text-indigo-100" : "text-slate-500")}>{qPlan.department_name}</span>
                  )}
                  <span className={cn("text-2xs font-mono font-black border-l px-2 flex-shrink-0", isSelected ? "text-white border-white/20" : "text-indigo-600 border-indigo-100")}>
                    {spentHours}h / {plannedHours}h
                  </span>
                  {canAddTask && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddTaskFromTile(monthPlan);
                      }}
                      aria-label="Добавить задачу"
                      className={cn(
                        "p-0.5 rounded transition-all",
                        "focus:outline-none focus:ring-2 focus:ring-indigo-500",
                        isSelected
                          ? "text-indigo-200 hover:text-white hover:bg-white/20"
                          : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-100"
                      )}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <p className={cn("text-xs leading-tight line-clamp-2 mb-1", isSelected && "font-semibold")}>{monthPlan.measure_name || 'Мероприятие не выбрано'}</p>

                {/* Прогресс-бар */}
                <div className="flex items-center gap-2">
                  <div className={cn("flex-1 h-1.5 rounded-full overflow-hidden", progressBgColor)}>
                    <div
                      className={cn("h-full rounded-full transition-all", progressColor)}
                      style={{ width: `${Math.min(100, completionPct)}%` }}
                    />
                  </div>
                  <span className={cn("text-2xs font-bold tabular-nums min-w-[32px] text-right", isSelected ? "text-white" : completionPct >= 80 ? "text-emerald-600" : completionPct >= 50 ? "text-amber-600" : "text-blue-600")}>
                    {completionPct}%
                  </span>
                </div>
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
              <div className="text-2xs font-medium text-gray-400 uppercase tracking-wide px-2 py-1">
                Квартальные планы Q{selectedQuarter} ({filteredQuarterlyPlans.length})
              </div>
              {filteredQuarterlyPlans.map(plan => {
                const planMonths = monthlyPlans.filter(m => m.quarterly_id === plan.quarterly_id);
                const isSelected = selectedPlan && selectedType === 'quarterly' && (selectedPlan as QuarterlyPlan).quarterly_id === plan.quarterly_id;

                // Агрегируем часы по всем месячным планам квартала
                const totalSpent = planMonths.reduce((sum, m) => sum + (m.total_spent_hours || 0), 0);
                const totalPlanned = planMonths.reduce((sum, m) => sum + (m.planned_hours || 0), 0);
                const completionPct = totalPlanned > 0 ? Math.round((totalSpent / totalPlanned) * 100) : 0;

                // Цвет прогресса: зеленый ≥80%, желтый 50-80%, синий <50% (начало работы)
                const progressColor = completionPct >= 80 ? 'bg-emerald-500' : completionPct >= 50 ? 'bg-amber-500' : 'bg-blue-500';
                const progressBgColor = isSelected ? 'bg-white/30' : 'bg-gray-200';

                return (
                  <div
                    key={plan.quarterly_id}
                    onClick={() => handleSelectPlan('quarterly', plan)}
                    className={cn(
                      "px-3 py-2 rounded-xl cursor-pointer transition-all border shadow-sm",
                      isSelected ? "bg-gradient-to-r from-purple-400/80 to-violet-400/80 text-white shadow-md border-white/20 backdrop-blur-md" : "glass-card text-slate-800 bg-white/70 hover:bg-white/90 hover:border-purple-300"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn("w-3 h-3 rounded-full flex-shrink-0", getStatusBgClass(plan.status), isSelected && "ring-2 ring-white")}
                        title={getPlanStatusText(plan.status)}
                        aria-label={getPlanStatusText(plan.status)}
                      />
                      {plan.department_name && (
                        <span className={cn("text-2xs font-bold truncate flex-1", isSelected ? "text-purple-100" : "text-slate-500")}>{plan.department_name}</span>
                      )}
                      <span className={cn("text-2xs font-mono font-black border-l px-2 flex-shrink-0", isSelected ? "text-white border-white/20" : "text-purple-600 border-purple-100")}>
                        {Math.round(totalSpent)}h / {totalPlanned}h
                      </span>
                      {canCreate && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreatePlan('monthly', plan.quarterly_id);
                          }}
                          className="p-0.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 rounded transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          title="Создать месячный план"
                          aria-label="Создать месячный план"
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <p className={cn("text-xs leading-tight line-clamp-2 mb-1", isSelected && "font-semibold")}>{plan.goal}</p>

                    {/* Прогресс-бар */}
                    <div className="flex items-center gap-2">
                      <div className={cn("flex-1 h-1.5 rounded-full overflow-hidden", progressBgColor)}>
                        <div
                          className={cn("h-full rounded-full transition-all", progressColor)}
                          style={{ width: `${Math.min(100, completionPct)}%` }}
                        />
                      </div>
                      <span className={cn("text-2xs font-bold tabular-nums min-w-[32px] text-right", isSelected ? "text-white" : completionPct >= 80 ? "text-emerald-600" : completionPct >= 50 ? "text-amber-600" : "text-blue-600")}>
                        {completionPct}%
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="text-center py-3 text-gray-400 text-xs border-t mt-2">
                Выберите квартальный план для просмотра месячных планов
              </div>
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
            <div className="text-2xs font-medium text-gray-400 uppercase tracking-wide px-2 py-1">
              Годовые планы {selectedYear} ({filteredAnnualPlans.length})
            </div>
            {filteredAnnualPlans.map(plan => {
              const planQuarters = quarterlyPlans.filter(q => q.annual_plan_id === plan.annual_id);
              const isSelected = selectedPlan && selectedType === 'annual' && (selectedPlan as AnnualPlan).annual_id === plan.annual_id;

              // Агрегируем часы по всем месячным планам года (через квартальные)
              const quarterIds = planQuarters.map(q => q.quarterly_id);
              const yearMonthlyPlans = monthlyPlans.filter(m => quarterIds.includes(m.quarterly_id || ''));
              const totalSpent = yearMonthlyPlans.reduce((sum, m) => sum + (m.total_spent_hours || 0), 0);
              const totalPlanned = yearMonthlyPlans.reduce((sum, m) => sum + (m.planned_hours || 0), 0);
              const completionPct = totalPlanned > 0 ? Math.round((totalSpent / totalPlanned) * 100) : 0;

              // Цвет прогресса: зеленый ≥80%, желтый 50-80%, синий <50% (начало работы)
              const progressColor = completionPct >= 80 ? 'bg-emerald-500' : completionPct >= 50 ? 'bg-amber-500' : 'bg-blue-500';
              const progressBgColor = isSelected ? 'bg-white/30' : 'bg-gray-200';

              return (
                <div
                  key={plan.annual_id}
                  onClick={() => handleSelectPlan('annual', plan)}
                  className={cn(
                    "px-3 py-2 rounded-xl cursor-pointer transition-all border shadow-sm",
                    isSelected ? "bg-gradient-to-r from-amber-400/80 to-orange-400/80 text-white shadow-md border-white/20 backdrop-blur-md" : "glass-card text-slate-800 bg-white/70 hover:bg-white/90 hover:border-amber-300"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn("w-3 h-3 rounded-full flex-shrink-0", getStatusBgClass(plan.status), isSelected && "ring-2 ring-white")}
                      title={getPlanStatusText(plan.status)}
                      aria-label={getPlanStatusText(plan.status)}
                    />
                    {plan.author_name && (
                      <span className={cn("text-2xs font-bold truncate flex-1", isSelected ? "text-amber-100" : "text-slate-500")}>{plan.author_name}</span>
                    )}
                    <span className={cn("text-2xs font-mono font-black border-l px-2 flex-shrink-0", isSelected ? "text-white border-white/20" : "text-amber-600 border-amber-100")}>
                      {Math.round(totalSpent)}h / {totalPlanned}h
                    </span>
                    {canCreate && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreatePlan('quarterly', plan.annual_id);
                        }}
                        className="p-0.5 text-slate-400 hover:text-purple-600 hover:bg-purple-100 rounded transition-all focus:outline-none focus:ring-2 focus:ring-purple-500"
                        title="Создать квартальный план"
                        aria-label="Создать квартальный план"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <p className={cn("text-xs leading-tight line-clamp-2 mb-1", isSelected && "font-semibold")}>{plan.goal}</p>

                  {/* Прогресс-бар */}
                  <div className="flex items-center gap-2">
                    <div className={cn("flex-1 h-1.5 rounded-full overflow-hidden", progressBgColor)}>
                      <div
                        className={cn("h-full rounded-full transition-all", progressColor)}
                        style={{ width: `${Math.min(100, completionPct)}%` }}
                      />
                    </div>
                    <span className={cn("text-2xs font-bold tabular-nums min-w-[32px] text-right", isSelected ? "text-white" : completionPct >= 80 ? "text-emerald-600" : completionPct >= 50 ? "text-amber-600" : "text-blue-600")}>
                      {completionPct}%
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="text-center py-4 text-gray-400 text-xs">
              Выберите квартал во вкладках выше для просмотра квартальных планов
            </div>
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
          onEdit={handleEditPlan}
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
          onEdit={handleEditPlan}
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
      <PlansLayout
        selectedType={selectedType}
        isDrawerOpen={isDrawerOpen}
        onDrawerClose={handleDrawerClose}
        leftPanel={
          <>
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
              "flex-1 overflow-y-auto p-3 space-y-4",
              isEmployee ? "bg-indigo-50/20" :
                selectedMonth !== null ? "bg-indigo-50/20" :
                  selectedQuarter ? "bg-purple-50/20" :
                    selectedYear ? "bg-amber-50/20" : "bg-slate-50/20"
            )}>
              {renderTreeContent()}
            </div>
          </>
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
