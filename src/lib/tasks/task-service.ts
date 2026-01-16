import { supabase } from '@/lib/supabase';

/**
 * Получает список задач для конкретного недельного плана
 * @param weeklyPlanId ID недельного плана
 * @returns Массив задач
 */
export async function getTasksByWeeklyPlanId(weeklyPlanId: string) {
  try {
    // Прямое обращение к таблице weekly_tasks
    const { data, error } = await supabase
      .from('weekly_tasks')
      .select('*')
      .eq('weekly_plan_id', weeklyPlanId);

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('Ошибка при получении задач:', error.message);
    throw error;
  }
}
