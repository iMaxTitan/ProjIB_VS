/**
 * API endpoint для расчёта KPI
 * GET /api/kpi?year=2026&periodType=month|quarter|year&periodValue=2
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/api/request-guards';
import type { KPIResponse, KPIMetricRow, KPIPlanRow, KPITrendPoint } from '@/components/dashboard/content/kpi/types';

// --- DB singleton (service-role) ---

let _db: ReturnType<typeof createClient> | null = null;
function getDb() {
  if (_db) return _db;
  _db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  return _db;
}

// --- Rate limit ---
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

const KPI_NORM = 70;
const VACATION_CALENDAR_DAYS_PER_YEAR = 24;
const HOURS_PER_DAY = 8;

// --- Helpers ---

function calcKPI(actual: number, planned: number): number {
  return planned > 0 ? Math.round((actual / planned) * 1000) / 10 : 0;
}

/** Count Mon-Fri working days in a given month (no holidays). If upToDay given, only count 1..upToDay. */
function getWorkingDaysInMonth(year: number, month: number, upToDay?: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  const maxDay = upToDay != null ? Math.min(upToDay, daysInMonth) : daysInMonth;
  let count = 0;
  for (let d = 1; d <= maxDay; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/** Available working hours for one employee in a period, minus proportional vacation.
 *  For the current month in the current year, only counts working days up to today. */
function getAvailableHours(year: number, months: number[]): number {
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const today = now.getDate();

  let totalWorkingDays = 0;
  let effectiveMonths = 0;

  for (const m of months) {
    if (isCurrentYear && m === curMonth) {
      // Current month: only count working days up to today
      totalWorkingDays += getWorkingDaysInMonth(year, m, today);
      const daysInMonth = new Date(year, m, 0).getDate();
      effectiveMonths += today / daysInMonth;
    } else {
      totalWorkingDays += getWorkingDaysInMonth(year, m);
      effectiveMonths += 1;
    }
  }

  // 24 calendar days → ~17.14 working days/year, proportional to effective period
  const vacationWorkingDays = (VACATION_CALENDAR_DAYS_PER_YEAR * 5 / 7) * (effectiveMonths / 12);
  return Math.max(0, totalWorkingDays - vacationWorkingDays) * HOURS_PER_DAY;
}

function getMonthsForPeriod(periodType: string, periodValue?: number): number[] {
  if (periodType === 'month' && periodValue) return [periodValue];
  if (periodType === 'quarter' && periodValue) {
    const start = (periodValue - 1) * 3 + 1;
    return [start, start + 1, start + 2];
  }
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

function getQuarterForMonth(month: number): number {
  return Math.ceil(month / 3);
}

function getQuarterMonths(quarter: number): number[] {
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

// --- Row types ---

type PlanRow = {
  monthly_plan_id: string;
  year: number;
  month: number;
  planned_hours: number | null;
  measure_id: string | null;
  quarterly_id: string | null;
};

type QuarterlyRow = {
  quarterly_id: string;
  department_id: string | null;
  process_id: string | null;
  quarter: number;
};

type TaskAggRow = {
  monthly_plan_id: string;
  user_id: string | null;
  total_spent_hours: number;
  tasks_count: number;
};

type AssigneeRow = {
  monthly_plan_id: string;
  user_id: string;
};

type MeasureRef = { measure_id: string; name: string; process_id: string | null };
type ProcessRef = { process_id: string; process_name: string; department_id: string | null };
type DeptRef = { department_id: string; department_name: string };
type UserRef = { user_id: string; full_name: string | null; department_id: string | null };

// --- Main handler ---

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
  const periodType = url.searchParams.get('periodType') || 'year';
  const periodValue = url.searchParams.get('periodValue') ? Number(url.searchParams.get('periodValue')) : undefined;

  if (year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
  }
  if (!['month', 'quarter', 'year'].includes(periodType)) {
    return NextResponse.json({ error: 'Invalid periodType' }, { status: 400 });
  }

  try {
    const db = getDb();
    const data = await computeKPI(db, userId, year, periodType, periodValue);
    return NextResponse.json(data);
  } catch (err) {
    logger.error('[KPI API] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// --- Core KPI computation ---

async function computeKPI(
  db: ReturnType<typeof createClient>,
  userId: string,
  year: number,
  periodType: string,
  periodValue?: number,
): Promise<KPIResponse> {
  const months = getMonthsForPeriod(periodType, periodValue);

  // 1. Current user profile
  const { data: profile } = await db
    .from('user_profiles')
    .select('role, department_id, full_name')
    .eq('user_id', userId)
    .single();

  const role = (profile?.role || 'employee') as 'chief' | 'head' | 'employee';
  const userDeptId = profile?.department_id as string | null;

  // 2. All months we need (main period + trend)
  let allMonths: number[];
  if (role === 'employee' && periodType === 'month' && periodValue) {
    // Employee: need full quarter for trend
    const q = getQuarterForMonth(periodValue);
    allMonths = getQuarterMonths(q);
  } else if (role === 'head' && periodType === 'quarter') {
    // Head: need all 12 months for quarterly trend
    allMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  } else {
    allMonths = months;
  }

  // 3. Parallel data fetching
  const [plansRes, qpRes, taskAggRes, assigneesRes, measuresRes, processesRes, deptsRes, usersRes] = await Promise.all([
    db.from('monthly_plans')
      .select('monthly_plan_id, year, month, planned_hours, measure_id, quarterly_id')
      .eq('year', year)
      .in('month', allMonths)
      .in('status', ['active', 'completed']),
    db.from('quarterly_plans')
      .select('quarterly_id, department_id, process_id, quarter'),
    // Will be filtered by planIds after
    db.from('v_task_hours_by_plan_user')
      .select('monthly_plan_id, user_id, total_spent_hours, tasks_count'),
    db.from('monthly_plan_assignees')
      .select('monthly_plan_id, user_id'),
    db.from('measures')
      .select('measure_id, name, process_id')
      .eq('is_active', true),
    db.from('processes')
      .select('process_id, process_name, department_id'),
    db.from('departments')
      .select('department_id, department_name'),
    db.from('user_profiles')
      .select('user_id, full_name, department_id'),
  ]);

  const plans = (plansRes.data || []) as PlanRow[];
  const qps = (qpRes.data || []) as QuarterlyRow[];
  const allTaskAgg = (taskAggRes.data || []) as TaskAggRow[];
  const allAssignees = (assigneesRes.data || []) as AssigneeRow[];
  const measures = (measuresRes.data || []) as MeasureRef[];
  const processes = (processesRes.data || []) as ProcessRef[];
  const depts = (deptsRes.data || []) as DeptRef[];
  const users = (usersRes.data || []) as UserRef[];

  if (plans.length === 0) {
    return emptyResult(year, periodType, periodValue, role);
  }

  // Build lookup maps
  const planIds = new Set(plans.map(p => p.monthly_plan_id));
  const qpMap = new Map(qps.map(q => [q.quarterly_id, q]));
  const measureMap = new Map(measures.map(m => [m.measure_id, m]));
  const processMap = new Map(processes.map(p => [p.process_id, p]));
  const deptMap = new Map(depts.map(d => [d.department_id, d]));
  const userMap = new Map(users.map(u => [u.user_id, u]));

  // Filter task aggregations to our plan scope
  const taskAgg = allTaskAgg.filter(t => planIds.has(t.monthly_plan_id));

  // Assignees per plan + count
  const assigneesByPlan = new Map<string, string[]>();
  for (const a of allAssignees) {
    if (!planIds.has(a.monthly_plan_id)) continue;
    const list = assigneesByPlan.get(a.monthly_plan_id) || [];
    list.push(a.user_id);
    assigneesByPlan.set(a.monthly_plan_id, list);
  }

  // Task hours: planId+userId → hours
  const taskHoursMap = new Map<string, number>();
  const taskHoursByPlan = new Map<string, number>();
  for (const t of taskAgg) {
    const key = `${t.monthly_plan_id}:${t.user_id || 'all'}`;
    taskHoursMap.set(key, (taskHoursMap.get(key) || 0) + t.total_spent_hours);
    taskHoursByPlan.set(t.monthly_plan_id, (taskHoursByPlan.get(t.monthly_plan_id) || 0) + t.total_spent_hours);
  }

  // Resolve department for a plan (primary: quarterly_plans, fallback: measure→process→department)
  function getPlanDeptId(plan: PlanRow): string | null {
    if (plan.quarterly_id) {
      const qp = qpMap.get(plan.quarterly_id);
      if (qp?.department_id) return qp.department_id;
    }
    if (plan.measure_id) {
      const m = measureMap.get(plan.measure_id);
      if (m?.process_id) {
        const p = processMap.get(m.process_id);
        if (p?.department_id) return p.department_id;
      }
    }
    return null;
  }

  // Resolve process for a plan
  function getPlanProcessId(plan: PlanRow): string | null {
    if (plan.quarterly_id) {
      const qp = qpMap.get(plan.quarterly_id);
      if (qp?.process_id) return qp.process_id;
    }
    if (plan.measure_id) {
      const m = measureMap.get(plan.measure_id);
      if (m?.process_id) return m.process_id;
    }
    return null;
  }

  // --- Filter plans by role ---
  const mainMonthsSet = new Set(months);

  // Plans in the main period (for overall + breakdowns)
  let filteredPlans: PlanRow[];
  if (role === 'employee') {
    const myPlanIds = new Set(
      allAssignees.filter(a => a.user_id === userId).map(a => a.monthly_plan_id)
    );
    filteredPlans = plans.filter(p => myPlanIds.has(p.monthly_plan_id) && mainMonthsSet.has(p.month));
  } else if (role === 'head') {
    filteredPlans = plans.filter(p => {
      if (!mainMonthsSet.has(p.month)) return false;
      return getPlanDeptId(p) === userDeptId;
    });
  } else {
    // chief: all plans in main period
    filteredPlans = plans.filter(p => mainMonthsSet.has(p.month));
  }

  // --- Overall KPI ---
  let totalPlanned = 0;
  let totalActual = 0;

  // Cap months to current month for current/future year (don't count months that haven't happened yet)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  let availableMonths = months;
  if (year === currentYear) {
    availableMonths = months.filter(m => m <= currentMonth);
  } else if (year > currentYear) {
    availableMonths = [];
  }

  // Calendar-based capacity (100%) and norm (70%) for one employee
  const fullCapacity = getAvailableHours(year, availableMonths);
  const employeeNormHours = Math.round(fullCapacity * KPI_NORM / 100 * 10) / 10;

  if (role === 'employee') {
    // Employee: planned = norm (70% of capacity), actual = their logged hours
    totalPlanned = employeeNormHours;
    for (const p of filteredPlans) {
      totalActual += taskHoursMap.get(`${p.monthly_plan_id}:${userId}`) || 0;
    }
  } else {
    // Head/Chief: full planned hours from plans, all actual hours
    for (const p of filteredPlans) {
      totalPlanned += p.planned_hours || 0;
      totalActual += taskHoursByPlan.get(p.monthly_plan_id) || 0;
    }
  }

  const overallKPI = calcKPI(totalActual, totalPlanned);

  // --- byProcess ---
  const procAgg = new Map<string, { planned: number; actual: number; deptId: string | null; employees: Set<string> }>();
  for (const p of filteredPlans) {
    const procId = getPlanProcessId(p) || '__none__';
    const agg = procAgg.get(procId) || { planned: 0, actual: 0, deptId: null, employees: new Set<string>() };
    agg.planned += p.planned_hours || 0;
    agg.actual += taskHoursByPlan.get(p.monthly_plan_id) || 0;
    if (!agg.deptId) agg.deptId = getPlanDeptId(p);
    const assignees = assigneesByPlan.get(p.monthly_plan_id) || [];
    for (const uid of assignees) agg.employees.add(uid);
    procAgg.set(procId, agg);
  }

  // Count how many processes each employee participates in PER DEPARTMENT (for bench splitting)
  // employee → department → count of processes
  const empDeptProcessCount = new Map<string, Map<string, number>>();
  Array.from(procAgg.entries()).forEach(([, agg]) => {
    const deptId = agg.deptId || '__none__';
    Array.from(agg.employees).forEach(uid => {
      let deptMap2 = empDeptProcessCount.get(uid);
      if (!deptMap2) { deptMap2 = new Map(); empDeptProcessCount.set(uid, deptMap2); }
      deptMap2.set(deptId, (deptMap2.get(deptId) || 0) + 1);
    });
  });

  const byProcess: KPIMetricRow[] = Array.from(procAgg.entries()).map(([procId, agg]) => {
    const proc = processMap.get(procId);
    const dept = agg.deptId ? deptMap.get(agg.deptId) : null;
    const deptId = agg.deptId || '__none__';
    // Bench: each employee contributes normHours / (processes they're in within THIS department)
    let bench = 0;
    Array.from(agg.employees).forEach(uid => {
      const countInDept = empDeptProcessCount.get(uid)?.get(deptId) || 1;
      bench += employeeNormHours / countInDept;
    });
    return {
      id: procId,
      name: proc?.process_name || 'Без категорії',
      departmentName: dept?.department_name || 'Без відділу',
      planned: Math.round(agg.planned * 10) / 10,
      actual: Math.round(agg.actual * 10) / 10,
      kpi: calcKPI(agg.actual, agg.planned),
      bench: Math.round(bench * 10) / 10,
    };
  }).sort((a, b) => b.planned - a.planned);

  // --- Build response ---
  const result: KPIResponse = {
    period: { year, type: periodType as KPIResponse['period']['type'], value: periodValue },
    role,
    norm: KPI_NORM,
    overall: {
      planned: Math.round(totalPlanned * 10) / 10,
      actual: Math.round(totalActual * 10) / 10,
      kpi: overallKPI,
    },
    byProcess,
  };

  // --- Employee: myPlans + monthTrend ---
  if (role === 'employee') {
    const myPlanIds = new Set(
      allAssignees.filter(a => a.user_id === userId).map(a => a.monthly_plan_id)
    );

    result.myPlans = filteredPlans.map(p => {
      const assignees = assigneesByPlan.get(p.monthly_plan_id) || [];
      const count = Math.max(assignees.length, 1);
      const planned = (p.planned_hours || 0) / count;
      const actual = taskHoursMap.get(`${p.monthly_plan_id}:${userId}`) || 0;
      const measure = p.measure_id ? measureMap.get(p.measure_id) : null;
      const procId = getPlanProcessId(p);
      const proc = procId ? processMap.get(procId) : null;

      return {
        planId: p.monthly_plan_id,
        measureName: measure?.name || 'Без мероприятия',
        processName: proc?.process_name || 'Без процесу',
        month: p.month,
        planned: Math.round(planned * 10) / 10,
        actual: Math.round(actual * 10) / 10,
        kpi: calcKPI(actual, planned),
        assigneeCount: count,
      } satisfies KPIPlanRow;
    }).sort((a, b) => b.planned - a.planned);

    // monthTrend: KPI per month for the quarter (calendar-based plan)
    if (periodType === 'month' && periodValue) {
      const q = getQuarterForMonth(periodValue);
      const qMonths = getQuarterMonths(q);
      const myPlansAll = plans.filter(p => myPlanIds.has(p.monthly_plan_id));

      result.monthTrend = qMonths.map(m => {
        const monthNorm = Math.round(getAvailableHours(year, [m]) * KPI_NORM / 100 * 10) / 10;
        let mActual = 0;
        for (const p of myPlansAll) {
          if (p.month !== m) continue;
          mActual += taskHoursMap.get(`${p.monthly_plan_id}:${userId}`) || 0;
        }
        return { period: m, planned: monthNorm, actual: Math.round(mActual * 10) / 10, kpi: calcKPI(mActual, monthNorm) };
      });
    }
  }

  // --- Head: byEmployee + quarterTrend ---
  if (role === 'head' || role === 'chief') {
    // byEmployee — plan is calendar-based (available working hours), not from plans
    const empActual = new Map<string, { actual: number; deptId: string | null }>();

    // Collect unique employees from assignees of filtered plans
    for (const p of filteredPlans) {
      const assignees = assigneesByPlan.get(p.monthly_plan_id) || [];
      for (const uid of assignees) {
        const agg = empActual.get(uid) || { actual: 0, deptId: null };
        agg.actual += taskHoursMap.get(`${p.monthly_plan_id}:${uid}`) || 0;
        if (!agg.deptId) {
          const u = userMap.get(uid);
          agg.deptId = u?.department_id || null;
        }
        empActual.set(uid, agg);
      }
    }

    result.byEmployee = Array.from(empActual.entries()).map(([uid, agg]) => {
      const u = userMap.get(uid);
      const dept = agg.deptId ? deptMap.get(agg.deptId) : null;
      return {
        id: uid,
        name: u?.full_name || 'Невідомий',
        departmentName: dept?.department_name || '',
        planned: employeeNormHours,
        actual: Math.round(agg.actual * 10) / 10,
        kpi: calcKPI(agg.actual, employeeNormHours),
      };
    }).sort((a, b) => b.kpi - a.kpi);
  }

  // --- Head: quarterTrend ---
  if (role === 'head') {
    const deptPlans = plans.filter(p => getPlanDeptId(p) === userDeptId);
    result.quarterTrend = [1, 2, 3, 4].map(q => {
      const qm = new Set(getQuarterMonths(q));
      let qPlanned = 0;
      let qActual = 0;
      for (const p of deptPlans) {
        if (!qm.has(p.month)) continue;
        qPlanned += p.planned_hours || 0;
        qActual += taskHoursByPlan.get(p.monthly_plan_id) || 0;
      }
      return { period: q, planned: Math.round(qPlanned * 10) / 10, actual: Math.round(qActual * 10) / 10, kpi: calcKPI(qActual, qPlanned) };
    });
  }

  // --- Chief: byDepartment + byQuarter ---
  if (role === 'chief') {
    // byDepartment — track planned, actual, and unique employees for bench
    const deptAgg = new Map<string, { planned: number; actual: number; employees: Set<string> }>();
    for (const p of filteredPlans) {
      const deptId = getPlanDeptId(p) || '__none__';
      const agg = deptAgg.get(deptId) || { planned: 0, actual: 0, employees: new Set<string>() };
      agg.planned += p.planned_hours || 0;
      agg.actual += taskHoursByPlan.get(p.monthly_plan_id) || 0;
      // Track unique employees assigned to plans in this dept
      const assignees = assigneesByPlan.get(p.monthly_plan_id) || [];
      for (const uid of assignees) agg.employees.add(uid);
      deptAgg.set(deptId, agg);
    }

    result.byDepartment = Array.from(deptAgg.entries()).map(([deptId, agg]) => {
      const dept = deptMap.get(deptId);
      const bench = agg.employees.size * employeeNormHours;
      return {
        id: deptId,
        name: dept?.department_name || 'Без відділу',
        departmentName: dept?.department_name || 'Без відділу',
        planned: Math.round(agg.planned * 10) / 10,
        actual: Math.round(agg.actual * 10) / 10,
        kpi: calcKPI(agg.actual, agg.planned),
        bench: Math.round(bench * 10) / 10,
      };
    }).sort((a, b) => b.planned - a.planned);

    // byQuarter: all plans for the year grouped by quarter
    const allYearPlans = plans; // already filtered by year
    result.byQuarter = [1, 2, 3, 4].map(q => {
      const qm = new Set(getQuarterMonths(q));
      let qPlanned = 0;
      let qActual = 0;
      for (const p of allYearPlans) {
        if (!qm.has(p.month)) continue;
        qPlanned += p.planned_hours || 0;
        qActual += taskHoursByPlan.get(p.monthly_plan_id) || 0;
      }
      return { period: q, planned: Math.round(qPlanned * 10) / 10, actual: Math.round(qActual * 10) / 10, kpi: calcKPI(qActual, qPlanned) };
    });

    // quarterTrend (same as byQuarter for chief)
    result.quarterTrend = result.byQuarter;
  }

  return result;
}

function emptyResult(year: number, periodType: string, periodValue: number | undefined, role: string): KPIResponse {
  return {
    period: { year, type: periodType as KPIResponse['period']['type'], value: periodValue },
    role: role as KPIResponse['role'],
    norm: KPI_NORM,
    overall: { planned: 0, actual: 0, kpi: 0 },
    byProcess: [],
  };
}
