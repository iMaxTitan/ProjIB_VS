/**
 * Excel report — data fetching from DB.
 * Extracted from excel.ts to keep the orchestrator under the 300-line limit.
 */

import { supabase } from '../../shared/db-client';
import logger from '@/lib/shared/logger';

export interface MonthlyReportData {
  period: {
    year: number;
    month: number;
    monthName: string;
  };
  department: {
    id: string;
    name: string;
    code: string;
  };
  summary: {
    totalPlans: number;
    completedPlans: number;
    activePlans: number;
    failedPlans: number;
    completionRate: number;
    totalHoursPlanned: number;
    totalHoursSpent: number;
  };
  quarterlyPlans: QuarterlyPlanReportItem[];
  tasks: TaskReportItem[];
  employees: EmployeeReportItem[];
}

export interface QuarterlyPlanReportItem {
  quarterly_id: string;
  quarter: number;
  goal: string;
  expected_result: string;
  status: string;
  process_name: string;
  completion_percentage: number;
}

export interface TaskReportItem {
  task_id: string;
  description: string;
  spent_hours: number;
  completed_at: string;
  employee_name: string;
  plan_name: string;
}

export interface EmployeeReportItem {
  user_id: string;
  full_name: string;
  total_hours: number;
  tasks_count: number;
  plans_count: number;
}

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

export async function getMonthlyReportData(
  year: number,
  month: number,
  departmentId?: string
): Promise<MonthlyReportData | null> {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    let departmentData = null;
    if (departmentId) {
      const { data } = await supabase
        .from('departments')
        .select('*')
        .eq('department_id', departmentId)
        .single();
      departmentData = data;
    }

    let monthlyQuery = supabase
      .from('monthly_plans')
      .select('*')
      .eq('year', year)
      .eq('month', month);

    if (departmentId) {
      monthlyQuery = monthlyQuery.eq('department_id', departmentId);
    }

    const { data: monthlyPlans, error: monthlyError } = await monthlyQuery;
    if (monthlyError) {
      logger.error('[ExcelReportGenerator] Ошибка получения месячных планов:', monthlyError);
      throw monthlyError;
    }

    const quarterlyIds = Array.from(new Set(
      (monthlyPlans || []).map(mp => mp.quarterly_id).filter(Boolean)
    ));

    let quarterlyPlans: QuarterlyPlanReportItem[] = [];
    if (quarterlyIds.length > 0) {
      const { data } = await supabase
        .from('quarterly_plans')
        .select(`
          quarterly_id,
          quarter,
          goal,
          expected_result,
          status,
          processes (process_name)
        `)
        .in('quarterly_id', quarterlyIds);

      const qCompletion = new Map<string, { planned: number; completed: number }>();
      for (const mp of (monthlyPlans || [])) {
        if (!mp.quarterly_id) continue;
        const cur = qCompletion.get(mp.quarterly_id) || { planned: 0, completed: 0 };
        cur.planned += 1;
        if (mp.status === 'done') cur.completed += 1;
        qCompletion.set(mp.quarterly_id, cur);
      }

      type QpRow = {
        quarterly_id: string;
        quarter: number;
        goal: string | null;
        expected_result: string | null;
        status: string | null;
        processes?: { process_name?: string | null } | { process_name?: string | null }[] | null;
      };

      quarterlyPlans = ((data || []) as QpRow[]).map(qp => {
        const processRel = Array.isArray(qp.processes) ? qp.processes[0] : qp.processes;
        const counts = qCompletion.get(qp.quarterly_id) || { planned: 0, completed: 0 };
        const pct = counts.planned > 0 ? Math.round((counts.completed / counts.planned) * 100) : 0;
        return {
          quarterly_id: qp.quarterly_id,
          quarter: qp.quarter,
          goal: qp.goal || '',
          expected_result: qp.expected_result || '',
          status: qp.status || '',
          process_name: processRel?.process_name || '',
          completion_percentage: pct,
        };
      });
    }

    const { data: tasks } = await supabase
      .from('daily_tasks')
      .select('daily_task_id, description, spent_hours, task_date, user_id, monthly_plan_id')
      .gte('task_date', startDateStr)
      .lte('task_date', endDateStr);

    const userIds = Array.from(new Set((tasks || []).map(t => t.user_id).filter(Boolean)));
    let usersMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('user_profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);
      usersMap = (users || []).reduce((acc, u) => {
        acc[u.user_id] = u.full_name || 'Неизвестно';
        return acc;
      }, {} as Record<string, string>);
    }

    const planIds = Array.from(new Set((tasks || []).map(t => t.monthly_plan_id).filter(Boolean)));
    let plansMap: Record<string, string> = {};
    if (planIds.length > 0) {
      const { data: plans } = await supabase
        .from('monthly_plans')
        .select('monthly_plan_id, description')
        .in('monthly_plan_id', planIds);
      plansMap = (plans || []).reduce((acc, p) => {
        acc[p.monthly_plan_id] = p.description || '';
        return acc;
      }, {} as Record<string, string>);
    }

    const taskItems: TaskReportItem[] = (tasks || []).map(t => ({
      task_id: t.daily_task_id,
      description: t.description || '',
      spent_hours: Number(t.spent_hours) || 0,
      completed_at: t.task_date || '',
      employee_name: usersMap[t.user_id] || 'Неизвестно',
      plan_name: plansMap[t.monthly_plan_id] || ''
    }));

    const employeeStats = new Map<string, EmployeeReportItem>();
    const employeePlans = new Map<string, Set<string>>();

    (tasks || []).forEach(task => {
      const userId = task.user_id;
      if (!userId) return;
      const existing = employeeStats.get(userId) || {
        user_id: userId,
        full_name: usersMap[userId] || 'Неизвестно',
        total_hours: 0,
        tasks_count: 0,
        plans_count: 0
      };
      existing.total_hours += Number(task.spent_hours) || 0;
      existing.tasks_count += 1;
      employeeStats.set(userId, existing);
      if (!employeePlans.has(userId)) employeePlans.set(userId, new Set());
      if (task.monthly_plan_id) employeePlans.get(userId)!.add(task.monthly_plan_id);
    });

    employeePlans.forEach((plans, userId) => {
      const emp = employeeStats.get(userId);
      if (emp) emp.plans_count = plans.size;
    });

    const completedPlans = (monthlyPlans || []).filter(p => p.status === 'done').length;
    const activePlans = (monthlyPlans || []).filter(p => p.status === 'active').length;
    const failedPlans = (monthlyPlans || []).filter(p => p.status === 'failed').length;
    const totalPlans = (monthlyPlans || []).length;
    const totalHoursPlanned = (monthlyPlans || []).reduce((sum, p) => sum + (Number(p.planned_hours) || 0), 0);
    const totalHoursSpent = taskItems.reduce((sum, t) => sum + t.spent_hours, 0);

    return {
      period: { year, month, monthName: MONTH_NAMES[month - 1] },
      department: departmentData ? {
        id: departmentData.department_id,
        name: departmentData.department_name,
        code: departmentData.department_code || 'DEPT'
      } : { id: 'all', name: 'Все отделы', code: 'ALL' },
      summary: {
        totalPlans, completedPlans, activePlans, failedPlans,
        completionRate: totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0,
        totalHoursPlanned, totalHoursSpent
      },
      quarterlyPlans,
      tasks: taskItems,
      employees: Array.from(employeeStats.values())
    };
  } catch (error: unknown) {
    logger.error('[ExcelReportGenerator] Ошибка получения данных:', error);
    return null;
  }
}
