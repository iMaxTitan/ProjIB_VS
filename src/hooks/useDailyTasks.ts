import { useState, useEffect, useCallback } from 'react';
import {
  getDailyTasksByMonthlyPlan,
  manageDailyTask,
  getDailySpentHours,
  DailyTaskParams
} from '@/lib/plans/plan-service';
import type { DailyTask } from '@/types/planning';
import { getErrorMessage } from '@/lib/utils/error-message';

export function useDailyTasks(monthlyPlanId: string | null) {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!monthlyPlanId) {
      setTasks([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await getDailyTasksByMonthlyPlan(monthlyPlanId);
      setTasks(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Не удалось загрузить задачи'));
    } finally {
      setLoading(false);
    }
  }, [monthlyPlanId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const createTask = async (params: Omit<DailyTaskParams, 'action' | 'dailyTaskId'>) => {
    const result = await manageDailyTask({ ...params, action: 'create' });
    await fetchTasks();
    return result;
  };

  const updateTask = async (params: DailyTaskParams) => {
    const result = await manageDailyTask({ ...params, action: 'update' });
    await fetchTasks();
    return result;
  };

  const deleteTask = async (dailyTaskId: string) => {
    const result = await manageDailyTask({
      dailyTaskId,
      monthlyPlanId: monthlyPlanId || '',
      userId: '',
      taskDate: '',
      description: '',
      spentHours: 0,
      action: 'delete'
    });
    await fetchTasks();
    return result;
  };

  const tasksByDate = tasks.reduce((acc, task) => {
    const date = task.task_date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(task);
    return acc;
  }, {} as Record<string, DailyTask[]>);

  const tasksByUser = tasks.reduce((acc, task) => {
    const userId = task.user_id;
    if (!acc[userId]) {
      acc[userId] = {
        user_id: userId,
        user_name: task.user_name,
        user_email: task.user_email,
        user_photo: task.user_photo,
        tasks: [],
        total_hours: 0
      };
    }
    acc[userId].tasks.push(task);
    acc[userId].total_hours += task.spent_hours || 0;
    return acc;
  }, {} as Record<string, { user_id: string; user_name?: string; user_email?: string; user_photo?: string; tasks: DailyTask[]; total_hours: number }>);

  const totalHours = tasks.reduce((sum, t) => sum + (t.spent_hours || 0), 0);
  const uniqueDates = Array.from(new Set(tasks.map(t => t.task_date))).length;
  const uniqueUsers = Array.from(new Set(tasks.map(t => t.user_id))).length;

  return {
    tasks,
    tasksByDate,
    tasksByUser: Object.values(tasksByUser),
    loading,
    error,
    refetch: fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    stats: {
      totalTasks: tasks.length,
      totalHours,
      uniqueDates,
      uniqueUsers
    }
  };
}

export function useDailyHoursValidation(userId: string) {
  const [dailyHours, setDailyHours] = useState<Record<string, number>>({});

  const checkDailyLimit = useCallback(async (taskDate: string, additionalHours: number = 0): Promise<{
    currentHours: number;
    canAdd: boolean;
    remainingHours: number;
  }> => {
    const current = await getDailySpentHours(userId, taskDate);
    const remaining = 8 - current;

    setDailyHours(prev => ({ ...prev, [taskDate]: current }));

    return {
      currentHours: current,
      canAdd: (current + additionalHours) <= 8,
      remainingHours: Math.max(0, remaining)
    };
  }, [userId]);

  return {
    dailyHours,
    checkDailyLimit
  };
}
