import { createClient } from '@/lib/shared/postgrest-client';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';
import { isRequestAuthorized, getDbUserId } from '@/lib/shared/api/request-guards';
import type { MonthProcessItem } from '@/components/dashboard/reports/types';

// ─── Supabase service-role (lazy singleton) ───
let _db: ReturnType<typeof createClient> | null = null;
function getDb() {
  if (_db) return _db;
  const url = config.db.serverUrl;
  const key = config.db.serviceRoleKey;
  _db = createClient(url, key, { auth: { persistSession: false } });
  return _db;
}

interface MonthSummaryResponse {
  processes: MonthProcessItem[];
  procedures: MonthProcessItem[];
  companies: MonthProcessItem[];
  employees: MonthProcessItem[];
  departments: MonthProcessItem[];
}

/**
 * GET /api/reports/month-summary?year=2026&month=1
 * Aggregates 5 report tabs on the server (7 queries → 1 API call from browser).
 */
export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const yearStr = req.nextUrl.searchParams.get('year');
  const monthStr = req.nextUrl.searchParams.get('month');
  if (!yearStr || !monthStr) {
    return NextResponse.json({ error: 'year and month required' }, { status: 400 });
  }

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year/month' }, { status: 400 });
  }

  try {
    const db = getDb();

    // ─── Step 1: Plans with joins ───
    const { data: rawPlans, error: plansError } = await db
      .from('monthly_plans')
      .select(`
        monthly_plan_id,
        status,
        distribution_type,
        procedures (
          procedure_id,
          name,
          service_name,
          process_id,
          processes (process_name)
        ),
        quarterly_plans (
          department_id,
          departments (department_name)
        )
      `)
      .eq('year', year)
      .eq('month', month)
      .in('status', ['active', 'done']);

    if (plansError) throw plansError;

    type PlanRow = {
      monthly_plan_id: string;
      status: string | null;
      procedures?: { procedure_id?: string | null; name?: string | null; service_name?: string | null; process_id?: string | null; processes?: { process_name?: string | null } | { process_name?: string | null }[] | null } | { procedure_id?: string | null; name?: string | null; service_name?: string | null; process_id?: string | null; processes?: { process_name?: string | null } | { process_name?: string | null }[] | null }[] | null;
      quarterly_plans?: { department_id?: string | null; departments?: { department_name?: string | null } | { department_name?: string | null }[] | null } | { department_id?: string | null; departments?: { department_name?: string | null } | { department_name?: string | null }[] | null }[] | null;
    };

    const plans = (rawPlans || []) as PlanRow[];
    if (plans.length === 0) {
      const empty: MonthSummaryResponse = { processes: [], procedures: [], companies: [], employees: [], departments: [] };
      return NextResponse.json(empty);
    }

    const planMap = new Map(plans.map(p => [p.monthly_plan_id, p]));
    const planIds = plans.map(p => p.monthly_plan_id);

    // ─── Step 2: Task aggregation + company view (parallel) ───
    type TaskAggRow = { monthly_plan_id: string; user_id: string | null; total_spent_hours: number; tasks_count: number };
    type ViewCompanyRow = { monthly_plan_id: string; company_id: string; distributed_hours: number; tasks_count: number };

    const [taskAggResult, viewCompanyResult] = await Promise.all([
      db.from('v_task_hours_by_plan_user')
        .select('monthly_plan_id, user_id, total_spent_hours, tasks_count')
        .in('monthly_plan_id', planIds),
      db.from('v_plan_user_company_hours')
        .select('monthly_plan_id, company_id, distributed_hours, tasks_count')
        .in('monthly_plan_id', planIds),
    ]);

    if (taskAggResult.error) throw taskAggResult.error;
    if (viewCompanyResult.error) throw viewCompanyResult.error;

    const taskAgg = (taskAggResult.data || []) as TaskAggRow[];
    const viewCompanyRows = (viewCompanyResult.data || []) as ViewCompanyRow[];

    // ─── Step 3: Users + departments + companies + timesheet (parallel) ───
    const userIds = Array.from(new Set(taskAgg.map(r => r.user_id).filter((id): id is string => Boolean(id))));
    const uniqueCompanyIds = Array.from(new Set(viewCompanyRows.map(r => r.company_id)));

    const [usersResult, companiesResult] = await Promise.all([
      userIds.length > 0
        ? db.from('user_profiles').select('user_id, full_name, department_id').in('user_id', userIds)
        : Promise.resolve({ data: [], error: null }),
      uniqueCompanyIds.length > 0
        ? db.from('companies').select('company_id, company_name').in('company_id', uniqueCompanyIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const usersMap = new Map<string, { full_name: string; department_id: string | null }>();
    for (const row of (usersResult.data || []) as { user_id: string; full_name: string | null; department_id: string | null }[]) {
      usersMap.set(row.user_id, { full_name: row.full_name || 'Неизвестно', department_id: row.department_id });
    }

    const deptIds = Array.from(new Set(Array.from(usersMap.values()).map(u => u.department_id).filter((id): id is string => Boolean(id))));

    const [deptsResult, timesheetResult] = await Promise.all([
      deptIds.length > 0
        ? db.from('departments').select('department_id, department_name').in('department_id', deptIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length > 0
        ? db.from('employee_timesheet').select('user_id, work_hours').eq('year', year).eq('month', month).in('user_id', userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const deptMap = new Map<string, string>();
    for (const row of (deptsResult.data || []) as { department_id: string; department_name: string | null }[]) {
      deptMap.set(row.department_id, row.department_name || 'Без отдела');
    }

    const companyNameMap = new Map<string, string>();
    for (const c of (companiesResult.data || []) as { company_id: string; company_name: string | null }[]) {
      companyNameMap.set(c.company_id, c.company_name || 'Без предприятия');
    }

    const timesheetCapacity = new Map<string, number>();
    for (const ts of (timesheetResult.data || []) as { user_id: string; work_hours: number | null }[]) {
      timesheetCapacity.set(ts.user_id, Number(ts.work_hours) || 0);
    }

    // ─── Aggregation: statsByPlan ───
    const statsByPlan = new Map<string, { hours: number; tasks: number }>();
    for (const row of taskAgg) {
      const cur = statsByPlan.get(row.monthly_plan_id) || { hours: 0, tasks: 0 };
      cur.hours += Number(row.total_spent_hours) || 0;
      cur.tasks += Number(row.tasks_count) || 0;
      statsByPlan.set(row.monthly_plan_id, cur);
    }

    // ─── Tab: Employees ───
    const employeeAggMap = new Map<string, MonthProcessItem>();
    const departmentSummaryMap = new Map<string, MonthProcessItem>();
    const departmentEmployeeSets = new Map<string, Set<string>>();

    for (const row of taskAgg) {
      const plan = planMap.get(row.monthly_plan_id);
      if (!plan) continue;
      const uid = row.user_id || 'unknown-user';
      const u = usersMap.get(uid);
      const employeeName = u?.full_name || 'Неизвестно';
      const deptId = u?.department_id || 'unknown-department';
      const deptName = deptMap.get(deptId) || 'Без отдела';
      const hours = Number(row.total_spent_hours) || 0;
      const tasks = Number(row.tasks_count) || 0;

      // Employee
      const empCurrent = employeeAggMap.get(uid) || {
        key: uid, processId: uid, processName: employeeName,
        scopeId: deptId, scopeName: deptName,
        activeCount: 0, completedCount: 0, tasksCount: 0, totalHours: 0,
      };
      if (plan.status === 'active') empCurrent.activeCount += 1;
      if (plan.status === 'done') empCurrent.completedCount += 1;
      empCurrent.tasksCount += tasks;
      empCurrent.totalHours += hours;
      employeeAggMap.set(uid, empCurrent);

      // Department
      const deptCurrent = departmentSummaryMap.get(deptId) || {
        key: deptId, processId: deptId, processName: deptName,
        scopeId: deptId, scopeName: deptName,
        activeCount: 0, completedCount: 0, tasksCount: 0, totalHours: 0,
      };
      if (plan.status === 'active') deptCurrent.activeCount += 1;
      if (plan.status === 'done') deptCurrent.completedCount += 1;
      deptCurrent.tasksCount += tasks;
      deptCurrent.totalHours += hours;
      departmentSummaryMap.set(deptId, deptCurrent);

      if (uid !== 'unknown-user') {
        const empSet = departmentEmployeeSets.get(deptId) || new Set<string>();
        empSet.add(uid);
        departmentEmployeeSets.set(deptId, empSet);
      }
    }

    // Department capacity
    departmentSummaryMap.forEach((item, deptId) => {
      item.employeesCount = departmentEmployeeSets.get(deptId)?.size || 0;
      let totalCapacity = 0;
      const empSet = departmentEmployeeSets.get(deptId);
      if (empSet) {
        Array.from(empSet).forEach(uid => {
          totalCapacity += timesheetCapacity.get(uid) || 0;
        });
      }
      item.capacityHours = totalCapacity * 0.70;
    });

    // ─── Tab: Processes + Procedures ───
    const processAggMap = new Map<string, MonthProcessItem>();
    const procedureAggMap = new Map<string, MonthProcessItem>();
    const companyAggMap = new Map<string, MonthProcessItem>();

    for (const plan of plans) {
      const proc = Array.isArray(plan.procedures) ? plan.procedures[0] : plan.procedures;
      const processRel = Array.isArray(proc?.processes) ? proc?.processes[0] : proc?.processes;
      const quarterly = Array.isArray(plan.quarterly_plans) ? plan.quarterly_plans[0] : plan.quarterly_plans;
      const deptRel = Array.isArray(quarterly?.departments) ? quarterly?.departments[0] : quarterly?.departments;
      const processId = proc?.process_id || 'unknown-process';
      const processName = processRel?.process_name || 'Без процесса';
      const departmentId = quarterly?.department_id || 'unknown-department';
      const departmentName = deptRel?.department_name || 'Без отдела';
      const key = `${departmentId}::${processId}`;
      const stats = statsByPlan.get(plan.monthly_plan_id);

      // Process tab
      const current = processAggMap.get(key) || {
        key, processId, processName,
        scopeId: departmentId, scopeName: departmentName,
        activeCount: 0, completedCount: 0, tasksCount: 0, totalHours: 0,
      };
      if (plan.status === 'active') current.activeCount += 1;
      if (plan.status === 'done') current.completedCount += 1;
      current.totalHours += stats?.hours || 0;
      current.tasksCount += stats?.tasks || 0;
      processAggMap.set(key, current);

      // Procedure tab
      const procedureId = proc?.procedure_id || `unknown-procedure-${plan.monthly_plan_id}`;
      const procedureName = proc?.service_name || proc?.name || 'Без процедуры';
      const procedureKey = `${departmentId}::${procedureId}`;
      const procedureCurrent = procedureAggMap.get(procedureKey) || {
        key: procedureKey, processId: procedureId, processName: procedureName,
        scopeId: departmentId, scopeName: departmentName,
        activeCount: 0, completedCount: 0, tasksCount: 0, totalHours: 0,
      };
      if (plan.status === 'active') procedureCurrent.activeCount += 1;
      if (plan.status === 'done') procedureCurrent.completedCount += 1;
      procedureCurrent.totalHours += stats?.hours || 0;
      procedureCurrent.tasksCount += stats?.tasks || 0;
      procedureAggMap.set(procedureKey, procedureCurrent);
    }

    // ─── Tab: Companies ───
    for (const row of viewCompanyRows) {
      const plan = planMap.get(row.monthly_plan_id);
      if (!plan) continue;
      const proc = Array.isArray(plan.procedures) ? plan.procedures[0] : plan.procedures;
      const processRel = Array.isArray(proc?.processes) ? proc?.processes[0] : proc?.processes;
      const processId = proc?.process_id || 'unknown-process';
      const processName = processRel?.process_name || 'Без процесса';
      const companyId = row.company_id || 'unknown-company';
      const companyName = companyNameMap.get(companyId) || 'Без предприятия';
      const adjustedHours = Number(row.distributed_hours) || 0;
      const tasksCnt = Number(row.tasks_count) || 0;
      const companyKey = `${companyId}::${processId}`;
      const companyCurrent = companyAggMap.get(companyKey) || {
        key: companyKey, processId, processName,
        scopeId: companyId, scopeName: companyName,
        activeCount: 0, completedCount: 0, tasksCount: 0, totalHours: 0,
      };
      if (plan.status === 'active') companyCurrent.activeCount += 1;
      if (plan.status === 'done') companyCurrent.completedCount += 1;
      companyCurrent.totalHours += adjustedHours;
      companyCurrent.tasksCount += tasksCnt;
      companyAggMap.set(companyKey, companyCurrent);
    }

    // ─── Sort & round ───
    const sortByScope = (a: MonthProcessItem, b: MonthProcessItem) => {
      const byScope = a.scopeName.localeCompare(b.scopeName, 'ru');
      return byScope !== 0 ? byScope : a.processName.localeCompare(b.processName, 'ru');
    };
    const roundHours = (item: MonthProcessItem): MonthProcessItem => ({
      ...item,
      totalHours: Math.round(item.totalHours * 100) / 100,
    });

    const processResult = Array.from(processAggMap.values()).map(roundHours).sort(sortByScope);
    const procedureResult = Array.from(procedureAggMap.values()).map(roundHours).sort(sortByScope);
    const companyRows = Array.from(companyAggMap.values()).map(roundHours).sort((a, b) => b.totalHours - a.totalHours);

    // Company summary (group by company)
    const companySummaryMap = new Map<string, MonthProcessItem>();
    for (const row of companyRows) {
      const cur = companySummaryMap.get(row.scopeId) || {
        key: row.scopeId, processId: 'company-summary', processName: 'Сводно',
        scopeId: row.scopeId, scopeName: row.scopeName,
        activeCount: 0, completedCount: 0, tasksCount: 0, totalHours: 0,
      };
      cur.activeCount += row.activeCount;
      cur.completedCount += row.completedCount;
      cur.tasksCount += row.tasksCount;
      cur.totalHours += row.totalHours;
      companySummaryMap.set(row.scopeId, cur);
    }
    const companySummaryResult = Array.from(companySummaryMap.values()).map(roundHours).sort((a, b) => b.totalHours - a.totalHours);

    const employeeResult = Array.from(employeeAggMap.values()).map(roundHours).sort(sortByScope);
    const departmentResult = Array.from(departmentSummaryMap.values()).map(roundHours).sort((a, b) => b.totalHours - a.totalHours);

    const response: MonthSummaryResponse = {
      processes: processResult,
      procedures: procedureResult,
      companies: companySummaryResult,
      employees: employeeResult,
      departments: departmentResult,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    logger.error('[month-summary] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
