import { supabase } from '@/lib/supabase';
import type { StatusChangeParams, AnnualPlanParams, QuarterlyPlanParams, MonthlyPlanParams, DailyTaskParams } from './types';

export async function changePlanStatus(params: StatusChangeParams) {
  const { planType, planId, newStatus, userId } = params;
  const { data, error } = await supabase.rpc('change_plan_status', {
    plan_type: planType,
    plan_id: planId,
    new_status: newStatus,
    user_id: userId
  });
  if (error) throw error;
  return data;
}


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

// ==================== MONTHLY PLANS ====================


export async function manageMonthlyPlan(params: MonthlyPlanParams) {
  const {
    monthlyPlanId, quarterlyId, measureId, year, month,
    description, plannedHours, status, assignees, userId,
    action = 'create'
  } = params;

  const isCreate = !monthlyPlanId || monthlyPlanId === 'new';
  let resultId = monthlyPlanId;

  if (action === 'delete' && monthlyPlanId) {
    const { error } = await supabase
      .from('monthly_plans')
      .delete()
      .eq('monthly_plan_id', monthlyPlanId);
    if (error) throw error;
    return { monthly_plan_id: monthlyPlanId, deleted: true };
  }

  if (isCreate) {
    const { data, error } = await supabase
      .from('monthly_plans')
      .insert({
        quarterly_id: quarterlyId,
        measure_id: measureId,
        year,
        month,
        description,
        planned_hours: plannedHours || 0,
        status,
        created_by: userId
      })
      .select()
      .single();

    if (error) throw error;
    resultId = data.monthly_plan_id;
  } else {
    const { error } = await supabase
      .from('monthly_plans')
      .update({
        quarterly_id: quarterlyId,
        measure_id: measureId,
        year,
        month,
        description,
        planned_hours: plannedHours || 0,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('monthly_plan_id', monthlyPlanId);

    if (error) throw error;
  }

  // Обновляем исполнителей
  if (assignees !== undefined && resultId) {
    await supabase.from('monthly_plan_assignees').delete().eq('monthly_plan_id', resultId);

    if (assignees && assignees.length > 0) {
      const { error: assignError } = await supabase
        .from('monthly_plan_assignees')
        .insert(assignees.map(uid => ({ monthly_plan_id: resultId, user_id: uid })));

      if (assignError) throw assignError;
    }
  }

  return { monthly_plan_id: resultId };
}


export async function manageDailyTask(params: DailyTaskParams) {
  const {
    dailyTaskId, monthlyPlanId, userId, taskDate,
    description, spentHours, attachmentUrl, documentNumber,
    action = 'create'
  } = params;

  if (action === 'delete' && dailyTaskId) {
    const { error } = await supabase
      .from('daily_tasks')
      .delete()
      .eq('daily_task_id', dailyTaskId);
    if (error) throw error;
    return { daily_task_id: dailyTaskId, deleted: true };
  }

  const isCreate = !dailyTaskId || dailyTaskId === 'new';

  if (isCreate) {
    const { data, error } = await supabase
      .from('daily_tasks')
      .insert({
        monthly_plan_id: monthlyPlanId,
        user_id: userId,
        task_date: taskDate,
        description,
        spent_hours: spentHours,
        attachment_url: attachmentUrl,
        document_number: documentNumber
      })
      .select()
      .single();

    if (error) throw error;
    return { daily_task_id: data.daily_task_id };
  } else {
    const { error } = await supabase
      .from('daily_tasks')
      .update({
        task_date: taskDate,
        description,
        spent_hours: spentHours,
        attachment_url: attachmentUrl,
        document_number: documentNumber
      })
      .eq('daily_task_id', dailyTaskId);

    if (error) throw error;
    return { daily_task_id: dailyTaskId };
  }
}
