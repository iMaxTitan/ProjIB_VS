import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, Users, FileText, Clock, Pencil, Loader2, ChevronRight, Plus, Settings, Building2 } from 'lucide-react';
import AddTaskModal from '@/components/dashboard/Tasks/AddTaskModal';
import { cn } from '@/lib/utils';
import { MonthlyPlan, QuarterlyPlan, Measure, PlanStatus, getMonthName, MONTH_NAMES_RU } from '@/types/planning';
import { UserInfo } from '@/types/azure';
import { UserRole } from '@/types/supabase';
import { supabase } from '@/lib/supabase';
import { PlanDetailcard, PlanDetailHeader, PlanSection } from './components/PlanDetailCommon';
import { manageMonthlyPlan, getMeasures, canDeleteMonthlyPlan, deleteMonthlyPlan, changeMonthlyPlanStatus } from '@/lib/plans/plan-service';
import { useAvailableStatuses } from '@/hooks/useAvailableStatuses';
import { getTasksByMonthlyPlanId, DailyTaskRow } from '@/lib/tasks/task-service';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage } from '@/lib/utils/error-message';
import logger from '@/lib/logger';
import {
    WorkloadDistributionType,
    WORKLOAD_DISTRIBUTION_TYPES,
    EXCLUDED_COMPANIES_ATBi5,
    CompanyWithInfrastructure
} from '@/types/infrastructure';

interface AssigneeWithDetails {
    user_id: string;
    full_name: string;
    department_name?: string;
    photo_base64?: string;
    role?: string;
    department_id?: string;
}

interface Company {
    company_id: string;
    company_name: string;
    has_servers?: boolean;
}

interface Task {
    daily_task_id: string;
    description: string;
    spent_hours: number;
    created_at: string;
    task_date: string;
    attachment_url?: string | null;
    document_number?: string | null;
    project_id?: string | null;
    user_id?: string;
    user_profiles?: {
        full_name: string | null;
        photo_base64?: string | null;
        role?: string | null;
    } | null;
}

interface EmployeeGroup {
    user: Task['user_profiles'];
    userId: string;
    tasks: Task[];
    totalHours: number;
    completedCount: number;
}

interface MonthlyPlanDetailsProps {
    plan: MonthlyPlan;
    user: UserInfo;
    onClose: () => void;
    onUpdate?: (newId?: string) => void;
    canEdit: boolean;
    quarterlyPlans: QuarterlyPlan[];
}

const normalizeUserRole = (role: string | null | undefined): UserRole => {
    if (role === 'chief' || role === 'head' || role === 'employee') return role;
    return 'employee';
};

const mapTaskRow = (row: DailyTaskRow): Task => ({
    ...row,
    user_profiles: Array.isArray(row.user_profiles)
        ? row.user_profiles[0] ?? null
        : row.user_profiles ?? null,
});

export default function MonthlyPlanDetails({
    plan,
    user,
    onClose,
    onUpdate,
    canEdit,
    quarterlyPlans
}: MonthlyPlanDetailsProps) {
    const isNewPlan = plan.monthly_plan_id === 'new';

    // Editing state
    const [isEditing, setIsEditing] = useState(isNewPlan);
    const [currentStatus, setCurrentStatus] = useState<PlanStatus>(plan.status);
    const [editMonth, setEditMonth] = useState(plan.month);
    const [editPlannedHours, setEditPlannedHours] = useState(plan.planned_hours);
    const [editQuarterlyId, setEditQuarterlyId] = useState(plan.quarterly_id || '');
    const [editMeasureId, setEditMeasureId] = useState(plan.measure_id || '');
    const [editAssigneeIds, setEditAssigneeIds] = useState<string[]>([]);
    const [editCompanyIds, setEditCompanyIds] = useState<string[]>([]);
    const [distributionType, setDistributionType] = useState<WorkloadDistributionType>('custom');

    // Data state
    const [assignees, setAssignees] = useState<AssigneeWithDetails[]>([]);
    const [measures, setMeasures] = useState<Measure[]>([]);
    const [allUsers, setAllUsers] = useState<AssigneeWithDetails[]>([]);
    const [allCompanies, setAllCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Tasks state for work log
    const [tasks, setTasks] = useState<Task[]>([]);
    const [tasksLoading, setTasksLoading] = useState(false);
    const [expandedEmployees, setExpandedEmployees] = useState<string[]>([]);

    // Task editing state
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
    const [isUserAssigned, setIsUserAssigned] = useState(false);
    const [tasksRefreshTrigger, setTasksRefreshTrigger] = useState(0);

    // Delete state
    const [canDelete, setCanDelete] = useState(false);
    const [deleteReason, setDeleteReason] = useState<string>('');
    const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
    const [copyQuarterlyId, setCopyQuarterlyId] = useState<string>('');
    const [copyTargetMonth, setCopyTargetMonth] = useState<number>(((plan.month % 12) || 0) + 1);
    const [copying, setCopying] = useState(false);
    const [copyError, setCopyError] = useState<string | null>(null);
    const PERIOD_LABELS: Record<'year' | 'quarter' | 'month', string> = {
        year: 'в год',
        quarter: 'в квартал',
        month: 'в месяц',
    };

    const getMonthlyHoursFromMeasure = useCallback((measure: Measure): number => {
        const value = Number(measure.target_value) || 0;
        if (value <= 0) return 0;

        switch (measure.target_period) {
            case 'month':
                return Math.round(value);
            case 'year':
                return Math.round(value / 12);
            case 'quarter':
            default:
                return Math.round(value / 3);
        }
    }, []);

    // Available statuses
    const availableStatuses = useAvailableStatuses({
        user,
        currentStatus,
        isEditMode: !isNewPlan,
        planType: 'monthly',
    });

    // Get linked quarterly plan
    const linkedQuarterly = useMemo(() =>
        quarterlyPlans.find(q => q.quarterly_id === (isEditing ? editQuarterlyId : plan.quarterly_id)),
        [quarterlyPlans, plan.quarterly_id, editQuarterlyId, isEditing]
    );

    // Determine quarter from linked quarterly plan
    const selectedQuarter = linkedQuarterly?.quarter || Math.ceil(plan.month / 3);

    // Get months for this quarter (1-indexed)
    const quarterMonths = useMemo(() => {
        const startMonth = (selectedQuarter - 1) * 3 + 1;
        return [startMonth, startMonth + 1, startMonth + 2];
    }, [selectedQuarter]);

    // Group tasks by employee for work log (include assignees without tasks)
    const employeeGroups: EmployeeGroup[] = useMemo(() => {
        // First, create groups from tasks
        const groupsMap = tasks.reduce((acc, task) => {
            const key = task.user_id || task.user_profiles?.full_name || 'unknown';
            if (!acc[key]) {
                acc[key] = {
                    user: task.user_profiles,
                    userId: key,
                    tasks: [],
                    totalHours: 0,
                    completedCount: 0
                };
            }
            acc[key].tasks.push(task);
            acc[key].totalHours += Number(task.spent_hours || 0);
            if (task.task_date) acc[key].completedCount++;
            return acc;
        }, {} as Record<string, EmployeeGroup>);

        // Add assignees who don't have tasks yet
        assignees.forEach(assignee => {
            if (!groupsMap[assignee.user_id]) {
                groupsMap[assignee.user_id] = {
                    user: {
                        full_name: assignee.full_name,
                        photo_base64: assignee.photo_base64,
                        role: assignee.role
                    },
                    userId: assignee.user_id,
                    tasks: [],
                    totalHours: 0,
                    completedCount: 0
                };
            }
        });

        return Object.values(groupsMap).sort((a, b) => b.totalHours - a.totalHours);
    }, [tasks, assignees]);

    const assigneeNameById = useMemo(
        () => new Map(assignees.map(a => [a.user_id, a.full_name])),
        [assignees]
    );

    const resolveUserName = (group: EmployeeGroup): string => {
        return (
            group.user?.full_name ||
            assigneeNameById.get(group.userId) ||
            group.tasks[0]?.user_profiles?.full_name ||
            (group.userId !== 'unknown' ? `ID: ${group.userId.slice(0, 8)}` : 'Исполнитель')
        );
    };

    // Helper functions for work log
    const avatarColors = ['bg-indigo-500', 'bg-blue-500', 'bg-emerald-500', 'bg-pink-500', 'bg-purple-500', 'bg-teal-500'];

    const getInitials = (name: string) => {
        return name.split(' ').map(w => w[0]?.toUpperCase() || '').join('').slice(0, 2);
    };

    const formatTaskDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    };

    // Update local state if prop changes
    useEffect(() => {
        setCurrentStatus(plan.status);
        setEditMonth(plan.month);
        setEditPlannedHours(plan.planned_hours);
        setEditQuarterlyId(plan.quarterly_id || '');
        setEditMeasureId(plan.measure_id || '');
        if (plan.monthly_plan_id === 'new') {
            setIsEditing(true);
        }
    }, [plan]);

    // Load dictionaries (companies and users)
    useEffect(() => {
        const loadDictionaries = async () => {
            // Companies with infrastructure info (for has_servers)
            const { data: companies } = await supabase
                .from('v_companies_with_infrastructure')
                .select('company_id, company_name, has_servers')
                .order('company_name');
            if (companies) setAllCompanies(companies);

            // Users - фильтрация по отделу для head
            let usersQuery = supabase
                .from('v_user_details')
                .select('user_id, full_name, department_name, photo_base64, role, department_id')
                .eq('status', 'active');

            if (user?.role === 'head' && user?.department_id) {
                usersQuery = usersQuery.eq('department_id', user.department_id);
            }

            const { data: users } = await usersQuery.order('full_name');
            if (users) setAllUsers(users);
        };
        loadDictionaries();
    }, [user?.role, user?.department_id]);

    const effectiveProcessId = linkedQuarterly?.process_id || plan.process_id;
    const effectiveProcessName = (linkedQuarterly?.process_name || plan.process_name || '').trim();

    // Load measures when process changes
    useEffect(() => {
        const fetchMeasures = async () => {
            // Если есть process_id - загружаем мероприятия этого процесса
            if (effectiveProcessId) {
                try {
                    const data = await getMeasures(effectiveProcessId);
                    setMeasures(data);
                } catch (err: unknown) {
                    logger.error('Error loading measures:', err);
                }
            } else if (effectiveProcessName) {
                // Fallback: если есть только имя процесса, фильтруем мероприятия по process_name
                try {
                    const data = await getMeasures();
                    const filtered = data.filter(
                        (m) => (m.process_name || '').trim().toLowerCase() === effectiveProcessName.toLowerCase()
                    );
                    setMeasures(filtered);
                } catch (err: unknown) {
                    logger.error('Error loading measures by process name:', err);
                }
            } else if (plan.measure_id && !plan.measure_name) {
                // Если нет process_id, но есть measure_id - загружаем все и ищем нужное
                try {
                    const data = await getMeasures();
                    setMeasures(data);
                } catch (err: unknown) {
                    logger.error('Error loading measures:', err);
                }
            } else {
                setMeasures([]);
            }
        };
        fetchMeasures();
    }, [effectiveProcessId, effectiveProcessName, plan.measure_id, plan.measure_name]);

    // Load plan data (assignees, companies)
    useEffect(() => {
        if (isNewPlan) {
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                // Assignees
                const { data: assigneesData } = await supabase
                    .from('monthly_plan_assignees')
                    .select('user_id')
                    .eq('monthly_plan_id', plan.monthly_plan_id);

                if (assigneesData) {
                    const ids = assigneesData.map(a => a.user_id);
                    setEditAssigneeIds(ids);

                    // Get full details
                    if (ids.length > 0) {
                        const { data: details } = await supabase
                            .from('v_user_details')
                            .select('user_id, full_name, department_name, photo_base64')
                            .in('user_id', ids);
                        if (details) setAssignees(details);
                    }
                }

                // Companies (if table exists)
                const { data: companiesData } = await supabase
                    .from('monthly_plan_companies')
                    .select('company_id')
                    .eq('monthly_plan_id', plan.monthly_plan_id);

                if (companiesData) {
                    const companyIds = companiesData.map(c => c.company_id);
                    setEditCompanyIds(companyIds);

                    // Try to determine distribution type from selected companies
                    // For now, default to 'custom' since we don't store the type yet
                    setDistributionType('custom');
                }
            } catch (err: unknown) {
                logger.error('Error loading monthly plan data:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [plan.monthly_plan_id, isNewPlan]);

    // Check delete permissions
    useEffect(() => {
        if (isNewPlan) {
            setCanDelete(false);
            return;
        }

        const checkDelete = async () => {
            const result = await canDeleteMonthlyPlan(plan.monthly_plan_id, user.user_id);
            setCanDelete(result.canDelete);
            setDeleteReason(result.reason || '');
        };
        checkDelete();
    }, [plan.monthly_plan_id, user.user_id, isNewPlan]);

    // Check if current user is assigned to this plan
    useEffect(() => {
        if (isNewPlan || !plan.monthly_plan_id || !user?.user_id) {
            setIsUserAssigned(false);
            return;
        }

        const checkAssignment = async () => {
            const { data } = await supabase
                .from('monthly_plan_assignees')
                .select('user_id')
                .eq('monthly_plan_id', plan.monthly_plan_id)
                .eq('user_id', user.user_id)
                .maybeSingle();

            setIsUserAssigned(!!data);
        };

        checkAssignment();
    }, [plan.monthly_plan_id, user?.user_id, isNewPlan]);

    // Load tasks for work log
    useEffect(() => {
        if (isNewPlan || !plan.monthly_plan_id) {
            setTasks([]);
            return;
        }

        setTasksLoading(true);
        getTasksByMonthlyPlanId(plan.monthly_plan_id)
            .then((data: DailyTaskRow[]) => {
                const mapped: Task[] = data.map(mapTaskRow);
                setTasks(mapped);
            })
            .catch(err => logger.error('Error loading tasks:', err))
            .finally(() => setTasksLoading(false));
    }, [plan.monthly_plan_id, isNewPlan, tasksRefreshTrigger]);

    const handleDelete = async () => {
        const result = await deleteMonthlyPlan(plan.monthly_plan_id, user.user_id);
        if (result.success) {
            onUpdate?.();
            onClose();
        } else {
            alert(result.error || 'Ошибка при удалении');
        }
    };

    const onStatusChangeHandler = async (newStatus: PlanStatus) => {
        if (isNewPlan) return;
        const oldStatus = currentStatus; // Сохраняем для отката
        try {
            setCurrentStatus(newStatus);
            // Используем специализированную функцию для смены статуса
            // Передаём текущий статус чтобы обойти RLS на SELECT
            const result = await changeMonthlyPlanStatus(
                plan.monthly_plan_id,
                newStatus,
                user.user_id,
                normalizeUserRole(user.role),
                oldStatus // передаём текущий статус
            );
            if (!result.success) {
                throw new Error(result.error || 'Ошибка изменения статуса');
            }
            onUpdate?.();
        } catch (e: unknown) {
            logger.error('Status Change Error:', e);
            setCurrentStatus(oldStatus); // Откат к предыдущему
            alert(`Ошибка при изменении статуса: ${getErrorMessage(e)}`);
        }
    };

    const handleSave = async () => {
        if (!editMeasureId) {
            alert('Выберите мероприятие');
            return;
        }
        if (!editQuarterlyId) {
            alert('Выберите квартальный план');
            return;
        }

        setSaving(true);
        try {
            const result = await manageMonthlyPlan({
                action: isNewPlan ? 'create' : 'update',
                monthlyPlanId: isNewPlan ? undefined : plan.monthly_plan_id,
                quarterlyId: editQuarterlyId,
                measureId: editMeasureId,
                year: plan.year,
                month: editMonth,
                plannedHours: editPlannedHours,
                status: currentStatus,
                assignees: editAssigneeIds,
                userId: user.user_id
            });

            const newId = (typeof result === 'string' ? result : result?.monthly_plan_id) ?? undefined;
            const targetId = isNewPlan ? newId : plan.monthly_plan_id;

            // Update companies
            if (targetId && targetId !== 'new') {
                await updateMonthlyPlanCompanies(targetId, editCompanyIds);
            }

            setIsEditing(false);
            onUpdate?.(newId);
        } catch (error: unknown) {
            logger.error('Failed to save plan:', error);
            alert(`Ошибка при сохранении: ${getErrorMessage(error)}`);
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        if (isNewPlan) {
            onClose();
        } else {
            setEditMonth(plan.month);
            setEditPlannedHours(plan.planned_hours);
            setEditMeasureId(plan.measure_id || '');
            setIsEditing(false);
        }
    };

    const toggleAssignee = (id: string) => {
        setEditAssigneeIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const toggleCompany = (id: string) => {
        setEditCompanyIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // Task handlers
    const handleAddTask = useCallback(() => {
        setTaskToEdit(null);
        setIsTaskModalOpen(true);
    }, []);

    const handleEditTask = useCallback((task: Task) => {
        setTaskToEdit(task);
        setIsTaskModalOpen(true);
    }, []);

    const handleTaskSuccess = useCallback(() => {
        setIsTaskModalOpen(false);
        setTaskToEdit(null);
        setTasksRefreshTrigger(prev => prev + 1);
        onUpdate?.();
    }, [onUpdate]);

    // Get companies by distribution type
    const getCompaniesByDistributionType = useCallback((type: WorkloadDistributionType): string[] => {
        if (type === 'custom') return editCompanyIds;

        return allCompanies
            .filter(c => {
                if (type === 'ATBi5') {
                    // Exclude КФК and МФФ
                    return !EXCLUDED_COMPANIES_ATBi5.some(name => c.company_name.includes(name));
                }
                if (type === 'ATB3') {
                    // Only companies with servers
                    return c.has_servers === true;
                }
                // ATBi7, ATB7 - all companies
                return true;
            })
            .map(c => c.company_id);
    }, [allCompanies, editCompanyIds]);

    // Handle distribution type change
    const handleDistributionTypeChange = useCallback((type: WorkloadDistributionType) => {
        setDistributionType(type);
        if (type !== 'custom') {
            // Auto-populate companies based on type
            const companyIds = getCompaniesByDistributionType(type);
            setEditCompanyIds(companyIds);
        }
    }, [getCompaniesByDistributionType]);

    const sourceProcessId = linkedQuarterly?.process_id || plan.process_id || null;
    const sourceProcessName = (linkedQuarterly?.process_name || plan.process_name || '').trim().toLowerCase();

    const activeQuarterlyPlans = useMemo(
        () => quarterlyPlans.filter(q => q.status === 'active'),
        [quarterlyPlans]
    );

    const copyQuarterlyOptions = useMemo(() => {
        const sameProcess = activeQuarterlyPlans.filter(q => {
            if (sourceProcessId) return q.process_id === sourceProcessId;
            if (sourceProcessName) return (q.process_name || '').trim().toLowerCase() === sourceProcessName;
            return false;
        });
        return sameProcess.length > 0 ? sameProcess : activeQuarterlyPlans;
    }, [activeQuarterlyPlans, sourceProcessId, sourceProcessName]);

    const selectedCopyQuarterly = useMemo(
        () => copyQuarterlyOptions.find(q => q.quarterly_id === copyQuarterlyId) || null,
        [copyQuarterlyOptions, copyQuarterlyId]
    );

    const copyQuarterMonths = useMemo(() => {
        if (!selectedCopyQuarterly) return [];
        const startMonth = (selectedCopyQuarterly.quarter - 1) * 3 + 1;
        return [startMonth, startMonth + 1, startMonth + 2];
    }, [selectedCopyQuarterly]);

    useEffect(() => {
        if (!isCopyModalOpen) return;

        const preferredQuarterlyId = (plan.quarterly_id && copyQuarterlyOptions.some(q => q.quarterly_id === plan.quarterly_id))
            ? plan.quarterly_id
            : copyQuarterlyOptions[0]?.quarterly_id || '';
        setCopyQuarterlyId(preferredQuarterlyId);
    }, [isCopyModalOpen, plan.quarterly_id, copyQuarterlyOptions]);

    useEffect(() => {
        if (!isCopyModalOpen || copyQuarterMonths.length === 0) return;
        if (!copyQuarterMonths.includes(copyTargetMonth)) {
            setCopyTargetMonth(copyQuarterMonths[0]);
        }
    }, [isCopyModalOpen, copyQuarterMonths, copyTargetMonth]);

    const handleCopyPlan = useCallback(async () => {
        if (isNewPlan) return;
        setCopying(true);
        setCopyError(null);

        try {
            const targetQuarterly = copyQuarterlyOptions.find(q => q.quarterly_id === copyQuarterlyId) || null;
            if (!targetQuarterly) {
                throw new Error('Не найден квартальный план для выбранного месяца');
            }

            const { data: existing, error: existingError } = await supabase
                .from('monthly_plans')
                .select('monthly_plan_id')
                .eq('quarterly_id', targetQuarterly.quarterly_id)
                .eq('year', plan.year)
                .eq('month', copyTargetMonth)
                .limit(1);

            if (existingError) throw existingError;
            if (existing && existing.length > 0) {
                throw new Error('В выбранном месяце уже существует месячный план');
            }

            const assigneesForCopy = editAssigneeIds.length > 0
                ? editAssigneeIds
                : assignees.map(a => a.user_id);
            const companiesForCopy = editCompanyIds.length > 0 ? editCompanyIds : [];
            const measureIdForCopy = editMeasureId || plan.measure_id;
            if (!measureIdForCopy) {
                throw new Error('Нельзя скопировать план без выбранного мероприятия');
            }

            const result = await manageMonthlyPlan({
                quarterlyId: targetQuarterly.quarterly_id,
                measureId: measureIdForCopy,
                year: plan.year,
                month: copyTargetMonth,
                description: plan.description || '',
                plannedHours: Number(plan.planned_hours) || 0,
                status: 'draft',
                assignees: assigneesForCopy,
                userId: user.user_id,
                action: 'create',
            });

            const newId = typeof result === 'string' ? result : result?.monthly_plan_id;
            if (!newId) {
                throw new Error('Не удалось получить ID нового плана');
            }

            await updateMonthlyPlanCompanies(newId, companiesForCopy);
            setIsCopyModalOpen(false);
            onUpdate?.(newId);
        } catch (e: unknown) {
            setCopyError(getErrorMessage(e));
        } finally {
            setCopying(false);
        }
    }, [
        isNewPlan,
        copyQuarterlyOptions,
        copyQuarterlyId,
        copyTargetMonth,
        plan.year,
        plan.description,
        plan.planned_hours,
        plan.measure_id,
        editMeasureId,
        editAssigneeIds,
        assignees,
        editCompanyIds,
        user.user_id,
        onUpdate,
    ]);

    return (
        <div className="p-4 pb-8">
            <PlanDetailcard colorScheme="indigo">
                <PlanDetailHeader
                    title={isNewPlan ? 'Создание' : isEditing ? 'Редактирование' : 'Просмотр'}
                    status={currentStatus}
                    colorScheme="indigo"
                    onClose={onClose}
                    onStatusChange={isNewPlan ? undefined : onStatusChangeHandler}
                    canEdit={canEdit}
                    icon={<Calendar className="h-5 w-5" />}
                    onEdit={canEdit && !isNewPlan ? () => setIsEditing(true) : undefined}
                    isEditing={isEditing}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    onDelete={isNewPlan ? undefined : handleDelete}
                    onCopy={!isNewPlan ? () => setIsCopyModalOpen(true) : undefined}
                    canDelete={canDelete}
                    deleteReason={deleteReason}
                    availableStatuses={availableStatuses}
                />

                <div className="p-4 space-y-5 overflow-y-auto flex-1">
                    {/* Квартальный план - показываем только если создаем не из плюсика */}
                    {isEditing && !plan.quarterly_id && (
                        <div>
                            <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">Квартальный план</label>
                            <select
                                value={editQuarterlyId}
                                onChange={(e) => {
                                    setEditQuarterlyId(e.target.value);
                                    setEditMeasureId('');
                                    // Reset month to first month of the quarter
                                    const q = quarterlyPlans.find(qp => qp.quarterly_id === e.target.value);
                                    if (q) {
                                        setEditMeasureId('');
                                        setEditMonth((q.quarter - 1) * 3 + 1);
                                    }
                                }}
                                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                            >
                                <option value="">Выберите...</option>
                                {quarterlyPlans
                                    .filter(q => ['approved', 'active'].includes(q.status))
                                    .map(q => (
                                        <option key={q.quarterly_id} value={q.quarterly_id}>
                                            Q{q.quarter} - {q.goal?.slice(0, 50) || 'Без названия'}
                                        </option>
                                    ))
                                }
                            </select>
                        </div>
                    )}

                    {/* Контекст: Квартальный план и Процесс */}
                    {linkedQuarterly && !isNewPlan && !isEditing && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Квартальный план */}
                            <div className="glass-card rounded-2xl p-3 flex items-center gap-3 bg-purple-50/30 border-purple-100/50">
                                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-xs shadow-sm">
                                    Q{linkedQuarterly.quarter}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-3xs font-bold uppercase tracking-wider text-purple-400 mb-0.5">Квартальный план</div>
                                    <div className="text-xs font-medium text-slate-700 leading-tight line-clamp-2">{linkedQuarterly.goal}</div>
                                </div>
                            </div>

                            {/* Процесс */}
                            {(plan.process_name || linkedQuarterly.process_name) && (
                                <div className="glass-card rounded-2xl p-3 flex items-center gap-3 bg-indigo-50/30 border-indigo-100/50">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                                        <Settings className="h-4 w-4" aria-hidden="true" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-3xs font-bold uppercase tracking-wider text-indigo-400 mb-0.5">Процесс</div>
                                        <div className="text-xs font-medium text-slate-700 leading-tight line-clamp-2">{plan.process_name || linkedQuarterly.process_name}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Привязанный квартальный план и процесс (в режиме редактирования) */}
                    {linkedQuarterly && isEditing && plan.quarterly_id && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Квартальный план */}
                            <div className="glass-card rounded-2xl p-3 flex items-center gap-3 bg-purple-50/30 border-purple-100/50">
                                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-xs shadow-sm">
                                    Q{linkedQuarterly.quarter}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-3xs font-bold uppercase tracking-wider text-purple-400 mb-0.5">Квартальный план</div>
                                    <div className="text-xs font-medium text-slate-700 leading-tight line-clamp-2">{linkedQuarterly.goal}</div>
                                </div>
                            </div>

                            {/* Процесс */}
                            {(plan.process_name || linkedQuarterly.process_name) && (
                                <div className="glass-card rounded-2xl p-3 flex items-center gap-3 bg-indigo-50/30 border-indigo-100/50">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
                                        <Settings className="h-4 w-4" aria-hidden="true" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-3xs font-bold uppercase tracking-wider text-indigo-400 mb-0.5">Процесс</div>
                                        <div className="text-xs font-medium text-slate-700 leading-tight line-clamp-2">{plan.process_name || linkedQuarterly.process_name}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Мероприятие */}
                    {(isEditing || !isNewPlan) && (
                        <PlanSection title="Мероприятие" colorScheme="indigo" titleIcon={<FileText />}>
                            {isEditing ? (
                                <select
                                    value={editMeasureId}
                                    onChange={(e) => {
                                        const measureId = e.target.value;
                                        setEditMeasureId(measureId);
                                        // Автозаполнение плановых часов по периоду мероприятия
                                        const selectedMeasure = measures.find(m => m.measure_id === measureId);
                                        if (selectedMeasure) {
                                            setEditPlannedHours(getMonthlyHoursFromMeasure(selectedMeasure));
                                        }
                                    }}
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                    disabled={measures.length === 0}
                                >
                                    <option value="">
                                        {measures.length === 0
                                            ? (linkedQuarterly ? 'Нет мероприятий для этого процесса' : 'Сначала выберите квартальный план')
                                            : 'Выберите мероприятие...'}
                                    </option>
                                    {measures.map(m => (
                                        <option key={m.measure_id} value={m.measure_id}>
                                            {m.name} ({m.target_value} ч. {PERIOD_LABELS[m.target_period]})
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-gray-100 text-sm">
                                    <div className="p-2 bg-indigo-100 rounded-lg flex-shrink-0">
                                        <FileText className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                                    </div>
                                    <span className="font-medium text-slate-700 leading-snug">
                                        {plan.measure_name || measures.find(m => m.measure_id === plan.measure_id)?.name || <span className="text-slate-500 italic">Мероприятие не выбрано</span>}
                                    </span>
                                </div>
                            )}
                        </PlanSection>
                    )}

                    {/* Месяц и часы (компактно, как в мероприятиях) */}
                    <PlanSection title="Часы" colorScheme="indigo" titleIcon={<Clock />}>
                        {isEditing ? (
                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    type="number"
                                    value={editPlannedHours}
                                    onChange={(e) => setEditPlannedHours(Number(e.target.value) || 0)}
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                    min={0}
                                    step={8}
                                    placeholder="План часов"
                                />
                                <select
                                    value={editMonth}
                                    onChange={(e) => setEditMonth(Number(e.target.value))}
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                >
                                    {quarterMonths.map((monthNum) => (
                                        <option key={monthNum} value={monthNum}>
                                            {MONTH_NAMES_RU[monthNum - 1]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-gray-100 text-sm">
                                <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
                                    <Clock className="h-4 w-4 text-amber-600" aria-hidden="true" />
                                </div>
                                <span className="font-medium text-slate-700">
                                    {Number(plan.planned_hours || editPlannedHours || 0).toFixed(0)} ч. на {getMonthName(plan.month || editMonth, 'ru')}
                                </span>
                            </div>
                        )}
                    </PlanSection>

                    {/* Тип распределения и компании */}
                    {isEditing ? (
                        <PlanSection title="Предприятия" colorScheme="indigo" titleIcon={<Building2 />}>
                            {/* Distribution type selector */}
                            <div className="mb-3">
                                <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">Тип распределения</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {WORKLOAD_DISTRIBUTION_TYPES.map(dt => (
                                        <button
                                            key={dt.type}
                                            type="button"
                                            onClick={() => handleDistributionTypeChange(dt.type)}
                                            className={cn(
                                                "px-2.5 py-1.5 rounded-lg text-xs border transition-all",
                                                distributionType === dt.type
                                                    ? "bg-indigo-500 border-indigo-600 text-white shadow-sm"
                                                    : "bg-white border-gray-200 text-gray-700 hover:bg-indigo-50 hover:border-indigo-300"
                                            )}
                                            title={dt.description}
                                        >
                                            {dt.label}
                                        </button>
                                    ))}
                                </div>
                                {distributionType !== 'custom' && (
                                    <p className="text-2xs text-gray-400 mt-1">
                                        {WORKLOAD_DISTRIBUTION_TYPES.find(dt => dt.type === distributionType)?.description}
                                    </p>
                                )}
                            </div>

                            {/* Manual company selection - only for 'custom' type */}
                            {distributionType === 'custom' ? (
                                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                                    {allCompanies.map(c => (
                                        <button
                                            key={c.company_id}
                                            type="button"
                                            onClick={() => toggleCompany(c.company_id)}
                                            className={cn(
                                                "px-2 py-0.5 rounded-full text-2xs border transition-all",
                                                editCompanyIds.includes(c.company_id)
                                                    ? "bg-indigo-100 border-indigo-300 text-indigo-800"
                                                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                                            )}
                                        >
                                            {c.company_name}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                /* Show auto-selected companies as read-only chips */
                                <div className="flex flex-wrap gap-1.5">
                                    {allCompanies
                                        .filter(c => editCompanyIds.includes(c.company_id))
                                        .map(c => (
                                            <span
                                                key={c.company_id}
                                                className="px-2 py-0.5 rounded-full text-2xs bg-indigo-100 border border-indigo-300 text-indigo-800"
                                            >
                                                {c.company_name}
                                            </span>
                                        ))}
                                    <span className="text-2xs text-gray-400 self-center ml-1">
                                        ({editCompanyIds.length} выбрано автоматически)
                                    </span>
                                </div>
                            )}
                        </PlanSection>
                    ) : (
                        <PlanSection title="Предприятия" colorScheme="indigo" titleIcon={<Building2 />}>
                            <div className="glass-card p-3 rounded-2xl bg-white/30">
                                {editCompanyIds.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {allCompanies
                                            .filter(c => editCompanyIds.includes(c.company_id))
                                            .map(c => (
                                                <span
                                                    key={c.company_id}
                                                    className="px-2.5 py-1 rounded-lg text-xs bg-white/50 border border-indigo-100 text-indigo-700 font-medium shadow-sm"
                                                >
                                                    {c.company_name}
                                                </span>
                                            ))}
                                    </div>
                                ) : (
                                    <span className="text-xs text-slate-500 italic px-1">Не выбрано</span>
                                )}
                            </div>
                        </PlanSection>
                    )}

                    {/* Исполнители - только в режиме редактирования */}
                    {isEditing && (
                        <PlanSection title="Исполнители" colorScheme="indigo" titleIcon={<Users />}>
                            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                                {allUsers.map(u => (
                                    <button
                                        key={u.user_id}
                                        type="button"
                                        onClick={() => toggleAssignee(u.user_id)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border transition-all",
                                            editAssigneeIds.includes(u.user_id)
                                                ? "bg-indigo-100 border-indigo-300 text-indigo-800"
                                                : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                                        )}
                                    >
                                        {u.photo_base64 ? (
                                            <img src={u.photo_base64} alt="" className="w-4 h-4 rounded-full" />
                                        ) : (
                                            <Users className="w-3 h-3" />
                                        )}
                                        {u.full_name}
                                    </button>
                                ))}
                            </div>
                        </PlanSection>
                    )}

                    {/* Исполнители - только для существующих планов и не в режиме редактирования */}
                    {!isNewPlan && !isEditing && (
                        <PlanSection
                            title="Исполнители"
                            colorScheme="indigo"
                            titleIcon={<Users />}
                            className="pt-4 border-t border-indigo-100"
                            rightElement={
                                isUserAssigned && (
                                    <button
                                        type="button"
                                        onClick={handleAddTask}
                                        aria-label="Добавить задачу"
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg",
                                            "bg-indigo-500 text-white hover:bg-indigo-600",
                                            "focus:outline-none focus:ring-2 focus:ring-indigo-500",
                                            "active:scale-95 transition-all"
                                        )}
                                    >
                                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                        <span className="hidden xs:inline">Добавить</span>
                                    </button>
                                )
                            }
                        >
                            {tasksLoading ? (
                                <div className="flex justify-center py-6">
                                    <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                                </div>
                            ) : employeeGroups.length > 0 ? (
                                <div className="space-y-1">
                                    {employeeGroups.map((group, idx) => {
                                        const empProgressPercent = plan.planned_hours > 0
                                            ? Math.round((group.totalHours / plan.planned_hours) * 100)
                                            : 0;
                                        const isExpanded = expandedEmployees.includes(group.userId);
                                        const userName = resolveUserName(group);

                                        return (
                                            <div key={group.userId}>
                                                {/* Строка сотрудника */}
                                                <div
                                                    className={cn(
                                                        "flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all border border-transparent shadow-md",
                                                        isExpanded
                                                            ? "bg-gradient-to-r from-indigo-50 to-blue-50 text-slate-900 border-indigo-200 ring-1 ring-indigo-200/50"
                                                            : "glass-card text-slate-800 bg-white/70 hover:bg-white/90 hover:border-indigo-200"
                                                    )}
                                                    onClick={() => setExpandedEmployees(prev =>
                                                        isExpanded
                                                            ? prev.filter(id => id !== group.userId)
                                                            : [...prev, group.userId]
                                                    )}
                                                >
                                                    {/* Стрелка */}
                                                    <div className={cn(
                                                        "flex items-center justify-center w-5 h-5 rounded-full transition-all duration-300",
                                                        isExpanded ? "bg-indigo-200 text-indigo-700 rotate-90" : "bg-indigo-50 text-indigo-400"
                                                    )}>
                                                        <ChevronRight className="w-3 h-3" />
                                                    </div>

                                                    {/* Аватар */}
                                                    {group.user?.photo_base64 ? (
                                                        <img src={group.user.photo_base64} alt="" className="w-8 h-8 rounded-xl object-cover flex-shrink-0 shadow-sm border border-white/20" />
                                                    ) : (
                                                        <div className={cn(
                                                            "w-8 h-8 rounded-xl flex items-center justify-center text-white text-2xs font-black flex-shrink-0 shadow-sm",
                                                            avatarColors[idx % avatarColors.length]
                                                        )}>
                                                            {getInitials(userName)}
                                                        </div>
                                                    )}

                                                    {/* Имя и прогресс */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className={cn("text-xs font-medium tracking-tight truncate", isExpanded ? "text-indigo-900" : "text-slate-900")}>{userName}</span>
                                                            <span className={cn("text-2xs font-medium flex-shrink-0 ml-2", isExpanded ? "text-indigo-600" : "text-indigo-600")}>
                                                                {group.tasks.length} задач
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("flex-1 h-2 rounded-full overflow-hidden shadow-inner", isExpanded ? "bg-indigo-200/50" : "bg-indigo-50")}>
                                                                <div
                                                                    className={cn(
                                                                        "h-full transition-all duration-500",
                                                                        empProgressPercent >= 80 ? "bg-emerald-400" : empProgressPercent >= 50 ? "bg-amber-400" : "bg-blue-400"
                                                                    )}
                                                                    style={{ width: `${Math.min(empProgressPercent, 100)}%` }}
                                                                />
                                                            </div>
                                                            <span className={cn("text-2xs font-bold font-mono w-10 text-right flex-shrink-0", isExpanded ? "text-indigo-700" : "text-indigo-600")}>
                                                                {group.totalHours.toFixed(1)}h
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Список задач */}
                                                {isExpanded && group.tasks.length > 0 && (
                                                    <div className="ml-9 mt-1 mb-2 space-y-1 border-l-2 border-indigo-200 pl-2">
                                                        {group.tasks.map(task => (
                                                            <div
                                                                key={task.daily_task_id}
                                                                className="flex items-start gap-2 text-xs py-1 group/task hover:bg-indigo-50/50 rounded px-1 -mx-1"
                                                            >
                                                                <span className="text-2xs font-bold text-slate-500 flex-shrink-0 mt-0.5">
                                                                    {formatTaskDate(task.task_date)}
                                                                </span>
                                                                <span className="flex-1 break-words text-slate-800 font-medium">
                                                                    {task.description}
                                                                </span>
                                                                {Number(task.spent_hours) > 0 && (
                                                                    <span className="text-2xs font-bold text-indigo-600 flex-shrink-0 bg-indigo-50 px-1.5 py-0.5 rounded shadow-sm">
                                                                        {Number(task.spent_hours).toFixed(1)}ч
                                                                    </span>
                                                                )}
                                                                {/* Кнопка редактирования - только для назначенных и своих задач */}
                                                                {isUserAssigned && task.user_id === user.user_id && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleEditTask(task);
                                                                        }}
                                                                        aria-label="Редактировать задачу"
                                                                        className="p-0.5 hover:bg-indigo-100 rounded transition-all flex-shrink-0 focus:ring-2 focus:ring-indigo-500"
                                                                    >
                                                                        <Pencil className="h-3 w-3 text-indigo-400 hover:text-indigo-600" aria-hidden="true" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-6">
                                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-indigo-50 mb-2">
                                        <Clock className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <p className="text-xs text-slate-600">Записей пока нет</p>
                                </div>
                            )}
                        </PlanSection>
                    )}

                </div>
            </PlanDetailcard>

            {/* Task Modal */}
            {!isNewPlan && (
                <AddTaskModal
                    isOpen={isTaskModalOpen}
                    onClose={() => {
                        setIsTaskModalOpen(false);
                        setTaskToEdit(null);
                    }}
                    onSuccess={handleTaskSuccess}
                    monthlyPlanId={plan.monthly_plan_id}
                    userId={user.user_id}
                    userDepartmentId={user.department_id || undefined}
                    task={taskToEdit ? {
                        daily_task_id: taskToEdit.daily_task_id,
                        description: taskToEdit.description,
                        spent_hours: taskToEdit.spent_hours,
                        task_date: taskToEdit.task_date,
                        attachment_url: taskToEdit.attachment_url,
                        document_number: taskToEdit.document_number,
                        project_id: taskToEdit.project_id
                    } : null}
                    monthlyPlan={plan}
                />
            )}

            {!isNewPlan && (
                <Modal
                    isOpen={isCopyModalOpen}
                    onClose={() => {
                        if (copying) return;
                        setIsCopyModalOpen(false);
                        setCopyError(null);
                    }}
                    title="Копировать месячный план"
                    headerVariant="gradient-indigo"
                >
                    <div className="space-y-4">
                        <div>
                            <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">
                                Квартальный план (в работе)
                            </label>
                            <select
                                value={copyQuarterlyId}
                                onChange={(e) => setCopyQuarterlyId(e.target.value)}
                                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                disabled={copying || copyQuarterlyOptions.length === 0}
                            >
                                {copyQuarterlyOptions.length === 0 ? (
                                    <option value="">Нет доступных квартальных планов</option>
                                ) : (
                                    copyQuarterlyOptions.map((q) => (
                                        <option key={q.quarterly_id} value={q.quarterly_id}>
                                            Q{q.quarter} - {(q.process_name || 'Без процесса')} - {(q.goal || 'Без названия').slice(0, 60)}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>

                        <div>
                            <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">
                                Месяц для копии
                            </label>
                            <select
                                value={copyTargetMonth}
                                onChange={(e) => setCopyTargetMonth(Number(e.target.value))}
                                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                disabled={copying || copyQuarterMonths.length === 0}
                            >
                                {copyQuarterMonths.map((monthNum) => (
                                    <option key={monthNum} value={monthNum}>
                                        {MONTH_NAMES_RU[monthNum - 1]}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <p className="text-xs text-slate-500 px-1">
                            Будет создан новый план со статусом «Черновик» с копированием мероприятия, часов, описания, исполнителей и предприятий.
                        </p>

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
                                onClick={handleCopyPlan}
                                className="px-3 py-2 text-sm rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-all disabled:opacity-50"
                                disabled={copying}
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

// Helper function to update monthly plan companies
async function updateMonthlyPlanCompanies(monthlyPlanId: string, companyIds: string[]) {
    // Delete existing
    await supabase
        .from('monthly_plan_companies')
        .delete()
        .eq('monthly_plan_id', monthlyPlanId);

    // Insert new
    if (companyIds.length > 0) {
        await supabase
            .from('monthly_plan_companies')
            .insert(companyIds.map(id => ({ monthly_plan_id: monthlyPlanId, company_id: id })));
    }
}




