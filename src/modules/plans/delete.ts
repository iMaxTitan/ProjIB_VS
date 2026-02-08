import { supabase } from '@/lib/supabase';
import type { DeleteCheckResult } from './types';

export async function canDeleteAnnualPlan(annualId: string, userId: string): Promise<DeleteCheckResult> {
  // Проверяем создателя
  const { data: plan, error: planError } = await supabase
    .from('annual_plans')
    .select('user_id')
    .eq('annual_id', annualId)
    .single();

  if (planError || !plan) {
    return { canDelete: false, reason: 'План не найден' };
  }

  if (plan.user_id !== userId) {
    return { canDelete: false, reason: 'Удалить план может только его автор' };
  }

  // Проверяем наличие квартальных планов
  const { count, error } = await supabase
    .from('quarterly_plans')
    .select('quarterly_id', { count: 'exact', head: true })
    .eq('annual_plan_id', annualId);

  if (error) {
    return { canDelete: false, reason: 'Ошибка проверки связанных планов' };
  }

  if (count && count > 0) {
    return { canDelete: false, reason: `Сначала удалите ${count} квартальных планов`, childCount: count };
  }

  return { canDelete: true };
}

/**
 * Удаление годового плана
 */
export async function deleteAnnualPlan(annualId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const check = await canDeleteAnnualPlan(annualId, userId);
  if (!check.canDelete) {
    return { success: false, error: check.reason };
  }

  const { error } = await supabase
    .from('annual_plans')
    .delete()
    .eq('annual_id', annualId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Проверка возможности удаления квартального плана
 * Удалить можно только если нет связанных месячных планов
 */
export async function canDeleteQuarterlyPlan(quarterlyId: string, userId: string): Promise<DeleteCheckResult> {
  // Проверяем создателя
  const { data: plan, error: planError } = await supabase
    .from('quarterly_plans')
    .select('created_by')
    .eq('quarterly_id', quarterlyId)
    .single();

  if (planError || !plan) {
    return { canDelete: false, reason: 'План не найден' };
  }

  if (plan.created_by !== userId) {
    return { canDelete: false, reason: 'Удалить план может только его автор' };
  }

  // Проверяем наличие месячных планов
  const { count, error } = await supabase
    .from('monthly_plans')
    .select('monthly_plan_id', { count: 'exact', head: true })
    .eq('quarterly_id', quarterlyId);

  if (error) {
    return { canDelete: false, reason: 'Ошибка проверки связанных планов' };
  }

  if (count && count > 0) {
    return { canDelete: false, reason: `Сначала удалите ${count} месячных планов`, childCount: count };
  }

  return { canDelete: true };
}

/**
 * Удаление квартального плана
 */
export async function deleteQuarterlyPlan(quarterlyId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const check = await canDeleteQuarterlyPlan(quarterlyId, userId);
  if (!check.canDelete) {
    return { success: false, error: check.reason };
  }

  const { error } = await supabase
    .from('quarterly_plans')
    .delete()
    .eq('quarterly_id', quarterlyId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Проверка возможности удаления месячного плана
 * При удалении также удаляются все связанные задачи
 */
export async function canDeleteMonthlyPlan(monthlyPlanId: string, userId: string): Promise<DeleteCheckResult> {
  // Проверяем создателя
  const { data: plan, error: planError } = await supabase
    .from('monthly_plans')
    .select('created_by')
    .eq('monthly_plan_id', monthlyPlanId)
    .single();

  if (planError || !plan) {
    return { canDelete: false, reason: 'План не найден' };
  }

  if (plan.created_by !== userId) {
    return { canDelete: false, reason: 'Удалить план может только его автор' };
  }

  // Считаем задачи (для информации)
  const { count } = await supabase
    .from('daily_tasks')
    .select('daily_task_id', { count: 'exact', head: true })
    .eq('monthly_plan_id', monthlyPlanId);

  return { canDelete: true, childCount: count || 0 };
}

/**
 * Удаление месячного плана (вместе со связанными задачами)
 */
export async function deleteMonthlyPlan(monthlyPlanId: string, userId: string): Promise<{ success: boolean; error?: string; deletedTasks?: number }> {
  const check = await canDeleteMonthlyPlan(monthlyPlanId, userId);
  if (!check.canDelete) {
    return { success: false, error: check.reason };
  }

  // Удаляем связанные задачи
  const { error: tasksError } = await supabase
    .from('daily_tasks')
    .delete()
    .eq('monthly_plan_id', monthlyPlanId);

  if (tasksError) {
    return { success: false, error: `Ошибка удаления задач: ${tasksError.message}` };
  }

  // Удаляем связанных исполнителей
  await supabase
    .from('monthly_plan_assignees')
    .delete()
    .eq('monthly_plan_id', monthlyPlanId);

  // Удаляем связанные компании
  await supabase
    .from('monthly_plan_companies')
    .delete()
    .eq('monthly_plan_id', monthlyPlanId);

  // Удаляем сам план
  const { error } = await supabase
    .from('monthly_plans')
    .delete()
    .eq('monthly_plan_id', monthlyPlanId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, deletedTasks: check.childCount };
}
