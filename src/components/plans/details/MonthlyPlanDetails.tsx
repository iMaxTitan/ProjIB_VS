import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { Calendar, Users, Clock, Pencil, Trash2, Loader2, Plus, Check, X, Info } from 'lucide-react';
import AddTaskModal from '@/components/dashboard/Tasks/AddTaskModal';
import { cn } from '@/lib/utils';
import { MonthlyPlan, QuarterlyPlan, Measure, PlanStatus, getMonthName, MONTH_NAMES_RU } from '@/types/planning';
import { UserInfo } from '@/types/azure';
import { UserRole } from '@/types/supabase';
import { supabase } from '@/lib/supabase';
import { DetailSection, GradientDetailCard, ExpandableListItem } from '@/components/dashboard/content/shared';
import PlanStatusDropdown from './components/PlanStatusDropdown';
import { manageMonthlyPlan, getMeasures, canDeleteMonthlyPlan, deleteMonthlyPlan, changeMonthlyPlanStatus } from '@/lib/plans/plan-service';
import { useAvailableStatuses } from '@/hooks/useAvailableStatuses';
import { getTasksByMonthlyPlanId, DailyTaskRow } from '@/lib/tasks/task-service';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage } from '@/lib/utils/error-message';
import logger from '@/lib/logger';
import {
    HourDistributionType,
    HOUR_DISTRIBUTION_TYPES,
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
    servers_count?: number;
    workstations_count?: number;
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
    const [distributionType, setDistributionType] = useState<HourDistributionType>(
        (plan.distribution_type as HourDistributionType) || 'even'
    );
    // Инфраструктура за конкретный период (year + month) для фильтрации компаний
    const [periodInfra, setPeriodInfra] = useState<Map<string, { servers_count: number; workstations_count: number }>>(new Map());

    // Data state
    const [assignees, setAssignees] = useState<AssigneeWithDetails[]>([]);
    const [measures, setMeasures] = useState<Measure[]>([]);
    const [usedMeasureIds, setUsedMeasureIds] = useState<Set<string>>(new Set());
    const [allUsers, setAllUsers] = useState<AssigneeWithDetails[]>([]);
    const [allCompanies, setAllCompanies] = useState<Company[]>([]);
    const [saving, setSaving] = useState(false);

    // Tasks state for work log
    const [tasks, setTasks] = useState<Task[]>([]);
    const [tasksLoading, setTasksLoading] = useState(false);
    const [expandedEmployees, setExpandedEmployees] = useState<string[]>([]);

    // Task editing state
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
    const [taskToDeleteId, setTaskToDeleteId] = useState<string | null>(null);
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
            // Companies with infrastructure info
            const { data: companies } = await supabase
                .from('v_companies_with_infrastructure')
                .select('company_id, company_name, has_servers, servers_count, workstations_count')
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

    // Загрузка инфраструктуры за конкретный период (для фильтрации компаний по серверам/станциям)
    useEffect(() => {
        const targetMonth = isEditing ? editMonth : plan.month;
        const targetYear = plan.year;
        if (!targetYear || !targetMonth) return;

        const fetchPeriodInfra = async () => {
            const { data } = await supabase
                .from('company_infrastructure')
                .select('company_id, servers_count, workstations_count')
                .eq('period_year', targetYear)
                .eq('period_month', targetMonth);

            const map = new Map<string, { servers_count: number; workstations_count: number }>();
            if (data && data.length > 0) {
                for (const row of data) {
                    map.set(row.company_id, {
                        servers_count: row.servers_count || 0,
                        workstations_count: row.workstations_count || 0,
                    });
                }
            } else {
                // Fallback: использовать данные из v_companies_with_infrastructure (последние известные)
                for (const c of allCompanies) {
                    if (c.servers_count || c.workstations_count) {
                        map.set(c.company_id, {
                            servers_count: c.servers_count || 0,
                            workstations_count: c.workstations_count || 0,
                        });
                    }
                }
            }
            setPeriodInfra(map);
        };
        fetchPeriodInfra();
    }, [plan.year, editMonth, isEditing, plan.month, allCompanies]);

    const effectiveProcessId = linkedQuarterly?.process_id || plan.process_id;
    const effectiveProcessName = (linkedQuarterly?.process_name || plan.process_name || '').trim();

    // Описание текущего мероприятия (read-only)
    const currentMeasureDescription = useMemo(() => {
        const mid = isEditing ? editMeasureId : plan.measure_id;
        if (!mid) return null;
        const found = measures.find(m => m.measure_id === mid);
        return found?.description || null;
    }, [measures, editMeasureId, plan.measure_id, isEditing]);

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

    // Load already-used measure IDs for this quarterly + month (to hide from dropdown)
    useEffect(() => {
        if (!isEditing) { setUsedMeasureIds(new Set()); return; }
        const qId = editQuarterlyId;
        const m = editMonth;
        const y = plan.year;
        if (!qId || !m || !y) { setUsedMeasureIds(new Set()); return; }

        const fetchUsed = async () => {
            const { data } = await supabase
                .from('monthly_plans')
                .select('measure_id')
                .eq('quarterly_id', qId)
                .eq('year', y)
                .eq('month', m)
                .neq('monthly_plan_id', plan.monthly_plan_id);
            setUsedMeasureIds(new Set((data || []).map(r => r.measure_id).filter(Boolean)));
        };
        fetchUsed();
    }, [isEditing, editQuarterlyId, editMonth, plan.year, plan.monthly_plan_id]);

    // Available measures: exclude already-used in this quarterly+month
    // Always keep the currently selected measure visible (for editing)
    const availableMeasures = useMemo(() =>
        measures.filter(m => m.measure_id === editMeasureId || !usedMeasureIds.has(m.measure_id)),
        [measures, usedMeasureIds, editMeasureId]
    );

    // Load plan data (assignees, companies)
    useEffect(() => {
        if (isNewPlan) {
            return;
        }

        const fetchData = async () => {
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
                    setDistributionType((plan.distribution_type as HourDistributionType) || 'even');
                }
            } catch (err: unknown) {
                logger.error('Error loading monthly plan data:', err);
            }
        };
        fetchData();
    }, [plan.monthly_plan_id, plan.distribution_type, isNewPlan]);

    // Check delete permissions
    useEffect(() => {
        if (isNewPlan) {
            setCanDelete(false);
            return;
        }

        const checkDelete = async () => {
            const result = await canDeleteMonthlyPlan(plan.monthly_plan_id, user.user_id, user.role);
            setCanDelete(result.canDelete);
            setDeleteReason(result.reason || '');
        };
        checkDelete();
    }, [plan.monthly_plan_id, user.user_id, user.role, isNewPlan]);

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
    }, [plan.monthly_plan_id, isNewPlan, tasksRefreshTrigger, plan.tasks_count]);

    const handleDelete = async () => {
        const result = await deleteMonthlyPlan(plan.monthly_plan_id, user.user_id, user.role);
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
        if (editCompanyIds.length === 0) {
            alert('Виберіть хоча б одне підприємство');
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
                userId: user.user_id,
                distributionType,
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

    const handleDeleteTask = useCallback(async (taskId: string) => {
        try {
            const { error } = await supabase
                .from('daily_tasks')
                .delete()
                .eq('daily_task_id', taskId);
            if (error) throw error;
            setTaskToDeleteId(null);
            setTasksRefreshTrigger(prev => prev + 1);
            onUpdate?.();
        } catch (err: unknown) {
            logger.error('Error deleting task:', err);
            setTaskToDeleteId(null);
        }
    }, [onUpdate]);

    const handleTaskSuccess = useCallback(() => {
        setIsTaskModalOpen(false);
        setTaskToEdit(null);
        setTasksRefreshTrigger(prev => prev + 1);
        onUpdate?.();
    }, [onUpdate]);

    // Компании, доступные для текущего типа распределения
    const availableCompanies = useMemo(() => {
        if (distributionType === 'even') return allCompanies;

        return allCompanies.filter(c => {
            const infra = periodInfra.get(c.company_id);
            if (distributionType === 'by_servers') {
                return infra ? infra.servers_count > 0 : (c.servers_count || 0) > 0;
            }
            // by_workstations
            return infra ? infra.workstations_count > 0 : (c.workstations_count || 0) > 0;
        });
    }, [allCompanies, distributionType, periodInfra]);

    // Доли распределения для отображения процентов
    const companyShares = useMemo(() => {
        if (distributionType === 'even' || editCompanyIds.length === 0) return new Map<string, number>();

        const field = distributionType === 'by_servers' ? 'servers_count' : 'workstations_count';
        const values = editCompanyIds.map(id => {
            const infra = periodInfra.get(id);
            const c = allCompanies.find(c => c.company_id === id);
            const val = infra ? infra[field] : (c?.[field] || 0);
            return { id, val: val || 0 };
        });
        const total = values.reduce((s, v) => s + v.val, 0);
        if (total === 0) return new Map<string, number>();

        const shares = new Map<string, number>();
        for (const v of values) {
            shares.set(v.id, Math.round((v.val / total) * 100));
        }
        return shares;
    }, [distributionType, editCompanyIds, periodInfra, allCompanies]);

    // Получить кол-во инфраструктуры для отображения
    const getInfraCount = useCallback((companyId: string): number => {
        const infra = periodInfra.get(companyId);
        const c = allCompanies.find(c => c.company_id === companyId);
        if (distributionType === 'by_servers') {
            return infra ? infra.servers_count : (c?.servers_count || 0);
        }
        return infra ? infra.workstations_count : (c?.workstations_count || 0);
    }, [periodInfra, allCompanies, distributionType]);

    // Handle distribution type change
    const handleDistributionTypeChange = useCallback((type: HourDistributionType) => {
        setDistributionType(type);
        if (type === 'by_servers') {
            const ids = allCompanies
                .filter(c => {
                    const infra = periodInfra.get(c.company_id);
                    return infra ? infra.servers_count > 0 : (c.servers_count || 0) > 0;
                })
                .map(c => c.company_id);
            setEditCompanyIds(ids);
        } else if (type === 'by_workstations') {
            const ids = allCompanies
                .filter(c => {
                    const infra = periodInfra.get(c.company_id);
                    return infra ? infra.workstations_count > 0 : (c.workstations_count || 0) > 0;
                })
                .map(c => c.company_id);
            setEditCompanyIds(ids);
        }
        // 'even' — не трогаем текущий набор, пользователь выбирает вручную
    }, [allCompanies, periodInfra]);

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
                distributionType,
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
        distributionType,
    ]);

    const modeLabel = isNewPlan ? 'Создание' : isEditing ? 'Редактирование' : 'Просмотр';

    return (
        <>
        <GradientDetailCard
            gradientClassName="from-indigo-400/80 to-blue-400/80"
            modeLabel={modeLabel}
            isEditing={isEditing}
            canEdit={canEdit}
            onEdit={canEdit && !isNewPlan ? () => setIsEditing(true) : undefined}
            onSave={handleSave}
            onCancel={handleCancel}
            onClose={onClose}
            onDelete={isNewPlan ? undefined : handleDelete}
            onCopy={!isNewPlan ? () => setIsCopyModalOpen(true) : undefined}
            canDelete={canDelete}
            deleteReason={deleteReason}
            deleteConfirm
            saving={saving}
            headerActions={!isNewPlan && !isEditing && (
                <button
                    type="button"
                    onClick={handleAddTask}
                    aria-label="Добавить задачу"
                    title="Добавить задачу"
                    className="p-2 hover:bg-white/20 rounded-xl transition-colors text-white/80 hover:text-white"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
            )}
            headerContent={
                <>
                    <Calendar className="h-5 w-5 opacity-80" aria-hidden="true" />
                    <PlanStatusDropdown
                        status={currentStatus}
                        onStatusChange={isNewPlan ? undefined : onStatusChangeHandler}
                        canChange={canEdit && !isEditing}
                        availableStatuses={availableStatuses}
                    />
                    <span className="font-bold text-lg leading-tight tracking-tight drop-shadow-sm font-heading">
                        {modeLabel}
                    </span>
                </>
            }
        >
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

                    {/* Квартальный план — на всю ширину */}
                    {linkedQuarterly && !isNewPlan && !isEditing && (
                        <DetailSection title="Квартальный план" colorScheme="purple">
                            <div className="glass-card p-3 rounded-2xl text-xs font-medium text-slate-700 bg-white/40 leading-snug line-clamp-2">
                                Q{linkedQuarterly.quarter} — {linkedQuarterly.goal}
                            </div>
                        </DetailSection>
                    )}
                    {linkedQuarterly && isEditing && plan.quarterly_id && (
                        <DetailSection title="Квартальный план" colorScheme="purple">
                            <div className="glass-card p-3 rounded-2xl text-xs font-medium text-slate-700 bg-white/40 leading-snug line-clamp-2">
                                Q{linkedQuarterly.quarter} — {linkedQuarterly.goal}
                            </div>
                        </DetailSection>
                    )}

                    {/* Мероприятие */}
                    {(isEditing || !isNewPlan) && (
                        <DetailSection title="Мероприятие" colorScheme="indigo">
                            {isEditing ? (
                                <select
                                    value={editMeasureId}
                                    onChange={(e) => {
                                        const measureId = e.target.value;
                                        setEditMeasureId(measureId);
                                        const selectedMeasure = measures.find(m => m.measure_id === measureId);
                                        if (selectedMeasure) {
                                            setEditPlannedHours(getMonthlyHoursFromMeasure(selectedMeasure));
                                        }
                                    }}
                                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                                    disabled={availableMeasures.length === 0 && !editMeasureId}
                                >
                                    <option value="">
                                        {availableMeasures.length === 0
                                            ? (linkedQuarterly ? 'Нет доступных мероприятий' : 'Сначала выберите квартальный план')
                                            : 'Выберите мероприятие...'}
                                    </option>
                                    {availableMeasures.map(m => (
                                        <option key={m.measure_id} value={m.measure_id}>
                                            {m.name} ({m.target_value} ч. {PERIOD_LABELS[m.target_period]})
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <div className="glass-card p-3 rounded-2xl text-xs font-medium text-slate-700 bg-white/40 leading-snug">
                                    {plan.measure_name || measures.find(m => m.measure_id === plan.measure_id)?.name || <span className="text-slate-500 italic">Мероприятие не выбрано</span>}
                                </div>
                            )}
                        </DetailSection>
                    )}

                    {/* Описание мероприятия — акцентный блок */}
                    {currentMeasureDescription && (
                        <div className="relative rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-yellow-50/70 p-3 sm:p-4 shadow-sm">
                            <div className="flex items-start gap-2.5">
                                <div className="flex-shrink-0 mt-0.5">
                                    <div className="w-6 h-6 rounded-lg bg-amber-400/20 flex items-center justify-center">
                                        <Info className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-3xs font-bold text-amber-600/80 uppercase tracking-wider mb-1">Описание мероприятия</div>
                                    <div className="text-xs sm:text-sm text-amber-900/80 leading-relaxed whitespace-pre-line">
                                        {currentMeasureDescription}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Месяц и часы (компактно, как в мероприятиях) */}
                    <DetailSection title="Часы" colorScheme="indigo">
                        {isEditing ? (
                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    type="number"
                                    value={editPlannedHours}
                                    onChange={(e) => setEditPlannedHours(Number(e.target.value) || 0)}
                                    onFocus={(e) => e.target.select()}
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
                            <div className="glass-card p-3 rounded-2xl text-xs font-medium text-slate-700 bg-white/40 leading-snug">
                                {Number(plan.planned_hours || editPlannedHours || 0).toFixed(0)} ч. на {getMonthName(plan.month || editMonth, 'ru')}
                            </div>
                        )}
                    </DetailSection>

                    {/* Тип распределения и компании */}
                    {isEditing ? (
                        <DetailSection title="Предприятия" colorScheme="indigo">
                            {/* Селектор типа распределения */}
                            <div className="mb-3">
                                <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">
                                    Тип распределения
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {HOUR_DISTRIBUTION_TYPES.map(dt => (
                                        <button
                                            key={dt.type}
                                            type="button"
                                            onClick={() => handleDistributionTypeChange(dt.type)}
                                            aria-label={dt.description}
                                            className={cn(
                                                "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs border transition-colors",
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
                                <p className="text-xs text-gray-400 mt-1">
                                    {HOUR_DISTRIBUTION_TYPES.find(dt => dt.type === distributionType)?.description}
                                </p>
                            </div>

                            {/* Компании — ручной выбор для 'even', автовыбор для by_servers/by_workstations */}
                            {distributionType === 'even' ? (
                                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                                    {allCompanies.map(c => (
                                        <button
                                            key={c.company_id}
                                            type="button"
                                            onClick={() => toggleCompany(c.company_id)}
                                            aria-label={`Выбрать ${c.company_name}`}
                                            className={cn(
                                                "px-2 py-0.5 rounded-full text-xs border transition-colors",
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
                                /* Автоматически выбранные компании — read-only, с инфраструктурой и процентами */
                                <div className="flex flex-wrap gap-1.5">
                                    {availableCompanies.map(c => {
                                        const count = getInfraCount(c.company_id);
                                        const share = companyShares.get(c.company_id);
                                        return (
                                            <span
                                                key={c.company_id}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-100 border border-indigo-300 text-indigo-800"
                                            >
                                                {c.company_name}
                                                <span className="text-indigo-500 font-medium">
                                                    {count}
                                                </span>
                                                {share !== undefined && (
                                                    <span className="text-indigo-400">
                                                        ({share}%)
                                                    </span>
                                                )}
                                            </span>
                                        );
                                    })}
                                    <span className="text-xs text-gray-400 self-center ml-1">
                                        ({editCompanyIds.length} авто)
                                    </span>
                                </div>
                            )}
                        </DetailSection>
                    ) : (
                        <DetailSection title="Предприятия" colorScheme="indigo">
                            <div className="glass-card p-3 rounded-2xl bg-white/30">
                                {editCompanyIds.length > 0 ? (
                                    <>
                                        {/* Бейдж типа распределения */}
                                        <div className="mb-2">
                                            <span className="text-2xs font-medium text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                                                {HOUR_DISTRIBUTION_TYPES.find(d => d.type === distributionType)?.label || 'Поровну'}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {allCompanies
                                                .filter(c => editCompanyIds.includes(c.company_id))
                                                .map(c => {
                                                    const share = companyShares.get(c.company_id);
                                                    return (
                                                        <span
                                                            key={c.company_id}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-white/50 border border-indigo-100 text-indigo-700 font-medium shadow-sm"
                                                        >
                                                            {c.company_name}
                                                            {share !== undefined && (
                                                                <span className="text-indigo-400 font-normal">({share}%)</span>
                                                            )}
                                                        </span>
                                                    );
                                                })}
                                        </div>
                                    </>
                                ) : (
                                    <span className="text-xs text-slate-500 italic px-1">Не выбрано</span>
                                )}
                            </div>
                        </DetailSection>
                    )}

                    {/* Исполнители - только в режиме редактирования */}
                    {isEditing && (
                        <DetailSection title="Исполнители" colorScheme="indigo">
                            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                                {allUsers.map(u => (
                                    <button
                                        key={u.user_id}
                                        type="button"
                                        onClick={() => toggleAssignee(u.user_id)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border transition-colors",
                                            editAssigneeIds.includes(u.user_id)
                                                ? "bg-indigo-100 border-indigo-300 text-indigo-800"
                                                : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                                        )}
                                    >
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

                    {/* Исполнители - только для существующих планов и не в режиме редактирования */}
                    {!isNewPlan && !isEditing && (
                        <DetailSection
                            title="Исполнители"
                            colorScheme="indigo"
                            className="pt-4 border-t border-indigo-100"
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
                                            <ExpandableListItem
                                                key={group.userId}
                                                tone="indigo"
                                                chevronSize="sm"
                                                expanded={isExpanded}
                                                onToggle={() => setExpandedEmployees(prev =>
                                                    isExpanded
                                                        ? prev.filter(id => id !== group.userId)
                                                        : [...prev, group.userId]
                                                )}
                                                expandedContent={group.tasks.length > 0 ? (
                                                    <>
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
                                                                {isUserAssigned && task.user_id === user.user_id && (
                                                                    <div className="flex items-center gap-0.5 flex-shrink-0">
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleEditTask(task);
                                                                            }}
                                                                            aria-label="Редактировать задачу"
                                                                            className="p-0.5 hover:bg-indigo-100 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                        >
                                                                            <Pencil className="h-3 w-3 text-indigo-400 hover:text-indigo-600" aria-hidden="true" />
                                                                        </button>
                                                                        {taskToDeleteId === task.daily_task_id ? (
                                                                            <div className="flex items-center gap-0.5 bg-red-50 rounded px-1 animate-fade-in">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setTaskToDeleteId(null);
                                                                                    }}
                                                                                    aria-label="Отмена удаления"
                                                                                    className="p-0.5 hover:bg-white rounded transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                                >
                                                                                    <X className="h-3 w-3 text-gray-500" aria-hidden="true" />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleDeleteTask(task.daily_task_id);
                                                                                    }}
                                                                                    aria-label="Подтвердить удаление"
                                                                                    className="p-0.5 hover:bg-red-100 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                                                                                >
                                                                                    <Check className="h-3 w-3 text-red-500" aria-hidden="true" />
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setTaskToDeleteId(task.daily_task_id);
                                                                                }}
                                                                                aria-label="Удалить задачу"
                                                                                className="p-0.5 hover:bg-red-100 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                                                                            >
                                                                                <Trash2 className="h-3 w-3 text-red-400 hover:text-red-600" aria-hidden="true" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </>
                                                ) : undefined}
                                            >
                                                {/* Аватар */}
                                                {group.user?.photo_base64 ? (
                                                    <Image src={group.user.photo_base64} alt="" width={32} height={32} unoptimized className="w-8 h-8 rounded-xl object-cover flex-shrink-0 shadow-sm border border-white/20" />
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
                                                        <span className="text-2xs font-medium flex-shrink-0 ml-2 text-indigo-600">
                                                            {group.tasks.length} задач
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className={cn("flex-1 h-2 rounded-full overflow-hidden shadow-inner", isExpanded ? "bg-indigo-200/50" : "bg-indigo-50")}>
                                                            <div
                                                                className={cn(
                                                                    "h-full transition-colors duration-500",
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
                                            </ExpandableListItem>
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
                        </DetailSection>
                    )}

        </GradientDetailCard>

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
                                className="px-3 py-2 text-sm rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                                disabled={copying}
                            >
                                Отмена
                            </button>
                            <button
                                type="button"
                                onClick={handleCopyPlan}
                                className="px-3 py-2 text-sm rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors disabled:opacity-50"
                                disabled={copying}
                            >
                                {copying ? 'Копирование...' : 'Копировать'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
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




