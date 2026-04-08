'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { employeesQueryOptions, departmentsQueryOptions, botStatusQueryOptions } from '@/lib/ops/reference-queries';
import { saveEmployee as saveEmployeeCmd, type SaveEmployeeParams } from '@/lib/ops/reference-commands';
import { DbUserInfo } from '@/types/db-user';

// ─── useDepartments ───────────────────────────────────────────

export interface Department {
  id: string;
  name: string;
}

export function useDepartments(): { departments: Department[]; loading: boolean } {
  const { data = [], isLoading } = useQuery(departmentsQueryOptions);
  return { departments: data, loading: isLoading };
}

// ─── useEmployeeSave ──────────────────────────────────────────

export { type SaveEmployeeParams } from '@/lib/ops/reference-commands';

export function useEmployeeSave() {
  const [saving, setSaving] = useState(false);

  const saveEmployee = useCallback(async (params: SaveEmployeeParams): Promise<DbUserInfo> => {
    setSaving(true);
    try {
      return await saveEmployeeCmd(params);
    } finally {
      setSaving(false);
    }
  }, []);

  return { saving, saveEmployee };
}

// ─── useBotStatus ─────────────────────────────────────────────

export interface BotStatus {
  telegram_is_active: boolean;
  telegram_username: string | null;
  teams_is_active: boolean;
  ai_provider: string | null;
  notification_channel: string | null;
}

export function useBotStatus(userId: string | null): { data: BotStatus | null; isLoading: boolean } {
  const { data = null, isLoading } = useQuery(botStatusQueryOptions(userId));
  return { data: data as BotStatus | null, isLoading };
}

// ─── useAllEmployees ──────────────────────────────────────────

export function useAllEmployees(): { employees: DbUserInfo[]; isLoading: boolean } {
  const { data: employees = [], isLoading } = useQuery(employeesQueryOptions);
  return { employees, isLoading };
}

// ─── useEmployees (full) ──────────────────────────────────────

export type StatusFilter = 'all' | 'active' | 'blocked';

interface UseEmployeesReturn {
  employees: DbUserInfo[];
  loading: boolean;
  error: string | null;
  employeesByDepartment: Record<string, DbUserInfo[]>;
  departments: string[];
  statusFilter: StatusFilter;
  setStatusFilter: (filter: StatusFilter) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredEmployees: DbUserInfo[];
  expandedDepartments: Record<string, boolean>;
  toggleDepartment: (department: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  refreshEmployees: () => Promise<void>;
  handleEmployeeUpserted: (employee: DbUserInfo) => void;
}

export function useEmployees(): UseEmployeesReturn {
  const queryClient = useQueryClient();
  const { data: employees = [], isLoading: loading, error: queryError } = useQuery(employeesQueryOptions);
  const error = queryError ? (queryError instanceof Error ? queryError.message : String(queryError)) : null;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDepartments, setExpandedDepartments] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (employees.length > 0) {
      setExpandedDepartments(prev => {
        const depts: Record<string, boolean> = {};
        employees.forEach(emp => { if (emp.department_name) depts[emp.department_name] = false; });
        const merged = { ...depts };
        Object.keys(prev).forEach(key => { if (key in merged) merged[key] = prev[key]; });
        return merged;
      });
    }
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (statusFilter !== 'all' && emp.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!emp.full_name?.toLowerCase().includes(q) && !emp.email?.toLowerCase().includes(q) && !emp.department_name?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [employees, statusFilter, searchQuery]);

  const employeesByDepartment = useMemo(() => {
    const grouped: Record<string, DbUserInfo[]> = {};
    filteredEmployees.forEach(emp => {
      const dept = emp.department_name || 'Без отдела';
      if (!grouped[dept]) grouped[dept] = [];
      grouped[dept].push(emp);
    });
    Object.keys(grouped).forEach(dept => {
      grouped[dept].sort((a, b) => {
        const roleOrder = { chief: 0, head: 1, employee: 2 };
        const roleA = roleOrder[a.role as keyof typeof roleOrder] ?? 2;
        const roleB = roleOrder[b.role as keyof typeof roleOrder] ?? 2;
        if (roleA !== roleB) return roleA - roleB;
        return (a.full_name || '').localeCompare(b.full_name || '', 'ru');
      });
    });
    return grouped;
  }, [filteredEmployees]);

  const departments = useMemo(() => {
    return Object.keys(employeesByDepartment).sort((a, b) => {
      if (a === 'Без отдела') return 1;
      if (b === 'Без отдела') return -1;
      return a.localeCompare(b, 'ru');
    });
  }, [employeesByDepartment]);

  const toggleDepartment = useCallback((dept: string) => { setExpandedDepartments(prev => ({ ...prev, [dept]: !prev[dept] })); }, []);
  const expandAll = useCallback(() => { const all: Record<string, boolean> = {}; departments.forEach(d => { all[d] = true; }); setExpandedDepartments(all); }, [departments]);
  const collapseAll = useCallback(() => { const all: Record<string, boolean> = {}; departments.forEach(d => { all[d] = false; }); setExpandedDepartments(all); }, [departments]);

  const handleEmployeeUpserted = useCallback((employee: DbUserInfo) => {
    queryClient.setQueryData<DbUserInfo[]>(['employees'], prev => {
      if (!prev) return [employee];
      const idx = prev.findIndex(emp => emp.user_id === employee.user_id);
      if (idx >= 0) { const updated = [...prev]; updated[idx] = employee; return updated; }
      return [...prev, employee];
    });
  }, [queryClient]);

  const refreshEmployees = useCallback(async () => { await queryClient.invalidateQueries({ queryKey: ['employees'] }); }, [queryClient]);

  return {
    employees, loading, error, employeesByDepartment, departments,
    statusFilter, setStatusFilter, searchQuery, setSearchQuery, filteredEmployees,
    expandedDepartments, toggleDepartment, expandAll, collapseAll,
    refreshEmployees, handleEmployeeUpserted,
  };
}
