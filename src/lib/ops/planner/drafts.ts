/**
 * Draft tasks service — CRUD for unassigned tasks + active plans for assignment.
 *
 * Draft = daily_task with monthly_plan_id IS NULL.
 * "Assign" = UPDATE monthly_plan_id + copy companies from plan.
 */

import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import logger from '@/lib/shared/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DraftTask {
  daily_task_id: string;
  description: string;
  task_date: string;
  spent_hours: number;
}

export interface AssignedTask {
  daily_task_id: string;
  monthly_plan_id: string;
  description: string;
  task_date: string;
  spent_hours: number;
  plan_name: string | null;
}

export interface ActivePlan {
  monthlyPlanId: string;
  planName: string;
  processName: string;
}

export interface DraftsData {
  drafts: DraftTask[];
  recentTasks: AssignedTask[];
  activePlans: ActivePlan[];
  /** Source IDs (from document_number) that already have tasks — for dedup in calendar. */
  meetingTaskIds: string[];
  /** Source IDs where the task is still a draft (monthly_plan_id IS NULL). */
  draftSourceIds: string[];
  /** Source IDs where the task has been assigned to a plan (monthly_plan_id IS NOT NULL). */
  assignedSourceIds: string[];
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getDraftsData(
  db: SupabaseClient,
  userId: string,
): Promise<DraftsData> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Parallel: drafts + recent assigned + active plans setup + meeting IDs
  const [draftsRes, recentRes, assigneeRes, meetingIdsRes] = await Promise.all([
    // All drafts (no plan)
    db.from('daily_tasks')
      .select('daily_task_id, description, task_date, spent_hours')
      .eq('user_id', userId)
      .is('monthly_plan_id', null)
      .order('task_date', { ascending: false }),

    // Incomplete tasks (with plan, current month)
    db.from('daily_tasks')
      .select('daily_task_id, monthly_plan_id, description, task_date, spent_hours')
      .eq('user_id', userId)
      .not('monthly_plan_id', 'is', null)
      .gte('task_date', `${year}-${String(month).padStart(2, '0')}-01`)
      .order('task_date', { ascending: false }),

    // User's plan assignments (for active plans)
    db.from('monthly_plan_assignees')
      .select('monthly_plan_id')
      .eq('user_id', userId),

    // Source IDs stored in document_number (for calendar dedup + status)
    db.from('daily_tasks')
      .select('document_number, monthly_plan_id')
      .eq('user_id', userId)
      .not('document_number', 'is', null),
  ]);

  // --- Drafts ---
  const drafts: DraftTask[] = (draftsRes.data || []).map((d) => ({
    daily_task_id: d.daily_task_id,
    description: d.description || '',
    task_date: d.task_date,
    spent_hours: Number(d.spent_hours) || 0,
  }));

  // --- Fetch plan names from view for recent tasks + active plans ---
  const recentPlanIds = [...new Set((recentRes.data || []).map(d => d.monthly_plan_id).filter(Boolean))] as string[];
  const assignedIds = (assigneeRes.data || []).map((r) => r.monthly_plan_id);
  const allPlanIds = [...new Set([...recentPlanIds, ...assignedIds])];

  type PlanDetail = { plan_name: string; process_name: string; status: string; year: number; month: number };
  const planDetailMap = new Map<string, PlanDetail>();
  if (allPlanIds.length > 0) {
    const { data: planDetails } = await db
      .from('v_monthly_plan_details')
      .select('monthly_plan_id, plan_name, process_name, status, year, month')
      .in('monthly_plan_id', allPlanIds);
    for (const p of planDetails || []) {
      planDetailMap.set(p.monthly_plan_id, { plan_name: p.plan_name ?? '', process_name: p.process_name ?? '', status: p.status, year: p.year, month: p.month });
    }
  }

  // --- Recent assigned tasks ---
  const recentTasks: AssignedTask[] = (recentRes.data || []).map((d) => ({
    daily_task_id: d.daily_task_id,
    monthly_plan_id: d.monthly_plan_id as string,
    description: d.description || '',
    task_date: d.task_date,
    spent_hours: Number(d.spent_hours) || 0,
    plan_name: planDetailMap.get(d.monthly_plan_id as string)?.plan_name ?? null,
  }));

  // --- Active plans for assignment dropdown ---
  const activePlans: ActivePlan[] = assignedIds
    .filter(id => {
      const p = planDetailMap.get(id);
      return p && p.status === 'active' && p.year === year && p.month === month;
    })
    .map(id => {
      const p = planDetailMap.get(id)!;
      return { monthlyPlanId: id, planName: p.plan_name, processName: p.process_name };
    });

  // --- Source IDs (for calendar dedup + status) ---
  const sourceRows = (meetingIdsRes.data || []).filter((r) => r.document_number);
  const meetingTaskIds = sourceRows.map((r) => r.document_number as string);
  const draftSourceIds = sourceRows
    .filter((r) => !r.monthly_plan_id)
    .map((r) => r.document_number as string);
  const assignedSourceIds = sourceRows
    .filter((r) => r.monthly_plan_id)
    .map((r) => r.document_number as string);

  return { drafts, recentTasks, activePlans, meetingTaskIds, draftSourceIds, assignedSourceIds };
}

// ─── Assign ───────────────────────────────────────────────────────────────────

export async function assignDraft(
  db: SupabaseClient,
  draftId: string,
  planId: string,
  userId: string,
): Promise<void> {
  // Verify ownership + draft status
  const { data: task, error: fetchErr } = await db
    .from('daily_tasks')
    .select('daily_task_id')
    .eq('daily_task_id', draftId)
    .eq('user_id', userId)
    .is('monthly_plan_id', null)
    .single();

  if (fetchErr || !task) {
    throw new Error('Draft not found or not owned by user');
  }

  // Update plan assignment + promote from draft to incomplete
  const { error: updateErr } = await db
    .from('daily_tasks')
    .update({ monthly_plan_id: planId, task_type: 'incomplete' })
    .eq('daily_task_id', draftId);

  if (updateErr) throw updateErr;

  // Copy companies from plan → task
  const { data: planCompanies } = await db
    .from('monthly_plan_companies')
    .select('company_id')
    .eq('monthly_plan_id', planId);

  const companyIds = (planCompanies || []).map((c) => c.company_id);
  if (companyIds.length > 0) {
    await db.from('daily_task_companies').insert(
      companyIds.map((id) => ({ daily_task_id: draftId, company_id: id })),
    );
  }

  logger.info(`[Drafts] Assigned draft ${draftId} → plan ${planId}`);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createDraft(
  db: SupabaseClient,
  userId: string,
  description: string,
  hours: number,
  date?: string,
  meetingId?: string,
  planId?: string,
  source?: 'manual' | 'template' | 'manager' | 'calendar',
): Promise<string> {
  const taskDate = date || new Date().toISOString().slice(0, 10);

  // Dedup: if meetingId (or slot id) provided, check if already exists
  if (meetingId) {
    const { data: existing } = await db
      .from('daily_tasks')
      .select('daily_task_id')
      .eq('user_id', userId)
      .eq('document_number', meetingId)
      .limit(1)
      .maybeSingle();
    if (existing) {
      logger.info(`[Drafts] Duplicate skipped for source ${meetingId}`);
      return existing.daily_task_id;
    }
  }

  const resolvedSource = source || (meetingId ? 'calendar' : 'manual');
  const taskType = planId ? 'incomplete' : 'draft';
  const { data, error } = await db
    .from('daily_tasks')
    .insert({
      monthly_plan_id: planId || null,
      user_id: userId,
      task_date: taskDate,
      description: description.slice(0, 500),
      spent_hours: hours,
      source: resolvedSource,
      task_type: taskType,
      ...(meetingId ? { document_number: meetingId } : {}),
    })
    .select('daily_task_id')
    .single();

  if (error) throw error;

  // Link calendar entry if created from an external event (outlook_event_id)
  if (meetingId && !meetingId.startsWith('proc:')) {
    const { error: linkErr } = await db
      .from('weekly_calendar_entries')
      .update({ daily_task_id: data!.daily_task_id })
      .eq('employee_id', userId)
      .eq('outlook_event_id', meetingId);
    if (linkErr) logger.error(`[Drafts] Failed to link calendar entry:`, linkErr);
  }

  logger.info(`[Drafts] Created ${planId ? 'task' : 'draft'} for ${userId}: "${description.substring(0, 50)}" · ${hours}h`);
  return data!.daily_task_id;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteDraft(
  db: SupabaseClient,
  draftId: string,
  userId: string,
): Promise<void> {
  // Delete companies first (FK constraint)
  await db.from('daily_task_companies').delete().eq('daily_task_id', draftId);

  const { error } = await db
    .from('daily_tasks')
    .delete()
    .eq('daily_task_id', draftId)
    .eq('user_id', userId);

  if (error) throw error;
  logger.info(`[Drafts] Deleted task ${draftId}`);
}
