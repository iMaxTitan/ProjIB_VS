'use client';

import { useState, useEffect, useCallback } from 'react';
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
  deleteProject: (projectId: string) => Promise<{ success: boolean; error?: string }>;
  toggleActive: (projectId: string, isActive: boolean) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Хук для работы с проектами (справочник)
 */
export function useProjects(options: UseProjectsOptions = {}): UseProjectsReturn {
  const { activeOnly = false, departmentId } = options;

  const [projects, setProjects] = useState<ProjectWithDepartments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('v_projects_with_departments')
        .select('*')
        .order('project_name');

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      let filteredData = data || [];

      // Фильтруем по департаменту, если нужно
      if (departmentId) {
        filteredData = filteredData.filter((p: ProjectWithDepartments) =>
          p.department_ids?.includes(departmentId)
        );
      }

      setProjects(filteredData);
    } catch (err: unknown) {
      logger.error('[useProjects] Error fetching:', err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeOnly, departmentId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = useCallback(async (input: CreateProjectInput) => {
    try {
      // 1. Создаем проект
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

      // 2. Добавляем связи с департаментами
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

      await fetchProjects();
      return { success: true, project };
    } catch (err: unknown) {
      logger.error('[useProjects] Error creating:', err);
      return { success: false, error: getErrorMessage(err) };
    }
  }, [fetchProjects]);

  const updateProject = useCallback(async (input: UpdateProjectInput) => {
    try {
      // 1. Обновляем основные поля проекта
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

      // 2. Обновляем связи с департаментами
      if (input.department_ids !== undefined) {
        // Удаляем старые связи
        const { error: deleteError } = await supabase
          .from('project_departments')
          .delete()
          .eq('project_id', input.project_id);

        if (deleteError) throw deleteError;

        // Добавляем новые связи
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

      await fetchProjects();
      return { success: true };
    } catch (err: unknown) {
      logger.error('[useProjects] Error updating:', err);
      return { success: false, error: getErrorMessage(err) };
    }
  }, [fetchProjects]);

  const deleteProject = useCallback(async (projectId: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('projects')
        .delete()
        .eq('project_id', projectId);

      if (deleteError) throw deleteError;

      await fetchProjects();
      return { success: true };
    } catch (err: unknown) {
      logger.error('[useProjects] Error deleting:', err);
      return { success: false, error: getErrorMessage(err) };
    }
  }, [fetchProjects]);

  const toggleActive = useCallback(async (projectId: string, isActive: boolean) => {
    try {
      const { error: updateError } = await supabase
        .from('projects')
        .update({ is_active: isActive })
        .eq('project_id', projectId);

      if (updateError) throw updateError;

      await fetchProjects();
      return { success: true };
    } catch (err: unknown) {
      logger.error('[useProjects] Error toggling active:', err);
      return { success: false, error: getErrorMessage(err) };
    }
  }, [fetchProjects]);

  return {
    projects,
    loading,
    error,
    refetch: fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    toggleActive
  };
}

/**
 * Хук для получения проектов для dropdown в задаче
 * Фильтрует по департаменту пользователя
 */
export function useProjectsForTask(userDepartmentId: string | undefined): {
  options: ProjectOption[];
  loading: boolean;
} {
  const [options, setOptions] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userDepartmentId) {
      setOptions([]);
      setLoading(false);
      return;
    }

    const fetchOptions = async () => {
      setLoading(true);
      try {
        // Получаем активные проекты из view
        const { data, error } = await supabase
          .from('v_projects_with_departments')
          .select('project_id, project_name, description, department_ids')
          .eq('is_active', true)
          .order('project_name');

        if (error) throw error;

        // Фильтруем по департаменту
        const filtered = (data || [])
          .filter((p: { department_ids: string[] }) =>
            p.department_ids?.includes(userDepartmentId)
          )
          .map((p: { project_id: string; project_name: string; description: string | null }) => ({
            project_id: p.project_id,
            project_name: p.project_name,
            description: p.description
          }));

        setOptions(filtered);
      } catch (err: unknown) {
        logger.error('[useProjectsForTask] Error:', err);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOptions();
  }, [userDepartmentId]);

  return { options, loading };
}


