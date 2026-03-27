/**
 * collectProcedureTasks — collects calendar entries with task_template_id
 * into daily_tasks grouped by template.
 *
 * Flow:
 * 1. Group entries by task_template_id
 * 2. For each group: create daily_task with template title/content, sum hours
 * 3. Link entries → daily_task_id
 * 4. Copy companies from monthly_plan
 *
 * No modal — runs immediately when user clicks ClipboardCheck.
 */

import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import logger from '@/lib/shared/logger';

interface EntryInput {
  id: string;
  task_template_id: string;
  duration_minutes: number;
  date: string;
}

interface ExternalEntryInput {
  id: string;
  duration_minutes: number;
  date: string;
  subject: string | null;
  transcript_summary: string | null;
}

interface CollectParams {
  procedureId: string;
  weekStart: string;
  monthlyPlanId: string;
  entries: EntryInput[];
  externalEntries?: ExternalEntryInput[];
}

interface CollectResult {
  tasksCreated: number;
  entriesLinked: number;
}

export async function collectProcedureTasks(
  db: SupabaseClient,
  userId: string,
  params: CollectParams,
): Promise<CollectResult> {
  const { procedureId, monthlyPlanId, entries, externalEntries = [] } = params;

  if (entries.length === 0 && externalEntries.length === 0) {
    throw new Error('Немає записів для збору');
  }

  // 1. Fetch templates
  const templateIds = [...new Set(entries.map(e => e.task_template_id))];
  const { data: templates } = await db
    .from('procedure_task_templates')
    .select('id, title, content')
    .in('id', templateIds);

  const templateMap = new Map((templates || []).map(t => [t.id, t]));

  // 2. Group entries by template
  const groups = new Map<string, EntryInput[]>();
  for (const entry of entries) {
    const list = groups.get(entry.task_template_id) || [];
    list.push(entry);
    groups.set(entry.task_template_id, list);
  }

  // 3. Get companies from plan
  const { data: planCompanies } = await db
    .from('monthly_plan_companies')
    .select('company_id')
    .eq('monthly_plan_id', monthlyPlanId);
  const companyIds = (planCompanies || []).map(c => c.company_id);

  let tasksCreated = 0;
  let entriesLinked = 0;

  // 4. Create a task per group
  for (const [templateId, groupEntries] of groups) {
    const template = templateMap.get(templateId);
    const totalHours = Math.round(groupEntries.reduce((s, e) => s + e.duration_minutes / 60, 0) * 10) / 10;
    const latestDate = groupEntries.reduce((max, e) => e.date > max ? e.date : max, groupEntries[0].date);

    const { data: taskData, error: taskErr } = await db
      .from('daily_tasks')
      .insert({
        monthly_plan_id: monthlyPlanId,
        user_id: userId,
        task_date: latestDate,
        title: template?.title || 'Задача',
        description: template?.content || '',
        spent_hours: totalHours,
        source: 'calendar',
        task_type: 'incomplete',
        document_number: `proc:${procedureId}`,
      })
      .select('daily_task_id')
      .single();

    if (taskErr) throw taskErr;
    const taskId = taskData!.daily_task_id;

    // Link entries
    const entryIds = groupEntries.map(e => e.id);
    const { error: linkErr } = await db
      .from('weekly_calendar_entries')
      .update({ daily_task_id: taskId })
      .in('id', entryIds);

    if (linkErr) {
      logger.error(`[CollectTasks] Failed to link entries:`, linkErr);
      throw linkErr;
    }

    // Companies
    if (companyIds.length > 0) {
      await db.from('daily_task_companies').insert(
        companyIds.map(cid => ({ daily_task_id: taskId, company_id: cid })),
      );
    }

    tasksCreated++;
    entriesLinked += entryIds.length;
    logger.info(`[CollectTasks] Task ${taskId} (${template?.title}): ${totalHours}h from ${entryIds.length} entries`);
  }

  // 5. External entries (meetings with procedure) — each becomes a separate task
  for (const ext of externalEntries) {
    const hours = Math.round(ext.duration_minutes / 60 * 10) / 10;

    const { data: taskData, error: taskErr } = await db
      .from('daily_tasks')
      .insert({
        monthly_plan_id: monthlyPlanId,
        user_id: userId,
        task_date: ext.date,
        title: ext.subject || 'Зустріч',
        description: ext.transcript_summary || '',
        spent_hours: hours,
        source: 'calendar',
        task_type: 'incomplete',
        document_number: `proc:${procedureId}`,
      })
      .select('daily_task_id')
      .single();

    if (taskErr) throw taskErr;
    const extTaskId = taskData!.daily_task_id;

    await db.from('weekly_calendar_entries')
      .update({ daily_task_id: extTaskId })
      .eq('id', ext.id);

    if (companyIds.length > 0) {
      await db.from('daily_task_companies').insert(
        companyIds.map(cid => ({ daily_task_id: extTaskId, company_id: cid })),
      );
    }

    tasksCreated++;
    entriesLinked++;
    logger.info(`[CollectTasks] External task ${extTaskId} (${ext.subject}): ${hours}h`);
  }

  return { tasksCreated, entriesLinked };
}
