import React, { useEffect, useState, useRef } from 'react';
import { MonthlyPlan, PlanStatus, getPlanStatusColor, MONTH_NAMES_RU } from '@/types/planning';
import { getTasksByMonthlyPlanId } from '@/lib/tasks/task-service';
import { Loader2, Plus, Calendar, Clock, Users, Pencil, ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { getPlanStatusText } from '@/types/planning';
import { supabase } from '@/lib/supabase';
import { useAvailableStatuses, getStatusActionLabel, canUserChangeStatus } from '@/hooks/useAvailableStatuses';

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
    attachment_url?: string;
    document_number?: string;
    user_id?: string;
    user_profiles?: {
        full_name: string;
        photo_base64?: string;
        role?: string;
    };
}

interface EmployeeGroup {
    user: Task['user_profiles'];
    userId: string;
    tasks: Task[];
    totalHours: number;
    completedCount: number;
}

export default function WorkLogViewer({ selectedPlan, refreshTrigger, onAddTask, onEditTask, onStatusChange, onClose, userId }: WorkLogViewerProps) {
    const { user } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
    const [isUserAssigned, setIsUserAssigned] = useState(false);
    const [isStatusOpen, setIsStatusOpen] = useState(false);
    const statusDropdownRef = useRef<HTMLDivElement>(null);

    // Получаем доступные статусы для текущей роли пользователя
    const availableStatuses = useAvailableStatuses({
        user,
        currentStatus: selectedPlan?.status || 'draft',
        planType: 'monthly'
    });

    // DEBUG: Логируем что получили
    console.log('[WorkLogViewer] DEBUG:', {
        user_role: user?.role,
        selectedPlan_status: selectedPlan?.status,
        availableStatuses: availableStatuses.map(s => s.value),
        availableStatuses_length: availableStatuses.length
    });

    // Проверяем, может ли пользователь менять статус
    const canChangeStatusFlag = canUserChangeStatus(user, selectedPlan?.status || 'draft');

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
            .then((data: any[]) => setTasks(data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [selectedPlan?.monthly_plan_id, refreshTrigger]);

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
    const totalSpent = tasks.reduce((sum, t) => sum + (Number(t.spent_hours) || 0), 0);
    const plannedHours = Number(selectedPlan.planned_hours) || 0;
    const progress = plannedHours > 0 ? (totalSpent / plannedHours) * 100 : 0;
    const isOvertime = progress > 100;
    const completedTasks = tasks.filter(t => t.task_date).length;
    const totalTasks = tasks.length;
    const taskProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

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

    // Format task date
    const formatTaskDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    };

    return (
        <div className="p-4 w-full">
            {/* Компактная карточка в стиле планов, но на всю ширину */}
            <div className="glass-card rounded-3xl border border-white/20 shadow-glass overflow-hidden w-full flex flex-col animate-scale">
                {/* Заголовок */}
                <div className="bg-gradient-to-r from-indigo-500/80 to-blue-500/80 px-4 py-4 text-white backdrop-blur-md border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 p-2 rounded-xl shadow-inner-light">
                                <Calendar className="h-5 w-5" />
                            </div>
                            <span className="font-heading font-bold text-lg tracking-tight">{monthDisplay}</span>

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
                                        "bg-white/20 text-white border-white/30 text-2xs whitespace-nowrap transition-colors",
                                        canChangeStatusFlag && onStatusChange && "group-hover:bg-white/30 pr-1.5"
                                    )}>
                                        {getPlanStatusText(selectedPlan.status)}
                                        {canChangeStatusFlag && onStatusChange && <ChevronDown className="ml-1 h-3 w-3 opacity-70" />}
                                    </Badge>
                                </div>

                                {isStatusOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                                        <div className="px-3 py-2 text-2xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-50 mb-1">
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
                                                    "w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-50 transition-colors",
                                                    selectedPlan.status === s.value ? "text-gray-900 bg-gray-50 font-medium" : "text-gray-600"
                                                )}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className={cn("w-2 h-2 rounded-full", `bg-${getPlanStatusColor(s.value)}-500`)} />
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
                <div className="p-4 space-y-3">
                    {/* Услуга (вместо ожидаемого результата) */}
                    <div className="bg-white/60 p-4 rounded-2xl glass-card border-indigo-100/50 shadow-sm">
                        <h3 className="text-2xs font-heading font-black text-indigo-600 uppercase tracking-widest mb-1.5 shadow-sm w-fit px-2 py-0.5 rounded-md bg-indigo-50/80">Услуга</h3>
                        <p className="text-sm font-bold text-slate-800 leading-relaxed font-heading truncate">{selectedPlan.service_name || (selectedPlan as any).title || 'Без описания'}</p>
                    </div>

                    {/* Статистика */}
                    <div className="grid grid-cols-3 gap-3 pt-2">
                        <div className="glass-card p-3 rounded-2xl flex items-center gap-3 bg-white/60 border-indigo-100/30 shadow-sm">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100/80 flex items-center justify-center shadow-inner-light">
                                <Clock className="h-5 w-5 text-indigo-700" />
                            </div>
                            <div>
                                <p className="text-lg font-black text-slate-900 font-mono tracking-tighter leading-none">{plannedHours}</p>
                                <p className="text-2xs font-heading font-black text-indigo-500/70 uppercase tracking-wide">план</p>
                            </div>
                        </div>
                        <div className="glass-card p-3 rounded-2xl flex items-center gap-3 bg-white/60 border-indigo-100/30 shadow-sm">
                            <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center shadow-inner-light",
                                isOvertime ? "bg-red-100/80" : "bg-emerald-100/80"
                            )}>
                                <Clock className={cn("h-5 w-5", isOvertime ? "text-red-700" : "text-emerald-700")} />
                            </div>
                            <div>
                                <p className={cn(
                                    "text-lg font-black font-mono tracking-tighter leading-none",
                                    isOvertime ? "text-red-700" : "text-slate-900"
                                )}>
                                    {loading ? '...' : totalSpent.toFixed(1)}
                                </p>
                                <p className="text-2xs font-heading font-black text-indigo-500/70 uppercase tracking-wide">факт</p>
                            </div>
                        </div>
                        <div className="glass-card p-3 rounded-2xl flex items-center gap-3 bg-white/60 border-indigo-100/30 shadow-sm">
                            <div className="w-10 h-10 rounded-xl bg-purple-100/80 flex items-center justify-center shadow-inner-light">
                                <Users className="h-5 w-5 text-purple-700" />
                            </div>
                            <div>
                                <p className="text-lg font-black text-slate-900 font-mono tracking-tighter leading-none">{employeeGroups.length}</p>
                                <p className="text-2xs font-heading font-black text-indigo-500/70 uppercase tracking-wide">человек</p>
                            </div>
                        </div>
                    </div>

                    {/* Выполнение */}
                    {!loading && (
                        <div className="pt-3 border-t">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-2xs font-medium text-gray-400 uppercase">Журнал работ</h3>
                                <span className="text-2xs text-gray-500">
                                    {totalTasks} записей
                                </span>
                            </div>

                            {/* Общий прогресс */}
                            <div className="mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                            className={cn(
                                                "h-full transition-all",
                                                progress >= 100 ? "bg-emerald-500" : "bg-indigo-500"
                                            )}
                                            style={{ width: `${Math.min(progress, 100)}%` }}
                                        />
                                    </div>
                                    <span className="text-2xs font-medium text-gray-600 w-8">{Math.round(progress)}%</span>
                                </div>
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
                                        const isExpanded = expandedEmployee === group.userId;
                                        const userName = group.user?.full_name || 'Неизвестный';

                                        return (
                                            <div key={group.userId}>
                                                {/* Строка сотрудника */}
                                                <div
                                                    className={cn(
                                                        "flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all border border-transparent shadow-md",
                                                        isExpanded ? "glass-card-dark text-white ring-2 ring-indigo-500/50" : "glass-card text-slate-800 bg-white/70 hover:bg-white/90 hover:border-indigo-200"
                                                    )}
                                                    onClick={() => setExpandedEmployee(isExpanded ? null : group.userId)}
                                                >
                                                    {/* Стрелка */}
                                                    <div className={cn(
                                                        "flex items-center justify-center w-5 h-5 rounded-full transition-all duration-300",
                                                        isExpanded ? "bg-white/20 rotate-90" : "bg-indigo-50 text-indigo-400"
                                                    )}>
                                                        <span className="text-[8px]">▶</span>
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
                                                            <span className={cn("text-xs font-black tracking-tight truncate", isExpanded ? "text-white" : "text-indigo-900")}>{userName.split(' ')[0]}</span>
                                                            <span className={cn("text-2xs font-black opacity-70 flex-shrink-0 ml-2 uppercase tracking-tighter", isExpanded ? "text-white" : "text-slate-500")}>
                                                                {group.tasks.length} звітів
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("flex-1 h-2 rounded-full overflow-hidden shadow-inner", isExpanded ? "bg-white/10" : "bg-indigo-50")}>
                                                                <div
                                                                    className={cn(
                                                                        "h-full transition-all duration-500",
                                                                        empProgressPercent >= 100 ? "bg-emerald-400" : (isExpanded ? "bg-indigo-300" : "bg-indigo-500")
                                                                    )}
                                                                    style={{ width: `${Math.min(empProgressPercent, 100)}%` }}
                                                                />
                                                            </div>
                                                            <span className={cn("text-2xs font-black font-mono w-10 text-right flex-shrink-0", isExpanded ? "text-white" : "text-indigo-600")}>
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
                                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 mb-2">
                                        <Clock className="w-5 h-5 text-gray-400" />
                                    </div>
                                    <p className="text-xs text-gray-500">Записей пока нет</p>
                                    <p className="text-2xs text-gray-400 mt-1">Добавьте задачу для начала работы</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
