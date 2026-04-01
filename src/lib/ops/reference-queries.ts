import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/lib/shared/db-client';
import { getCompanies } from '@/lib/ops';
import type { Process, AnnualPlan } from '@/types/planning';
import type { SupabaseUserInfo } from '@/types/supabase';
import type { ProjectWithDepartments } from '@/types/projects';

// --- Companies (8 rows, staleTime: Infinity) ---
export const companiesQueryOptions = queryOptions({
  queryKey: ['companies'] as const,
  queryFn: getCompanies,
  staleTime: Infinity,
});

// --- Processes (13 rows) ---
export const processesQueryOptions = queryOptions({
  queryKey: ['processes'] as const,
  queryFn: async (): Promise<Process[]> => {
    const { data, error } = await supabase
      .from('processes')
      .select('process_id, process_name, description, mission, expected_result, department_id')
      .order('process_name', { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as Process[];
    // Fetch department names
    const deptIds = [...new Set(rows.map(r => r.department_id).filter(Boolean))] as string[];
    if (deptIds.length > 0) {
      const { data: depts } = await supabase.from('departments').select('department_id, department_name').in('department_id', deptIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deptMap = new Map((depts || []).map((d: any) => [d.department_id, d.department_name] as [string, string]));
      for (const r of rows) {
        if (r.department_id) r.department_name = deptMap.get(r.department_id) ?? null;
      }
    }
    return rows;
  },
  staleTime: Infinity,
});

// --- Employees (21 rows) ---
export const employeesQueryOptions = queryOptions({
  queryKey: ['employees'] as const,
  queryFn: async (): Promise<SupabaseUserInfo[]> => {
    const { data, error } = await supabase
      .from('v_user_details')
      .select('*');
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map(emp => ({
      ...emp,
      status: emp.status || 'active',
    })) as SupabaseUserInfo[];
  },
  staleTime: Infinity,
});

// --- Projects (47 rows) ---
export const projectsQueryOptions = queryOptions({
  queryKey: ['projects'] as const,
  queryFn: async (): Promise<ProjectWithDepartments[]> => {
    const { data, error } = await supabase
      .from('v_projects_with_departments')
      .select('*')
      .order('project_name');
    if (error) throw error;
    return (data ?? []) as ProjectWithDepartments[];
  },
  staleTime: Infinity,
});

// --- Annual Plans (~26 rows, staleTime: 5min — plans change rarely) ---
export const annualPlansQueryOptions = queryOptions({
  queryKey: ['annual-plans'] as const,
  queryFn: async (): Promise<AnnualPlan[]> => {
    const { data, error } = await supabase
      .from('v_annual_plans')
      .select('*')
      .order('year', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AnnualPlan[];
  },
  staleTime: 5 * 60_000, // 5 min
});

// --- Procedures via v_kpi_operational (96 rows) ---
// Shared: usePlans (buildProceduresMap), ProceduresReferenceContent, KPI page
export type ProcedureKpiRow = {
  entity_id: string;
  entity_name: string;
  process_id: string;
  process_name: string;
  description?: string | null;
  service_name?: string | null;
  target_value?: number | null;
  target_period?: string | null;
  category?: string | null;
  actual_value?: number | null;
  plans_count?: number | null;
  total_hours?: number | null;
};

export const proceduresQueryOptions = queryOptions({
  queryKey: ['procedures'] as const,
  queryFn: async (): Promise<ProcedureKpiRow[]> => {
    const { data, error } = await supabase
      .from('v_kpi_operational')
      .select('*');
    if (error) throw error;
    return (data ?? []) as ProcedureKpiRow[];
  },
  staleTime: Infinity,
});
