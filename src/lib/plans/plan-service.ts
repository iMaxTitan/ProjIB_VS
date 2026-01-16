import { supabase } from '../supabase';
import type { PlanStatus } from '@/types/planning';

/**
 * Интерфейс для параметров изменения статуса плана
 */
export interface StatusChangeParams {
  planType: 'annual' | 'quarterly' | 'weekly';
  planId: string;
  newStatus: PlanStatus;
  userId: string;
}

/**
 * Интерфейс для параметров годового плана
 */
export interface AnnualPlanParams {
  annualId?: string;
  year: number;
  goal: string;
  expectedResult: string;
  budget: number;
  status: PlanStatus;
  userId: string;
  action?: 'create' | 'update' | 'delete';
}

/**
 * Интерфейс для параметров квартального плана
 */
export interface QuarterlyPlanParams {
  quarterlyId?: string;
  annualPlanId: string;
  departmentId: string;
  quarter: number;
  goal: string;
  expectedResult: string;
  status: PlanStatus;
  process_id: string;
  userId: string;
  action?: 'create' | 'update' | 'delete';
}

/**
 * Интерфейс для параметров недельного плана
 */
export interface WeeklyPlanParams {
  weeklyId?: string;
  quarterlyId: string;
  departmentId: string;
  weeklyDate: string;
  expectedResult: string;
  status: PlanStatus;
  assignees?: string[];
  userId: string;
  action?: 'create' | 'update' | 'delete';
}

/**
 * Получение агрегированных счетчиков планов по пользователю
 */
export async function getPlansCounts(userId: string) {
  const { data, error } = await supabase.rpc('get_plans_counts', { u_id: userId });
  if (error) throw error;
  return data;
}

/**
 * Изменение статуса плана
 */
export async function changePlanStatus(params: StatusChangeParams) {
  const { planType, planId, newStatus, userId } = params;
  const { data, error } = await supabase.rpc('change_plan_status', {
    p_plan_type: planType,
    p_plan_id: planId,
    p_new_status: newStatus,
    p_user_id: userId
  });
  if (error) throw error;
  return data;
}

/**
 * Управление годовым планом (создание, обновление, удаление)
 */
export async function manageAnnualPlan(params: AnnualPlanParams) {
  const { annualId, year, goal, expectedResult, budget, status, userId, action = 'create' } = params;
  const { data, error } = await supabase.rpc('manage_annual_plan', {
    p_user_id: userId,
    p_year: year,
    p_goal: goal,
    p_expected_result: expectedResult,
    p_budget: budget,
    p_status: status,
    p_action: action,
    p_annual_id: annualId || null
  });
  if (error) throw error;
  return data;
}

/**
 * Управление квартальным планом (создание, обновление, удаление)
 */
export async function manageQuarterlyPlan(params: QuarterlyPlanParams) {
  const { quarterlyId, annualPlanId, departmentId, quarter, goal, expectedResult, status, userId, action = 'create', process_id } = params;
  const { data, error } = await supabase.rpc('manage_quarterly_plan', {
    p_quarterly_id: quarterlyId || null,
    p_annual_plan_id: annualPlanId,
    p_department_id: departmentId,
    p_quarter: quarter,
    p_goal: goal,
    p_expected_result: expectedResult,
    p_status: status,
    p_user_id: userId,
    p_process_id: process_id,
    p_action: action
  });
  if (error) throw error;
  return data;
}

/**
 * Управление недельным планом (создание, обновление, удаление)
 */
export async function manageWeeklyPlan(params: WeeklyPlanParams) {
  const { weeklyId, quarterlyId, departmentId, weeklyDate, expectedResult, status, assignees, userId, action = 'create' } = params;
  const { data, error } = await supabase.rpc('manage_weekly_plan', {
    p_weekly_id: weeklyId || null,
    p_quarterly_id: quarterlyId,
    p_department_id: departmentId,
    p_weekly_date: weeklyDate,
    p_expected_result: expectedResult,
    p_status: status,
    p_user_id: userId,
    p_assignees: assignees || null,
    p_action: action
  });
  if (error) throw error;
  return data;
}

/**
 * Получение недельных планов с назначенными сотрудниками и часами (через представление Supabase)
 * @param userId ID пользователя
 * @returns Массив недельных планов с информацией по исполнителям и часам
 */
export async function getWeeklyPlansWithAssigneesHours(userId: string) {
  const { data, error } = await supabase.rpc('get_weekly_plans_with_assignees_hours', {
    p_user_id: userId
  });
  if (error) throw error;
  return data;
}

// Здесь можно добавить дополнительные сервисы для работы с представлениями (views)
