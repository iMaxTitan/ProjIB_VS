/**
 * Role-specific KPI computation — employee, head, chief sections.
 * Extracted from computeKPI in kpi.service.ts.
 */

import type { KPIResponse, KPIPlanRow } from '@/components/dashboard/kpi/types';
import {
  calcKPI,
  getQuarterForMonth,
  getQuarterMonths,
  getPlanDeptId,
  getPlanProcessId,
  getEmployeeNormForPeriod,
  type EmployeeNormContext,
} from './helpers';
import type {
  PlanRow,
  QuarterlyRow,
  AssigneeRow,
  ProcedureRef,
  ProcessRef,
  DeptRef,
  UserRef,
} from './types';

export interface RoleKPIContext {
  filteredPlans: PlanRow[];
  plans: PlanRow[];
  userId: string;
  role: 'employee' | 'head' | 'chief';
  userDeptId: string | null;
  availableMonths: number[];
  periodType: string;
  periodValue?: number;
  taskHoursMap: Map<string, number>;
  taskHoursByPlan: Map<string, number>;
  assigneesByPlan: Map<string, string[]>;
  allAssignees: AssigneeRow[];
  procedureMap: Map<string, ProcedureRef>;
  processMap: Map<string, ProcessRef>;
  userMap: Map<string, UserRef>;
  deptMap: Map<string, DeptRef>;
  qpMap: Map<string, QuarterlyRow>;
  normCtx: EmployeeNormContext;
}

export function addRoleSpecificKPI(result: KPIResponse, ctx: RoleKPIContext): void {
  const {
    filteredPlans, plans, userId, role, userDeptId, availableMonths, periodType, periodValue,
    taskHoursMap, taskHoursByPlan, assigneesByPlan, allAssignees,
    procedureMap, processMap, userMap, deptMap, qpMap, normCtx,
  } = ctx;

  if (role === 'employee') {
    const myPlanIds = new Set(
      allAssignees.filter(a => a.user_id === userId).map(a => a.monthly_plan_id)
    );
    result.myPlans = filteredPlans.map(p => {
      const assignees = assigneesByPlan.get(p.monthly_plan_id) || [];
      const count = Math.max(assignees.length, 1);
      const planned = (p.planned_hours || 0) / count;
      const actual = taskHoursMap.get(`${p.monthly_plan_id}:${userId}`) || 0;
      const procedure = p.procedure_id ? procedureMap.get(p.procedure_id) : null;
      const procId = getPlanProcessId(p, qpMap, procedureMap);
      const proc = procId ? processMap.get(procId) : null;
      return {
        planId: p.monthly_plan_id,
        procedureName: procedure?.name || 'Без процедуры',
        processName: proc?.process_name || 'Без процесу',
        month: p.month,
        planned: Math.round(planned * 10) / 10,
        actual: Math.round(actual * 10) / 10,
        kpi: calcKPI(actual, planned),
        assigneeCount: count,
      } satisfies KPIPlanRow;
    }).sort((a, b) => b.planned - a.planned);

    if (periodType === 'month' && periodValue) {
      const q = getQuarterForMonth(periodValue);
      const qMonths = getQuarterMonths(q);
      const myPlansAll = plans.filter(p => myPlanIds.has(p.monthly_plan_id));
      result.monthTrend = qMonths.map(m => {
        const monthNorm = getEmployeeNormForPeriod(userId, [m], normCtx);
        let mActual = 0;
        for (const p of myPlansAll) {
          if (p.month !== m) continue;
          mActual += taskHoursMap.get(`${p.monthly_plan_id}:${userId}`) || 0;
        }
        return { period: m, planned: monthNorm, actual: Math.round(mActual * 10) / 10, kpi: calcKPI(mActual, monthNorm) };
      });
    }
  }

  if (role === 'head' || role === 'chief') {
    const empActual = new Map<string, { actual: number; deptId: string | null }>();
    for (const p of filteredPlans) {
      const assignees = assigneesByPlan.get(p.monthly_plan_id) || [];
      for (const uid of assignees) {
        const agg = empActual.get(uid) || { actual: 0, deptId: null };
        agg.actual += taskHoursMap.get(`${p.monthly_plan_id}:${uid}`) || 0;
        if (!agg.deptId) agg.deptId = userMap.get(uid)?.department_id || null;
        empActual.set(uid, agg);
      }
    }
    result.byEmployee = Array.from(empActual.entries()).map(([uid, agg]) => {
      const u = userMap.get(uid);
      const dept = agg.deptId ? deptMap.get(agg.deptId) : null;
      const empNorm = getEmployeeNormForPeriod(uid, availableMonths, normCtx);
      return {
        id: uid,
        name: u?.full_name || 'Невідомий',
        departmentName: dept?.department_name || '',
        planned: empNorm,
        actual: Math.round(agg.actual * 10) / 10,
        kpi: calcKPI(agg.actual, empNorm),
      };
    }).sort((a, b) => b.kpi - a.kpi);
  }

  if (role === 'head') {
    const deptPlans = plans.filter(p => getPlanDeptId(p, qpMap, procedureMap, processMap) === userDeptId);
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

  if (role === 'chief') {
    const deptAgg = new Map<string, { planned: number; actual: number; employees: Set<string> }>();
    for (const p of filteredPlans) {
      const deptId = getPlanDeptId(p, qpMap, procedureMap, processMap) || '__none__';
      const agg = deptAgg.get(deptId) || { planned: 0, actual: 0, employees: new Set<string>() };
      agg.planned += p.planned_hours || 0;
      agg.actual += taskHoursByPlan.get(p.monthly_plan_id) || 0;
      for (const uid of (assigneesByPlan.get(p.monthly_plan_id) || [])) agg.employees.add(uid);
      deptAgg.set(deptId, agg);
    }
    result.byDepartment = Array.from(deptAgg.entries()).map(([deptId, agg]) => {
      const dept = deptMap.get(deptId);
      let bench = 0;
      Array.from(agg.employees).forEach(uid => { bench += getEmployeeNormForPeriod(uid, availableMonths, normCtx); });
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

    result.byQuarter = [1, 2, 3, 4].map(q => {
      const qm = new Set(getQuarterMonths(q));
      let qPlanned = 0;
      let qActual = 0;
      for (const p of plans) {
        if (!qm.has(p.month)) continue;
        qPlanned += p.planned_hours || 0;
        qActual += taskHoursByPlan.get(p.monthly_plan_id) || 0;
      }
      return { period: q, planned: Math.round(qPlanned * 10) / 10, actual: Math.round(qActual * 10) / 10, kpi: calcKPI(qActual, qPlanned) };
    });
    result.quarterTrend = result.byQuarter;
  }
}
