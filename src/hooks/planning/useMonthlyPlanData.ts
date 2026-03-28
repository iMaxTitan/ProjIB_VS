/**
 * Data-loading hook for MonthlyPlanDetails.
 * Handles: companies/users dictionary, period infrastructure,
 * procedures, assignees (display), delete permissions, user assignment, tasks.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/shared/db-client';
import { getProcedures, canDeleteMonthlyPlan } from '@/lib/ops/plans';
import { getTasksByMonthlyPlanId, type DailyTaskRow } from '@/lib/ops/tasks/task-service';
import logger from '@/lib/shared/logger';
import type { MonthlyPlan, Procedure } from '@/types/planning';
import type { UserInfo } from '@/types/azure';
import type { HourDistributionType } from '@/types/infrastructure';

export interface AssigneeWithDetails {
  user_id: string;
  full_name: string;
  department_name?: string;
  photo_base64?: string;
  role?: string;
  department_id?: string;
}

export interface PlanCompany {
  company_id: string;
  company_name: string;
  has_servers?: boolean;
  servers_count?: number;
  workstations_count?: number;
}

export interface PlanTask {
  daily_task_id: string;
  description: string;
  title?: string | null;
  task_type?: string;
  source?: string;
  spent_hours: number;
  created_at: string;
  task_date: string;
  attachment_url?: string | null;
  document_number?: string | null;
  project_id?: string | null;
  kb_document_id?: string | null;
  user_id?: string;
  created_by?: string | null;
  created_by_role?: string | null;
  user_profiles?: { full_name: string | null; photo_base64?: string | null; role?: string | null } | null;
}

interface Params {
  plan: MonthlyPlan;
  user: UserInfo;
  isEditing: boolean;
  editQuarterlyId: string;
  editProcedureId: string;
  editMonth: number;
  editCompanyIds: string[];
  distributionType: HourDistributionType;
  tasksRefreshTrigger: number;
  isNewPlan: boolean;
  effectiveProcessId: string | null | undefined;
  effectiveProcessName: string;
}

const mapTaskRow = (row: DailyTaskRow): PlanTask => {
  const cbp = Array.isArray(row.created_by_profile) ? row.created_by_profile[0] : row.created_by_profile;
  return {
    ...row,
    created_by_role: cbp?.role ?? null,
    user_profiles: Array.isArray(row.user_profiles) ? row.user_profiles[0] ?? null : row.user_profiles ?? null,
  };
};

export function useMonthlyPlanData({
  plan, user, isEditing, editQuarterlyId, editProcedureId, editMonth,
  editCompanyIds, distributionType, tasksRefreshTrigger, isNewPlan,
  effectiveProcessId, effectiveProcessName,
}: Params) {
  const [allCompanies, setAllCompanies] = useState<PlanCompany[]>([]);
  const [allUsers, setAllUsers] = useState<AssigneeWithDetails[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [usedProcedureIds, setUsedProcedureIds] = useState<Set<string>>(new Set());
  const [assignees, setAssignees] = useState<AssigneeWithDetails[]>([]);
  const [periodInfra, setPeriodInfra] = useState<Map<string, { servers_count: number; workstations_count: number }>>(new Map());
  const [canDelete, setCanDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [isUserAssigned, setIsUserAssigned] = useState(false);
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Load companies + users dictionary
  useEffect(() => {
    const load = async () => {
      const { data: companies } = await supabase
        .from('v_companies_with_infrastructure')
        .select('company_id, company_name, has_servers, servers_count, workstations_count')
        .order('company_name');
      if (companies) setAllCompanies(companies as unknown as PlanCompany[]);

      let usersQuery = supabase
        .from('v_user_details')
        .select('user_id, full_name, department_name, photo_base64, role, department_id')
        .eq('status', 'active');
      if (user?.role === 'head' && user?.department_id) {
        usersQuery = usersQuery.eq('department_id', user.department_id);
      }
      const { data: users } = await usersQuery.order('full_name');
      if (users) setAllUsers(users as unknown as AssigneeWithDetails[]);
    };
    load();
  }, [user?.role, user?.department_id]);

  // Load period infrastructure
  useEffect(() => {
    const targetMonth = isEditing ? editMonth : plan.month;
    const targetYear = plan.year;
    if (!targetYear || !targetMonth) return;
    const fetch = async () => {
      const { data } = await supabase
        .from('company_infrastructure')
        .select('company_id, servers_count, workstations_count')
        .eq('period_year', targetYear)
        .eq('period_month', targetMonth);
      const map = new Map<string, { servers_count: number; workstations_count: number }>();
      if (data && data.length > 0) {
        for (const row of data) map.set(row.company_id, { servers_count: row.servers_count || 0, workstations_count: row.workstations_count || 0 });
      } else {
        for (const c of allCompanies) {
          if (c.servers_count || c.workstations_count) {
            map.set(c.company_id, { servers_count: c.servers_count || 0, workstations_count: c.workstations_count || 0 });
          }
        }
      }
      setPeriodInfra(map);
    };
    fetch();
  }, [plan.year, editMonth, isEditing, plan.month, allCompanies]);

  // Load procedures
  useEffect(() => {
    const fetch = async () => {
      if (effectiveProcessId) {
        try { setProcedures(await getProcedures(effectiveProcessId)); } catch (err) { logger.error('Error loading procedures:', err); }
      } else if (effectiveProcessName) {
        try {
          const data = await getProcedures();
          setProcedures(data.filter(m => (m.process_name || '').trim().toLowerCase() === effectiveProcessName.toLowerCase()));
        } catch (err) { logger.error('Error loading procedures:', err); }
      } else if (plan.procedure_id && !plan.procedure_name) {
        try { setProcedures(await getProcedures()); } catch (err) { logger.error('Error loading procedures:', err); }
      } else {
        setProcedures([]);
      }
    };
    fetch();
  }, [effectiveProcessId, effectiveProcessName, plan.procedure_id, plan.procedure_name]);

  // Load used procedure IDs for this quarterly + month
  useEffect(() => {
    if (!isEditing) { setUsedProcedureIds(new Set()); return; }
    const qId = editQuarterlyId;
    const m = editMonth;
    const y = plan.year;
    if (!qId || !m || !y) { setUsedProcedureIds(new Set()); return; }
    const fetch = async () => {
      const { data } = await supabase
        .from('monthly_plans')
        .select('procedure_id')
        .eq('quarterly_id', qId)
        .eq('year', y)
        .eq('month', m)
        .neq('monthly_plan_id', plan.monthly_plan_id);
      setUsedProcedureIds(new Set((data || []).map(r => r.procedure_id).filter(Boolean)));
    };
    fetch();
  }, [isEditing, editQuarterlyId, editMonth, plan.year, plan.monthly_plan_id]);

  // Load assignees display data
  useEffect(() => {
    if (isNewPlan) return;
    const fetch = async () => {
      try {
        const { data: assigneesData } = await supabase
          .from('monthly_plan_assignees')
          .select('user_id')
          .eq('monthly_plan_id', plan.monthly_plan_id);
        if (assigneesData && assigneesData.length > 0) {
          const ids = assigneesData.map(a => a.user_id);
          const { data: details } = await supabase
            .from('v_user_details')
            .select('user_id, full_name, department_name, photo_base64')
            .in('user_id', ids);
          if (details) setAssignees(details as unknown as AssigneeWithDetails[]);
        } else {
          setAssignees([]);
        }
      } catch (err) { logger.error('Error loading assignees:', err); }
    };
    fetch();
  }, [plan.monthly_plan_id, isNewPlan]);

  // Check delete permissions
  useEffect(() => {
    if (isNewPlan) { setCanDelete(false); return; }
    canDeleteMonthlyPlan(plan.monthly_plan_id, user.user_id, user.role).then(result => {
      setCanDelete(result.canDelete);
      setDeleteReason(result.reason || '');
    });
  }, [plan.monthly_plan_id, user.user_id, user.role, isNewPlan]);

  // Check if user is assigned
  useEffect(() => {
    if (isNewPlan || !plan.monthly_plan_id || !user?.user_id) { setIsUserAssigned(false); return; }
    supabase
      .from('monthly_plan_assignees')
      .select('user_id')
      .eq('monthly_plan_id', plan.monthly_plan_id)
      .eq('user_id', user.user_id)
      .maybeSingle()
      .then(({ data }) => setIsUserAssigned(!!data));
  }, [plan.monthly_plan_id, user?.user_id, isNewPlan]);

  // Load tasks
  useEffect(() => {
    if (isNewPlan || !plan.monthly_plan_id) { setTasks([]); return; }
    setTasksLoading(true);
    getTasksByMonthlyPlanId(plan.monthly_plan_id)
      .then((data: DailyTaskRow[]) => setTasks(data.map(mapTaskRow)))
      .catch(err => logger.error('Error loading tasks:', err))
      .finally(() => setTasksLoading(false));
  }, [plan.monthly_plan_id, isNewPlan, tasksRefreshTrigger, plan.tasks_count]);

  // Computed
  const availableProcedures = useMemo(() =>
    procedures.filter(m => m.procedure_id === editProcedureId || !usedProcedureIds.has(m.procedure_id)),
    [procedures, usedProcedureIds, editProcedureId],
  );

  const companyInfraMap = useMemo(() => {
    const map = new Map<string, { servers_count: number; workstations_count: number }>();
    for (const id of editCompanyIds) {
      const infra = periodInfra.get(id);
      const c = allCompanies.find(c => c.company_id === id);
      map.set(id, { servers_count: infra ? infra.servers_count : (c?.servers_count || 0), workstations_count: infra ? infra.workstations_count : (c?.workstations_count || 0) });
    }
    return map;
  }, [editCompanyIds, periodInfra, allCompanies]);

  const companyShares = useMemo(() => {
    if (distributionType === 'even' || editCompanyIds.length === 0) return new Map<string, number>();
    const field = distributionType === 'by_servers' ? 'servers_count' : 'workstations_count';
    const values = editCompanyIds.map(id => {
      const infra = periodInfra.get(id);
      const c = allCompanies.find(c => c.company_id === id);
      return { id, val: (infra ? infra[field] : (c?.[field] || 0)) || 0 };
    });
    const total = values.reduce((s, v) => s + v.val, 0);
    if (total === 0) return new Map<string, number>();
    const shares = new Map<string, number>();
    for (const v of values) shares.set(v.id, Math.round((v.val / total) * 100));
    return shares;
  }, [distributionType, editCompanyIds, periodInfra, allCompanies]);

  const getInfraCount = useCallback((companyId: string): number => {
    const infra = periodInfra.get(companyId);
    const c = allCompanies.find(c => c.company_id === companyId);
    if (distributionType === 'by_servers') return infra ? infra.servers_count : (c?.servers_count || 0);
    return infra ? infra.workstations_count : (c?.workstations_count || 0);
  }, [periodInfra, allCompanies, distributionType]);

  return {
    allCompanies, allUsers, assignees, procedures, availableProcedures,
    canDelete, deleteReason, isUserAssigned, tasks, tasksLoading,
    periodInfra, companyInfraMap, companyShares, getInfraCount,
  };
}
