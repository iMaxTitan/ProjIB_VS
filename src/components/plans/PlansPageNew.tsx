'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { UserInfo } from '@/types/azure';
import { AnnualPlan, QuarterlyPlan, WeeklyPlan, MonthlyPlan, PlanStatus, canCreateAnnualPlans } from '@/types/planning';
import { usePlans } from '@/hooks/usePlans';
import { usePlanNavigation } from '@/hooks/planning/usePlanNavigation';
import { usePlanFilters } from '@/hooks/planning/usePlanFilters';
import { getWeekNumber, getWeekDateRange, getStatusColorClasses, getStatusVariant, getStatusBgClass } from '@/lib/utils/planning-utils';
import { Plus } from 'lucide-react';
import { useIsMobile } from '@/hooks/useMediaQuery';

// Components
import PlansLayout from './PlansLayout';
import PlanTreeHeader from './tree/PlanTreeHeader';
import PlanStatusFilter from './tree/PlanStatusFilter';
import AnnualPlanDetails from './details/AnnualPlanDetails';
import QuarterlyPlanDetails from './details/QuarterlyPlanDetails';
import WeeklyPlanDetails from './details/WeeklyPlanDetails';
import MonthlyPlanDetails from './details/MonthlyPlanDetails';
import { cn } from '@/lib/utils';
import { getPlanStatusText } from '@/types/planning';

interface PlansPageNewProps {
  user: UserInfo;
  fetchPlanCounts?: () => void;
}

type PlanType = 'annual' | 'quarterly' | 'weekly' | 'monthly';

export default function PlansPageNew({ user, fetchPlanCounts }: PlansPageNewProps) {
  // State
  const [selectedType, setSelectedType] = useState<PlanType | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<AnnualPlan | QuarterlyPlan | WeeklyPlan | MonthlyPlan | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Parent ID for creating child plans
  const [parentIdForCreate, setParentIdForCreate] = useState<string | null>(null);

  // Mobile detection
  const isMobile = useIsMobile();

  // Data
  const {
    annualPlans,
    quarterlyPlans,
    weeklyPlans,
    monthlyPlans,
    loading,
    error,
    fetchAllPlans,
    refreshPlans,
    fetchAnnualPlans,
    fetchQuarterlyPlans,
    fetchWeeklyPlans,
    fetchMonthlyPlans,
    handlePlanSuccess
  } = usePlans(user);

  // Initial Load
  useEffect(() => {
    fetchAnnualPlans();
  }, [fetchAnnualPlans]);


  // Hooks
  const {
    selectedYear, setSelectedYear,
    selectedQuarter, setSelectedQuarter,
    selectedMonth, setSelectedMonth,
    // selectedWeekNumber, setSelectedWeekNumber, // Deprecated
    availableYears
  } = usePlanNavigation(annualPlans, quarterlyPlans, weeklyPlans);

  const {
    searchQuery, setSearchQuery, // eslint-disable-line @typescript-eslint/no-unused-vars
    statusFilter, setStatusFilter,
    filteredAnnualPlans,
    filteredQuarterlyPlans,
    filteredWeeklyPlans
  } = usePlanFilters(annualPlans, quarterlyPlans, weeklyPlans, selectedYear, selectedQuarter, user);

  // Lazy Load Quarterly Plans
  useEffect(() => {
    if (selectedYear) {
      fetchQuarterlyPlans(selectedYear);
    }
  }, [selectedYear, fetchQuarterlyPlans]);

  // Lazy Load Weekly Plans
  useEffect(() => {
    if (selectedYear && selectedQuarter && quarterlyPlans.length > 0) {
      fetchWeeklyPlans(selectedQuarter);
    }
  }, [selectedYear, selectedQuarter, quarterlyPlans, fetchWeeklyPlans]);

  // Lazy Load Monthly Plans
  useEffect(() => {
    if (selectedYear && selectedQuarter && quarterlyPlans.length > 0) {
      fetchMonthlyPlans(selectedQuarter);
    }
  }, [selectedYear, selectedQuarter, quarterlyPlans, fetchMonthlyPlans]);

  // Handlers
  const handleSelectPlan = (type: PlanType, plan: AnnualPlan | QuarterlyPlan | WeeklyPlan | MonthlyPlan) => {
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

    // Inline creation for Weekly Plans
    if (type === 'weekly') {
      let effectiveParentId = parentId;

      // If no explicit parent provided, check if we have a selected Quarterly Plan
      if (!effectiveParentId && selectedType === 'quarterly' && selectedPlan) {
        effectiveParentId = (selectedPlan as QuarterlyPlan).quarterly_id;
      }

      const parentQuarterly = quarterlyPlans.find(q => q.quarterly_id === effectiveParentId);

      // Determine default date based on selected context
      const defaultDate = new Date();
      if (selectedYear) {
        defaultDate.setFullYear(selectedYear);
        // If selectedQuarter/selectedMonth is active, pick correct date
        if (selectedMonth !== null) {
          defaultDate.setMonth(selectedMonth);
          defaultDate.setDate(1); // Start of month

          // Adjust to Monday if needed? No, weekly_date expects exact date usually, 
          // but we usually pick Monday of the current week. 
          // Here just defaulting to 1st of month is OK, backend/UI might correct it to Monday.
        } else if (selectedQuarter) {
          const targetMonth = (selectedQuarter - 1) * 3;
          defaultDate.setMonth(targetMonth);
          defaultDate.setDate(1); // Start of quarter
        }
      }

      const newPlan: WeeklyPlan = {
        weekly_id: 'new', // Placeholder ID
        quarterly_id: effectiveParentId || null,
        weekly_date: defaultDate.toISOString(),
        expected_result: '',
        status: 'draft',
        planned_hours: 0,
        department_id: parentQuarterly?.department_id || user.department_id || null,
        department_name: parentQuarterly?.department_name || '',
      };

      setSelectedType('weekly');
      setSelectedPlan(newPlan);
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
        service_id: null,
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
      if ((selectedPlan as any).annual_id === 'new') {
        setSelectedPlan(prev => ({ ...prev!, annual_id: newPlanId } as any));
      } else if ((selectedPlan as any).quarterly_id === 'new') {
        setSelectedPlan(prev => ({ ...prev!, quarterly_id: newPlanId } as any));
      } else if ((selectedPlan as any).weekly_id === 'new') {
        setSelectedPlan(prev => ({ ...prev!, weekly_id: newPlanId } as any));
      } else if ((selectedPlan as any).monthly_plan_id === 'new') {
        setSelectedPlan(prev => ({ ...prev!, monthly_plan_id: newPlanId } as any));
      }
    }
  }, [refreshPlans, handlePlanSuccess, fetchPlanCounts, selectedPlan]);

  const canCreate = canCreateAnnualPlans(user);
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const canEdit = user.role === 'chief' || user.role === 'head';

  // --- Render Left Panel Content ---
  const renderTreeContent = () => {
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
      const monthName = new Date(2024, selectedMonth, 1).toLocaleString('uk-UA', { month: 'long' });

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

            return (
              <div
                key={monthPlan.monthly_plan_id}
                onClick={() => handleSelectPlan('monthly', monthPlan)}
                className={cn(
                  "p-3 rounded-xl cursor-pointer transition-all border shadow-sm",
                  isSelected ? "bg-gradient-to-r from-indigo-500 to-blue-500 text-white ring-2 ring-indigo-500/50 shadow-xl border-indigo-500/50" : "glass-card text-slate-800 bg-white/70 hover:bg-white/90 hover:border-indigo-300"
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={cn("text-3xs px-2 py-0.5 rounded-full font-black uppercase shadow-sm", isSelected ? "bg-white text-indigo-700" : getStatusColorClasses(monthPlan.status))}>
                    {getPlanStatusText(monthPlan.status)}
                  </span>
                  {qPlan?.department_name && (
                    <span className={cn("text-2xs font-bold truncate flex-1", isSelected ? "text-indigo-100" : "text-slate-500")}>{qPlan.department_name}</span>
                  )}
                  <span className={cn("text-2xs font-mono font-black border-l px-2 flex-shrink-0", isSelected ? "text-white border-white/20" : "text-indigo-600 border-indigo-100")}>{monthPlan.planned_hours}h</span>
                </div>
                <p className="text-xs font-semibold leading-relaxed line-clamp-2">{monthPlan.service_name || (monthPlan as any).title || 'Без назви'}</p>
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

                return (
                  <div
                    key={plan.quarterly_id}
                    onClick={() => handleSelectPlan('quarterly', plan)}
                    className={cn(
                      "p-3 rounded-xl cursor-pointer transition-all border shadow-sm",
                      isSelected ? "bg-gradient-to-r from-purple-500 to-violet-500 text-white ring-2 ring-purple-500/50 shadow-xl border-purple-500/50" : "glass-card text-slate-800 bg-white/70 hover:bg-white/90 hover:border-purple-300"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={cn("text-3xs px-2 py-0.5 rounded-full font-black uppercase shadow-sm", isSelected ? "bg-white text-purple-700" : getStatusColorClasses(plan.status))}>
                        {getPlanStatusText(plan.status)}
                      </span>
                      {plan.department_name && (
                        <span className={cn("text-2xs font-bold truncate flex-1", isSelected ? "text-purple-100" : "text-slate-500")}>{plan.department_name}</span>
                      )}
                      <span className={cn("text-2xs font-mono font-black border-l px-2 flex-shrink-0", isSelected ? "text-white border-white/20" : "text-purple-600 border-purple-100")}>{planMonths.length}m</span>
                      {canCreate && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreatePlan('monthly', plan.quarterly_id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white/40 rounded-md transition-colors border border-transparent hover:border-indigo-100 shadow-sm"
                          title="Создать месячный план"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs font-semibold leading-relaxed line-clamp-2">{plan.goal}</p>
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

              return (
                <div
                  key={plan.annual_id}
                  onClick={() => handleSelectPlan('annual', plan)}
                  className={cn(
                    "p-3 rounded-xl cursor-pointer transition-all border shadow-sm",
                    isSelected ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white ring-2 ring-amber-500/50 shadow-xl border-amber-500/50" : "glass-card text-slate-800 bg-white/70 hover:bg-white/90 hover:border-amber-300"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={cn("text-3xs px-2 py-0.5 rounded-full font-black uppercase shadow-sm", isSelected ? "bg-white text-amber-700" : getStatusColorClasses(plan.status))}>
                      {getPlanStatusText(plan.status)}
                    </span>
                    {plan.author_name && (
                      <span className={cn("text-2xs font-bold truncate flex-1", isSelected ? "text-amber-100" : "text-slate-500")}>{plan.author_name}</span>
                    )}
                    <span className={cn("text-2xs font-mono font-black border-l px-2 flex-shrink-0", isSelected ? "text-white border-white/20" : "text-amber-600 border-amber-100")}>{planQuarters.length}Q</span>
                    {canCreate && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreatePlan('quarterly', plan.annual_id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-white/40 rounded-md transition-colors border border-transparent hover:border-purple-100 shadow-sm"
                        title="Создать квартальный план"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs font-semibold leading-relaxed line-clamp-2">{plan.goal}</p>
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
          weeklyPlans={weeklyPlans}
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

    if (selectedType === 'weekly') {
      return (
        <WeeklyPlanDetails
          plan={selectedPlan as WeeklyPlan}
          user={user}
          onEdit={handleEditPlan}
          onClose={handleCloseDetails}
          onUpdate={handleSuccess}
          canEdit={canEdit}
          quarterlyPlans={quarterlyPlans}
          annualPlans={annualPlans}
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
            <PlanTreeHeader
              availableYears={availableYears}
              selectedYear={selectedYear}
              selectedQuarter={selectedQuarter}
              selectedMonth={selectedMonth}
              annualPlans={annualPlans}
              quarterlyPlans={quarterlyPlans}
              weeklyPlans={weeklyPlans}
              onSelectYear={setSelectedYear}
              onSelectQuarter={setSelectedQuarter}
              onSelectMonth={setSelectedMonth}
              onCreatePlan={handleCreatePlan}
              canCreate={canCreate}
              onDoubleClickYear={(plan) => handleSelectPlan('annual', plan)}
              user={user}
            />
            <PlanStatusFilter
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              selectedMonth={selectedMonth}
              selectedQuarter={selectedQuarter}
              selectedYear={selectedYear}
            />
            <div className={cn(
              "flex-1 overflow-y-auto p-3 space-y-4",
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

    </>
  );
}
