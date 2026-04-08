/**
 * Reference data — write operations (projects, procedures, employees).
 * Mutations extracted from hooks to enforce module boundaries.
 */
import { supabase as db } from '@/lib/shared/db-client';
import type { Project, CreateProjectInput, UpdateProjectInput } from '@/types/projects';
import type { DbUserInfo } from '@/types/db-user';

// ─── Projects ──────────────────────────────────────────────────

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const { data: project, error } = await db
    .from('projects')
    .insert({ project_name: input.project_name, description: input.description || null, is_active: input.is_active ?? true })
    .select().single();
  if (error) throw error;

  if (input.department_ids.length > 0) {
    const links = input.department_ids.map(deptId => ({ project_id: project!.project_id, department_id: deptId }));
    const { error: linkErr } = await db.from('project_departments').insert(links);
    if (linkErr) throw linkErr;
  }
  return project as unknown as Project;
}

export async function updateProject(input: UpdateProjectInput): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (input.project_name !== undefined) updateData.project_name = input.project_name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;

  if (Object.keys(updateData).length > 0) {
    const { error } = await db.from('projects').update(updateData).eq('project_id', input.project_id);
    if (error) throw error;
  }

  if (input.department_ids !== undefined) {
    const { error: delErr } = await db.from('project_departments').delete().eq('project_id', input.project_id);
    if (delErr) throw delErr;
    if (input.department_ids.length > 0) {
      const links = input.department_ids.map(deptId => ({ project_id: input.project_id, department_id: deptId }));
      const { error: insErr } = await db.from('project_departments').insert(links);
      if (insErr) throw insErr;
    }
  }
}

export async function toggleProjectActive(projectId: string, isActive: boolean): Promise<void> {
  const { error } = await db.from('projects').update({ is_active: isActive }).eq('project_id', projectId);
  if (error) throw error;
}

// ─── Procedures ────────────────────────────────────────────────

export async function manageProcedure(
  action: 'create' | 'update' | 'delete',
  userId: string,
  params?: { procedure_id?: string | null; name?: string; description?: string | null; service_name?: string | null; process_id?: string | null; category?: string; target_value?: number; target_period?: string },
): Promise<void> {
  const { data, error } = await db.rpc('manage_procedure', {
    p_action: action,
    p_procedure_id: params?.procedure_id ?? null,
    p_name: params?.name ?? '',
    p_description: params?.description ?? null,
    p_service_name: params?.service_name ?? null,
    p_process_id: params?.process_id ?? null,
    p_category: params?.category ?? 'operational',
    p_target_value: params?.target_value ?? 0,
    p_target_period: params?.target_period ?? 'monthly',
    p_user_id: userId,
  });
  if (error) throw error;
  if (data && !data.success) throw new Error(data.error || 'Ошибка операції');
}

// ─── Employees ─────────────────────────────────────────────────

export interface SaveEmployeeParams {
  email: string;
  fullName: string;
  departmentId: string;
  photoBase64: string | null;
  role: string;
  status: string;
  position: string | null;
  workRate: number;
}

export async function saveEmployee(params: SaveEmployeeParams): Promise<DbUserInfo> {
  const { data, error } = await db.rpc('upsert_user_profile', {
    p_email: params.email,
    p_full_name: params.fullName,
    p_department_id: params.departmentId,
    p_photo_base64: params.photoBase64,
    p_role: params.role,
    p_status: params.status,
    p_position: params.position,
    p_work_rate: params.workRate,
  });
  if (error) throw error;
  return data as unknown as DbUserInfo;
}
