import { supabase } from '@/lib/supabase';
import logger from '@/lib/logger';

interface TaskUserProfile {
  full_name: string | null;
  photo_base64: string | null;
  role: string | null;
}

export interface DailyTaskRow {
  daily_task_id: string;
  monthly_plan_id: string;
  user_id: string;
  task_date: string;
  description: string;
  spent_hours: number;
  attachment_url: string | null;
  document_number: string | null;
  project_id: string | null;
  created_at: string;
  user_profiles: TaskUserProfile | TaskUserProfile[] | null;
}

export async function getTasksByMonthlyPlanId(monthlyPlanId: string): Promise<DailyTaskRow[]> {
  try {
    const { data, error } = await supabase
      .from('daily_tasks')
      .select('daily_task_id, monthly_plan_id, user_id, task_date, description, spent_hours, attachment_url, document_number, project_id, created_at, user_profiles:user_id(full_name, photo_base64, role)')
      .eq('monthly_plan_id', monthlyPlanId)
      .order('task_date', { ascending: false });

    if (error) throw error;
    return (data || []) as DailyTaskRow[];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Ошибка при получении задач:', message);
    throw error;
  }
}

export async function getDailyTasksSpentHours(userId: string, date: string): Promise<number> {
  const { data, error } = await supabase
    .from('daily_tasks')
    .select('spent_hours')
    .eq('user_id', userId)
    .eq('task_date', date);

  if (error) {
    logger.error('Error fetching daily hours:', error);
    return 0;
  }

  return data?.reduce((sum, task) => sum + (Number(task.spent_hours) || 0), 0) || 0;
}

export async function getWeeklyTasksSpentHours(userId: string, date: string): Promise<number> {
  const targetDate = new Date(date);
  const dayOfWeek = targetDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(targetDate);
  monday.setDate(targetDate.getDate() + mondayOffset);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const mondayStr = monday.toISOString().split('T')[0];
  const sundayStr = sunday.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_tasks')
    .select('spent_hours')
    .eq('user_id', userId)
    .gte('task_date', mondayStr)
    .lte('task_date', sundayStr);

  if (error) {
    logger.error('Error fetching weekly hours:', error);
    return 0;
  }

  return data?.reduce((sum, task) => sum + (Number(task.spent_hours) || 0), 0) || 0;
}

