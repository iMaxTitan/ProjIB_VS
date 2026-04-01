'use client';

import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsQueryOptions } from '@/lib/ops/reference-queries';
import {
  createProject as createProjectCmd,
  updateProject as updateProjectCmd,
  toggleProjectActive as toggleProjectActiveCmd,
} from '@/lib/ops/reference-commands';
import type { Project, ProjectWithDepartments, ProjectOption, CreateProjectInput, UpdateProjectInput } from '@/types/projects';
import { getErrorMessage } from '@/lib/shared/utils/error-message';
import logger from '@/lib/shared/logger';

interface UseProjectsOptions {
  activeOnly?: boolean;
  departmentId?: string;
}

export function useProjects(options: UseProjectsOptions = {}) {
  const { activeOnly = false, departmentId } = options;
  const queryClient = useQueryClient();

  const { data: allProjects = [], isLoading: loading, error: queryError } = useQuery(projectsQueryOptions);
  const error = queryError ? getErrorMessage(queryError) : null;

  const projects = useMemo(() => {
    let filtered = allProjects;
    if (activeOnly) filtered = filtered.filter(p => p.is_active);
    if (departmentId) filtered = filtered.filter(p => p.department_ids?.includes(departmentId));
    return filtered;
  }, [allProjects, activeOnly, departmentId]);

  const invalidate = useCallback(() => queryClient.invalidateQueries({ queryKey: ['projects'] }), [queryClient]);

  const createProject = useCallback(async (input: CreateProjectInput) => {
    try {
      const project = await createProjectCmd(input);
      await invalidate();
      return { success: true, project };
    } catch (err: unknown) {
      logger.error('[useProjects] Error creating:', err);
      return { success: false, error: getErrorMessage(err) };
    }
  }, [invalidate]);

  const updateProject = useCallback(async (input: UpdateProjectInput) => {
    try {
      await updateProjectCmd(input);
      await invalidate();
      return { success: true };
    } catch (err: unknown) {
      logger.error('[useProjects] Error updating:', err);
      return { success: false, error: getErrorMessage(err) };
    }
  }, [invalidate]);

  const toggleActive = useCallback(async (projectId: string, isActive: boolean) => {
    try {
      await toggleProjectActiveCmd(projectId, isActive);
      await invalidate();
      return { success: true };
    } catch (err: unknown) {
      logger.error('[useProjects] Error toggling active:', err);
      return { success: false, error: getErrorMessage(err) };
    }
  }, [invalidate]);

  return { projects, loading, error, refetch: invalidate, createProject, updateProject, toggleActive };
}

export function useProjectsForTask(userDepartmentId: string | undefined): { options: ProjectOption[]; loading: boolean } {
  const { data: allProjects = [], isLoading: loading } = useQuery(projectsQueryOptions);
  const options = useMemo(() => {
    if (!userDepartmentId) return [];
    return allProjects
      .filter(p => p.is_active && p.department_ids?.includes(userDepartmentId))
      .map(p => ({ project_id: p.project_id, project_name: p.project_name, description: p.description }));
  }, [allProjects, userDepartmentId]);
  return { options, loading };
}
