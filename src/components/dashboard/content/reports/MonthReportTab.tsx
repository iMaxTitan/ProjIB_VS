'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';

import { PlanStatus } from '@/types/planning';
import { getStatusColorClasses } from '@/lib/utils/planning-utils';
import {
  getReportClient,
  formatHours,
} from '@/lib/services/monthly-report.service';
import { getCompanyShare } from '@/lib/utils/hour-distribution';
import type { HourDistributionType } from '@/types/infrastructure';
import { CalendarDays, Building2, Users, Briefcase, Target, BarChart3, FileSpreadsheet } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import logger from '@/lib/logger';
import { useIsMobile } from '@/hooks/useMediaQuery';
import * as ExcelJS from 'exceljs';
import {
  TwoPanelLayout,
  GradientDetailCard,
  GroupHeader,
  ReferenceListItem,
  reportTableStyles,
  reportTableRowClass,
  reportSegmentedButtonClass,
  reportActionButtonClass,
  MobileDetailsFab,
} from '../shared';
import { MONTH_NAMES_RU, safeNumber, getTimestamp } from './report-utils';
import type { MonthProcessItem, MonthPeriodItem } from './types';

type MonthRightTab = 'process' | 'procedure' | 'company' | 'employee' | 'department';

interface MonthReportTabProps {
  tabsSlot: React.ReactNode;
}

export default function MonthReportTab({ tabsSlot }: MonthReportTabProps) {
  const isMobile = useIsMobile();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Periods
  const [monthPeriods, setMonthPeriods] = useState<MonthPeriodItem[]>([]);
  const [monthPeriodsLoading, setMonthPeriodsLoading] = useState(false);
  const [expandedYearGroups, setExpandedYearGroups] = useState<Record<string, boolean>>({});

  // Filters
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  // Reports data
  const [monthReports, setMonthReports] = useState<MonthProcessItem[]>([]);
  const [monthProcedureReports, setMonthProcedureReports] = useState<MonthProcessItem[]>([]);
  const [monthCompanySummaryReports, setMonthCompanySummaryReports] = useState<MonthProcessItem[]>([]);
  const [monthEmployeeReports, setMonthEmployeeReports] = useState<MonthProcessItem[]>([]);
  const [monthDepartmentSummaryReports, setMonthDepartmentSummaryReports] = useState<MonthProcessItem[]>([]);
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthExportingXlsx, setMonthExportingXlsx] = useState(false);
  const [monthRightTab, setMonthRightTab] = useState<MonthRightTab>('company');
  const [error, setError] = useState<string | null>(null);

  // Load available periods
  const loadMonthPeriods = useCallback(async () => {
    setMonthPeriodsLoading(true);
    setError(null);
    try {
      type PeriodPlanRow = { monthly_plan_id: string; year: number; month: number };
      type PeriodTaskAggRow = { monthly_plan_id: string; total_spent_hours: number; tasks_count: number };

      const db = getReportClient();
      const { data: rawPlans, error: plansError } = await db
        .from('monthly_plans')
        .select('monthly_plan_id, year, month')
        .in('status', ['active', 'completed']);
      if (plansError) throw plansError;

      const plans = (rawPlans || []) as PeriodPlanRow[];
      if (plans.length === 0) { setMonthPeriods([]); return; }

      const planIds = plans.map((p) => p.monthly_plan_id);
      const { data: rawTaskAgg, error: taskAggError } = await db
        .from('v_task_hours_by_plan_user')
        .select('monthly_plan_id, total_spent_hours, tasks_count')
        .in('monthly_plan_id', planIds);
      if (taskAggError) throw taskAggError;

      const aggByPlan = new Map<string, { tasks: number; hours: number }>();
      for (const row of (rawTaskAgg || []) as PeriodTaskAggRow[]) {
        const cur = aggByPlan.get(row.monthly_plan_id) || { tasks: 0, hours: 0 };
        cur.tasks += Number(row.tasks_count) || 0;
        cur.hours += Number(row.total_spent_hours) || 0;
        aggByPlan.set(row.monthly_plan_id, cur);
      }

      const periodMap = new Map<string, MonthPeriodItem>();
      for (const plan of plans) {
        const stats = aggByPlan.get(plan.monthly_plan_id);
        if (!stats || stats.tasks <= 0) continue;
        const key = `${plan.year}-${String(plan.month).padStart(2, '0')}`;
        const current = periodMap.get(key) || { key, year: plan.year, month: plan.month, tasksCount: 0, totalHours: 0 };
        current.tasksCount += stats.tasks;
        current.totalHours += stats.hours;
        periodMap.set(key, current);
      }

      const periods = Array.from(periodMap.values())
        .map((p) => ({ ...p, totalHours: Math.round(p.totalHours * 100) / 100 }))
        .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));

      setMonthPeriods(periods);
    } catch (err: unknown) {
      setError('Ошибка загрузки доступных месяцев');
      logger.error(err);
      setMonthPeriods([]);
    } finally {
      setMonthPeriodsLoading(false);
    }
  }, []);

  // Load month reports
  const loadMonthReports = useCallback(async () => {
    setMonthLoading(true);
    setError(null);
    try {
      type MonthPlanRow = {
        monthly_plan_id: string;
        status: string | null;
        distribution_type: string | null;
        measures?: {
          measure_id?: string | null;
          name?: string | null;
          service_name?: string | null;
          process_id?: string | null;
          processes?: { process_name?: string | null } | { process_name?: string | null }[] | null;
        } | {
          measure_id?: string | null;
          name?: string | null;
          service_name?: string | null;
          process_id?: string | null;
          processes?: { process_name?: string | null } | { process_name?: string | null }[] | null;
        }[] | null;
        quarterly_plans?: {
          department_id?: string | null;
          departments?: { department_name?: string | null } | { department_name?: string | null }[] | null;
        } | {
          department_id?: string | null;
          departments?: { department_name?: string | null } | { department_name?: string | null }[] | null;
        }[] | null;
      };
      type PlanCompanyRow = {
        monthly_plan_id: string;
        company_id: string;
        companies?: { company_name?: string | null } | { company_name?: string | null }[] | null;
      };
      type TaskAggRow = {
        monthly_plan_id: string;
        user_id: string | null;
        total_spent_hours: number;
        tasks_count: number;
      };

      const db = getReportClient();
      const { data: rawPlans, error: plansError } = await db
        .from('monthly_plans')
        .select(`
          monthly_plan_id,
          status,
          distribution_type,
          measures (
            measure_id,
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
        .eq('year', selectedYear)
        .eq('month', selectedMonth)
        .in('status', ['active', 'completed']);

      if (plansError) throw plansError;
      const plans = (rawPlans || []) as MonthPlanRow[];
      if (plans.length === 0) {
        setMonthReports([]);
        setMonthProcedureReports([]);
        setMonthCompanySummaryReports([]);
        setMonthEmployeeReports([]);
        setMonthDepartmentSummaryReports([]);
        return;
      }

      const planMap = new Map(plans.map((p) => [p.monthly_plan_id, p]));
      const planIds = plans.map((p) => p.monthly_plan_id);
      const { data: rawTaskAgg, error: taskAggError } = await db
        .from('v_task_hours_by_plan_user')
        .select('monthly_plan_id, user_id, total_spent_hours, tasks_count')
        .in('monthly_plan_id', planIds);
      if (taskAggError) throw taskAggError;

      const taskAgg = (rawTaskAgg || []) as TaskAggRow[];
      const userIds = Array.from(new Set(taskAgg.map((r) => r.user_id).filter((id): id is string => Boolean(id))));
      const usersMap = new Map<string, { full_name: string; department_id: string | null }>();
      if (userIds.length > 0) {
        const { data: users } = await db.from('user_profiles').select('user_id, full_name, department_id').in('user_id', userIds);
        for (const row of (users || [])) {
          usersMap.set(row.user_id as string, { full_name: (row.full_name as string) || 'Неизвестно', department_id: (row.department_id as string | null) || null });
        }
      }

      const deptIds = Array.from(new Set(Array.from(usersMap.values()).map((u) => u.department_id).filter((id): id is string => Boolean(id))));
      const deptMap = new Map<string, string>();
      if (deptIds.length > 0) {
        const { data: depts } = await db.from('departments').select('department_id, department_name').in('department_id', deptIds);
        for (const row of (depts || [])) {
          deptMap.set(row.department_id as string, (row.department_name as string) || 'Без отдела');
        }
      }

      const statsByPlan = new Map<string, { hours: number; tasks: number }>();
      for (const row of taskAgg) {
        const current = statsByPlan.get(row.monthly_plan_id) || { hours: 0, tasks: 0 };
        current.hours += Number(row.total_spent_hours) || 0;
        current.tasks += Number(row.tasks_count) || 0;
        statsByPlan.set(row.monthly_plan_id, current);
      }

      const employeeAggMap = new Map<string, MonthProcessItem>();
      const departmentSummaryMap = new Map<string, MonthProcessItem>();
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

        const empCurrent = employeeAggMap.get(uid) || {
          key: uid, processId: uid, processName: employeeName,
          scopeId: deptId, scopeName: deptName,
          activeCount: 0, completedCount: 0, tasksCount: 0, totalHours: 0,
        };
        if (plan.status === 'active') empCurrent.activeCount += 1;
        if (plan.status === 'completed') empCurrent.completedCount += 1;
        empCurrent.tasksCount += tasks;
        empCurrent.totalHours += hours;
        employeeAggMap.set(uid, empCurrent);

        const deptCurrent = departmentSummaryMap.get(deptId) || {
          key: deptId, processId: deptId, processName: deptName,
          scopeId: deptId, scopeName: deptName,
          activeCount: 0, completedCount: 0, tasksCount: 0, totalHours: 0,
        };
        if (plan.status === 'active') deptCurrent.activeCount += 1;
        if (plan.status === 'completed') deptCurrent.completedCount += 1;
        deptCurrent.tasksCount += tasks;
        deptCurrent.totalHours += hours;
        departmentSummaryMap.set(deptId, deptCurrent);
      }

      const { data: rawPlanCompanies, error: pcError } = await db
        .from('monthly_plan_companies')
        .select('monthly_plan_id, company_id, companies (company_name)')
        .in('monthly_plan_id', planIds);
      if (pcError) throw pcError;
      const planCompanies = (rawPlanCompanies || []) as PlanCompanyRow[];
      const companiesByPlan = new Map<string, PlanCompanyRow[]>();
      for (const row of planCompanies) {
        const list = companiesByPlan.get(row.monthly_plan_id) || [];
        list.push(row);
        companiesByPlan.set(row.monthly_plan_id, list);
      }

      const { data: infra } = await db
        .from('company_infrastructure')
        .select('company_id, servers_count, workstations_count')
        .eq('period_year', selectedYear)
        .eq('period_month', selectedMonth);
      const infraMap = new Map<string, { servers_count: number; workstations_count: number }>();
      for (const row of (infra || [])) {
        infraMap.set(row.company_id as string, {
          servers_count: Number(row.servers_count) || 0,
          workstations_count: Number(row.workstations_count) || 0,
        });
      }

      const aggMap = new Map<string, MonthProcessItem>();
      const procedureAggMap = new Map<string, MonthProcessItem>();
      const companyAggMap = new Map<string, MonthProcessItem>();
      for (const plan of plans) {
        const measure = Array.isArray(plan.measures) ? plan.measures[0] : plan.measures;
        const processRel = Array.isArray(measure?.processes) ? measure?.processes[0] : measure?.processes;
        const quarterly = Array.isArray(plan.quarterly_plans) ? plan.quarterly_plans[0] : plan.quarterly_plans;
        const deptRel = Array.isArray(quarterly?.departments) ? quarterly?.departments[0] : quarterly?.departments;
        const processId = measure?.process_id || 'unknown-process';
        const processName = processRel?.process_name || 'Без процесса';
        const departmentId = quarterly?.department_id || 'unknown-department';
        const departmentName = deptRel?.department_name || 'Без отдела';
        const key = `${departmentId}::${processId}`;

        const current = aggMap.get(key) || {
          key, processId, processName,
          scopeId: departmentId, scopeName: departmentName,
          activeCount: 0, completedCount: 0, tasksCount: 0, totalHours: 0,
        };
        if (plan.status === 'active') current.activeCount += 1;
        if (plan.status === 'completed') current.completedCount += 1;
        current.totalHours += statsByPlan.get(plan.monthly_plan_id)?.hours || 0;
        current.tasksCount += statsByPlan.get(plan.monthly_plan_id)?.tasks || 0;
        aggMap.set(key, current);

        const procedureId = measure?.measure_id || `unknown-procedure-${plan.monthly_plan_id}`;
        const procedureName = measure?.service_name || measure?.name || 'Без процедуры';
        const procedureKey = `${departmentId}::${procedureId}`;
        const procedureCurrent = procedureAggMap.get(procedureKey) || {
          key: procedureKey, processId: procedureId, processName: procedureName,
          scopeId: departmentId, scopeName: departmentName,
          activeCount: 0, completedCount: 0, tasksCount: 0, totalHours: 0,
        };
        if (plan.status === 'active') procedureCurrent.activeCount += 1;
        if (plan.status === 'completed') procedureCurrent.completedCount += 1;
        procedureCurrent.totalHours += statsByPlan.get(plan.monthly_plan_id)?.hours || 0;
        procedureCurrent.tasksCount += statsByPlan.get(plan.monthly_plan_id)?.tasks || 0;
        procedureAggMap.set(procedureKey, procedureCurrent);
      }

      for (const [planId, rows] of Array.from(companiesByPlan.entries())) {
        const plan = planMap.get(planId);
        if (!plan) continue;
        const measure = Array.isArray(plan.measures) ? plan.measures[0] : plan.measures;
        const processRel = Array.isArray(measure?.processes) ? measure?.processes[0] : measure?.processes;
        const processId = measure?.process_id || 'unknown-process';
        const processName = processRel?.process_name || 'Без процесса';
        const planHours = statsByPlan.get(planId)?.hours || 0;
        const planTasks = statsByPlan.get(planId)?.tasks || 0;
        const companyIds = rows.map((r) => r.company_id);
        const distType = (plan.distribution_type as HourDistributionType) || 'even';

        for (const row of rows) {
          const companyRel = Array.isArray(row.companies) ? row.companies[0] : row.companies;
          const companyName = companyRel?.company_name || 'Без предприятия';
          const companyId = row.company_id || 'unknown-company';
          const share = getCompanyShare(companyId, companyIds, infraMap, distType);
          const adjustedHours = Math.round(planHours * share * 100) / 100;
          const companyKey = `${companyId}::${processId}`;
          const companyCurrent = companyAggMap.get(companyKey) || {
            key: companyKey, processId, processName,
            scopeId: companyId, scopeName: companyName,
            activeCount: 0, completedCount: 0, tasksCount: 0, totalHours: 0,
          };
          if (plan.status === 'active') companyCurrent.activeCount += 1;
          if (plan.status === 'completed') companyCurrent.completedCount += 1;
          companyCurrent.totalHours += adjustedHours;
          companyCurrent.tasksCount += planTasks;
          companyAggMap.set(companyKey, companyCurrent);
        }
      }

      const sortByScope = (a: MonthProcessItem, b: MonthProcessItem) => {
        const byScope = a.scopeName.localeCompare(b.scopeName, 'ru');
        return byScope !== 0 ? byScope : a.processName.localeCompare(b.processName, 'ru');
      };
      const roundHours = (item: MonthProcessItem) => ({ ...item, totalHours: Math.round(item.totalHours * 100) / 100 });

      const result = Array.from(aggMap.values()).map(roundHours).sort(sortByScope);
      const procedureResult = Array.from(procedureAggMap.values()).map(roundHours).sort(sortByScope);
      const companyRows = Array.from(companyAggMap.values()).map(roundHours).sort((a, b) => b.totalHours - a.totalHours);

      const companySummaryMap = new Map<string, MonthProcessItem>();
      for (const row of companyRows) {
        const current = companySummaryMap.get(row.scopeId) || {
          key: row.scopeId, processId: 'company-summary', processName: 'Сводно',
          scopeId: row.scopeId, scopeName: row.scopeName,
          activeCount: 0, completedCount: 0, tasksCount: 0, totalHours: 0,
        };
        current.activeCount += row.activeCount;
        current.completedCount += row.completedCount;
        current.tasksCount += row.tasksCount;
        current.totalHours += row.totalHours;
        companySummaryMap.set(row.scopeId, current);
      }
      const companySummaryResult = Array.from(companySummaryMap.values()).map(roundHours).sort((a, b) => b.totalHours - a.totalHours);
      const employeeResult = Array.from(employeeAggMap.values()).map(roundHours).sort(sortByScope);
      const departmentResult = Array.from(departmentSummaryMap.values()).map(roundHours).sort((a, b) => b.totalHours - a.totalHours);

      setMonthReports(result);
      setMonthProcedureReports(procedureResult);
      setMonthCompanySummaryReports(companySummaryResult);
      setMonthEmployeeReports(employeeResult);
      setMonthDepartmentSummaryReports(departmentResult);
    } catch (err: unknown) {
      setError('Ошибка загрузки месячной сводки');
      logger.error(err);
      setMonthReports([]);
      setMonthProcedureReports([]);
      setMonthCompanySummaryReports([]);
      setMonthEmployeeReports([]);
      setMonthDepartmentSummaryReports([]);
    } finally {
      setMonthLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => { loadMonthPeriods(); }, [loadMonthPeriods]);
  useEffect(() => { loadMonthReports(); }, [loadMonthReports]);

  // Auto-select period
  useEffect(() => {
    if (monthPeriods.length === 0) return;
    const hasSelected = monthPeriods.some((p) => p.year === selectedYear && p.month === selectedMonth);
    if (!hasSelected) {
      const first = monthPeriods[0];
      setSelectedYear(first.year);
      setSelectedMonth(first.month);
    }
  }, [monthPeriods, selectedYear, selectedMonth]);

  // Group periods by year
  const groupedMonthPeriods = useMemo(() => {
    const groups = new Map<string, { key: string; year: number; periods: MonthPeriodItem[] }>();
    for (const period of monthPeriods) {
      const gk = String(period.year);
      if (!groups.has(gk)) groups.set(gk, { key: gk, year: period.year, periods: [] });
      groups.get(gk)!.periods.push(period);
    }
    const result = Array.from(groups.values());
    for (const group of result) group.periods.sort((a, b) => b.month - a.month);
    return result.sort((a, b) => b.year - a.year);
  }, [monthPeriods]);

  useEffect(() => {
    if (groupedMonthPeriods.length === 0) return;
    const availableYears = Array.from(new Set(groupedMonthPeriods.map((g) => g.key)));
    const next = { ...expandedYearGroups };
    for (const key of availableYears) {
      if (next[key] === undefined) next[key] = false;
    }
    setExpandedYearGroups(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedMonthPeriods]);

  // XLSX export
  const handleExportMonthXlsx = useCallback(async () => {
    const monthTableRows = monthRightTab === 'process'
      ? monthReports
      : monthRightTab === 'procedure'
        ? monthProcedureReports
        : monthRightTab === 'company'
          ? monthCompanySummaryReports
          : monthRightTab === 'employee'
            ? monthEmployeeReports
            : monthDepartmentSummaryReports;

    if (!monthTableRows.length) return;

    const showScopeColumn = monthRightTab === 'process' || monthRightTab === 'procedure' || monthRightTab === 'employee';
    const mainHeader = monthRightTab === 'process' ? 'Процесс'
      : monthRightTab === 'procedure' ? 'Процедура'
        : monthRightTab === 'employee' ? 'Сотрудник'
          : monthRightTab === 'department' ? 'Отдел'
            : 'Предприятие';

    setMonthExportingXlsx(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Сводная');

      ws.addRow(['Сводная']);
      ws.addRow([`${MONTH_NAMES_RU[selectedMonth - 1]} ${selectedYear}`]);
      ws.addRow([]);

      const header = showScopeColumn
        ? ['№', mainHeader, 'Отдел', 'Задачи', 'Часы', 'Статус']
        : ['№', mainHeader, 'Задачи', 'Часы', 'Статус'];
      ws.addRow(header);

      monthTableRows.forEach((row, idx) => {
        const active = safeNumber(row.activeCount);
        const completed = safeNumber(row.completedCount);
        const statusText = active > 0 && completed > 0
          ? `${active}/${completed}`
          : active > 0 ? String(active)
            : completed > 0 ? String(completed)
              : '0';
        const mainValue = monthRightTab === 'company' || monthRightTab === 'department' ? row.scopeName : row.processName;
        const rowData = showScopeColumn
          ? [idx + 1, mainValue, row.scopeName, safeNumber(row.tasksCount), Number(safeNumber(row.totalHours).toFixed(2)), statusText]
          : [idx + 1, mainValue, safeNumber(row.tasksCount), Number(safeNumber(row.totalHours).toFixed(2)), statusText];
        ws.addRow(rowData);
      });

      const totalTasks = monthTableRows.reduce((sum, row) => sum + safeNumber(row.tasksCount), 0);
      const totalHours = Number(monthTableRows.reduce((sum, row) => sum + safeNumber(row.totalHours), 0).toFixed(2));
      ws.addRow(showScopeColumn ? ['Итого', '', '', totalTasks, totalHours, ''] : ['Итого', '', totalTasks, totalHours, '']);

      const headerRowIdx = 4;
      const totalRowIdx = ws.rowCount;
      ws.getRow(1).font = { bold: true, size: 14 };
      ws.getRow(2).font = { size: 11, color: { argb: 'FF64748B' } };
      ws.getRow(headerRowIdx).font = { bold: true };
      ws.getRow(totalRowIdx).font = { bold: true };

      ws.columns = showScopeColumn
        ? [{ width: 6 }, { width: 44 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 12 }]
        : [{ width: 6 }, { width: 44 }, { width: 12 }, { width: 12 }, { width: 12 }];

      const hoursCol = showScopeColumn ? 5 : 4;
      for (let i = headerRowIdx + 1; i <= totalRowIdx; i += 1) {
        ws.getRow(i).getCell(hoursCol).numFmt = '0.00';
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const modeName = monthRightTab === 'process' ? 'processes'
        : monthRightTab === 'procedure' ? 'procedures'
          : monthRightTab === 'company' ? 'companies'
            : monthRightTab === 'employee' ? 'employees'
              : 'departments';
      a.download = `report_${modeName}_${selectedMonth}_${selectedYear}(${getTimestamp()}).xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error('[reports] Ошибка экспорта месячной сводной в XLSX:', err);
      alert('Не удалось сформировать XLSX');
    } finally {
      setMonthExportingXlsx(false);
    }
  }, [monthRightTab, monthReports, monthProcedureReports, monthCompanySummaryReports, monthEmployeeReports, monthDepartmentSummaryReports, selectedMonth, selectedYear]);

  // --- Render ---

  const monthTableRows = monthRightTab === 'process'
    ? monthReports
    : monthRightTab === 'procedure'
      ? monthProcedureReports
      : monthRightTab === 'company'
        ? monthCompanySummaryReports
        : monthRightTab === 'employee'
          ? monthEmployeeReports
          : monthDepartmentSummaryReports;
  const showScopeColumn = monthRightTab === 'process' || monthRightTab === 'procedure' || monthRightTab === 'employee';

  const leftPanel = (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0">{tabsSlot}</div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 sm:p-2">
        {monthPeriodsLoading ? (
          <div className="flex justify-center items-center py-10"><Spinner /></div>
        ) : monthPeriods.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 rounded-lg">
            <CalendarDays className="w-12 h-12 mx-auto text-gray-300 mb-3" aria-hidden="true" />
            <p className="text-gray-500">Нет периодов с задачами</p>
            <p className="text-sm text-gray-400 mt-1">Для статусів active/completed ничего не найдено</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {groupedMonthPeriods.map((group) => {
              const isExpanded = expandedYearGroups[group.key] ?? false;
              return (
                <div key={group.key} className="rounded-xl border border-slate-200/80 bg-white/90 overflow-hidden">
                  <div className="p-2">
                    <GroupHeader
                      tone="purple"
                      title={String(group.year)}
                      count={group.periods.length}
                      showCount={false}
                      expanded={isExpanded}
                      onToggle={() => setExpandedYearGroups((prev) => ({ ...prev, [group.key]: !isExpanded }))}
                      toggleAriaLabel={`${isExpanded ? 'Свернуть' : 'Развернуть'} месяцы ${group.year} года`}
                    />
                  </div>
                  {isExpanded && (
                    <div className="px-2 pb-2 space-y-1 border-t border-slate-100 bg-slate-50/70">
                      {group.periods.map((period) => {
                        const isSelected = period.year === selectedYear && period.month === selectedMonth;
                        return (
                          <ReferenceListItem
                            key={period.key}
                            tone="purple"
                            isSelected={isSelected}
                            onClick={() => { setSelectedYear(period.year); setSelectedMonth(period.month); if (isMobile) setIsDrawerOpen(true); }}
                            ariaLabel={`Выбрать период ${MONTH_NAMES_RU[period.month - 1]} ${period.year}`}
                            className="px-2.5 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium text-slate-700">{MONTH_NAMES_RU[period.month - 1]}</div>
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span>{safeNumber(period.tasksCount)} задач</span>
                                <span>{formatHours(safeNumber(period.totalHours))}</span>
                              </div>
                            </div>
                          </ReferenceListItem>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const rightPanel = (() => {
    if (monthLoading) return (
      <div className="h-full min-h-0 overflow-auto">
        <GradientDetailCard
          modeLabel="Загрузка..."
          isEditing={false}
          canEdit={false}
          gradientClassName="from-purple-500 to-indigo-500"
          cardClassName="max-w-none w-full"
          bodyClassName="flex justify-center py-10"
        >
          <Spinner />
        </GradientDetailCard>
      </div>
    );

    return (
      <div className="h-full min-h-0 overflow-auto">
        <GradientDetailCard
          modeLabel="Просмотр"
          isEditing={false}
          canEdit={false}
          gradientClassName="from-purple-500 to-indigo-500"
          cardClassName="max-w-none w-full"
          bodyClassName="space-y-4"
          headerContent={
            <div className="min-w-0 flex items-center gap-3">
              <CalendarDays className="w-5 h-5 opacity-90" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-bold text-lg leading-tight">Сводная</div>
                <div className="text-xs text-white/80">{MONTH_NAMES_RU[selectedMonth - 1]} {selectedYear}</div>
              </div>
            </div>
          }
        >
          <div className="text-sm text-slate-700 font-semibold">
            {monthTableRows.length} {monthRightTab === 'process' ? 'процессов'
              : monthRightTab === 'procedure' ? 'процедур'
                : monthRightTab === 'employee' ? 'сотрудников'
                  : monthRightTab === 'department' ? 'отделов'
                    : 'предприятий'}
          </div>

          <div className={reportTableStyles.frame}>
            {monthTableRows.length ? (
              <div className={reportTableStyles.scroll}>
                <div className="px-3 sm:px-4 py-2.5 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2">
                  <div className={reportTableStyles.segmentedGroup} role="radiogroup" aria-label="Группировка месячной сводной">
                    <button type="button" role="radio" aria-checked={monthRightTab === 'company'} aria-label="Группировать по предприятиям" onClick={() => setMonthRightTab('company')} className={reportSegmentedButtonClass(monthRightTab === 'company')}>
                      <Building2 aria-hidden="true" className="h-3.5 w-3.5" />Предприятия
                    </button>
                    <button type="button" role="radio" aria-checked={monthRightTab === 'department'} aria-label="Группировать по отделам" onClick={() => setMonthRightTab('department')} className={reportSegmentedButtonClass(monthRightTab === 'department')}>
                      <Briefcase aria-hidden="true" className="h-3.5 w-3.5" />Отделы
                    </button>
                    <button type="button" role="radio" aria-checked={monthRightTab === 'employee'} aria-label="Группировать по сотрудникам" onClick={() => setMonthRightTab('employee')} className={reportSegmentedButtonClass(monthRightTab === 'employee')}>
                      <Users aria-hidden="true" className="h-3.5 w-3.5" />Сотрудники
                    </button>
                    <button type="button" role="radio" aria-checked={monthRightTab === 'procedure'} aria-label="Группировать по мероприятиям" onClick={() => setMonthRightTab('procedure')} className={reportSegmentedButtonClass(monthRightTab === 'procedure')}>
                      <Target aria-hidden="true" className="h-3.5 w-3.5" />Мероприятия
                    </button>
                    <button type="button" role="radio" aria-checked={monthRightTab === 'process'} aria-label="Группировать по процессам" onClick={() => setMonthRightTab('process')} className={reportSegmentedButtonClass(monthRightTab === 'process')}>
                      <BarChart3 aria-hidden="true" className="h-3.5 w-3.5" />Процессы
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportMonthXlsx}
                    disabled={monthExportingXlsx || monthTableRows.length === 0}
                    aria-label="Скачать месячную сводную в XLSX"
                    className={reportActionButtonClass('pdf')}
                  >
                    {monthExportingXlsx ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                        <span>XLSX...</span>
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet aria-hidden="true" className="w-4 h-4" />
                        <span>XLSX</span>
                      </>
                    )}
                  </button>
                </div>
                <table className={reportTableStyles.table}>
                  <colgroup>
                    <col style={{ width: '36px' }} />
                    <col style={monthRightTab === 'department' ? { width: '220px' } : undefined} />
                    {showScopeColumn && <col style={{ width: '92px' }} />}
                    <col style={{ width: '92px' }} />
                    <col style={{ width: '92px' }} />
                    <col style={{ width: '92px' }} />
                  </colgroup>
                  <thead className={reportTableStyles.thead}>
                    <tr className={reportTableStyles.headerRow}>
                      <th className="text-left px-2 py-2 font-semibold border-r border-slate-200/80">№</th>
                      <th className="text-left px-2 py-2 font-semibold border-r border-slate-200/80">
                        {monthRightTab === 'process' ? 'Процесс'
                          : monthRightTab === 'procedure' ? 'Процедура'
                            : monthRightTab === 'employee' ? 'Сотрудник'
                              : monthRightTab === 'department' ? 'Отдел'
                                : 'Предприятие'}
                      </th>
                      {showScopeColumn && <th className="text-center px-2 py-2 font-semibold border-r border-slate-200/80">Отдел</th>}
                      <th className="text-center px-2 py-2 font-semibold border-r border-slate-200/80">Задачи</th>
                      <th className="text-center px-2 py-2 font-semibold border-r border-slate-200/80">Часы</th>
                      <th className="text-center px-2 py-2 font-semibold">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthTableRows.map((row, idx) => (
                      <tr key={row.key} className={reportTableRowClass(idx, 'middle')}>
                        <td className="px-2 py-2 text-slate-500 border-r border-slate-100">{idx + 1}</td>
                        <td className="px-2 py-2 text-slate-700 leading-snug border-r border-slate-100 align-middle">
                          {monthRightTab === 'company' || monthRightTab === 'department' ? row.scopeName : row.processName}
                        </td>
                        {showScopeColumn && (
                          <td className="px-2 py-2 text-slate-600 leading-snug border-r border-slate-100 align-middle text-center">{row.scopeName}</td>
                        )}
                        <td className="px-2 py-2 text-slate-700 text-center tabular-nums border-r border-slate-100 align-middle">{safeNumber(row.tasksCount)}</td>
                        <td className="px-2 py-2 text-slate-700 text-center tabular-nums border-r border-slate-100 align-middle">{safeNumber(row.totalHours).toFixed(2)}</td>
                        <td className="px-1 py-2 text-center whitespace-nowrap">
                          {(() => {
                            const badges = [
                              { key: 'active', value: safeNumber(row.activeCount), className: getStatusColorClasses('active' as PlanStatus) },
                              { key: 'completed', value: safeNumber(row.completedCount), className: getStatusColorClasses('completed' as PlanStatus) },
                            ].filter((b) => b.value > 0);
                            const visibleBadges = badges.length > 0
                              ? badges
                              : [{ key: 'active-zero', value: 0, className: getStatusColorClasses('active' as PlanStatus) }];
                            return (
                              <span className="inline-flex items-center justify-center gap-1.5">
                                {visibleBadges.map((b) => (
                                  <span key={b.key} className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold leading-none ${b.className}`}>
                                    {b.value}
                                  </span>
                                ))}
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-300">
                      <td className="px-2 py-2 text-slate-800 font-semibold border-r border-slate-200/80" colSpan={showScopeColumn ? 3 : 2}>Итого</td>
                      <td className="px-2 py-2 text-slate-800 font-semibold text-center tabular-nums border-r border-slate-200/80">
                        {monthTableRows.reduce((sum, row) => sum + safeNumber(row.tasksCount), 0)}
                      </td>
                      <td className="px-2 py-2 text-slate-800 font-semibold text-center tabular-nums border-r border-slate-200/80">
                        {monthTableRows.reduce((sum, row) => sum + safeNumber(row.totalHours), 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-8 text-sm text-slate-500 text-center">Нет данных за выбранный период</div>
            )}
          </div>
        </GradientDetailCard>
      </div>
    );
  })();

  return (
    <>
      <TwoPanelLayout
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        isDrawerOpen={isDrawerOpen}
        onDrawerClose={() => setIsDrawerOpen(false)}
        rightPanelClassName="bg-white/20"
        resizerClassName="hover:bg-purple-300/50 active:bg-purple-400/50"
      />
      {isMobile && (
        <MobileDetailsFab onClick={() => setIsDrawerOpen(true)} />
      )}
    </>
  );
}
