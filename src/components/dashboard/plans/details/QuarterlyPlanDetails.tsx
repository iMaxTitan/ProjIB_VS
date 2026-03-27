import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { AnnualPlan, QuarterlyPlan, MonthlyPlan, PlanStatus } from '@/types/planning';
import { UserInfo } from '@/types/azure';
import { DetailSection, GradientDetailCard } from '@/components/dashboard/shared';
import PlanStatusDropdown from './components/PlanStatusDropdown';
import { useQuarterlyPlanOps } from '@/hooks/usePlanOperations';
import { useProcesses } from '@/hooks/useProcesses';
import { useAvailableStatuses } from '@/hooks/useAvailableStatuses';
import { getErrorMessage } from '@/lib/shared/utils/error-message';
import logger from '@/lib/shared/logger';
import QuarterlyMonthlyPlansList from './components/QuarterlyMonthlyPlansList';
import QuarterlyPlanCopyModal from './components/QuarterlyPlanCopyModal';
import { useQuarterlyPlanCopy } from '@/hooks/planning/useQuarterlyPlanCopy';
import { useQuarterlyMonthStats } from '@/hooks/planning/useQuarterlyMonthStats';

interface QuarterlyPlanDetailsProps {
    plan: QuarterlyPlan;
    user: UserInfo;
    onClose: () => void;
    onUpdate?: (newId?: string) => void;
    canEdit: boolean;
    annualPlans: AnnualPlan[];
    monthlyPlans: MonthlyPlan[];
}

const NO_PLAN_TITLE = 'Нет названия плана';
const NO_EXPECTED_RESULT = 'Нет ожидаемого результата';

export default function QuarterlyPlanDetails({
    plan, onClose, onUpdate, canEdit, annualPlans, monthlyPlans, user
}: QuarterlyPlanDetailsProps) {
    const isNewPlan = plan.quarterly_id === 'new';

    const [isEditing, setIsEditing] = useState(isNewPlan);
    const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
    const [currentStatus, setCurrentStatus] = useState<PlanStatus>(plan.status);
    const [editQuarter, setEditQuarter] = useState(plan.quarter);
    const [editProcessId, setEditProcessId] = useState(plan.process_id || '');
    const [editParams, setEditParams] = useState({ goal: plan.goal, expectedResult: plan.expected_result });
    const availableStatuses = useAvailableStatuses({ user, currentStatus, planType: 'quarterly' });
    const { processes, loading: loadingProcesses } = useProcesses({ userId: user?.user_id });

    const relatedMonthly = useMemo(() =>
        monthlyPlans.filter((m: MonthlyPlan) => m.quarterly_id === plan.quarterly_id),
        [monthlyPlans, plan.quarterly_id]);
    const linkedAnnual = useMemo(() =>
        annualPlans.find((a: AnnualPlan) => a.annual_id === plan.annual_plan_id),
        [annualPlans, plan.annual_plan_id]);
    const activeAnnualPlans = useMemo(() => annualPlans.filter((a) => a.status === 'active'), [annualPlans]);

    const { canDelete, deleteReason, save, remove, changeStatus } = useQuarterlyPlanOps(
        plan.quarterly_id,
        user?.user_id || '',
        user?.role,
        isNewPlan,
    );

    const { monthStats } = useQuarterlyMonthStats(plan.quarterly_id, relatedMonthly);

    const copy = useQuarterlyPlanCopy({
        plan, user, isNewPlan, activeAnnualPlans,
        onSuccess: (newId) => { onUpdate?.(newId); },
    });

    useEffect(() => {
        setCurrentStatus(plan.status);
        setEditQuarter(plan.quarter);
        setEditProcessId(plan.process_id || '');
        setEditParams({ goal: plan.goal, expectedResult: plan.expected_result });
        if (plan.quarterly_id === 'new') setIsEditing(true);
    }, [plan]);

    const handleDelete = async () => {
        const result = await remove();
        if (result.success) { onUpdate?.(); onClose(); }
        else toast.error(result.error || 'Ошибка при удалении');
    };

    const onStatusChangeHandler = async (newStatus: PlanStatus) => {
        if (isNewPlan) return;
        try {
            setCurrentStatus(newStatus);
            const result = await changeStatus(newStatus);
            if (!result.success) throw new Error(result.error || 'Ошибка изменения статуса');
            onUpdate?.();
        } catch (e: unknown) {
            logger.error('Status Change Error:', e);
            setCurrentStatus(plan.status);
            toast.error(`Ошибка при смене статуса: ${getErrorMessage(e)}`);
        }
    };

    const handleSave = async () => {
        if (!editParams.goal.trim()) { toast.warning('Введите цель плана'); return; }
        if (!editParams.expectedResult.trim()) { toast.warning('Введите ожидаемый результат'); return; }
        if (!editProcessId) { toast.warning('Выберите процесс'); return; }
        const departmentId = isNewPlan ? (user?.department_id || '') : (plan.department_id || '');
        try {
            const result = await save({
                action: isNewPlan ? 'create' : 'update',
                quarterlyId: isNewPlan ? undefined : plan.quarterly_id,
                annualPlanId: plan.annual_plan_id || '',
                departmentId, quarter: editQuarter,
                goal: editParams.goal, expectedResult: editParams.expectedResult,
                status: currentStatus, process_id: editProcessId, userId: user?.user_id || '',
            });
            setIsEditing(false);
            const newId = typeof result === 'string' ? result : (result?.quarterly_id || result?.id);
            onUpdate?.(newId);
        } catch (error: unknown) {
            logger.error('Failed to save plan:', error);
            toast.error('Ошибка при сохранении');
        }
    };

    const handleCancel = () => {
        if (isNewPlan) { onClose(); return; }
        setEditParams({ goal: plan.goal, expectedResult: plan.expected_result });
        setEditQuarter(plan.quarter);
        setEditProcessId(plan.process_id || '');
        setIsEditing(false);
    };

    const modeLabel = isNewPlan ? 'Создание' : isEditing ? 'Редактирование' : 'Просмотр';

    return (
        <>
        <GradientDetailCard
            gradientClassName="from-purple-400/80 to-violet-400/80"
            modeLabel={modeLabel} isEditing={isEditing} canEdit={canEdit}
            onEdit={canEdit && !isNewPlan ? () => setIsEditing(true) : undefined}
            onSave={handleSave} onCancel={handleCancel} onClose={onClose}
            onDelete={isNewPlan ? undefined : handleDelete}
            onCopy={!isNewPlan ? () => copy.setIsCopyModalOpen(true) : undefined}
            canDelete={canDelete} deleteReason={deleteReason} deleteConfirm
            headerIcon={<Calendar />}
            headerContent={
                <>
                    <PlanStatusDropdown status={currentStatus} onStatusChange={isNewPlan ? undefined : onStatusChangeHandler} canChange={canEdit && !isEditing} availableStatuses={availableStatuses} />
                    <span className="font-bold text-lg leading-tight tracking-tight drop-shadow-sm font-heading">{modeLabel}</span>
                </>
            }
        >
            {isEditing && (
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-700">Квартал:</span>
                    <div className="flex gap-1">
                        {[1, 2, 3, 4].map(q => (
                            <button key={q} type="button" onClick={() => setEditQuarter(q)}
                                className={cn('px-3 py-1.5 text-xs rounded-lg border transition-colors',
                                    editQuarter === q ? 'bg-purple-500 text-white border-purple-600 shadow-sm' : 'bg-white text-slate-700 border-slate-300 hover:bg-purple-50 hover:border-purple-300')}>
                                Q{q}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {linkedAnnual && !isNewPlan && (
                <div className="flex items-center gap-3 text-sm text-slate-800 bg-white/70 p-3 rounded-2xl border border-purple-200/50 shadow-sm glass-card">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 text-sm font-bold shadow-md flex-shrink-0">{linkedAnnual.year}</div>
                    <div className="flex flex-col flex-1 min-w-0">
                        <span className="font-bold tracking-tight text-slate-900 leading-tight truncate">{linkedAnnual.goal?.trim() || NO_PLAN_TITLE}</span>
                        <span className="text-2xs font-bold text-amber-600/70 uppercase tracking-widest mt-0.5">Годовой план</span>
                    </div>
                </div>
            )}

            <DetailSection title="Процесс" colorScheme="purple">
                {isEditing ? (
                    <select value={editProcessId} onChange={(e) => setEditProcessId(e.target.value)} disabled={loadingProcesses} aria-label="Выбор процесса"
                        className="w-full p-4 text-sm glass-card rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-colors font-medium text-slate-700 bg-white/40 cursor-pointer">
                        <option value="">Выберите процесс...</option>
                        {processes.map((proc) => <option key={proc.process_id} value={proc.process_id}>{proc.process_name}</option>)}
                    </select>
                ) : (
                    plan.process_name && <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">{plan.process_name}</div>
                )}
            </DetailSection>

            <DetailSection title="Цель" colorScheme="purple">
                {isEditing ? (
                    <textarea value={editParams.goal} onChange={(e) => setEditParams(p => ({ ...p, goal: e.target.value }))}
                        className="w-full min-h-[100px] p-4 text-sm glass-card rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-colors font-medium text-slate-700" placeholder="Введите цель..." />
                ) : (
                    <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">{editParams.goal?.trim() || NO_PLAN_TITLE}</div>
                )}
            </DetailSection>

            <DetailSection title="Ожидаемый результат" colorScheme="purple">
                {isEditing ? (
                    <textarea value={editParams.expectedResult} onChange={(e) => setEditParams(p => ({ ...p, expectedResult: e.target.value }))}
                        className="w-full min-h-[100px] p-4 text-sm glass-card rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-colors font-medium text-slate-700" placeholder="Ожидаемый результат..." />
                ) : (
                    <div className="glass-card p-3 rounded-2xl text-slate-700 bg-white/40 leading-snug">{editParams.expectedResult?.trim() || NO_EXPECTED_RESULT}</div>
                )}
            </DetailSection>

            {!isNewPlan && (
                <DetailSection title="Месячные планы" colorScheme="purple" className="pt-4 border-t border-purple-100">
                    <QuarterlyMonthlyPlansList relatedMonthly={relatedMonthly} monthStats={monthStats} expandedMonth={expandedMonth} onToggleExpand={(id) => setExpandedMonth(expandedMonth === id ? null : id)} />
                </DetailSection>
            )}
        </GradientDetailCard>

        {!isNewPlan && (
            <QuarterlyPlanCopyModal
                isOpen={copy.isCopyModalOpen} onClose={copy.closeCopyModal}
                activeAnnualPlans={activeAnnualPlans} copyAnnualId={copy.copyAnnualId}
                onCopyAnnualIdChange={copy.setCopyAnnualId} copyQuarter={copy.copyQuarter}
                onCopyQuarterChange={copy.setCopyQuarter} copyError={copy.copyError}
                copying={copy.copying} onCopy={copy.handleCopy}
            />
        )}
        </>
    );
}
