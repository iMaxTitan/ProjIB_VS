/**
 * Типы для сущности "Проекты".
 */

export interface Project {
  project_id: string;
  project_name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithDepartments extends Project {
  department_ids: string[];
  department_names: string[];
}

export interface ProjectDepartment {
  project_id: string;
  department_id: string;
  created_at: string;
}

export interface CreateProjectInput {
  project_name: string;
  description?: string;
  department_ids: string[];
  is_active?: boolean;
}

export interface UpdateProjectInput {
  project_id: string;
  project_name?: string;
  description?: string;
  department_ids?: string[];
  is_active?: boolean;
}

// Для dropdown в AddTaskModal
export interface ProjectOption {
  project_id: string;
  project_name: string;
  description: string | null;
}