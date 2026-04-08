import type { PostgrestClient } from '@/lib/shared/postgrest-client';
import logger from '@/lib/shared/logger';

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
  title: string | null;
  task_type: string;
  source: string;
  spent_hours: number;
  attachment_url: string | null;
  document_number: string | null;
  project_id: string | null;
  kb_document_id: string | null;
  distribution_type: string;
  created_at: string;
  created_by: string | null;
  created_by_profile: { role: string | null } | { role: string | null }[] | null;
  user_profiles: TaskUserProfile | TaskUserProfile[] | null;
}

export async function getTasksByMonthlyPlanId(db: PostgrestClient, monthlyPlanId: string): Promise<DailyTaskRow[]> {
  try {
    const { data, error } = await db
      .from('daily_tasks')
      .select('daily_task_id, monthly_plan_id, user_id, task_date, description, title, task_type, source, spent_hours, attachment_url, document_number, project_id, kb_document_id, distribution_type, created_at, created_by, created_by_profile:created_by(role), user_profiles:user_id(full_name, photo_base64, role)')
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

export async function getWeeklyTasksSpentHours(db: PostgrestClient, userId: string, date: string): Promise<number> {
  const targetDate = new Date(date);
  const dayOfWeek = targetDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(targetDate);
  monday.setDate(targetDate.getDate() + mondayOffset);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const mondayStr = monday.toISOString().split('T')[0];
  const sundayStr = sunday.toISOString().split('T')[0];

  const { data, error } = await db.rpc('get_user_hours_sum', {
    p_user_id: userId,
    p_from: mondayStr,
    p_to: sundayStr,
  });

  if (error) {
    logger.error('Error fetching weekly hours:', error);
    return 0;
  }

  return Number(data) || 0;
}

export async function getTaskCompanies(db: PostgrestClient, taskId: string): Promise<string[]> {
  const { data, error } = await db
    .from('daily_task_companies')
    .select('company_id')
    .eq('daily_task_id', taskId);

  if (error) {
    logger.error('Error fetching task companies:', error);
    return [];
  }
  return (data || []).map(r => r.company_id);
}

export async function updateTaskCompanies(db: PostgrestClient, taskId: string, companyIds: string[]): Promise<void> {
  const { error: delError } = await db
    .from('daily_task_companies')
    .delete()
    .eq('daily_task_id', taskId);

  if (delError) {
    logger.error('Error deleting task companies:', delError);
    throw delError;
  }

  if (companyIds.length > 0) {
    const { error: insError } = await db
      .from('daily_task_companies')
      .insert(companyIds.map(id => ({ daily_task_id: taskId, company_id: id })));

    if (insError) {
      logger.error('Error inserting task companies:', insError);
      throw insError;
    }
  }
}
