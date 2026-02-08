import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Building2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnnualPlan, QuarterlyPlan, MonthlyPlan, PlanStatus, getMonthName } from '@/types/planning';
import { UserInfo } from '@/types/azure';
import { supabase } from '@/lib/supabase';
import { PlanDetailcard, PlanDetailHeader, PlanSection } from './components/PlanDetailCommon';
import { manageQuarterlyPlan, canDeleteQuarterlyPlan, deleteQuarterlyPlan } from '@/lib/plans/plan-service';
import { useProcesses } from '@/hooks/useProcesses';
import { useAvailableStatuses } from '@/hooks/useAvailableStatuses';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage } from '@/lib/utils/error-message';
import logger from '@/lib/logger';

interface MonthStats {
    monthly_plan_id: string;
    totalTasks: number;
    completedTasks: number;
    spentHours: number;
    plannedHours: number;
}

interface QuarterlyPlanDetailsProps {
    plan: QuarterlyPlan;
    user: UserInfo;
    onEdit?: () => void;
    onClose: () => void;
    onUpdate?: (newId?: string) => void;
    canEdit: boolean;
    annualPlans: AnnualPlan[];
    monthlyPlans: MonthlyPlan[];
}

export default function QuarterlyPlanDetails({
    plan,
    onEdit,
    onClose,
    onUpdate,
    canEdit,
    annualPlans,
    monthlyPlans,
    user
}: QuarterlyPlanDetailsProps) {
    const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
    const [monthStats, setMonthStats] = useState<Map<string, MonthStats>>(new Map());
    const [currentStatus, setCurrentStatus] = useState<PlanStatus>(plan.status);

    // Available statuses based on role and current status
    const availableStatuses = useAvailableStatuses({
        user,
        currentStatus,
        planType: 'quarterly',
    });

    // Загрузка процессов (фильтр по отделу пользователя)
    const { processes, loading: loadingProcesses } = useProcesses({
        userId: user?.user_id
    });

    // Определяем, это создание нового плана или редактирование существующего
    const isNewPlan = plan.quarterly_id === 'new';

    // Editing state - для нового плана сразу в режиме редактирования
    const [isEditing, setIsEditing] = useState(isNewPlan);
    const [editQuarter, setEditQuarter] = useState(plan.quarter);
    const [editProcessId, setEditProcessId] = useState(plan.process_id || '');
    const [editParams, setEditParams] = useState({
        goal: plan.goal,
        expectedResult: plan.expected_result
    });

    // Delete state
    const [canDelete, setCanDelete] = useState(false);
    const [deleteReason, setDeleteReason] = useState<string>('');
    const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
    const [copyAnnualId, setCopyAnnualId] = useState(plan.annual_plan_id || '');
    const [copyQuarter, setCopyQuarter] = useState<number>(plan.quarter);
    const [copying, setCopying] = useState(false);
    const [copyError, setCopyError] = useState<string | null>(null);

    // Update local state if prop changes
    useEffect(() => {
        setCurrentStatus(plan.status);
        setEditQuarter(plan.quarter);
        setEditProcessId(plan.process_id || '');
        setEditParams({
            goal: plan.goal,
            expectedResult: plan.expected_result
        });
        // Для нового плана сразу в режиме редактирования
        if (plan.quarterly_id === 'new') {
            setIsEditing(true);
        }
    }, [plan]);

    // Check delete permissions
    useEffect(() => {
        if (isNewPlan) {
            setCanDelete(false);
            return;
        }

        const checkDelete = async () => {
            const result = await canDeleteQuarterlyPlan(plan.quarterly_id, user?.user_id || '');
            setCanDelete(result.canDelete);
            setDeleteReason(result.reason || '');
        };
        checkDelete();
    }, [plan.quarterly_id, user?.user_id, isNewPlan]);

    const handleDelete = async () => {
        const result = await deleteQuarterlyPlan(plan.quarterly_id, user?.user_id || '');
        if (result.success) {
            onUpdate?.();
            onClose();
        } else {
            alert(result.error || 'Ошибка при удалении');
        }
    };

    const onStatusChangeHandler = async (newStatus: PlanStatus) => {
        try {
            setCurrentStatus(newStatus); // Optimistic
            await manageQuarterlyPlan({
                action: 'update',
                quarterlyId: plan.quarterly_id,
                annualPlanId: plan.annual_plan_id || '',
                departmentId: plan.department_id || '',
                quarter: plan.quarter,
                goal: plan.goal,
                expectedResult: plan.expected_result,
                status: newStatus,
                process_id: plan.process_id || '',
                userId: user?.user_id || ''
            });
            onUpdate?.();
        } catch (e: unknown) {
            logger.error('Status Change Error:', e);
            setCurrentStatus(plan.status); // Revert
            alert(`Ошибка при смене статуса: ${getErrorMessage(e)}`);
        }
    };

    const handleSave = async () => {
        // Валидация
        if (!editParams.goal.trim()) {
            alert('Введите цель плана');
            return;
        }
        if (!editParams.expectedResult.trim()) {
            alert('Введите ожидаемый результат');
            return;
        }
        if (!editProcessId) {
            alert('Выберите процесс');
            return;
        }

        // Для нового плана используем отдел пользователя
        const departmentId = isNewPlan ? (user?.department_id || '') : (plan.department_id || '');

        try {
            const result = await manageQuarterlyPlan({
                action: isNewPlan ? 'create' : 'update',
                quarterlyId: isNewPlan ? undefined : plan.quarterly_id,
                annualPlanId: plan.annual_plan_id || '',
                departmentId: departmentId,
                quarter: editQuarter,
                goal: editParams.goal,
                expectedResult: editParams.expectedResult,
                status: currentStatus,
                process_id: editProcessId,
                userId: user?.user_id || ''
            });
            setIsEditing(false);
            const newId = typeof result === 'string' ? result : (result?.quarterly_id || result?.id);
            onUpdate?.(newId);
        } catch (error: unknown) {
            logger.error('Failed to save plan:', error);
            alert('Ошибка при сохранении');
        }
    };

    const handleCancel = () => {
        if (isNewPlan) {
            // Для нового плана - закрыть панель
            onClose();
        } else {
            // Для существующего - вернуть исходные значения
            setEditParams({
                goal: plan.goal,
                expectedResult: plan.expected_result
            });
            setEditQuarter(plan.quarter);
            setEditProcessId(plan.process_id || '');
            setIsEditing(false);
        }
    };

    const relatedMonthly = useMemo(() =>
        monthlyPlans.filter((m: MonthlyPlan) => m.quarterly_id === plan.quarterly_id),
        [monthlyPlans, plan.quarterly_id]);

    const linkedAnnual = useMemo(() =>
        annualPlans.find((a: AnnualPlan) => a.annual_id === plan.annual_plan_id),
        [annualPlans, plan.annual_plan_id]);

    const activeAnnualPlans = useMemo(
        () => annualPlans.filter((a) => a.status === 'active'),
        [annualPlans]
    );

    useEffect(() => {
        if (!isCopyModalOpen) return;
        const defaultAnnualId = plan.annual_plan_id && activeAnnualPlans.some(a => a.annual_id === plan.annual_plan_id)
            ? plan.annual_plan_id
            : (activeAnnualPlans[0]?.annual_id || plan.annual_plan_id || '');
        setCopyAnnualId(defaultAnnualId);
        setCopyQuarter(plan.quarter);
        setCopyError(null);
    }, [isCopyModalOpen, plan.annual_plan_id, plan.quarter, activeAnnualPlans]);

    const handleCopyQuarterlyPlan = async () => {
        if (isNewPlan) return;
        setCopying(true);
        setCopyError(null);
        try {
            if (!copyAnnualId) {
                throw new Error('Выберите годовой план');
            }

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
                userId: user?.user_id || ''
            });

            const newId = typeof result === 'string' ? result : (result?.quarterly_id || result?.id);
            setIsCopyModalOpen(false);
            onUpdate?.(newId);
        } catch (e: unknown) {
            setCopyError(getErrorMessage(e));
        } finally {
            setCopying(false);
        }
    };

    // Загрузка статистики задач по месячным планам
    useEffect(() => {
        const fetchMonthStats = async () => {
            try {
                const monthIds = relatedMonthly.map(m => m.monthly_plan_id);
                if (monthIds.length === 0) {
                    return;
                }

                const { data: tasks, error } = await supabase
                    .from('daily_tasks')
                    .select('monthly_plan_id, spent_hours')
                    .in('monthly_plan_id', monthIds);

                if (error) {
                    const errorMsg = error?.message || error?.details || error?.hint || JSON.stringify(error);
                    throw new Error(errorMsg || 'Unknown error loading tasks');
                }

                const statsMap = new Map<string, MonthStats>();

                // Инициализация для всех месяцев
                for (const m of relatedMonthly) {
                    statsMap.set(m.monthly_plan_id, {
                        monthly_plan_id: m.monthly_plan_id,
                        totalTasks: 0,
                        completedTasks: 0,
                        spentHours: 0,
                        plannedHours: Number(m.planned_hours) || 0
                    });
                }

                // Агрегация задач
                for (const task of (tasks || [])) {
                    const stats = statsMap.get(task.monthly_plan_id);
                    if (stats) {
                        stats.totalTasks++;
                        stats.spentHours += Number(task.spent_hours) || 0;
                    }
                }

                setMonthStats(statsMap);
            } catch (err: unknown) {
                const errorMessage = getErrorMessage(err);
                logger.error('Ошибка загрузки статистики месяцев:', errorMessage, err);
            }
        };

        fetchMonthStats();
    }, [plan.quarterly_id, relatedMonthly]);

    return (
        <div className="p-4 pb-8">
            <PlanDetailcard colorScheme="purple">
                <PlanDetailHeader
                    title={isNewPlan ? 'Создание' : isEditing ? 'Редактирование' : 'Просмотр'}
                    status={currentStatus}
                    colorScheme="purple"
                    onClose={onClose}
                    onStatusChange={isNewPlan ? undefined : onStatusChangeHandler}
                    canEdit={canEdit}
                    icon={<Calendar className="h-5 w-5 opacity-80" />}
                    // Editing props
                    onEdit={canEdit && !isNewPlan ? () => setIsEditing(true) : undefined}
                    isEditing={isEditing}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    // Delete props
                    onDelete={isNewPlan ? undefined : handleDelete}
                    onCopy={!isNewPlan ? () => setIsCopyModalOpen(true) : undefined}
                    canDelete={canDelete}
                    deleteReason={deleteReason}
                    availableStatuses={availableStatuses}
                />

                <div className="p-4 space-y-5 overflow-y-auto flex-1">
                    {/* Выбор квартала (только в режиме редактирования/создания) */}
                    {isEditing && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">Квартал:</span>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4].map(q => (
                                    <button
                                        key={q}
                                        type="button"
                                        onClick={() => setEditQuarter(q)}
                                        className={cn(
                                            "px-3 py-1.5 text-xs rounded-lg border transition-all",
                                            editQuarter === q
                                                ? "bg-purple-500 text-white border-purple-600 shadow-sm"
                                                : "bg-white text-gray-700 border-gray-300 hover:bg-purple-50 hover:border-purple-300"
                                        )}
                                    >
                                        Q{q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Контекстная карточка: связь с годовым планом */}
                    {linkedAnnual && !isNewPlan && (
                        <div className="flex items-center gap-3 text-sm text-slate-800 bg-white/70 p-3 rounded-2xl border border-purple-200/50 shadow-sm glass-card">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 text-sm font-bold shadow-md flex-shrink-0">
                                {linkedAnnual.year}
                            </div>
                            <div className="flex flex-col flex-1 min-w-0">
                                <span className="font-bold tracking-tight text-slate-900 leading-tight truncate">{linkedAnnual.goal}</span>
                                <span className="text-2xs font-bold text-amber-600/70 uppercase tracking-widest mt-0.5">Годовой план</span>
                            </div>
                        </div>
                    )}

                    {/* Процесс */}
                    <PlanSection title="Процесс" colorScheme="purple">
                        {isEditing ? (
                            <select
                                value={editProcessId}
                                onChange={(e) => setEditProcessId(e.target.value)}
                                disabled={loadingProcesses}
                                aria-label="Выбор процесса"
                                className="w-full p-4 text-sm glass-card rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-all font-medium text-slate-700 bg-white/40 cursor-pointer"
                            >
                                <option value="">Выберите процесс...</option>
                                {processes.map((proc) => (
                                    <option key={proc.process_id} value={proc.process_id}>
                                        {proc.process_name}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            plan.process_name && (
                                <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
                                    {plan.process_name}
                                </div>
                            )
                        )}
                    </PlanSection>

                    {/* Цель */}
                    <PlanSection title="Цель" colorScheme="purple">
                        {isEditing ? (
                            <textarea
                                value={editParams.goal}
                                onChange={(e) => setEditParams(p => ({ ...p, goal: e.target.value }))}
                                className="w-full min-h-[100px] p-4 text-sm glass-card rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-all font-medium text-slate-700"
                                placeholder="Введите цель..."
                            />
                        ) : (
                            <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
                                {editParams.goal}
                            </div>
                        )}
                    </PlanSection>

                    {/* Ожидаемый результат */}
                    <PlanSection title="Ожидаемый результат" colorScheme="purple">
                        {isEditing ? (
                            <textarea
                                value={editParams.expectedResult}
                                onChange={(e) => setEditParams(p => ({ ...p, expectedResult: e.target.value }))}
                                className="w-full min-h-[100px] p-4 text-sm glass-card rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-all font-medium text-slate-700"
                                placeholder="Ожидаемый результат..."
                            />
                        ) : (
                            <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
                                {editParams.expectedResult}
                            </div>
                        )}
                    </PlanSection>

                    {/* Месячные планы */}
                    {!isNewPlan && (
                        <PlanSection title="Месячные планы" colorScheme="purple" className="pt-4 border-t border-purple-100">
                            {relatedMonthly.length > 0 ? (
                                <div className="space-y-2">
                                    {relatedMonthly
                                        .sort((a, b) => a.month - b.month)
                                        .map(m => {
                                            const isCompleted = m.status === 'completed';
                                            const stats = monthStats.get(m.monthly_plan_id);
                                            const spentHours = stats?.spentHours || m.total_spent_hours || 0;
                                            const isExpanded = expandedMonth === m.monthly_plan_id;

                                            return (
                                                <div key={m.monthly_plan_id}>
                                                    {/* Заголовок месяца - indigo градиент */}
                                                    <div
                                                        className={cn(
                                                            "p-3 flex items-center gap-3 rounded-2xl cursor-pointer transition-all border shadow-md",
                                                            isExpanded
                                                                ? "bg-gradient-to-r from-indigo-50 to-blue-50 text-slate-900 ring-1 ring-indigo-200/50 border-indigo-200"
                                                                : "glass-card text-slate-800 bg-white/70 hover:bg-white/90 hover:border-indigo-200"
                                                        )}
                                                        onClick={() => setExpandedMonth(isExpanded ? null : m.monthly_plan_id)}
                                                    >
                                                        {/* Стрелка в круге */}
                                                        <div className={cn(
                                                            "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all",
                                                            isExpanded
                                                                ? "bg-indigo-200 text-indigo-700"
                                                                : "bg-indigo-100 text-indigo-600"
                                                        )}>
                                                            <span className={cn(
                                                                "text-xs transition-transform duration-200",
                                                                isExpanded && "rotate-90"
                                                            )}>
                                                                <ChevronRight className="w-3 h-3" />
                                                            </span>
                                                        </div>
                                                        {/* Месяц */}
                                                        <div className={cn(
                                                            "w-10 h-8 rounded-xl flex items-center justify-center text-2xs font-bold flex-shrink-0",
                                                            isCompleted ? 'bg-emerald-100 text-emerald-600' : isExpanded ? 'bg-white text-indigo-600 shadow-sm' : 'bg-indigo-100 text-indigo-600'
                                                        )}>
                                                            {getMonthName(m.month, 'ru').slice(0, 3)}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className={cn(
                                                                "text-xs font-medium tracking-tight truncate",
                                                                isExpanded ? "text-indigo-900" : "text-slate-900"
                                                            )}>
                                                                {m.measure_name || 'Без названия'}
                                                            </p>
                                                            {(() => {
                                                                const plannedHrs = Number(m.planned_hours) || 0;
                                                                const mProgressPercent = plannedHrs > 0 ? Math.round((spentHours / plannedHrs) * 100) : 0;
                                                                return (
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <div className={cn(
                                                                            "flex-1 h-2 rounded-full overflow-hidden shadow-inner",
                                                                            isExpanded ? "bg-white/10" : "bg-indigo-50"
                                                                        )}>
                                                                            <div
                                                                                className={cn(
                                                                                    "h-full transition-all duration-500",
                                                                                    mProgressPercent >= 100 ? "bg-emerald-400" : (isExpanded ? "bg-indigo-300" : "bg-indigo-500")
                                                                                )}
                                                                                style={{ width: `${Math.min(mProgressPercent, 100)}%` }}
                                                                            />
                                                                        </div>
                                                                        <span className={cn(
                                                                            "text-2xs font-black font-mono w-10 text-right flex-shrink-0",
                                                                            isExpanded ? "text-white" : "text-indigo-600"
                                                                        )}>
                                                                            {mProgressPercent}%
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>

                                                    {/* Детали месячного плана - белый фон */}
                                                    {isExpanded && (
                                                        <div className="ml-9 mt-1 mb-2 space-y-1 border-l-2 border-indigo-200 pl-2">
                                                            {m.description && (
                                                                <div className="flex items-start gap-2 text-xs py-1">
                                                                    <span className="text-2xs font-bold text-slate-500 flex-shrink-0 mt-0.5">Описание</span>
                                                                    <span className="flex-1 break-words text-slate-800 font-medium">{m.description}</span>
                                                                </div>
                                                            )}
                                                            {m.measure_name && (
                                                                <div className="flex items-start gap-2 text-xs py-1">
                                                                    <span className="text-2xs font-bold text-slate-500 flex-shrink-0 mt-0.5">Мероприятие</span>
                                                                    <span className="flex-1 break-words text-slate-800 font-medium">{m.measure_name}</span>
                                                                </div>
                                                            )}
                                                            <div className="flex items-center gap-2 pt-1">
                                                                <span className="text-2xs font-bold text-indigo-600 flex-shrink-0 bg-indigo-50 px-1.5 py-0.5 rounded shadow-sm">
                                                                    Задач: {stats?.totalTasks || m.tasks_count || 0}
                                                                </span>
                                                                {m.completion_percentage !== undefined && m.completion_percentage >= 100 && (
                                                                    <span className="text-2xs font-bold text-emerald-600 flex-shrink-0 bg-emerald-50 px-1.5 py-0.5 rounded shadow-sm">
                                                                        Все выполнено
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                </div>
                            ) : (
                                <div className="text-center py-6 text-gray-400 text-sm">
                                    <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p>Месячных планов пока нет</p>
                                </div>
                            )}
                        </PlanSection>
                    )}
                </div>
            </PlanDetailcard>

            {!isNewPlan && (
                <Modal
                    isOpen={isCopyModalOpen}
                    onClose={() => {
                        if (copying) return;
                        setIsCopyModalOpen(false);
                        setCopyError(null);
                    }}
                    title="Копировать квартальный план"
                    headerVariant="gradient-indigo"
                >
                    <div className="space-y-4">
                        <div>
                            <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">
                                Годовой план (в работе)
                            </label>
                            <select
                                value={copyAnnualId}
                                onChange={(e) => setCopyAnnualId(e.target.value)}
                                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                disabled={copying}
                            >
                                {activeAnnualPlans.length === 0 ? (
                                    <option value="">Нет активных годовых планов</option>
                                ) : (
                                    activeAnnualPlans.map((a) => (
                                        <option key={a.annual_id} value={a.annual_id}>
                                            {a.year} - {(a.goal || 'Без названия').slice(0, 70)}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>

                        <div>
                            <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">
                                Квартал
                            </label>
                            <div className="grid grid-cols-4 gap-2">
                                {[1, 2, 3, 4].map((q) => (
                                    <button
                                        key={q}
                                        type="button"
                                        onClick={() => setCopyQuarter(q)}
                                        className={cn(
                                            "px-3 py-2 text-sm rounded-xl border transition-all",
                                            copyQuarter === q
                                                ? "bg-indigo-500 text-white border-indigo-600 shadow-sm"
                                                : "bg-white text-gray-700 border-gray-200 hover:bg-indigo-50 hover:border-indigo-300"
                                        )}
                                        disabled={copying}
                                    >
                                        Q{q}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {copyError && (
                            <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                                <p className="text-sm text-red-600">{copyError}</p>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsCopyModalOpen(false);
                                    setCopyError(null);
                                }}
                                className="px-3 py-2 text-sm rounded-lg text-slate-600 hover:bg-slate-100 transition-all"
                                disabled={copying}
                            >
                                Отмена
                            </button>
                            <button
                                type="button"
                                onClick={handleCopyQuarterlyPlan}
                                className="px-3 py-2 text-sm rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-all disabled:opacity-50"
                                disabled={copying || !copyAnnualId}
                            >
                                {copying ? 'Копирование...' : 'Копировать'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}




