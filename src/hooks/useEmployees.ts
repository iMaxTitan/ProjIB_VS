'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { employeesQueryOptions } from '@/lib/queries/reference-queries';
import { SupabaseUserInfo } from '@/types/supabase';

export type StatusFilter = 'all' | 'active' | 'vacation' | 'absent';

interface UseEmployeesReturn {
  // Данные
  employees: SupabaseUserInfo[];
  loading: boolean;
  error: string | null;

  // Группировка по отделам
  employeesByDepartment: Record<string, SupabaseUserInfo[]>;
  departments: string[];

  // Фильтрация
  statusFilter: StatusFilter;
  setStatusFilter: (filter: StatusFilter) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredEmployees: SupabaseUserInfo[];

  // Состояние отделов (свернуты/развернуты)
  expandedDepartments: Record<string, boolean>;
  toggleDepartment: (department: string) => void;
  expandAll: () => void;
  collapseAll: () => void;

  // Действия
  refreshEmployees: () => Promise<void>;
  handleEmployeeUpserted: (employee: SupabaseUserInfo) => void;
}

export function useEmployees(): UseEmployeesReturn {
  const queryClient = useQueryClient();
  const { data: employees = [], isLoading: loading, error: queryError } = useQuery(employeesQueryOptions);
  const error = queryError ? (queryError instanceof Error ? queryError.message : String(queryError)) : null;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDepartments, setExpandedDepartments] = useState<Record<string, boolean>>({});

  // Инициализация expandedDepartments при первом получении данных
  useEffect(() => {
    if (employees.length > 0) {
      setExpandedDepartments(prev => {
        const depts: Record<string, boolean> = {};
        employees.forEach(emp => {
          if (emp.department_name) {
            depts[emp.department_name] = false;
          }
        });
        // Сохраняем существующие состояния
        const merged = { ...depts };
        Object.keys(prev).forEach(key => {
          if (key in merged) {
            merged[key] = prev[key];
          }
        });
        return merged;
      });
    }
  }, [employees]);

  // Фильтрация сотрудников
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      // Фильтр по статусу
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && emp.status !== 'active') return false;
        if (statusFilter === 'vacation' && emp.status !== 'vacation') return false;
        if (statusFilter === 'absent' && !['sick_leave', 'business_trip', 'day_off'].includes(emp.status || '')) return false;
      }

      // Фильтр по поиску
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = emp.full_name?.toLowerCase().includes(query);
        const matchesEmail = emp.email?.toLowerCase().includes(query);
        const matchesDept = emp.department_name?.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail && !matchesDept) return false;
      }

      return true;
    });
  }, [employees, statusFilter, searchQuery]);

  // Группировка по отделам
  const employeesByDepartment = useMemo(() => {
    const grouped: Record<string, SupabaseUserInfo[]> = {};

    filteredEmployees.forEach(emp => {
      const dept = emp.department_name || 'Без отдела';
      if (!grouped[dept]) {
        grouped[dept] = [];
      }
      grouped[dept].push(emp);
    });

    // Сортировка сотрудников внутри отделов: сначала начальники, потом по имени
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

  // Список отделов (отсортированный)
  const departments = useMemo(() => {
    return Object.keys(employeesByDepartment).sort((a, b) => {
      if (a === 'Без отдела') return 1;
      if (b === 'Без отдела') return -1;
      return a.localeCompare(b, 'ru');
    });
  }, [employeesByDepartment]);

  // Управление состоянием отделов
  const toggleDepartment = useCallback((department: string) => {
    setExpandedDepartments(prev => ({
      ...prev,
      [department]: !prev[department]
    }));
  }, []);

  const expandAll = useCallback(() => {
    const all: Record<string, boolean> = {};
    departments.forEach(dept => {
      all[dept] = true;
    });
    setExpandedDepartments(all);
  }, [departments]);

  const collapseAll = useCallback(() => {
    const all: Record<string, boolean> = {};
    departments.forEach(dept => {
      all[dept] = false;
    });
    setExpandedDepartments(all);
  }, [departments]);

  // Оптимистичное обновление
  const handleEmployeeUpserted = useCallback((employee: SupabaseUserInfo) => {
    queryClient.setQueryData<SupabaseUserInfo[]>(
      ['employees'],
      (prev) => {
        if (!prev) return [employee];
        const existingIndex = prev.findIndex(emp => emp.user_id === employee.user_id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = employee;
          return updated;
        }
        return [...prev, employee];
      }
    );
  }, [queryClient]);

  const refreshEmployees = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['employees'] });
  }, [queryClient]);

  return {
    employees,
    loading,
    error,
    employeesByDepartment,
    departments,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    filteredEmployees,
    expandedDepartments,
    toggleDepartment,
    expandAll,
    collapseAll,
    refreshEmployees,
    handleEmployeeUpserted,
  };
}
