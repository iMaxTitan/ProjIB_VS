'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { companiesQueryOptions, projectsQueryOptions } from '@/lib/ops/reference-queries';
import { useAllEmployees } from '@/hooks/useEmployees';

interface ListItem { id: string; label: string; }

/**
 * Hook for monthly plan relations editing.
 * Companies & projects from global cache, documents from API (not cached globally).
 */
export function usePlanRelations(monthlyPlanId: string | null, editing: boolean) {
  const { data: companiesRaw = [] } = useQuery(companiesQueryOptions);
  const { data: projectsRaw = [] } = useQuery(projectsQueryOptions);

  const allCompanies = useMemo<ListItem[]>(() =>
    companiesRaw.map(c => ({ id: c.company_id, label: c.company_name })),
  [companiesRaw]);

  const allProjects = useMemo<ListItem[]>(() =>
    projectsRaw.map(p => ({ id: p.project_id, label: p.project_name })),
  [projectsRaw]);

  // KB documents — not cached globally, fetch when editing
  const [allDocuments, setAllDocuments] = useState<ListItem[]>([]);
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    fetch('/api/plans/monthly/relations?type=documents', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (!cancelled && Array.isArray(data)) {
          setAllDocuments(data.map((d: Record<string, string>) => ({ id: d.id, label: d.title })));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [editing]);

  const addRelation = useCallback(async (type: string, id: string) => {
    if (!monthlyPlanId) return;
    await fetch('/api/plans/monthly/relations', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthly_plan_id: monthlyPlanId, type, id }),
    });
  }, [monthlyPlanId]);

  const removeRelation = useCallback(async (type: string, id: string) => {
    if (!monthlyPlanId) return;
    await fetch('/api/plans/monthly/relations', {
      method: 'DELETE', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthly_plan_id: monthlyPlanId, type, id }),
    });
  }, [monthlyPlanId]);

  return { allCompanies, allDocuments, allProjects, addRelation, removeRelation };
}

/**
 * Hook for department employees (from global cache) and toggling assignees.
 */
export function usePlanAssignees(monthlyPlanId: string | null, departmentId: string | null | undefined, editing: boolean, userRole?: string, userId?: string) {
  const { employees } = useAllEmployees();

  const deptEmployees = useMemo(() => {
    if (!editing || !departmentId) return [];
    const list = employees
      .filter(e => e.department_id === departmentId && e.status === 'active' && e.user_id)
      .map(e => ({ id: e.user_id!, name: e.full_name || '—' }));
    // Chief can add themselves even if they're in a different department
    if (userRole === 'chief' && userId && !list.some(e => e.id === userId)) {
      const me = employees.find(e => e.user_id === userId);
      if (me) list.push({ id: me.user_id!, name: me.full_name || '—' });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  }, [editing, departmentId, employees, userRole, userId]);

  const toggleAssignee = useCallback(async (userId: string, assigned: boolean) => {
    if (!monthlyPlanId) return;
    await fetch('/api/plans/monthly/relations', {
      method: assigned ? 'DELETE' : 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthly_plan_id: monthlyPlanId, type: 'assignee', id: userId }),
    });
  }, [monthlyPlanId]);

  return { deptEmployees, toggleAssignee };
}
