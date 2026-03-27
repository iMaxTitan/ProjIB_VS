'use client';

import React from 'react';
import { UserInfo } from '@/types/azure';
import { AnnualPlan, QuarterlyPlan, MonthlyPlan, PlanStatus, getPlanStatusText } from '@/types/planning';
import { GroupHeader } from '@/components/dashboard/shared';
import PlanTileCard from './PlanTileCard';
import { Spinner } from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';

type PlanType = 'annual' | 'quarterly' | 'monthly';
const NO_PLAN_TITLE = 'Нет названия плана';
const NO_PROCESS = 'Без процесса';
const NO_DEPT = 'Без отдела';

const statusOrder: PlanStatus[] = ['active', 'submitted', 'draft', 'approved', 'returned', 'completed', 'failed'];

interface PlanTreeContentProps {
  user: UserInfo;
  loading: boolean;
  error: string | null;
  monthlyPlans: MonthlyPlan[];
  quarterlyPlans: QuarterlyPlan[];
  filteredAnnualPlans: AnnualPlan[];
  filteredQuarterlyPlans: QuarterlyPlan[];
  roleFilteredMonthlyPlans: MonthlyPlan[];
  assignedPlanIds: string[];
  selectedPlan: AnnualPlan | QuarterlyPlan | MonthlyPlan | null;
  selectedType: PlanType | null;
  selectedMonth: number | null;
  selectedQuarter: number | null;
  selectedYear: number | null;
  isGroupExpanded: (key: string) => boolean;
  toggleStatusGroup: (key: string) => void;
  canCreate: boolean;
  onSelectPlan: (type: PlanType, plan: AnnualPlan | QuarterlyPlan | MonthlyPlan) => void;
  onCreatePlan: (type: PlanType, parentId?: string | null) => void;
  onAddTask: (plan: MonthlyPlan) => void;
}

export default function PlanTreeContent({
  user,
  loading,
  error,
  monthlyPlans,
  quarterlyPlans,
  filteredAnnualPlans,
  filteredQuarterlyPlans,
  roleFilteredMonthlyPlans,
  assignedPlanIds,
  selectedPlan,
  selectedType,
  selectedMonth,
  selectedQuarter,
  selectedYear,
  isGroupExpanded,
  toggleStatusGroup,
  canCreate,
  onSelectPlan,
  onCreatePlan,
  onAddTask,
}: PlanTreeContentProps) {
  const isEmployee = user.role === 'employee';

  // Employee view — only their active assigned plans
  if (isEmployee) {
    const myActivePlans = monthlyPlans.filter(
      p => p.status === 'active' && assignedPlanIds.includes(p.monthly_plan_id)
    );

    if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;

    if (myActivePlans.length === 0) {
      return (
        <EmptyState
          title="У вас нет активных планов"
          description="Обратитесь к руководителю для назначения"
          className="py-8"
        />
      );
    }

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
        <div className="text-2xs font-medium text-slate-400 uppercase tracking-wide px-2 py-1 flex justify-between">
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
                    const monthName = new Date(2024, monthPlan.month - 1, 1).toLocaleString('ru-RU', { month: 'short' });
                    return (
                      <PlanTileCard
                        key={monthPlan.monthly_plan_id}
                        variant="monthly"
                        isSelected={!!isSelected}
                        onClick={() => onSelectPlan('monthly', monthPlan)}
                        title={monthPlan.procedure_name || 'Процедура не выбрана'}
                        subtitle={`${monthName} ${monthPlan.year}${qPlan?.department_name ? ' • ' + qPlan.department_name : ''}`}
                        status={monthPlan.status}
                        spentHours={monthPlan.total_spent_hours || 0}
                        plannedHours={monthPlan.planned_hours || 0}
                        completionPct={monthPlan.completion_percentage || 0}
                        actionButton={{ label: "Добавить задачу", onClick: () => onAddTask(monthPlan) }}
                        ariaLabel={`Месячный план: ${monthPlan.procedure_name || 'Без процедуры'}, ${monthPlan.completion_percentage || 0}%`}
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

  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (error) return <div className="text-center py-8 text-red-500"><p className="text-sm">Ошибка загрузки</p></div>;

  // Monthly Plans (filtered by selected month)
  if (selectedMonth !== null) {
    const monthNum = selectedMonth + 1;
    const filteredMonthlyPlans = roleFilteredMonthlyPlans.filter(m => m.month === monthNum);
    const monthName = new Date(2024, selectedMonth, 1).toLocaleString('ru-RU', { month: 'long' });

    if (filteredMonthlyPlans.length === 0) {
      return <EmptyState title={`Месячные планы за ${monthName} не найдены`} className="py-8" />;
    }

    const plansByGroup: Record<string, MonthlyPlan[]> = {};
    filteredMonthlyPlans.forEach(plan => {
      const key = `${plan.department_name?.trim() || NO_DEPT} — ${plan.process_name?.trim() || NO_PROCESS}`;
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
              <GroupHeader tone="indigo" title={gk} count={groupPlans.length} expanded={expanded} onToggle={() => toggleStatusGroup(expandKey)} toggleAriaLabel={`${expanded ? 'Свернуть' : 'Развернуть'} ${gk}`} />
              {expanded && (
                <div className="space-y-1.5 pl-2">
                  {groupPlans.map(monthPlan => {
                    const isSelected = selectedPlan && selectedType === 'monthly' && (selectedPlan as MonthlyPlan).monthly_plan_id === monthPlan.monthly_plan_id;
                    const canAddTask = assignedPlanIds.includes(monthPlan.monthly_plan_id);
                    return (
                      <PlanTileCard
                        key={monthPlan.monthly_plan_id}
                        variant="monthly"
                        isSelected={!!isSelected}
                        onClick={() => onSelectPlan('monthly', monthPlan)}
                        title={monthPlan.procedure_name || 'Процедура не выбрана'}
                        status={monthPlan.status}
                        spentHours={monthPlan.total_spent_hours || 0}
                        plannedHours={monthPlan.planned_hours || 0}
                        completionPct={monthPlan.completion_percentage || 0}
                        actionButton={canAddTask ? { label: "Добавить задачу", onClick: () => onAddTask(monthPlan) } : undefined}
                        ariaLabel={`Месячный план: ${monthPlan.procedure_name || 'Без процедуры'}, ${monthPlan.completion_percentage || 0}%`}
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

  // Quarterly list
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
                    <GroupHeader tone="purple" title={getPlanStatusText(group.status)} count={group.items.length} expanded={expanded} onToggle={() => toggleStatusGroup(groupKey)} toggleAriaLabel={`${expanded ? 'Свернуть' : 'Развернуть'} группу ${getPlanStatusText(group.status)}`} />
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
                              onClick={() => onSelectPlan('quarterly', plan)}
                              title={plan.goal?.trim() || NO_PLAN_TITLE}
                              subtitle={plan.department_name}
                              status={plan.status}
                              spentHours={totalSpent}
                              plannedHours={totalPlanned}
                              completionPct={completionPct}
                              actionButton={canCreate ? { label: "Создать месячный план", onClick: () => onCreatePlan('monthly', plan.quarterly_id) } : undefined}
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
          <EmptyState title="Планы не найдены" className="py-8" />
        )}
      </div>
    );
  }

  // Annual list
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
                  <GroupHeader tone="amber" title={getPlanStatusText(group.status)} count={group.items.length} expanded={expanded} onToggle={() => toggleStatusGroup(groupKey)} toggleAriaLabel={`${expanded ? 'Свернуть' : 'Развернуть'} группу ${getPlanStatusText(group.status)}`} />
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
                            onClick={() => onSelectPlan('annual', plan)}
                            title={plan.goal?.trim() || NO_PLAN_TITLE}
                            subtitle={plan.author_name}
                            status={plan.status}
                            spentHours={totalSpent}
                            plannedHours={totalPlanned}
                            completionPct={completionPct}
                            actionButton={canCreate ? { label: "Создать квартальный план", onClick: () => onCreatePlan('quarterly', plan.annual_id) } : undefined}
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
        <EmptyState title="Планы не найдены" className="py-8" />
      )}
    </div>
  );
}
