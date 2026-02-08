import React, { useEffect, useState, useRef } from 'react';
import { MonthlyPlan, PlanStatus, getPlanStatusColor, MONTH_NAMES_RU } from '@/types/planning';
import { getTasksByMonthlyPlanId, DailyTaskRow } from '@/lib/tasks/task-service';
import { Loader2, Plus, Calendar, Clock, Pencil, ChevronDown, Check, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { getPlanStatusText } from '@/types/planning';
import { supabase } from '@/lib/supabase';
import { useAvailableStatuses, getStatusActionLabel, canUserChangeStatus } from '@/hooks/useAvailableStatuses';
import logger from '@/lib/logger';

interface WorkLogViewerProps {
    selectedPlan: MonthlyPlan | null;
    refreshTrigger?: number;
    onAddTask?: () => void;
    onEditTask?: (task: Task) => void;
    onStatusChange?: (planId: string, newStatus: PlanStatus) => void;
    onClose?: () => void;
    userId: string;
}

// Export Task type for parent component
export type { Task };

interface Task {
    daily_task_id: string;
    description: string;
    spent_hours: number;
    created_at: string;
    task_date: string;
    attachment_url?: string | null;
    document_number?: string | null;
    user_id?: string;
    user_profiles?: {
        full_name: string | null;
        photo_base64?: string | null;
        role?: string | null;
    };
}

const mapTaskRow = (row: DailyTaskRow): Task => ({
    ...row,
    user_profiles: Array.isArray(row.user_profiles)
        ? row.user_profiles[0] ?? undefined
        : row.user_profiles ?? undefined,
});

interface EmployeeGroup {
    user: Task['user_profiles'];
    userId: string;
    tasks: Task[];
    totalHours: number;
    completedCount: number;
}

interface CompanyInfo {
    company_id: string;
    company_name: string;
}

interface QuarterlyInfo {
    quarterly_id: string;
    quarter: number;
    goal: string;
}

export default function WorkLogViewer({ selectedPlan, refreshTrigger, onAddTask, onEditTask, onStatusChange, onClose, userId }: WorkLogViewerProps) {
    const { user } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedEmployees, setExpandedEmployees] = useState<string[]>([]);
    const [isUserAssigned, setIsUserAssigned] = useState(false);
    const [isStatusOpen, setIsStatusOpen] = useState(false);
    const statusDropdownRef = useRef<HTMLDivElement>(null);

    // Квартальный план и предприятия
    const [quarterlyPlan, setQuarterlyPlan] = useState<QuarterlyInfo | null>(null);
    const [companies, setCompanies] = useState<CompanyInfo[]>([]);
    // Актуальные часы из БД (для синхронизации со страницей планов)
    const [freshPlannedHours, setFreshPlannedHours] = useState<number | null>(null);

    // Получаем доступные статусы для текущей роли пользователя
    const availableStatuses = useAvailableStatuses({
        user,
        currentStatus: selectedPlan?.status || 'draft',
        planType: 'monthly'
    });

    // Проверяем, может ли пользователь менять статус (monthly plan - упрощенный workflow)
    const canChangeStatusFlag = canUserChangeStatus(user, selectedPlan?.status || 'draft', 'monthly');

    // Close status dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
                setIsStatusOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Check if current user is assigned to this plan
    useEffect(() => {
        if (!selectedPlan?.monthly_plan_id || !user?.user_id) {
            setIsUserAssigned(false);
            return;
        }

        const checkAssignment = async () => {
            const { data } = await supabase
                .from('monthly_plan_assignees')
                .select('user_id')
                .eq('monthly_plan_id', selectedPlan.monthly_plan_id)
                .eq('user_id', user.user_id)
                .maybeSingle();

            setIsUserAssigned(!!data);
        };

        checkAssignment();
    }, [selectedPlan?.monthly_plan_id, user?.user_id]);

    useEffect(() => {
        if (!selectedPlan?.monthly_plan_id) {
            setTasks([]);
            return;
        }

        setLoading(true);
        getTasksByMonthlyPlanId(selectedPlan.monthly_plan_id)
            .then((data: DailyTaskRow[]) => setTasks(data.map(mapTaskRow)))
            .catch(err => logger.error(err))
            .finally(() => setLoading(false));
    }, [selectedPlan?.monthly_plan_id, refreshTrigger]);

    // Загрузка квартального плана, предприятий и актуальных часов
    useEffect(() => {
        if (!selectedPlan?.monthly_plan_id) {
            setQuarterlyPlan(null);
            setCompanies([]);
            setFreshPlannedHours(null);
            return;
        }

        const fetchPlanDetails = async () => {
            // Загрузка актуальных planned_hours из БД (для синхронизации)
            const { data: freshPlan } = await supabase
                .from('monthly_plans')
                .select('planned_hours')
                .eq('monthly_plan_id', selectedPlan.monthly_plan_id)
                .maybeSingle();
            if (freshPlan) {
                setFreshPlannedHours(freshPlan.planned_hours);
            }

            // Загрузка квартального плана
            if (selectedPlan.quarterly_id) {
                const { data: qPlan } = await supabase
                    .from('quarterly_plans')
                    .select('quarterly_id, quarter, goal')
                    .eq('quarterly_id', selectedPlan.quarterly_id)
                    .maybeSingle();
                setQuarterlyPlan(qPlan);
            } else {
                setQuarterlyPlan(null);
            }

            // Загрузка предприятий
            const { data: companiesData } = await supabase
                .from('monthly_plan_companies')
                .select('company_id')
                .eq('monthly_plan_id', selectedPlan.monthly_plan_id);

            if (companiesData && companiesData.length > 0) {
                const companyIds = companiesData.map(c => c.company_id);
                const { data: companyDetails } = await supabase
                    .from('companies')
                    .select('company_id, company_name')
                    .in('company_id', companyIds);
                if (companyDetails) setCompanies(companyDetails);
            } else {
                setCompanies([]);
            }
        };

        fetchPlanDetails();
    }, [selectedPlan?.monthly_plan_id, selectedPlan?.quarterly_id]);

    if (!selectedPlan) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <div className="text-center">
                    <p className="text-lg mb-2">Выберите план</p>
                    <p className="text-sm">Кликните на план в списке слева для просмотра журнала работ</p>
                </div>
            </div>
        );
    }

    // Calculate Stats
    // Используем актуальные часы из БД, если они загружены, иначе из props
    const plannedHours = freshPlannedHours !== null ? freshPlannedHours : (Number(selectedPlan.planned_hours) || 0);
    const totalTasks = tasks.length;

    // Get month from plan
    const monthDisplay = `${MONTH_NAMES_RU[selectedPlan.month - 1]} ${selectedPlan.year}`;

    // Group tasks by employee
    const employeeGroups: EmployeeGroup[] = Object.values(
        tasks.reduce((acc, task) => {
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
        }, {} as Record<string, EmployeeGroup>)
    ).sort((a, b) => b.totalHours - a.totalHours);

    const avatarColors = ['bg-indigo-500', 'bg-blue-500', 'bg-emerald-500', 'bg-pink-500', 'bg-purple-500', 'bg-teal-500'];

    const getInitials = (name: string) => {
        return name.split(' ').map(w => w[0]?.toUpperCase() || '').join('').slice(0, 2);
    };

    const resolveUserName = (group: EmployeeGroup): string => {
        return (
            group.user?.full_name ||
            group.tasks[0]?.user_profiles?.full_name ||
            (group.userId !== 'unknown' ? `ID: ${group.userId.slice(0, 8)}` : 'Исполнитель')
        );
    };

    // Format task date
    const formatTaskDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    };

    return (
        <div className="p-4 w-full">
            {/* Компактная карточка в стиле планов, но на всю ширину */}
            <div className="glass-card rounded-3xl border border-white/30 shadow-glass overflow-hidden w-full flex flex-col">
                {/* Заголовок */}
                <div className="relative z-30 bg-gradient-to-r from-indigo-400/80 to-blue-400/80 px-4 py-4 text-white backdrop-blur-md border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 p-2 rounded-xl shadow-inner-light">
                                <Calendar className="h-5 w-5" />
                            </div>
                            {/* Status Badge with Dropdown */}
                            <div className="relative" ref={statusDropdownRef}>
                                <div
                                    className={cn(
                                        "flex items-center",
                                        canChangeStatusFlag && onStatusChange ? "cursor-pointer group" : "opacity-90"
                                    )}
                                    onClick={() => canChangeStatusFlag && onStatusChange && setIsStatusOpen(!isStatusOpen)}
                                >
                                    <Badge className={cn(
                                        "bg-white text-slate-900 border-white font-semibold text-xs px-2.5 py-1 rounded-full shadow-md whitespace-nowrap transition-all flex items-center gap-1.5",
                                        canChangeStatusFlag && onStatusChange && "group-hover:bg-slate-50 pr-2 translate-y-0 active:translate-y-0.5"
                                    )}>
                                        <div className={cn("w-1.5 h-1.5 rounded-full", `bg-${getPlanStatusColor(selectedPlan.status) === 'violet' ? 'purple' : getPlanStatusColor(selectedPlan.status)}-500`)} />
                                        {getPlanStatusText(selectedPlan.status)}
                                        {canChangeStatusFlag && onStatusChange && <ChevronDown className="ml-1 h-3 w-3 text-slate-500" />}
                                    </Badge>
                                </div>

                                {isStatusOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-slate-200 py-2 z-[100] animate-in fade-in zoom-in-95 duration-100">
                                        <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-2">
                                            Выберите статус
                                        </div>
                                        {availableStatuses.map((s) => (
                                            <button
                                                key={s.value}
                                                onClick={() => {
                                                    if (onStatusChange && s.value !== selectedPlan.status) {
                                                        onStatusChange(selectedPlan.monthly_plan_id, s.value);
                                                    }
                                                    setIsStatusOpen(false);
                                                }}
                                                className={cn(
                                                    "w-full text-left px-4 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors",
                                                    selectedPlan.status === s.value ? "text-indigo-600 bg-indigo-50/50 font-semibold" : "text-slate-600"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={cn("w-2.5 h-2.5 rounded-full shadow-sm", `bg-${getPlanStatusColor(s.value) === 'violet' ? 'purple' : getPlanStatusColor(s.value)}-500`)} />
                                                    {s.value !== selectedPlan.status
                                                        ? getStatusActionLabel(selectedPlan.status, s.value)
                                                        : s.label
                                                    }
                                                </div>
                                                {selectedPlan.status === s.value && <Check className="h-3 w-3 text-indigo-600" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <span className="font-heading font-bold text-lg tracking-tight">{monthDisplay}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {onAddTask && isUserAssigned && (
                                <button
                                    type="button"
                                    onClick={onAddTask}
                                    className="p-1.5 hover:bg-white/20 rounded-xl transition-colors"
                                    title="Добавить задачу"
                                    aria-label="Добавить задачу"
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                            {/* Close button - only on desktop (mobile uses swipe) */}
                            {onClose && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="hidden md:flex p-2 hover:bg-white/20 rounded-xl transition-all text-white/80 hover:text-white"
                                    aria-label="Закрыть"
                                    title="Закрыть"
                                >
                                    <X className="h-5 w-5" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Контент */}
                {/* Контент */}
                <div className="p-4 space-y-5">
                    {/* Контекст: Квартал и Процесс */}
                    {(quarterlyPlan || selectedPlan.process_name) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {quarterlyPlan && (
                                <div className="glass-card rounded-2xl p-3 flex items-center gap-3 bg-purple-50/30 border-purple-100/50">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-xs shadow-sm">
                                        Q{quarterlyPlan.quarter}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-3xs font-bold uppercase tracking-wider text-purple-400 mb-0.5">Квартальный план</div>
                                        <div className="text-xs font-medium text-slate-700 leading-tight line-clamp-2">{quarterlyPlan.goal}</div>
                                    </div>
                                </div>
                            )}

                            {selectedPlan.process_name && (
                                <div className="glass-card rounded-2xl p-3 flex items-center gap-3 bg-indigo-50/30 border-indigo-100/50">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs shadow-sm">
                                        <Loader2 className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-3xs font-bold uppercase tracking-wider text-indigo-400 mb-0.5">Процесс</div>
                                        <div className="text-xs font-medium text-slate-700 leading-tight line-clamp-2">{selectedPlan.process_name}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Мероприятие */}
                    <div>
                        <div className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
                            Мероприятие
                        </div>
                        <div className="glass-card p-3 rounded-2xl text-xs font-medium text-slate-700 bg-white/50 leading-relaxed shadow-sm">
                            {selectedPlan.measure_name || 'Мероприятие не выбрано'}
                        </div>
                    </div>

                    {/* Предприятия */}
                    <div>
                        <div className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1">
                            Предприятия
                        </div>
                        <div className="glass-card p-3 rounded-2xl bg-white/30">
                            {companies.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {companies.map(c => (
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
                    </div>

                    {/* Журнал работ */}
                    {!loading && (
                        <div className="pt-3 border-t">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-xs font-bold text-slate-700">Журнал работ</h3>
                                <span className="text-xs text-slate-600">
                                    {totalTasks} записей
                                </span>
                            </div>

                            {/* Разбивка по сотрудникам */}
                            {loading ? (
                                <div className="flex justify-center py-6">
                                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                                </div>
                            ) : employeeGroups.length > 0 ? (
                                <div className="space-y-1">
                                    {employeeGroups.map((group, idx) => {
                                        const empProgressPercent = plannedHours > 0
                                            ? Math.round((group.totalHours / plannedHours) * 100)
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
                                                            <span className={cn("text-xs font-medium tracking-tight truncate", isExpanded ? "text-indigo-900" : "text-indigo-900")}>{userName}</span>
                                                            <span className={cn("text-2xs font-medium flex-shrink-0 ml-2", isExpanded ? "text-indigo-600" : "text-indigo-600")}>
                                                                {group.tasks.length} отчетов
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("flex-1 h-2 rounded-full overflow-hidden shadow-inner", isExpanded ? "bg-indigo-200/50" : "bg-indigo-50")}>
                                                                <div
                                                                    className={cn(
                                                                        "h-full transition-all duration-500",
                                                                        empProgressPercent >= 100 ? "bg-emerald-400" : "bg-indigo-500"
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
                                                                {onEditTask && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            onEditTask(task);
                                                                        }}
                                                                        className="opacity-0 group-hover/task:opacity-100 p-0.5 hover:bg-indigo-100 rounded transition-all flex-shrink-0"
                                                                        title="Редактировать"
                                                                    >
                                                                        <Pencil className="h-3 w-3 text-indigo-500" />
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
                                    <p className="text-2xs text-slate-500 mt-1">Добавьте задачу для начала работы</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}



