import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getCompanies } from '@/lib/services/infrastructure.service';
import type { Process } from '@/types/planning';
import type { Company } from '@/types/infrastructure';
import type { SupabaseUserInfo } from '@/types/supabase';
import type { ProjectWithDepartments } from '@/types/projects';

// --- Companies (8 rows, staleTime: Infinity) ---
export const companiesQueryOptions = queryOptions({
  queryKey: ['companies'] as const,
  queryFn: getCompanies,
});

// --- Departments (4 rows) ---
export type Department = {
  department_id: string;
  department_name: string;
  department_code: string;
};

export const departmentsQueryOptions = queryOptions({
  queryKey: ['departments'] as const,
  queryFn: async (): Promise<Department[]> => {
    const { data, error } = await supabase
      .from('departments')
      .select('department_id, department_name, department_code')
      .order('department_name');
    if (error) throw error;
    return data || [];
  },
});

// --- Processes (13 rows) ---
export const processesQueryOptions = queryOptions({
  queryKey: ['processes'] as const,
  queryFn: async (): Promise<Process[]> => {
    const { data, error } = await supabase
      .from('processes')
      .select('process_id, process_name')
      .order('process_name', { ascending: true });
    if (error) throw error;
    return data || [];
  },
});

// --- Employees (21 rows) ---
export const employeesQueryOptions = queryOptions({
  queryKey: ['employees'] as const,
  queryFn: async (): Promise<SupabaseUserInfo[]> => {
    const { data, error } = await supabase
      .from('v_user_details')
      .select('*');
    if (error) throw error;
    return (data || []).map(emp => ({
      ...emp,
      status: emp.status || 'active',
    }));
  },
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
    return data || [];
  },
});

// --- Measures via v_kpi_operational (96 rows) ---
// Shared: usePlans (buildMeasuresMap), MeasuresReferenceContent, KPI page
export type MeasureKpiRow = {
  entity_id: string;
  entity_name: string;
  process_id: string;
  process_name: string;
  description?: string | null;
  service_name?: string | null;
  service_prompt?: string | null;
  target_value?: number | null;
  target_period?: string | null;
  category?: string | null;
  actual_value?: number | null;
  plans_count?: number | null;
  total_hours?: number | null;
};

export const measuresQueryOptions = queryOptions({
  queryKey: ['measures'] as const,
  queryFn: async (): Promise<MeasureKpiRow[]> => {
    const { data, error } = await supabase
      .from('v_kpi_operational')
      .select('*');
    if (error) throw error;
    return data || [];
  },
});
