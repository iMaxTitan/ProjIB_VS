import React, { useState, useMemo, useEffect } from 'react';
import { usePlans } from '@/hooks/usePlans';
import { useAuth } from '@/lib/auth';
import { MonthlyPlan, PlanStatus } from '@/types/planning';
import { cn } from '@/lib/utils';
import { getStatusBgClass } from '@/lib/utils/planning-utils';
import { Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface PlanListSidebarProps {
    selectedPlanId: string | null;
    onSelectPlan: (plan: MonthlyPlan) => void;
    onAddTask?: (plan: MonthlyPlan) => void;
}

export default function PlanListSidebar({ selectedPlanId, onSelectPlan, onAddTask }: PlanListSidebarProps) {
    const { user } = useAuth();
    const { monthlyPlans, quarterlyPlans, loading, fetchAllPlans } = usePlans(user!);

    useEffect(() => {
        fetchAllPlans();
    }, [fetchAllPlans]);

    const [assignedPlanIds, setAssignedPlanIds] = useState<string[]>([]);

    // Загружаем назначения планов для текущего пользователя (все роли)
    useEffect(() => {
        if (!user) return;

        const fetchAssigned = async () => {
            const { data } = await supabase
                .from('monthly_plan_assignees')
                .select('monthly_plan_id')
                .eq('user_id', user.user_id);

            if (data) {
                setAssignedPlanIds(data.map(d => d.monthly_plan_id));
            }
        };
        fetchAssigned();
    }, [user]);

    // Планы по отделу (для head и employee одинаково)
    // Добавлять задачи может только назначенный сотрудник
    const myPlans = useMemo(() => {
        if (!user || !monthlyPlans) return [];

        // Для chief - все планы
        if (user.role === 'chief') {
            return monthlyPlans;
        }

        // Для head и employee - планы своего отдела
        if (user.department_id) {
            return monthlyPlans.filter(p => p.department_id === user.department_id);
        }

        return [];
    }, [monthlyPlans, user]);

    // Только активные планы + сортировка
    const displayedPlans = useMemo(() => {
        return myPlans
            .filter(p => p.status === 'active')
            .sort((a, b) => {
                if (a.year !== b.year) return b.year - a.year;
                return b.month - a.month;
            });
    }, [myPlans]);

    const getShortStatus = (status: PlanStatus): string => {
        switch (status) {
            case 'draft': return 'Черновик';
            case 'submitted': return 'На проверке';
            case 'approved': return 'Утвержден';
            case 'active': return 'В работе';
            case 'completed': return 'Выполнен';
            case 'failed': return 'Провален';
            case 'returned': return 'Возвращен';
            default: return '';
        }
    };

    if (loading) return <div className="p-4 text-xs text-gray-400">Загрузка планов...</div>;

    return (
        <div className="flex flex-col h-full bg-transparent">
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {displayedPlans.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                        Нет активных планов
                    </div>
                ) : (
                    displayedPlans.map(plan => {
                        const isSelected = selectedPlanId === plan.monthly_plan_id;

                        // Связанный квартальный план (для названия отдела)
                        const qPlan = quarterlyPlans.find(q => q.quarterly_id === plan.quarterly_id);
                        const deptName = plan.department_name || qPlan?.department_name;

                        // Может ли текущий пользователь добавить задачу
                        const canAddTask = assignedPlanIds.includes(plan.monthly_plan_id);

                        // Процент использованных часов (без ограничения 100%)
                        const spentHours = plan.total_spent_hours || 0;
                        const progressPercent = plan.planned_hours > 0
                            ? Math.round((spentHours / plan.planned_hours) * 100)
                            : 0;

                        // Цвет прогресса: зеленый >=80%, желтый 50-80%, синий <50%
                        const progressColor = progressPercent >= 80 ? 'bg-emerald-500' : progressPercent >= 50 ? 'bg-amber-500' : 'bg-blue-500';
                        const progressBgColor = isSelected ? 'bg-white/30' : 'bg-gray-200';

                        return (
                            <div
                                key={plan.monthly_plan_id}
                                tabIndex={0}
                                onClick={() => onSelectPlan(plan)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onSelectPlan(plan);
                                    }
                                }}
                                aria-label={`План: ${plan.measure_name || 'Без описания'}`}
                                data-selected={isSelected}
                                className={cn(
                                    'px-3 py-2 rounded-xl cursor-pointer transition-all border shadow-sm',
                                    'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                                    isSelected
                                        ? 'bg-gradient-to-r from-indigo-400/80 to-blue-400/80 text-white shadow-md border-white/20 backdrop-blur-md'
                                        : 'glass-card text-slate-800 bg-white/70 hover:bg-white/90 hover:border-indigo-300'
                                )}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span
                                        className={cn('w-3 h-3 rounded-full flex-shrink-0', getStatusBgClass(plan.status), isSelected && 'ring-2 ring-white')}
                                        title={getShortStatus(plan.status)}
                                        aria-label={getShortStatus(plan.status)}
                                    />
                                    {deptName && (
                                        <span className={cn(
                                            'text-2xs font-bold truncate flex-1',
                                            isSelected ? 'text-indigo-100' : 'text-slate-500'
                                        )}>
                                            {deptName}
                                        </span>
                                    )}
                                    <span className={cn(
                                        'text-2xs font-mono font-black border-l px-2 flex-shrink-0',
                                        isSelected ? 'text-white border-white/20' : 'text-indigo-600 border-indigo-100'
                                    )}>
                                        {spentHours}h / {plan.planned_hours}h
                                    </span>
                                    {onAddTask && canAddTask && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onAddTask(plan);
                                            }}
                                            aria-label="Добавить задачу"
                                            className={cn(
                                                'p-0.5 rounded transition-all',
                                                'focus:outline-none focus:ring-2 focus:ring-indigo-500',
                                                isSelected
                                                    ? 'text-indigo-200 hover:text-white hover:bg-white/20'
                                                    : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-100'
                                            )}
                                        >
                                            <Plus className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    )}
                                </div>

                                <p className={cn('text-xs leading-tight line-clamp-2 mb-1', isSelected && 'font-semibold')}>
                                    {plan.measure_name || 'Мероприятие не выбрано'}
                                </p>

                                <div className="flex items-center gap-2">
                                    <div className={cn('flex-1 h-1.5 rounded-full overflow-hidden', progressBgColor)}>
                                        <div
                                            className={cn('h-full rounded-full transition-all', progressColor)}
                                            style={{ width: `${Math.min(100, progressPercent)}%` }}
                                        />
                                    </div>
                                    <span className={cn(
                                        'text-2xs font-bold tabular-nums min-w-[32px] text-right',
                                        isSelected
                                            ? 'text-white'
                                            : progressPercent >= 80 ? 'text-emerald-600' : progressPercent >= 50 ? 'text-amber-600' : 'text-blue-600'
                                    )}>
                                        {progressPercent}%
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
