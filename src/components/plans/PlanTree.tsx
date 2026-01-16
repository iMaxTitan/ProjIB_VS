'use client';

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Calendar, Target, Clock, AlertCircle, Plus, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AnnualPlan, QuarterlyPlan, WeeklyPlan, PlanStatus, getPlanStatusText } from '@/types/planning';

// Типы для узла дерева планов
export interface PlanTreeNode {
  type: 'annual' | 'quarterly' | 'weekly' | 'unplanned';
  data: AnnualPlan | QuarterlyPlan | WeeklyPlan | null;
  children?: PlanTreeNode[];
  label?: string;
}

interface PlanTreeProps {
  annualPlans: AnnualPlan[];
  quarterlyPlans: QuarterlyPlan[];
  weeklyPlans: WeeklyPlan[];
  onSelectPlan: (type: 'annual' | 'quarterly' | 'weekly', plan: AnnualPlan | QuarterlyPlan | WeeklyPlan) => void;
  onCreatePlan?: (type: 'annual' | 'quarterly' | 'weekly', parentId?: string | null) => void;
  selectedPlanId?: string;
  canCreate?: boolean;
}

// Цвет статуса (полоска слева)
function getStatusColor(status: PlanStatus): string {
  switch (status) {
    case 'draft': return 'bg-gray-300';
    case 'submitted': return 'bg-blue-500';
    case 'approved': return 'bg-indigo-500';
    case 'active': return 'bg-green-500';
    case 'completed': return 'bg-emerald-500';
    case 'failed': return 'bg-red-500';
    case 'returned': return 'bg-orange-500';
    default: return 'bg-gray-300';
  }
}

// Короткий текст статуса
function getShortStatus(status: PlanStatus): string {
  switch (status) {
    case 'draft': return 'Черновик';
    case 'submitted': return 'На проверке';
    case 'approved': return 'Утверждён';
    case 'active': return 'В работе';
    case 'completed': return 'Выполнен';
    case 'failed': return 'Провален';
    case 'returned': return 'Возвращён';
    default: return '';
  }
}

// Компонент для отображения годового плана
function AnnualPlanItem({
  plan,
  quarterlyPlans,
  weeklyPlans,
  onSelectPlan,
  onCreatePlan,
  selectedPlanId,
  canCreate
}: {
  plan: AnnualPlan;
  quarterlyPlans: QuarterlyPlan[];
  weeklyPlans: WeeklyPlan[];
  onSelectPlan: PlanTreeProps['onSelectPlan'];
  onCreatePlan?: PlanTreeProps['onCreatePlan'];
  selectedPlanId?: string;
  canCreate?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const relatedQuarterly = quarterlyPlans.filter(q => q.annual_plan_id === plan.annual_id);
  const hasChildren = relatedQuarterly.length > 0;
  const isSelected = selectedPlanId === plan.annual_id;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={cn(
          "group relative rounded-md transition-all duration-150",
          isSelected ? "bg-indigo-50" : "hover:bg-gray-50"
        )}
      >
        {/* Цветной индикатор статуса - толще */}
        <div className={cn(
          "absolute left-0 top-1 bottom-1 w-1 rounded-full",
          getStatusColor(plan.status)
        )} />

        <div className="flex items-center gap-1 py-2 pl-4 pr-2">
          {/* Стрелка раскрытия */}
          <CollapsibleTrigger asChild>
            <button
              className="p-1 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
            >
              {hasChildren ? (
                isOpen
                  ? <ChevronDown className="h-4 w-4 text-gray-400" />
                  : <ChevronRight className="h-4 w-4 text-gray-400" />
              ) : (
                <div className="w-4 h-4" />
              )}
            </button>
          </CollapsibleTrigger>

          {/* Контент */}
          <div
            className="flex-1 min-w-0 cursor-pointer py-1"
            onClick={() => onSelectPlan('annual', plan)}
          >
            {/* Заголовок: год + статус + счётчик */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{plan.year}</span>
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                plan.status === 'active' && "bg-green-500 text-white",
                plan.status === 'draft' && "bg-gray-200 text-gray-600",
                plan.status === 'submitted' && "bg-blue-500 text-white",
                plan.status === 'returned' && "bg-orange-500 text-white",
                plan.status === 'completed' && "bg-emerald-500 text-white",
                plan.status === 'failed' && "bg-red-500 text-white",
                plan.status === 'approved' && "bg-indigo-500 text-white"
              )}>
                {getShortStatus(plan.status)}
              </span>
              <span className="text-xs text-gray-400 ml-auto">{relatedQuarterly.length} кв.</span>
            </div>

            {/* Цель */}
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{plan.goal}</p>
          </div>

          {/* Кнопка добавить */}
          {canCreate && onCreatePlan && (
            <button
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); onCreatePlan('quarterly', plan.annual_id); }}
              title="Добавить квартальный план"
            >
              <Plus className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <CollapsibleContent className="collapsible-content">
        <div className="ml-6 border-l border-gray-200">
          {relatedQuarterly.map(quarterly => (
            <QuarterlyPlanItem
              key={quarterly.quarterly_id}
              plan={quarterly}
              weeklyPlans={weeklyPlans}
              onSelectPlan={onSelectPlan}
              onCreatePlan={onCreatePlan}
              selectedPlanId={selectedPlanId}
              canCreate={canCreate}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Компонент для отображения квартального плана
function QuarterlyPlanItem({
  plan,
  weeklyPlans,
  onSelectPlan,
  onCreatePlan,
  selectedPlanId,
  canCreate,
  showParentInfo = false
}: {
  plan: QuarterlyPlan;
  weeklyPlans: WeeklyPlan[];
  onSelectPlan: PlanTreeProps['onSelectPlan'];
  onCreatePlan?: PlanTreeProps['onCreatePlan'];
  selectedPlanId?: string;
  canCreate?: boolean;
  showParentInfo?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const relatedWeekly = weeklyPlans.filter(w => w.quarterly_id === plan.quarterly_id);
  const hasChildren = relatedWeekly.length > 0;
  const isSelected = selectedPlanId === plan.quarterly_id;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={cn(
          "group relative rounded-md transition-all duration-150 ml-2",
          isSelected ? "bg-blue-50" : "hover:bg-gray-50"
        )}
      >
        {/* Цветной индикатор статуса */}
        <div className={cn(
          "absolute left-0 top-1 bottom-1 w-1 rounded-full",
          getStatusColor(plan.status)
        )} />

        <div className="flex items-center gap-1 py-1.5 pl-3 pr-2">
          {/* Стрелка раскрытия */}
          <CollapsibleTrigger asChild>
            <button
              className="p-1 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
            >
              {hasChildren ? (
                isOpen
                  ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                  : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
              ) : (
                <div className="w-3.5 h-3.5" />
              )}
            </button>
          </CollapsibleTrigger>

          {/* Контент */}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => onSelectPlan('quarterly', plan)}
          >
            {/* Заголовок */}
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-800">Q{plan.quarter}</span>
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                plan.status === 'active' && "bg-green-500 text-white",
                plan.status === 'draft' && "bg-gray-200 text-gray-600",
                plan.status === 'submitted' && "bg-blue-500 text-white",
                plan.status === 'returned' && "bg-orange-500 text-white",
                plan.status === 'completed' && "bg-emerald-500 text-white",
                plan.status === 'failed' && "bg-red-500 text-white",
                plan.status === 'approved' && "bg-indigo-500 text-white"
              )}>
                {getShortStatus(plan.status)}
              </span>
              <span className="text-xs text-gray-400 ml-auto">{relatedWeekly.length} нед.</span>
            </div>

            {/* Цель */}
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{plan.goal}</p>
          </div>

          {/* Кнопка добавить */}
          {canCreate && onCreatePlan && (
            <button
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-all flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); onCreatePlan('weekly', plan.quarterly_id); }}
              title="Добавить недельный план"
            >
              <Plus className="h-3.5 w-3.5 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <CollapsibleContent className="collapsible-content">
        <div className="ml-6 border-l border-gray-200">
          {relatedWeekly.map(weekly => (
            <WeeklyPlanItem
              key={weekly.weekly_id}
              plan={weekly}
              onSelectPlan={onSelectPlan}
              selectedPlanId={selectedPlanId}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Компонент для отображения недельного плана
function WeeklyPlanItem({
  plan,
  onSelectPlan,
  selectedPlanId,
  showParentInfo = false
}: {
  plan: WeeklyPlan;
  onSelectPlan: PlanTreeProps['onSelectPlan'];
  selectedPlanId?: string;
  showParentInfo?: boolean;
}) {
  const isSelected = selectedPlanId === plan.weekly_id;
  const weekDate = new Date(plan.weekly_date);
  const day = weekDate.getDate();
  const month = weekDate.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '');

  return (
    <div
      className={cn(
        "group relative rounded-md transition-all duration-150 cursor-pointer ml-2",
        isSelected ? "bg-green-50" : "hover:bg-gray-50"
      )}
      onClick={() => onSelectPlan('weekly', plan)}
    >
      {/* Цветной индикатор статуса */}
      <div className={cn(
        "absolute left-0 top-1 bottom-1 w-1 rounded-full",
        getStatusColor(plan.status)
      )} />

      <div className="flex items-center gap-2 py-1.5 pl-3 pr-2">
        {/* Дата компактно */}
        <div className="flex-shrink-0 w-10 text-center">
          <div className="text-sm font-semibold text-gray-700">{day}</div>
          <div className="text-[10px] text-gray-400 -mt-0.5">{month}</div>
        </div>

        {/* Контент */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-600 line-clamp-1">{plan.expected_result}</p>
        </div>

        {/* Статус */}
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0",
          plan.status === 'active' && "bg-green-500 text-white",
          plan.status === 'draft' && "bg-gray-200 text-gray-600",
          plan.status === 'submitted' && "bg-blue-500 text-white",
          plan.status === 'returned' && "bg-orange-500 text-white",
          plan.status === 'completed' && "bg-emerald-500 text-white",
          plan.status === 'failed' && "bg-red-500 text-white",
          plan.status === 'approved' && "bg-indigo-500 text-white"
        )}>
          {getShortStatus(plan.status)}
        </span>
      </div>
    </div>
  );
}

// Секция внеплановых планов
function UnplannedSection({
  title,
  icon: Icon,
  plans,
  type,
  weeklyPlans,
  onSelectPlan,
  onCreatePlan,
  selectedPlanId,
  canCreate
}: {
  title: string;
  icon: React.ElementType;
  plans: (QuarterlyPlan | WeeklyPlan)[];
  type: 'quarterly' | 'weekly';
  weeklyPlans?: WeeklyPlan[];
  onSelectPlan: PlanTreeProps['onSelectPlan'];
  onCreatePlan?: PlanTreeProps['onCreatePlan'];
  selectedPlanId?: string;
  canCreate?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);

  if (plans.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer hover:bg-orange-50 transition-colors mb-1">
          <button className="p-0.5">
            {isOpen
              ? <ChevronDown className="h-4 w-4 text-orange-500" />
              : <ChevronRight className="h-4 w-4 text-orange-500" />
            }
          </button>
          <AlertCircle className="h-4 w-4 text-orange-500" />
          <span className="font-medium text-sm text-orange-700">{title}</span>
          <span className="ml-auto text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
            {plans.length}
          </span>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="collapsible-content">
        <div className="ml-5 pl-4 border-l-2 border-orange-200 space-y-1">
          {type === 'quarterly' && plans.map(plan => (
            <QuarterlyPlanItem
              key={(plan as QuarterlyPlan).quarterly_id}
              plan={plan as QuarterlyPlan}
              weeklyPlans={weeklyPlans || []}
              onSelectPlan={onSelectPlan}
              onCreatePlan={onCreatePlan}
              selectedPlanId={selectedPlanId}
              canCreate={canCreate}
              showParentInfo
            />
          ))}
          {type === 'weekly' && plans.map(plan => (
            <WeeklyPlanItem
              key={(plan as WeeklyPlan).weekly_id}
              plan={plan as WeeklyPlan}
              onSelectPlan={onSelectPlan}
              selectedPlanId={selectedPlanId}
              showParentInfo
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Основной компонент дерева планов
export default function PlanTree({
  annualPlans,
  quarterlyPlans,
  weeklyPlans,
  onSelectPlan,
  onCreatePlan,
  selectedPlanId,
  canCreate = false
}: PlanTreeProps) {
  // Квартальные планы без привязки к годовому (внеплановые)
  const unplannedQuarterly = quarterlyPlans.filter(q => !q.annual_plan_id);

  // Недельные планы без привязки к квартальному (внеплановые)
  const unplannedWeekly = weeklyPlans.filter(w => !w.quarterly_id);

  return (
    <div className="space-y-2 p-2">
      {/* Годовые планы с иерархией */}
      {annualPlans.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between px-3 py-2 mb-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Годовые планы
            </h3>
            {canCreate && onCreatePlan && (
              <button
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                onClick={() => onCreatePlan('annual')}
                title="Создать годовой план"
              >
                <Plus className="h-4 w-4 text-gray-500" />
              </button>
            )}
          </div>
          <div className="space-y-2">
            {annualPlans.map(plan => (
              <AnnualPlanItem
                key={plan.annual_id}
                plan={plan}
                quarterlyPlans={quarterlyPlans}
                weeklyPlans={weeklyPlans}
                onSelectPlan={onSelectPlan}
                onCreatePlan={onCreatePlan}
                selectedPlanId={selectedPlanId}
                canCreate={canCreate}
              />
            ))}
          </div>
        </div>
      )}

      {/* Внеплановые квартальные планы */}
      {unplannedQuarterly.length > 0 && (
        <UnplannedSection
          title="Внеплановые квартальные"
          icon={Target}
          plans={unplannedQuarterly}
          type="quarterly"
          weeklyPlans={weeklyPlans}
          onSelectPlan={onSelectPlan}
          onCreatePlan={onCreatePlan}
          selectedPlanId={selectedPlanId}
          canCreate={canCreate}
        />
      )}

      {/* Внеплановые недельные планы */}
      {unplannedWeekly.length > 0 && (
        <UnplannedSection
          title="Внеплановые недельные"
          icon={Clock}
          plans={unplannedWeekly}
          type="weekly"
          onSelectPlan={onSelectPlan}
          selectedPlanId={selectedPlanId}
        />
      )}

      {/* Пустое состояние */}
      {annualPlans.length === 0 && quarterlyPlans.length === 0 && weeklyPlans.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Calendar className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <p className="text-base mb-2">Планы не найдены</p>
          {canCreate && onCreatePlan && (
            <button
              className="text-sm text-indigo-500 hover:text-indigo-600 hover:underline"
              onClick={() => onCreatePlan('annual')}
            >
              Создать первый план
            </button>
          )}
        </div>
      )}
    </div>
  );
}
