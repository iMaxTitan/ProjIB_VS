/**
 * CRUD for procedure_task_templates — template task descriptions per procedure.
 * Templates are reference data: employee picks one → daily_task created with pre-filled title/description.
 */

import type { PostgrestClient } from '@/lib/shared/postgrest-client';

export interface TaskTemplate {
  id: string;
  procedure_id: string;
  title: string;
  content: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

// ─── Read ───

export async function getTemplates(
  db: PostgrestClient,
  procedureId: string,
): Promise<TaskTemplate[]> {
  const { data, error } = await db
    .from('procedure_task_templates')
    .select('*')
    .eq('procedure_id', procedureId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as TaskTemplate[];
}

// ─── Create ───

export async function createTemplate(
  db: PostgrestClient,
  procedureId: string,
  title: string,
  content: string,
  userId: string,
): Promise<TaskTemplate> {
  const { data, error } = await db
    .from('procedure_task_templates')
    .insert({
      procedure_id: procedureId,
      title,
      content,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as TaskTemplate;
}

// ─── Update ───

export async function updateTemplate(
  db: PostgrestClient,
  id: string,
  updates: Partial<Pick<TaskTemplate, 'title' | 'content' | 'is_active'>>,
): Promise<TaskTemplate> {
  const { data, error } = await db
    .from('procedure_task_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as TaskTemplate;
}

// ─── Delete (soft — is_active = false) ───

export async function deleteTemplate(
  db: PostgrestClient,
  id: string,
): Promise<void> {
  const { error } = await db
    .from('procedure_task_templates')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw error;
}
