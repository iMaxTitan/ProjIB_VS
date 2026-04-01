/**
 * Quarterly departments data loader.
 * Moved from components/dashboard/reports/quarterly-dept-data.ts
 */

import { getReportClient } from './types';
import type { QuarterlyReportGroup, MonthProcessItem } from './types';

export async function loadQuarterlyDeptData(group: QuarterlyReportGroup): Promise<MonthProcessItem[]> {
  const db = getReportClient();
  const quarterlyIds = group.plans.map(p => p.quarterly_id);

  type MPlanRow = { monthly_plan_id: string; procedure_id: string | null; quarterly_id: string; status: string | null; year: number; month: number; planned_hours: number | null };
  const { data: rawPlans, error: plansErr } = await db
    .from('monthly_plans')
    .select('monthly_plan_id, procedure_id, quarterly_id, status, year, month, planned_hours')
    .in('quarterly_id', quarterlyIds)
    .in('status', ['active', 'done']);
  if (plansErr) throw plansErr;
  const mPlans = (rawPlans || []) as MPlanRow[];
  if (mPlans.length === 0) return [];

  const planIds = mPlans.map(p => p.monthly_plan_id);

  type TaskAggRow = { monthly_plan_id: string; user_id: string | null; total_spent_hours: number; tasks_count: number };
  const { data: rawTaskAgg, error: taskErr } = await db
    .from('v_task_hours_by_plan_user')
    .select('monthly_plan_id, user_id, total_spent_hours, tasks_count')
    .in('monthly_plan_id', planIds);
  if (taskErr) throw taskErr;
  const taskAgg = (rawTaskAgg || []) as TaskAggRow[];

  const statsByPlan = new Map<string, { hours: number; tasks: number }>();
  for (const row of taskAgg) {
    const cur = statsByPlan.get(row.monthly_plan_id) || { hours: 0, tasks: 0 };
    cur.hours += Number(row.total_spent_hours) || 0;
    cur.tasks += Number(row.tasks_count) || 0;
    statsByPlan.set(row.monthly_plan_id, cur);
  }

  const procIds = Array.from(new Set(mPlans.map(p => p.procedure_id).filter((id): id is string => Boolean(id))));
  type ProcRow = { procedure_id: string; name: string | null; process_id: string | null; processes: { process_name: string | null } | { process_name: string | null }[] | null };
  const processMap = new Map<string, { processId: string; processName: string; procedureId: string; procedureName: string }>();
  if (procIds.length > 0) {
    const { data: procRows } = await db
      .from('procedures')
      .select('procedure_id, name, process_id, processes(process_name)')
      .in('procedure_id', procIds);
    for (const row of (procRows || []) as ProcRow[]) {
      const proc = Array.isArray(row.processes) ? row.processes[0] : row.processes;
      processMap.set(row.procedure_id, {
        processId: row.process_id || 'unknown-process',
        processName: proc?.process_name || 'Без процесса',
        procedureId: row.procedure_id,
        procedureName: row.name || 'Без назви',
      });
    }
  }

  const deptByQuarterly = new Map<string, { deptId: string; deptName: string }>();
  for (const plan of group.plans) {
    deptByQuarterly.set(plan.quarterly_id, {
      deptId: plan.department_id || plan.department_name || 'unknown',
      deptName: plan.department_name || 'Без отдела',
    });
  }

  const aggMap = new Map<string, MonthProcessItem>();
  for (const mp of mPlans) {
    const procInfo = processMap.get(mp.procedure_id || '') || { processId: 'unknown-process', processName: 'Без процесса', procedureId: mp.procedure_id || 'unknown', procedureName: 'Без назви' };
    const deptInfo = deptByQuarterly.get(mp.quarterly_id) || { deptId: 'unknown', deptName: 'Без отдела' };
    const stats = statsByPlan.get(mp.monthly_plan_id);
    const hours = stats?.hours || 0;
    const tasks = stats?.tasks || 0;
    const planned = Number(mp.planned_hours) || 0;
    if (hours <= 0 && planned <= 0) continue;

    const key = `${deptInfo.deptId}::${procInfo.processId}::${procInfo.procedureId}`;
    const cur = aggMap.get(key) || {
      key, processId: procInfo.processId, processName: procInfo.processName,
      procedureId: procInfo.procedureId, procedureName: procInfo.procedureName,
      scopeId: deptInfo.deptId, scopeName: deptInfo.deptName,
      activeCount: 0, completedCount: 0, tasksCount: 0, totalHours: 0, plannedHours: 0,
    };
    if (mp.status === 'active') cur.activeCount += 1;
    if (mp.status === 'done') cur.completedCount += 1;
    cur.totalHours += hours;
    cur.tasksCount += tasks;
    cur.plannedHours = (cur.plannedHours || 0) + planned;
    aggMap.set(key, cur);
  }

  const uniqueDeptIds = Array.from(new Set(Array.from(aggMap.values()).map(item => item.scopeId).filter(id => id !== 'unknown')));
  const deptEmployeeMap = new Map<string, string[]>();
  if (uniqueDeptIds.length > 0) {
    const { data: empRows } = await db
      .from('user_profiles')
      .select('user_id, department_id')
      .in('department_id', uniqueDeptIds);
    for (const emp of (empRows || []) as { user_id: string; department_id: string }[]) {
      const list = deptEmployeeMap.get(emp.department_id) || [];
      list.push(emp.user_id);
      deptEmployeeMap.set(emp.department_id, list);
    }
  }

  const quarterMonths = [(group.quarter - 1) * 3 + 1, (group.quarter - 1) * 3 + 2, (group.quarter - 1) * 3 + 3];
  const allDeptEmployees = Array.from(new Set(Array.from(deptEmployeeMap.values()).flat()));
  const capacityByUser = new Map<string, number>();
  if (allDeptEmployees.length > 0) {
    const { data: tsRows } = await db
      .from('employee_timesheet')
      .select('user_id, work_hours')
      .eq('year', group.year)
      .in('month', quarterMonths)
      .in('user_id', allDeptEmployees);
    for (const ts of (tsRows || [])) {
      const uid = ts.user_id as string;
      capacityByUser.set(uid, (capacityByUser.get(uid) || 0) + (Number(ts.work_hours) || 0));
    }
  }

  aggMap.forEach((item) => {
    const empList = deptEmployeeMap.get(item.scopeId) || [];
    item.employeesCount = empList.length;
    let totalCap = 0;
    for (const uid of empList) totalCap += capacityByUser.get(uid) || 0;
    item.capacityHours = totalCap * 0.70;
  });

  return Array.from(aggMap.values())
    .map(item => ({ ...item, totalHours: Math.round(item.totalHours * 100) / 100 }))
    .sort((a, b) => {
      const bySc = a.scopeName.localeCompare(b.scopeName, 'ru');
      return bySc !== 0 ? bySc : a.processName.localeCompare(b.processName, 'ru');
    });
}
