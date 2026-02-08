import React, { useState } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnnualPlan, QuarterlyPlan, PlanStatus } from '@/types/planning';
import { PlanDetailcard, PlanDetailHeader, PlanSection, PlanStatBox } from './components/PlanDetailCommon';
import { useAuth } from '@/lib/auth';
import { manageAnnualPlan, canDeleteAnnualPlan, deleteAnnualPlan } from '@/lib/plans/plan-service';
import { useAvailableStatuses } from '@/hooks/useAvailableStatuses';
import { getErrorMessage } from '@/lib/utils/error-message';
import logger from '@/lib/logger';

interface AnnualPlanDetailsProps {
    plan: AnnualPlan;
    onEdit?: (plan: AnnualPlan) => void;
    onClose: () => void;
    onUpdate?: (newId?: string) => void;
    canEdit: boolean;
    quarterlyPlans: QuarterlyPlan[];
}

export default function AnnualPlanDetails({
    plan,
    onEdit,
    onClose,
    onUpdate,
    canEdit,
    quarterlyPlans
}: AnnualPlanDetailsProps) {
    const { user } = useAuth();
    const [expandedQuarter, setExpandedQuarter] = useState<string | null>(null);
    const [currentStatus, setCurrentStatus] = useState<PlanStatus>(plan.status);

    // Available statuses based on role and current status
    const availableStatuses = useAvailableStatuses({
        user,
        currentStatus,
        planType: 'annual',
    });

    // Определяем, это создание нового плана или редактирование существующего
    const isNewPlan = plan.annual_id === 'new';

    // Editing state - для нового плана сразу в режиме редактирования
    const [isEditing, setIsEditing] = useState(isNewPlan);
    const [editYear, setEditYear] = useState(plan.year);
    const [editParams, setEditParams] = useState({
        goal: plan.goal,
        expectedResult: plan.expected_result,
        budget: plan.budget || 0
    });

    // Delete permissions state
    const [canDelete, setCanDelete] = useState(false);
    const [deleteReason, setDeleteReason] = useState<string | undefined>();

    // Check delete permissions
    React.useEffect(() => {
        if (!user || isNewPlan) {
            setCanDelete(false);
            return;
        }
        canDeleteAnnualPlan(plan.annual_id, user.user_id).then(result => {
            setCanDelete(result.canDelete);
            setDeleteReason(result.reason);
        });
    }, [plan.annual_id, user, isNewPlan]);

    // Update local state if prop changes
    React.useEffect(() => {
        setCurrentStatus(plan.status);
        setEditYear(plan.year);
        setEditParams({
            goal: plan.goal,
            expectedResult: plan.expected_result,
            budget: plan.budget || 0
        });
        // Для нового плана сразу в режиме редактирования
        if (plan.annual_id === 'new') {
            setIsEditing(true);
        }
    }, [plan]);

    const onStatusChangeHandler = async (newStatus: PlanStatus) => {
        try {
            setCurrentStatus(newStatus); // Optimistic
            await manageAnnualPlan({
                action: 'update',
                annualId: plan.annual_id,
                year: plan.year,
                goal: plan.goal,
                expectedResult: plan.expected_result,
                budget: plan.budget || 0,
                status: newStatus,
                userId: user?.user_id || ''
            });
            onUpdate?.(); // Notify parent
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

        try {
            const result = await manageAnnualPlan({
                action: isNewPlan ? 'create' : 'update',
                annualId: isNewPlan ? undefined : plan.annual_id,
                year: editYear,
                goal: editParams.goal,
                expectedResult: editParams.expectedResult,
                budget: editParams.budget,
                status: currentStatus,
                userId: user?.user_id || ''
            });
            setIsEditing(false);
            const newId = typeof result === 'string' ? result : (result?.annual_id || result?.id);
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
                expectedResult: plan.expected_result,
                budget: plan.budget || 0
            });
            setEditYear(plan.year);
            setIsEditing(false);
        }
    };

    const handleDelete = async () => {
        if (!user || !canDelete) return;
        try {
            await deleteAnnualPlan(plan.annual_id, user.user_id);
            onClose();
            onUpdate?.();
        } catch (error: unknown) {
            logger.error('Failed to delete annual plan:', error);
            alert(`Ошибка при удалении: ${getErrorMessage(error)}`);
        }
    };

    const relatedQuarterly = quarterlyPlans.filter(q => q.annual_plan_id === plan.annual_id);

    // Прогресс квартала по статусу: completed=100%, active=50%, остальные=0%
    const getStatusProgress = (status: PlanStatus): number => {
        switch (status) {
            case 'completed': return 100;
            case 'active': return 50;
            case 'approved': return 25;
            default: return 0;
        }
    };

    const quartersWithProgress = relatedQuarterly.map(q => {
        const qProgressPercent = getStatusProgress(q.status);
        return { ...q, qProgressPercent };
    });

    // Доступные годы для выбора
    const currentYear = new Date().getFullYear();
    const availableYears = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

    return (
        <div className="p-4 pb-8">
            <PlanDetailcard colorScheme="amber">
                <PlanDetailHeader
                    title={isNewPlan ? 'Создание' : isEditing ? 'Редактирование' : 'Просмотр'}
                    status={currentStatus}
                    colorScheme="amber"
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
                    onDelete={!isNewPlan ? handleDelete : undefined}
                    canDelete={canDelete}
                    deleteReason={deleteReason}
                    availableStatuses={availableStatuses}
                />

                <div className="p-4 space-y-5 overflow-y-auto flex-1">
                    {/* Выбор года (только в режиме редактирования/создания) */}
                    {isEditing && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">Год:</span>
                            <div className="flex gap-1">
                                {availableYears.map(y => (
                                    <button
                                        key={y}
                                        type="button"
                                        onClick={() => setEditYear(y)}
                                        className={cn(
                                            "px-3 py-1.5 text-xs rounded-lg border transition-all",
                                            editYear === y
                                                ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                                                : "bg-white text-gray-700 border-gray-300 hover:bg-amber-50 hover:border-amber-300"
                                        )}
                                    >
                                        {y}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Автор */}
                    {plan.author_name && !isNewPlan && (
                        <div className="flex items-center gap-3 text-sm text-slate-800 bg-white/70 p-3 rounded-2xl border border-amber-200/50 shadow-sm glass-card">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 text-sm font-bold shadow-md">
                                {plan.author_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                                <span className="font-bold tracking-tight text-slate-900 leading-tight">{plan.author_name}</span>
                                <span className="text-2xs font-bold text-amber-600/70 uppercase tracking-widest mt-0.5">Автор плана</span>
                            </div>
                        </div>
                    )}

                    {/* Цель */}
                    <PlanSection title="Цель" colorScheme="amber">
                        {isEditing ? (
                            <textarea
                                value={editParams.goal}
                                onChange={(e) => setEditParams(p => ({ ...p, goal: e.target.value }))}
                                className="w-full min-h-[100px] p-4 text-sm glass-card rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all font-medium text-slate-700"
                                placeholder="Введите цель..."
                            />
                        ) : (
                            <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
                                {editParams.goal}
                            </div>
                        )}
                    </PlanSection>

                    {/* Ожидаемый результат */}
                    <PlanSection title="Ожидаемый результат" colorScheme="amber">
                        {isEditing ? (
                            <textarea
                                value={editParams.expectedResult}
                                onChange={(e) => setEditParams(p => ({ ...p, expectedResult: e.target.value }))}
                                className="w-full min-h-[100px] p-4 text-sm glass-card rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all font-medium text-slate-700"
                                placeholder="Ожидаемый результат..."
                            />
                        ) : (
                            <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">
                                {editParams.expectedResult}
                            </div>
                        )}
                    </PlanSection>

                    {/* Бюджет (для нового плана - отдельное поле) */}
                    {isNewPlan ? (
                        <PlanSection title="Бюджет" colorScheme="amber">
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={editParams.budget}
                                    onChange={(e) => setEditParams(p => ({ ...p, budget: Number(e.target.value) }))}
                                    className="w-full p-3 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white"
                                    placeholder="Введите бюджет..."
                                />
                                <span className="text-gray-500 text-xs">$</span>
                            </div>
                        </PlanSection>
                    ) : (
                        /* Бюджет - только для существующих планов */
                        <div className="pt-2">
                            <PlanStatBox
                                icon={<span className="font-serif font-bold italic">$</span>}
                                value={
                                    isEditing ? (
                                        <input
                                            type="number"
                                            value={editParams.budget}
                                            onChange={(e) => setEditParams(p => ({ ...p, budget: Number(e.target.value) }))}
                                            className="w-full p-1 text-sm bg-transparent border-b border-amber-300 focus:outline-none focus:border-amber-600 font-bold text-center"
                                            aria-label="Бюджет"
                                        />
                                    ) : (
                                        `${(editParams.budget / 1000000).toFixed(1)}М`
                                    )
                                }
                                label="Бюджет"
                                colorScheme="amber"
                            />
                        </div>
                    )}

                    {/* Кварталы - только для существующих планов */}
                    {!isNewPlan && relatedQuarterly.length > 0 && (
                        <div className="pt-4 border-t border-amber-100">
                            <h3 className="text-xs font-bold text-amber-600/90 uppercase tracking-widest opacity-80 mb-2">Квартальные планы</h3>
                            <div className="space-y-2">
                                {quartersWithProgress.map(q => {
                                    const isExpanded = expandedQuarter === q.quarterly_id;
                                    return (
                                        <div key={q.quarterly_id}>
                                            {/* Заголовок квартала - purple градиент */}
                                            <div
                                                className={cn(
                                                    "p-3 flex items-center gap-3 rounded-2xl cursor-pointer transition-all border shadow-md",
                                                    isExpanded
                                                        ? "bg-gradient-to-r from-purple-50 to-violet-50 text-slate-900 ring-1 ring-purple-200/50 border-purple-200"
                                                        : "glass-card text-slate-800 bg-white/70 hover:bg-white/90 hover:border-purple-200"
                                                )}
                                                onClick={() => setExpandedQuarter(isExpanded ? null : q.quarterly_id)}
                                            >
                                                {/* Стрелка в круге */}
                                                <div className={cn(
                                                    "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all",
                                                    isExpanded
                                                        ? "bg-purple-200 text-purple-700"
                                                        : "bg-purple-100 text-purple-600"
                                                )}>
                                                    <span className={cn(
                                                        "text-xs transition-transform duration-200",
                                                        isExpanded && "rotate-90"
                                                    )}>
                                                        <ChevronRight className="w-3 h-3" />
                                                    </span>
                                                </div>
                                                {/* Квартал */}
                                                <div className={cn(
                                                    "w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm",
                                                    q.status === 'completed' ? 'bg-emerald-100 text-emerald-600' :
                                                        q.status === 'active' ? 'bg-violet-100 text-violet-600' :
                                                            isExpanded ? 'bg-white text-purple-600' : 'bg-purple-100 text-purple-600'
                                                )}>
                                                    Q{q.quarter}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={cn(
                                                        "text-xs font-medium tracking-tight truncate",
                                                        isExpanded ? "text-purple-900" : "text-slate-900"
                                                    )}>
                                                        {q.goal || 'Без цели'}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <div className={cn(
                                                            "flex-1 h-2 rounded-full overflow-hidden shadow-inner",
                                                            isExpanded ? "bg-white/10" : "bg-purple-50"
                                                        )}>
                                                            <div
                                                                className={cn(
                                                                    "h-full transition-all duration-500",
                                                                    q.qProgressPercent >= 100 ? "bg-emerald-400" : (isExpanded ? "bg-purple-300" : "bg-purple-500")
                                                                )}
                                                                style={{ width: `${Math.min(q.qProgressPercent, 100)}%` }}
                                                            />
                                                        </div>
                                                        <span className={cn(
                                                            "text-2xs font-black font-mono w-10 text-right flex-shrink-0",
                                                            isExpanded ? "text-white" : "text-purple-600"
                                                        )}>
                                                            {q.qProgressPercent}%
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Детали квартала - белый фон */}
                                            {isExpanded && (
                                                <div className="ml-9 mt-1 mb-2 space-y-1 border-l-2 border-purple-200 pl-2">
                                                    {q.expected_result && (
                                                        <div className="flex items-start gap-2 text-xs py-1">
                                                            <span className="text-2xs font-bold text-slate-500 flex-shrink-0 mt-0.5">Результат</span>
                                                            <span className="flex-1 break-words text-slate-800 font-medium">{q.expected_result}</span>
                                                        </div>
                                                    )}
                                                    {q.process_name && (
                                                        <div className="flex items-start gap-2 text-xs py-1">
                                                            <span className="text-2xs font-bold text-slate-500 flex-shrink-0 mt-0.5">Процесс</span>
                                                            <span className="flex-1 break-words text-slate-800 font-medium">{q.process_name}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </PlanDetailcard>
        </div>
    );
}




