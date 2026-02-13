'use client';

import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsQueryOptions } from '@/lib/queries/reference-queries';
import { supabase } from '@/lib/supabase';
import {
  Project,
  ProjectWithDepartments,
  ProjectOption,
  CreateProjectInput,
  UpdateProjectInput
} from '@/types/projects';
import { getErrorMessage } from '@/lib/utils/error-message';
import logger from '@/lib/logger';

interface UseProjectsOptions {
  /** Загружать только активные проекты */
  activeOnly?: boolean;
  /** Фильтровать по департаменту */
  departmentId?: string;
}

interface UseProjectsReturn {
  projects: ProjectWithDepartments[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createProject: (input: CreateProjectInput) => Promise<{ success: boolean; error?: string; project?: Project }>;
  updateProject: (input: UpdateProjectInput) => Promise<{ success: boolean; error?: string }>;
  toggleActive: (projectId: string, isActive: boolean) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Хук для работы с проектами (справочник)
 */
export function useProjects(options: UseProjectsOptions = {}): UseProjectsReturn {
  const { activeOnly = false, departmentId } = options;
  const queryClient = useQueryClient();

  const { data: allProjects = [], isLoading: loading, error: queryError } = useQuery(projectsQueryOptions);
  const error = queryError ? getErrorMessage(queryError) : null;

  // Фильтрация из кеша (без запроса к БД)
  const projects = useMemo(() => {
    let filtered = allProjects;
    if (activeOnly) {
      filtered = filtered.filter(p => p.is_active);
    }
    if (departmentId) {
      filtered = filtered.filter(p => p.department_ids?.includes(departmentId));
    }
    return filtered;
  }, [allProjects, activeOnly, departmentId]);

  const invalidate = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ['projects'] });
  }, [queryClient]);

  const createProject = useCallback(async (input: CreateProjectInput) => {
    try {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          project_name: input.project_name,
          description: input.description || null,
          is_active: input.is_active ?? true
        })
        .select()
        .single();

      if (projectError) throw projectError;

      if (input.department_ids.length > 0) {
        const deptLinks = input.department_ids.map(deptId => ({
          project_id: project.project_id,
          department_id: deptId
        }));

        const { error: linkError } = await supabase
          .from('project_departments')
          .insert(deptLinks);

        if (linkError) throw linkError;
      }

      await invalidate();
      return { success: true, project };
    } catch (err: unknown) {
      logger.error('[useProjects] Error creating:', err);
      return { success: false, error: getErrorMessage(err) };
    }
  }, [invalidate]);

  const updateProject = useCallback(async (input: UpdateProjectInput) => {
    try {
      const updateData: Partial<Project> = {};
      if (input.project_name !== undefined) updateData.project_name = input.project_name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.is_active !== undefined) updateData.is_active = input.is_active;

      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from('projects')
          .update(updateData)
          .eq('project_id', input.project_id);

        if (updateError) throw updateError;
      }

      if (input.department_ids !== undefined) {
        const { error: deleteError } = await supabase
          .from('project_departments')
          .delete()
          .eq('project_id', input.project_id);

        if (deleteError) throw deleteError;

        if (input.department_ids.length > 0) {
          const deptLinks = input.department_ids.map(deptId => ({
            project_id: input.project_id,
            department_id: deptId
          }));

          const { error: insertError } = await supabase
            .from('project_departments')
            .insert(deptLinks);

          if (insertError) throw insertError;
        }
      }

      await invalidate();
      return { success: true };
    } catch (err: unknown) {
      logger.error('[useProjects] Error updating:', err);
      return { success: false, error: getErrorMessage(err) };
    }
  }, [invalidate]);

  const toggleActive = useCallback(async (projectId: string, isActive: boolean) => {
    try {
      const { error: updateError } = await supabase
        .from('projects')
        .update({ is_active: isActive })
        .eq('project_id', projectId);

      if (updateError) throw updateError;

      await invalidate();
      return { success: true };
    } catch (err: unknown) {
      logger.error('[useProjects] Error toggling active:', err);
      return { success: false, error: getErrorMessage(err) };
    }
  }, [invalidate]);

  return {
    projects,
    loading,
    error,
    refetch: invalidate,
    createProject,
    updateProject,
    toggleActive
  };
}

/**
 * Хук для получения проектов для dropdown в задаче
 * Фильтрует по департаменту пользователя — тонкая обёртка над кешем
 */
export function useProjectsForTask(userDepartmentId: string | undefined): {
  options: ProjectOption[];
  loading: boolean;
} {
  const { data: allProjects = [], isLoading: loading } = useQuery(projectsQueryOptions);

  const options = useMemo(() => {
    if (!userDepartmentId) return [];
    return allProjects
      .filter(p => p.is_active && p.department_ids?.includes(userDepartmentId))
      .map(p => ({
        project_id: p.project_id,
        project_name: p.project_name,
        description: p.description
      }));
  }, [allProjects, userDepartmentId]);

  return { options, loading };
}
