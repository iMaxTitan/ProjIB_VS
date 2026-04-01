/**
 * KPI computation service.
 * Extracted from /api/kpi/route.ts for reuse by Telegram bot tools.
 *
 * Types   → kpi-types.ts
 * Helpers → kpi-helpers.ts
 * Role computations → kpi-compute-roles.ts
 */

import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import logger from '@/lib/shared/logger';
import {
  KPI_NORM,
  getMonthsForPeriod,
  getQuarterForMonth,
  getQuarterMonths,
  getAvailableHours,
  getPlanDeptId,
  getPlanProcessId,
  getEmployeeNormForPeriod,
  calcKPI,
  emptyResult,
  type EmployeeNormContext,
} from './helpers';
import { addRoleSpecificKPI } from './compute-roles';
import type { KPIResponse, KPIMetricRow } from '@/components/dashboard/kpi/types';
import type {
  PlanRow, QuarterlyRow, TaskAggRow, AssigneeRow,
  ProcedureRef, ProcessRef, DeptRef, UserRef,
} from './types';

export { KPI_NORM, getMonthsForPeriod };

export async function computeKPI(
  db: SupabaseClient,
  userId: string,
  year: number,
  periodType: string,
  periodValue?: number,
): Promise<KPIResponse> {
  const months = getMonthsForPeriod(periodType, periodValue);

  const { data: profile } = await db
    .from('user_profiles')
    .select('role, department_id, full_name')
    .eq('user_id', userId)
    .single();

  const role = (profile?.role || 'employee') as 'chief' | 'head' | 'employee';
  const userDeptId = profile?.department_id as string | null;

  let allMonths: number[];
  if (role === 'employee' && periodType === 'month' && periodValue) {
    const q = getQuarterForMonth(periodValue);
    allMonths = getQuarterMonths(q);
  } else if (role === 'head' && periodType === 'quarter') {
    allMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  } else {
    allMonths = months;
  }

  const [plansRes, qpRes, assigneesRes, proceduresRes, processesRes, deptsRes, usersRes, wdRes, tsRes] = await Promise.all([
    db.from('monthly_plans')
      .select('monthly_plan_id, year, month, planned_hours, procedure_id, quarterly_id')
      .eq('year', year).in('month', allMonths).in('status', ['active', 'done']),
    db.from('quarterly_plans').select('quarterly_id, department_id, process_id, quarter'),
    db.from('monthly_plan_assignees').select('monthly_plan_id, user_id'),
    db.from('procedures').select('procedure_id, name, process_id').eq('is_active', true),
    db.from('processes').select('process_id, process_name, department_id'),
    db.from('departments').select('department_id, department_name'),
    db.from('user_profiles').select('user_id, full_name, department_id, work_rate'),
    db.from('monthly_working_days').select('month, work_hours').eq('year', year),
    db.from('employee_timesheet').select('user_id, month, work_hours').eq('year', year).in('month', allMonths),
  ]);

  const plans = (plansRes.data || []) as PlanRow[];
  const qps = (qpRes.data || []) as QuarterlyRow[];
  const allAssignees = (assigneesRes.data || []) as AssigneeRow[];
  const procedures = (proceduresRes.data || []) as ProcedureRef[];
  const processes = (processesRes.data || []) as ProcessRef[];
  const depts = (deptsRes.data || []) as DeptRef[];
  const users = (usersRes.data || []) as UserRef[];

  if (wdRes.error) logger.error('[KPI] Failed to load working days:', wdRes.error);
  const customHoursMap = new Map<number, number>();
  ((wdRes.data || []) as { month: number; work_hours: number }[]).forEach(r => customHoursMap.set(r.month, r.work_hours));

  type TSRow = { user_id: string; month: number; work_hours: number };
  const userTimesheets = new Map<string, Map<number, number>>();
  for (const ts of (tsRes.data || []) as TSRow[]) {
    let um = userTimesheets.get(ts.user_id);
    if (!um) { um = new Map(); userTimesheets.set(ts.user_id, um); }
    um.set(ts.month, ts.work_hours);
  }

  if (plans.length === 0) return emptyResult(year, periodType, periodValue, role);

  const planIdsArray = plans.map(p => p.monthly_plan_id);
  const planIds = new Set(planIdsArray);
  const { data: taskAggData, error: taskAggError } = await db.rpc('get_task_hours_by_plan_user', { p_plan_ids: planIdsArray });
  if (taskAggError) throw taskAggError;

  const allTaskAgg = (taskAggData || []) as TaskAggRow[];
  const qpMap = new Map(qps.map(q => [q.quarterly_id, q]));
  const procedureMap = new Map(procedures.map(m => [m.procedure_id, m]));
  const processMap = new Map(processes.map(p => [p.process_id, p]));
  const deptMap = new Map(depts.map(d => [d.department_id, d]));
  const userMap = new Map(users.map(u => [u.user_id, u]));
  const taskAgg = allTaskAgg.filter(t => planIds.has(t.monthly_plan_id));

  const assigneesByPlan = new Map<string, string[]>();
  for (const a of allAssignees) {
    if (!planIds.has(a.monthly_plan_id)) continue;
    const list = assigneesByPlan.get(a.monthly_plan_id) || [];
    list.push(a.user_id);
    assigneesByPlan.set(a.monthly_plan_id, list);
  }

  const taskHoursMap = new Map<string, number>();
  const taskHoursByPlan = new Map<string, number>();
  for (const t of taskAgg) {
    const key = `${t.monthly_plan_id}:${t.user_id || 'all'}`;
    taskHoursMap.set(key, (taskHoursMap.get(key) || 0) + t.total_spent_hours);
    taskHoursByPlan.set(t.monthly_plan_id, (taskHoursByPlan.get(t.monthly_plan_id) || 0) + t.total_spent_hours);
  }

  const mainMonthsSet = new Set(months);
  let filteredPlans: PlanRow[];
  if (role === 'employee') {
    const myPlanIds = new Set(allAssignees.filter(a => a.user_id === userId).map(a => a.monthly_plan_id));
    filteredPlans = plans.filter(p => myPlanIds.has(p.monthly_plan_id) && mainMonthsSet.has(p.month));
  } else if (role === 'head') {
    filteredPlans = plans.filter(p => mainMonthsSet.has(p.month) && getPlanDeptId(p, qpMap, procedureMap, processMap) === userDeptId);
  } else {
    filteredPlans = plans.filter(p => mainMonthsSet.has(p.month));
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  let availableMonths = months;
  if (year === currentYear) availableMonths = months.filter(m => m <= currentMonth);
  else if (year > currentYear) availableMonths = [];

  const fullCapacity = getAvailableHours(year, availableMonths, customHoursMap);
  const employeeNormHours = Math.round(fullCapacity * KPI_NORM / 100 * 10) / 10;

  const normCtx: EmployeeNormContext = {
    userTimesheets, userMap, year, currentYear, currentMonth,
    todayDate: now.getDate(), customHoursMap, employeeNormHours,
  };

  let totalPlanned = 0;
  let totalActual = 0;
  if (role === 'employee') {
    totalPlanned = getEmployeeNormForPeriod(userId, availableMonths, normCtx);
    for (const p of filteredPlans) totalActual += taskHoursMap.get(`${p.monthly_plan_id}:${userId}`) || 0;
  } else {
    for (const p of filteredPlans) {
      totalPlanned += p.planned_hours || 0;
      totalActual += taskHoursByPlan.get(p.monthly_plan_id) || 0;
    }
  }

  const overallKPI = calcKPI(totalActual, totalPlanned);

  const procAgg = new Map<string, { planned: number; actual: number; deptId: string | null; employees: Set<string> }>();
  for (const p of filteredPlans) {
    const procId = getPlanProcessId(p, qpMap, procedureMap) || '__none__';
    const agg = procAgg.get(procId) || { planned: 0, actual: 0, deptId: null, employees: new Set<string>() };
    agg.planned += p.planned_hours || 0;
    agg.actual += taskHoursByPlan.get(p.monthly_plan_id) || 0;
    if (!agg.deptId) agg.deptId = getPlanDeptId(p, qpMap, procedureMap, processMap);
    for (const uid of (assigneesByPlan.get(p.monthly_plan_id) || [])) agg.employees.add(uid);
    procAgg.set(procId, agg);
  }

  const empDeptProcessCount = new Map<string, Map<string, number>>();
  Array.from(procAgg.entries()).forEach(([, agg]) => {
    const deptId = agg.deptId || '__none__';
    Array.from(agg.employees).forEach(uid => {
      let dm = empDeptProcessCount.get(uid);
      if (!dm) { dm = new Map(); empDeptProcessCount.set(uid, dm); }
      dm.set(deptId, (dm.get(deptId) || 0) + 1);
    });
  });

  const byProcess: KPIMetricRow[] = Array.from(procAgg.entries()).map(([procId, agg]) => {
    const proc = processMap.get(procId);
    const dept = agg.deptId ? deptMap.get(agg.deptId) : null;
    const deptId = agg.deptId || '__none__';
    let bench = 0;
    Array.from(agg.employees).forEach(uid => {
      const countInDept = empDeptProcessCount.get(uid)?.get(deptId) || 1;
      bench += getEmployeeNormForPeriod(uid, availableMonths, normCtx) / countInDept;
    });
    return {
      id: procId, name: proc?.process_name || 'Без категорії',
      departmentName: dept?.department_name || 'Без відділу',
      planned: Math.round(agg.planned * 10) / 10,
      actual: Math.round(agg.actual * 10) / 10,
      kpi: calcKPI(agg.actual, agg.planned),
      bench: Math.round(bench * 10) / 10,
    };
  }).sort((a, b) => b.planned - a.planned);

  const result: KPIResponse = {
    period: { year, type: periodType as KPIResponse['period']['type'], value: periodValue },
    role, norm: KPI_NORM,
    overall: {
      planned: Math.round(totalPlanned * 10) / 10,
      actual: Math.round(totalActual * 10) / 10,
      kpi: overallKPI,
    },
    byProcess,
  };

  addRoleSpecificKPI(result, {
    filteredPlans, plans, userId, role, userDeptId, availableMonths,
    periodType, periodValue, taskHoursMap, taskHoursByPlan, assigneesByPlan, allAssignees,
    procedureMap, processMap, userMap, deptMap, qpMap, normCtx,
  });

  return result;
}
