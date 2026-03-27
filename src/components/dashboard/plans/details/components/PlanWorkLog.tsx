import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { Pencil, Trash2, Loader2, Clock, Check, X, Plus } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { MonthlyPlan } from '@/types/planning';
import { UserInfo } from '@/types/azure';
import { DetailSection, ExpandableListItem } from '@/components/dashboard/shared';

interface Task {
  daily_task_id: string;
  description: string;
  title?: string | null;
  task_type?: string;
  source?: string;
  spent_hours: number;
  created_at: string;
  task_date: string;
  attachment_url?: string | null;
  document_number?: string | null;
  project_id?: string | null;
  user_id?: string;
  created_by?: string | null;
  created_by_role?: string | null;
  user_profiles?: {
    full_name: string | null;
    photo_base64?: string | null;
    role?: string | null;
  } | null;
}

interface AssigneeWithDetails {
  user_id: string;
  full_name: string;
  photo_base64?: string;
  role?: string;
}

interface EmployeeGroup {
  user: Task['user_profiles'];
  userId: string;
  tasks: Task[];
  totalHours: number;
  completedCount: number;
}

interface PlanWorkLogProps {
  tasks: Task[];
  tasksLoading: boolean;
  user: UserInfo;
  plan: MonthlyPlan;
  assignees: AssigneeWithDetails[];
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddTaskForUser?: (userId: string) => void;
  onAcceptTask?: (taskId: string) => Promise<void>;
  onRejectTask?: (taskId: string) => Promise<void>;
}

const avatarColors = ['bg-indigo-500', 'bg-blue-500', 'bg-emerald-500', 'bg-pink-500', 'bg-purple-500', 'bg-teal-500'];

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]?.toUpperCase() || '').join('').slice(0, 2);
}

function formatTaskDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export default function PlanWorkLog({
  tasks,
  tasksLoading,
  user,
  plan,
  assignees,
  onEditTask,
  onDeleteTask,
  onAddTaskForUser,
  onAcceptTask,
  onRejectTask,
}: PlanWorkLogProps) {
  const [expandedEmployees, setExpandedEmployees] = useState<string[]>([]);
  const [taskToDeleteId, setTaskToDeleteId] = useState<string | null>(null);

  const assigneeNameById = useMemo(
    () => new Map(assignees.map(a => [a.user_id, a.full_name])),
    [assignees]
  );

  const employeeGroups: EmployeeGroup[] = useMemo(() => {
    const groupsMap = tasks.reduce((acc, task) => {
      const key = task.user_id || task.user_profiles?.full_name || 'unknown';
      if (!acc[key]) {
        acc[key] = { user: task.user_profiles, userId: key, tasks: [], totalHours: 0, completedCount: 0 };
      }
      acc[key].tasks.push(task);
      acc[key].totalHours += Number(task.spent_hours || 0);
      if (task.task_date) acc[key].completedCount++;
      return acc;
    }, {} as Record<string, EmployeeGroup>);

    assignees.forEach(assignee => {
      if (!groupsMap[assignee.user_id]) {
        groupsMap[assignee.user_id] = {
          user: { full_name: assignee.full_name, photo_base64: assignee.photo_base64, role: assignee.role },
          userId: assignee.user_id,
          tasks: [],
          totalHours: 0,
          completedCount: 0,
        };
      }
    });

    return Object.values(groupsMap).sort((a, b) => b.totalHours - a.totalHours);
  }, [tasks, assignees]);

  const resolveUserName = (group: EmployeeGroup): string => {
    return (
      group.user?.full_name ||
      assigneeNameById.get(group.userId) ||
      group.tasks[0]?.user_profiles?.full_name ||
      (group.userId !== 'unknown' ? `ID: ${group.userId.slice(0, 8)}` : 'Исполнитель')
    );
  };

  return (
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
                  isExpanded ? prev.filter(id => id !== group.userId) : [...prev, group.userId]
                )}
                expandedContent={group.tasks.length > 0 ? (
                  <>
                    {group.tasks.map(task => {
                      const canManage = task.user_id === user.user_id || user.role === 'chief' || user.role === 'head';
                      const isChiefTask = task.source === 'chief' || task.source === 'head';
                      const canAcceptReject = isChiefTask && task.task_type !== 'completed' && (
                        user.role === 'chief' || (user.role === 'head' && task.source === 'head')
                      );
                      return (
                        <div
                          key={task.daily_task_id}
                          className="flex items-start gap-2 text-xs py-1 group/task hover:bg-indigo-50/50 rounded px-1 -mx-1"
                        >
                          {/* Left column: date + action icons */}
                          <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                            <span className="text-2xs font-bold text-slate-500">
                              {formatTaskDate(task.task_date)}
                            </span>
                            {canAcceptReject && onAcceptTask && onRejectTask && (
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); onAcceptTask(task.daily_task_id); }}
                                  aria-label="Прийняти"
                                  className="p-0.5 hover:bg-emerald-100 rounded transition-colors"
                                >
                                  <Check className="h-2.5 w-2.5 text-emerald-500 hover:text-emerald-700" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); onRejectTask(task.daily_task_id); }}
                                  aria-label="Повернути"
                                  className="p-0.5 hover:bg-amber-100 rounded transition-colors"
                                >
                                  <X className="h-2.5 w-2.5 text-amber-500 hover:text-amber-700" aria-hidden="true" />
                                </button>
                              </div>
                            )}
                            {canManage && (
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); onEditTask(task); }}
                                  aria-label="Редактировать"
                                  className="p-0.5 hover:bg-indigo-100 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                  <Pencil className="h-2.5 w-2.5 text-indigo-400 hover:text-indigo-600" aria-hidden="true" />
                                </button>
                                {taskToDeleteId === task.daily_task_id ? (
                                  <div className="flex items-center gap-0.5 bg-red-50 rounded px-0.5 animate-fade-in">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setTaskToDeleteId(null); }}
                                      aria-label="Отмена"
                                      className="p-0.5 hover:bg-white rounded transition-colors"
                                    >
                                      <X className="h-2.5 w-2.5 text-slate-500" aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); onDeleteTask(task.daily_task_id); setTaskToDeleteId(null); }}
                                      aria-label="Подтвердить"
                                      className="p-0.5 hover:bg-red-100 rounded transition-colors"
                                    >
                                      <Check className="h-2.5 w-2.5 text-red-500" aria-hidden="true" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setTaskToDeleteId(task.daily_task_id); }}
                                    aria-label="Удалить"
                                    className="p-0.5 hover:bg-red-100 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                                  >
                                    <Trash2 className="h-2.5 w-2.5 text-red-400 hover:text-red-600" aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Right: text content */}
                          <div className="flex-1 min-w-0">
                            {task.title && (
                              <span className="block text-xs font-semibold text-slate-900 truncate">{task.title}</span>
                            )}
                            <span className={cn('break-words text-slate-800', task.title ? 'text-2xs text-slate-600' : 'font-medium')}>
                              {task.description}
                            </span>
                          </div>
                          {(task.source === 'chief' || task.source === 'head') && (
                            <span className={cn(
                              'text-3xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5',
                              task.source === 'chief'
                                ? 'bg-purple-50 text-purple-600 border border-purple-200'
                                : 'bg-teal-50 text-teal-600 border border-teal-200'
                            )}>
                              {task.source === 'chief' ? 'CHIEF' : 'HEAD'}
                            </span>
                          )}
                          {task.task_type && task.task_type !== 'completed' && (
                            <span className={cn(
                              'text-3xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5',
                              task.task_type === 'draft' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                              task.task_type === 'incomplete' ? 'bg-sky-50 text-sky-600 border border-sky-200' :
                              'bg-slate-50 text-slate-500 border border-slate-200'
                            )}>
                              {task.task_type === 'draft' ? 'чернетка' : task.task_type === 'incomplete' ? 'в роботі' : task.task_type}
                            </span>
                          )}
                          {Number(task.spent_hours) > 0 && (
                            <span className="text-2xs font-bold text-indigo-600 flex-shrink-0 bg-indigo-50 px-1.5 py-0.5 rounded shadow-sm mt-0.5">
                              {Number(task.spent_hours).toFixed(1)}ч
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </>
                ) : undefined}
              >
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("text-xs font-medium tracking-tight truncate", isExpanded ? "text-indigo-900" : "text-slate-900")}>{userName}</span>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      <span className="text-2xs font-medium text-indigo-600">
                        {group.tasks.length} задач
                      </span>
                      {onAddTaskForUser && (user.role === 'chief' || user.role === 'head') && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onAddTaskForUser(group.userId); }}
                          aria-label="Добавить задачу сотруднику"
                          className="p-0.5 hover:bg-indigo-100 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <Plus className="h-3 w-3 text-indigo-400 hover:text-indigo-600" aria-hidden="true" />
                        </button>
                      )}
                    </div>
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
  );
}
