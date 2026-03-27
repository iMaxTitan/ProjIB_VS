import React, { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { Calendar, Users, Plus } from 'lucide-react';
import AddTaskModal from '@/components/dashboard/plans/Tasks/AddTaskModal';
import { cn } from '@/lib/shared/utils';
import { MonthlyPlan, QuarterlyPlan, PlanStatus, getMonthName, MONTH_NAMES_RU } from '@/types/planning';
import { UserInfo } from '@/types/azure';
import { supabase } from '@/lib/shared/supabase';
import { DetailSection, GradientDetailCard } from '@/components/dashboard/shared';
import PlanStatusDropdown from './components/PlanStatusDropdown';
import { useAvailableStatuses } from '@/hooks/useAvailableStatuses';
import PlanWorkLog from './components/PlanWorkLog';
import PlanCopyModal from './components/PlanCopyModal';
import logger from '@/lib/shared/logger';
import { HourDistributionType } from '@/types/infrastructure';
import { useProjects } from '@/hooks/useProjects';
import { useMonthlyPlanData } from '@/hooks/planning/useMonthlyPlanData';
import { useMonthlyPlanHandlers } from '@/hooks/planning/useMonthlyPlanHandlers';
import PlanCompanySection from './components/PlanCompanySection';
import PlanProcedureSection from './components/PlanProcedureSection';
import { useKBDocuments } from '@/hooks/useKBDocuments';
interface MonthlyPlanDetailsProps {
    plan: MonthlyPlan;
    user: UserInfo;
    onClose: () => void;
    onUpdate?: (newId?: string) => void;
    canEdit: boolean;
    quarterlyPlans: QuarterlyPlan[];
}

export default function MonthlyPlanDetails({ plan, user, onClose, onUpdate, canEdit, quarterlyPlans }: MonthlyPlanDetailsProps) {
    const isNewPlan = plan.monthly_plan_id === 'new';

    // Editing state
    const [isEditing, setIsEditing] = useState(isNewPlan);
    const [currentStatus, setCurrentStatus] = useState<PlanStatus>(plan.status);
    const [editMonth, setEditMonth] = useState(plan.month);
    const [editPlannedHours, setEditPlannedHours] = useState(plan.planned_hours);
    const [editQuarterlyId, setEditQuarterlyId] = useState(plan.quarterly_id || '');
    const [editProcedureId, setEditProcedureId] = useState(plan.procedure_id || '');
    const [editAssigneeIds, setEditAssigneeIds] = useState<string[]>([]);
    const initialAssigneeIdsRef = useRef<string[]>([]);
    const [editCompanyIds, setEditCompanyIds] = useState<string[]>([]);
    const [distributionType, setDistributionType] = useState<HourDistributionType>((plan.distribution_type as HourDistributionType) || 'even');
    const [editProjectIds, setEditProjectIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [taskToEdit, setTaskToEdit] = useState<ReturnType<typeof useMonthlyPlanData>['tasks'][number] | null>(null);
    const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
    const [tasksRefreshTrigger, setTasksRefreshTrigger] = useState(0);
    const [taskTargetUserId, setTaskTargetUserId] = useState<string | null>(null);
    const [editDocIds, setEditDocIds] = useState<string[]>([]);

    const { projects: activeProjects } = useProjects({ activeOnly: true });
    const { data: kbDocuments } = useKBDocuments('ib');

    const effectiveProcessId = (quarterlyPlans.find(q => q.quarterly_id === (isEditing ? editQuarterlyId : plan.quarterly_id))?.process_id || plan.process_id) ?? null;
    const effectiveProcessName = (quarterlyPlans.find(q => q.quarterly_id === (isEditing ? editQuarterlyId : plan.quarterly_id))?.process_name || plan.process_name || '').trim();

    const {
        allCompanies, allUsers, assignees, procedures, availableProcedures,
        canDelete, deleteReason, isUserAssigned, tasks, tasksLoading,
        companyInfraMap, companyShares, getInfraCount,
    } = useMonthlyPlanData({
        plan, user, isEditing, editQuarterlyId, editProcedureId, editMonth,
        editCompanyIds, distributionType, tasksRefreshTrigger, isNewPlan,
        effectiveProcessId, effectiveProcessName,
    });

    const handlers = useMonthlyPlanHandlers({
        plan, user, isNewPlan, currentStatus, editMonth, editPlannedHours,
        editQuarterlyId, editProcedureId, editAssigneeIds, editCompanyIds,
        distributionType, editProjectIds, editDocIds, initialAssigneeIdsRef,
        setCurrentStatus, setEditMonth, setEditPlannedHours, setEditProcedureId,
        setIsEditing, setSaving, setIsTaskModalOpen, setTaskToEdit,
        setTasksRefreshTrigger, setDistributionType, onUpdate, onClose,
    });

    const availableStatuses = useAvailableStatuses({ user, currentStatus, isEditMode: !isNewPlan, planType: 'monthly' });
    const linkedQuarterly = useMemo(() => quarterlyPlans.find(q => q.quarterly_id === (isEditing ? editQuarterlyId : plan.quarterly_id)), [quarterlyPlans, plan.quarterly_id, editQuarterlyId, isEditing]);
    const selectedQuarter = linkedQuarterly?.quarter || Math.ceil(plan.month / 3);
    const quarterMonths = useMemo(() => { const s = (selectedQuarter - 1) * 3 + 1; return [s, s + 1, s + 2]; }, [selectedQuarter]);
    const activeQuarterlyPlans = useMemo(() => quarterlyPlans.filter(q => q.status === 'active'), [quarterlyPlans]);

    const currentProcedureDescription = useMemo(() => {
        const mid = isEditing ? editProcedureId : plan.procedure_id;
        if (!mid) return null;
        return procedures.find(m => m.procedure_id === mid)?.description || null;
    }, [procedures, editProcedureId, plan.procedure_id, isEditing]);

    const sourceProcessId = linkedQuarterly?.process_id || plan.process_id || null;
    const sourceProcessName = (linkedQuarterly?.process_name || plan.process_name || '').trim().toLowerCase();

    // Sync prop changes
    useEffect(() => {
        setCurrentStatus(plan.status);
        setEditMonth(plan.month);
        setEditPlannedHours(plan.planned_hours);
        setEditQuarterlyId(plan.quarterly_id || '');
        setEditProcedureId(plan.procedure_id || '');
        if (plan.monthly_plan_id === 'new') setIsEditing(true);
    }, [plan]);

    // Load editing state from DB
    useEffect(() => {
        if (isNewPlan) return;
        const fetchData = async () => {
            try {
                const { data: assigneesData } = await supabase
                    .from('monthly_plan_assignees').select('user_id').eq('monthly_plan_id', plan.monthly_plan_id);
                if (assigneesData) {
                    const ids = assigneesData.map(a => a.user_id);
                    setEditAssigneeIds(ids);
                    initialAssigneeIdsRef.current = ids;
                }
                const { data: companiesData } = await supabase
                    .from('monthly_plan_companies').select('company_id').eq('monthly_plan_id', plan.monthly_plan_id);
                if (companiesData) {
                    setEditCompanyIds(companiesData.map(c => c.company_id));
                    setDistributionType((plan.distribution_type as HourDistributionType) || 'even');
                }
                const { data: projectsData } = await supabase
                    .from('monthly_plan_projects').select('project_id').eq('monthly_plan_id', plan.monthly_plan_id);
                if (projectsData) setEditProjectIds(projectsData.map(p => p.project_id));
                const { data: docsData } = await supabase
                    .from('monthly_plan_documents').select('kb_document_id').eq('monthly_plan_id', plan.monthly_plan_id);
                if (docsData) setEditDocIds(docsData.map(d => d.kb_document_id));
            } catch (err: unknown) { logger.error('Error loading monthly plan data:', err); }
        };
        fetchData();
    }, [plan.monthly_plan_id, plan.distribution_type, isNewPlan]);

    const modeLabel = isNewPlan ? 'Создание' : isEditing ? 'Редактирование' : 'Просмотр';
    const PERIOD_LABELS: Record<'year' | 'quarter' | 'month', string> = { year: 'в год', quarter: 'в квартал', month: 'в месяц' };

    return (
        <>
        <GradientDetailCard
            gradientClassName="from-indigo-400/80 to-blue-400/80"
            modeLabel={modeLabel} isEditing={isEditing} canEdit={canEdit}
            onEdit={canEdit && !isNewPlan ? () => setIsEditing(true) : undefined}
            onSave={handlers.handleSave} onCancel={handlers.handleCancel} onClose={onClose}
            onDelete={isNewPlan ? undefined : handlers.handleDelete}
            onCopy={!isNewPlan ? () => setIsCopyModalOpen(true) : undefined}
            canDelete={canDelete} deleteReason={deleteReason} deleteConfirm saving={saving}
            headerActions={!isNewPlan && !isEditing && (
                <button type="button" onClick={handlers.handleAddTask} aria-label="Добавить задачу" title="Добавить задачу"
                    className="p-2 hover:bg-white/20 rounded-xl transition-colors text-white/80 hover:text-white">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
            )}
            headerIcon={<Calendar />}
            headerContent={
                <>
                    <PlanStatusDropdown status={currentStatus} onStatusChange={isNewPlan ? undefined : handlers.onStatusChangeHandler} canChange={canEdit && !isEditing} availableStatuses={availableStatuses} />
                    <span className="font-bold text-lg leading-tight tracking-tight drop-shadow-sm font-heading">{modeLabel}</span>
                </>
            }
        >
            {isEditing && !plan.quarterly_id && (
                <div>
                    <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">Квартальный план</label>
                    <select value={editQuarterlyId}
                        onChange={(e) => { setEditQuarterlyId(e.target.value); setEditProcedureId(''); const q = quarterlyPlans.find(qp => qp.quarterly_id === e.target.value); if (q) { setEditProcedureId(''); setEditMonth((q.quarter - 1) * 3 + 1); } }}
                        className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400">
                        <option value="">Выберите...</option>
                        {quarterlyPlans.filter(q => ['approved', 'active'].includes(q.status)).map(q => (
                            <option key={q.quarterly_id} value={q.quarterly_id}>Q{q.quarter} - {q.goal?.slice(0, 50) || 'Без названия'}</option>
                        ))}
                    </select>
                </div>
            )}

            {linkedQuarterly && !isNewPlan && !isEditing && (
                <DetailSection title="Квартальный план" colorScheme="purple">
                    <div className="glass-card p-3 rounded-2xl text-xs font-medium text-slate-700 bg-white/40 leading-snug line-clamp-2">Q{linkedQuarterly.quarter} — {linkedQuarterly.goal}</div>
                </DetailSection>
            )}
            {linkedQuarterly && isEditing && plan.quarterly_id && (
                <DetailSection title="Квартальный план" colorScheme="purple">
                    <div className="glass-card p-3 rounded-2xl text-xs font-medium text-slate-700 bg-white/40 leading-snug line-clamp-2">Q{linkedQuarterly.quarter} — {linkedQuarterly.goal}</div>
                </DetailSection>
            )}

            <PlanProcedureSection
                isEditing={isEditing}
                editProcedureId={editProcedureId}
                availableProcedures={availableProcedures}
                planProcedureName={plan.procedure_name || procedures.find(m => m.procedure_id === plan.procedure_id)?.name}
                currentProcedureDescription={currentProcedureDescription}
                hasLinkedQuarterly={!!linkedQuarterly}
                onProcedureChange={(id, hours) => { setEditProcedureId(id); if (hours > 0) setEditPlannedHours(hours); }}
            />

            <DetailSection title="Часы" colorScheme="indigo">
                {isEditing ? (
                    <div className="grid grid-cols-2 gap-3">
                        <input type="number" value={editPlannedHours} onChange={(e) => setEditPlannedHours(Number(e.target.value) || 0)} onFocus={(e) => e.target.select()}
                            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" min={0} step={8} placeholder="План часов" />
                        <select value={editMonth} onChange={(e) => setEditMonth(Number(e.target.value))}
                            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400">
                            {quarterMonths.map((monthNum) => <option key={monthNum} value={monthNum}>{MONTH_NAMES_RU[monthNum - 1]}</option>)}
                        </select>
                    </div>
                ) : (
                    <div className="glass-card p-3 rounded-2xl text-xs font-medium text-slate-700 bg-white/40 leading-snug">
                        {Number(plan.planned_hours || editPlannedHours || 0).toFixed(0)} ч. на {getMonthName(plan.month || editMonth, 'ru')}
                    </div>
                )}
            </DetailSection>

            <PlanCompanySection
                isEditing={isEditing}
                allCompanies={allCompanies}
                editCompanyIds={editCompanyIds}
                distributionType={distributionType}
                companyShares={companyShares}
                getInfraCount={getInfraCount}
                activeProjects={activeProjects}
                editProjectIds={editProjectIds}
                onToggleCompany={(id) => setEditCompanyIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                onDistributionTypeChange={handlers.handleDistributionTypeChange}
                onToggleProject={(id) => setEditProjectIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                kbDocuments={kbDocuments}
                editDocIds={editDocIds}
                onToggleDoc={(id) => setEditDocIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
            />

            {isEditing && (
                <DetailSection title="Исполнители" colorScheme="indigo">
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                        {allUsers.map(u => (
                            <button key={u.user_id} type="button"
                                onClick={() => setEditAssigneeIds(prev => prev.includes(u.user_id) ? prev.filter(x => x !== u.user_id) : [...prev, u.user_id])}
                                className={cn('flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border transition-colors',
                                    editAssigneeIds.includes(u.user_id) ? 'bg-indigo-100 border-indigo-300 text-indigo-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100')}>
                                {u.photo_base64 ? (
                                    <Image src={u.photo_base64} alt="" width={16} height={16} unoptimized className="w-4 h-4 rounded-full" />
                                ) : (
                                    <Users className="w-3 h-3" />
                                )}
                                {u.full_name}
                            </button>
                        ))}
                    </div>
                </DetailSection>
            )}

            {!isNewPlan && !isEditing && (
                <PlanWorkLog
                    tasks={tasks} tasksLoading={tasksLoading}
                    user={user} plan={plan} assignees={assignees}
                    onEditTask={handlers.handleEditTask} onDeleteTask={handlers.handleDeleteTask}
                    onAddTaskForUser={(uid) => { setTaskTargetUserId(uid); setTaskToEdit(null); setIsTaskModalOpen(true); }}
                    onAcceptTask={handlers.handleAcceptTask} onRejectTask={handlers.handleRejectTask}
                />
            )}
        </GradientDetailCard>

        {!isNewPlan && (
            <AddTaskModal
                isOpen={isTaskModalOpen}
                onClose={() => { setIsTaskModalOpen(false); setTaskToEdit(null); setTaskTargetUserId(null); }}
                onSuccess={handlers.handleTaskSuccess}
                monthlyPlanId={plan.monthly_plan_id}
                userId={taskTargetUserId || user.user_id}
                userDepartmentId={user.department_id || undefined}
                task={taskToEdit ? {
                    daily_task_id: taskToEdit.daily_task_id, description: taskToEdit.description,
                    title: taskToEdit.title, source: taskToEdit.source,
                    spent_hours: taskToEdit.spent_hours, task_date: taskToEdit.task_date,
                    attachment_url: taskToEdit.attachment_url, document_number: taskToEdit.document_number,
                    project_id: taskToEdit.project_id,
                    kb_document_id: taskToEdit.kb_document_id,
                } : null}
                monthlyPlan={plan}
                planCompanyIds={editCompanyIds}
                planDistributionType={distributionType}
                planProjectIds={editProjectIds}
                companyInfraMap={companyInfraMap}
                creatorRole={taskTargetUserId && taskTargetUserId !== user.user_id ? (user.role || undefined) : undefined}
                planDocuments={(kbDocuments ?? []).filter(d => d.status === 'ready' && editDocIds.includes(d.id))}
            />
        )}

        {!isNewPlan && (
            <PlanCopyModal
                isOpen={isCopyModalOpen} onClose={() => setIsCopyModalOpen(false)}
                plan={plan} user={user} activeQuarterlyPlans={activeQuarterlyPlans}
                sourceProcessId={sourceProcessId} sourceProcessName={sourceProcessName}
                editAssigneeIds={editAssigneeIds} assignees={assignees}
                editCompanyIds={editCompanyIds} editProcedureId={editProcedureId}
                distributionType={distributionType} editProjectIds={editProjectIds}
                onSuccess={(newId) => { setIsCopyModalOpen(false); onUpdate?.(newId); }}
            />
        )}
        </>
    );
}
