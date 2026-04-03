/**
 * /api/planner/tasks — Task Picker for calendar entry blocks.
 * GET  ?procedure_id=uuid&monthly_plan_id=uuid -> { templates, incomplete, chief, drafts }
 * GET  ?mode=detail&monthly_plan_id=uuid       -> { tasks, drafts, summary }
 * POST { monthly_plan_id, title, description, task_date, spent_hours } -> { daily_task_id }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rl = checkRateLimit(`wp-tasks:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }
  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 401 });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get('mode');
  const monthlyPlanId = url.searchParams.get('monthly_plan_id');

  // ─── Detail mode: all tasks for a monthly plan + unassigned drafts ───
  if (mode === 'detail') {
    if (!monthlyPlanId) {
      return NextResponse.json(
        { error: 'monthly_plan_id is required for detail mode' },
        { status: 400 },
      );
    }
    try {
      return await handleDetailMode(userId, monthlyPlanId);
    } catch (err) {
      logger.error('[planner/tasks] detail GET error:', err);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  }

  // ─── Picker mode (default) ───
  const procedureId = url.searchParams.get('procedure_id');

  if (!monthlyPlanId) {
    return NextResponse.json(
      { error: 'monthly_plan_id is required' },
      { status: 400 },
    );
  }

  try {
    const db = getDb();

    // Collect daily_task_ids already linked to calendar entries (scoped to current user)
    const { data: linkedRows } = await db
      .from('weekly_calendar_entries')
      .select('daily_task_id')
      .eq('employee_id', userId)
      .not('daily_task_id', 'is', null);

    const linkedTaskIds = new Set(
      (linkedRows || []).map((r) => r.daily_task_id as string),
    );

    // 1. Templates -- active templates for the procedure (empty for initiatives)
    let tplRows: { id: string; title: string; content: string }[] = [];
    if (procedureId) {
      const { data, error: tplErr } = await db
        .from('procedure_task_templates')
        .select('id, title, content')
        .eq('procedure_id', procedureId)
        .eq('is_active', true)
        .order('created_at');
      if (tplErr) throw tplErr;
      tplRows = (data || []) as { id: string; title: string; content: string }[];
    }

    // 2. Incomplete tasks -- task_type = 'incomplete', not yet linked, current user only
    const { data: incRows, error: incErr } = await db
      .from('daily_tasks')
      .select('daily_task_id, title, description, spent_hours, source')
      .eq('monthly_plan_id', monthlyPlanId)
      .eq('user_id', userId)
      .eq('task_type', 'incomplete')
      .not('source', 'in', '("chief","head")');

    if (incErr) throw incErr;

    const incomplete = (incRows || []).filter(
      (t) => !linkedTaskIds.has(t.daily_task_id),
    );

    // 3. Chief/head tasks -- source in ('chief','head'), not completed, not linked
    const { data: chiefRows, error: chiefErr } = await db
      .from('daily_tasks')
      .select('daily_task_id, title, description, spent_hours, source')
      .eq('monthly_plan_id', monthlyPlanId)
      .eq('user_id', userId)
      .in('source', ['chief', 'head'])
      .neq('task_type', 'completed');

    if (chiefErr) throw chiefErr;

    const incompleteIds = new Set(incomplete.map((t) => t.daily_task_id));
    const chief = (chiefRows || []).filter(
      (t) => !linkedTaskIds.has(t.daily_task_id) && !incompleteIds.has(t.daily_task_id),
    );

    // 4. Drafts -- tasks without monthly_plan_id (unassigned), current user only
    const { data: draftRows, error: draftErr } = await db
      .from('daily_tasks')
      .select('daily_task_id, title, description, spent_hours, source, task_date')
      .eq('user_id', userId)
      .is('monthly_plan_id', null)
      .order('task_date', { ascending: false })
      .limit(20);

    if (draftErr) throw draftErr;

    const drafts = (draftRows || []).filter(
      (t) => !linkedTaskIds.has(t.daily_task_id),
    );

    // Exclude templates that already have a matching incomplete task (by title)
    const incompleteTitles = new Set(incomplete.map((t) => t.title?.trim().toLowerCase()));
    const chiefTitles = new Set(chief.map((t) => t.title?.trim().toLowerCase()));
    const templates = (tplRows || []).filter((t) => {
      const key = t.title?.trim().toLowerCase();
      return !incompleteTitles.has(key) && !chiefTitles.has(key);
    });

    return NextResponse.json({
      templates,
      incomplete,
      chief,
      drafts,
    });
  } catch (err) {
    logger.error('[planner/tasks] GET error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ─── Detail mode handler ─────────────────────────────────────────────────

async function handleDetailMode(userId: string, monthlyPlanId: string) {
  const db = getDb();

  // Plan info: description + companies
  const { data: planRow } = await db
    .from('monthly_plans')
    .select('description, planned_hours, status, year, month, procedure_id, procedures(description)')
    .eq('monthly_plan_id', monthlyPlanId)
    .single();

  const { data: companyRows } = await db
    .from('monthly_plan_companies')
    .select('company_id, companies(company_name)')
    .eq('monthly_plan_id', monthlyPlanId);

  const companyIds = (companyRows || []).map(r => r.company_id as string);
  const companies = (companyRows || [])
    .map((r) => {
      const c = r.companies as unknown as { company_name: string } | { company_name: string }[] | null;
      return Array.isArray(c) ? c[0]?.company_name : c?.company_name;
    })
    .filter(Boolean) as string[];

  // Projects linked to plan
  const { data: projectRows } = await db
    .from('monthly_plan_projects')
    .select('project_id, projects:project_id(project_name)')
    .eq('monthly_plan_id', monthlyPlanId);

  const planProjects = (projectRows || []).map((r) => {
    const p = r.projects as unknown as { project_name: string } | { project_name: string }[] | null;
    const name = Array.isArray(p) ? p[0]?.project_name : p?.project_name;
    return { id: r.project_id as string, name: name || '' };
  });

  // KB documents linked to plan
  const { data: docRows } = await db
    .from('monthly_plan_documents')
    .select('kb_document_id, kb_documents:kb_document_id(title, source_filename)')
    .eq('monthly_plan_id', monthlyPlanId);

  const planDocuments = (docRows || []).map((r) => {
    const d = r.kb_documents as unknown as { title: string; source_filename: string } | { title: string; source_filename: string }[] | null;
    const doc = Array.isArray(d) ? d[0] : d;
    return { id: r.kb_document_id as string, title: doc?.title || '', source_filename: doc?.source_filename || '' };
  });

  // All tasks for the monthly plan (including completed), current user
  const { data: taskRows, error: taskErr } = await db
    .from('daily_tasks')
    .select('daily_task_id, title, description, task_date, spent_hours, task_type, source, created_by, project_id, document_number, created_by_profile:created_by(role)')
    .eq('monthly_plan_id', monthlyPlanId)
    .eq('user_id', userId)
    .order('source', { ascending: true })
    .order('task_date', { ascending: false });

  if (taskErr) throw taskErr;

  // Map created_by_profile.role → created_by_role
  const mappedTasks = (taskRows || []).map((t) => {
    const profile = t.created_by_profile as unknown as { role: string | null } | { role: string | null }[] | null;
    const role = Array.isArray(profile) ? profile[0]?.role : profile?.role;
    return {
      daily_task_id: t.daily_task_id,
      title: t.title,
      description: t.description,
      task_date: t.task_date,
      spent_hours: t.spent_hours,
      task_type: t.task_type,
      source: t.source,
      created_by_role: role || null,
      project_id: (t as Record<string, unknown>).project_id || null,
      document_number: (t as Record<string, unknown>).document_number || null,
    };
  });

  // Sort: 1) chief/head not completed, 2) own not completed/not draft, 3) drafts, 4) completed
  const isFromManager = (t: { source: string }) => t.source === 'chief' || t.source === 'head';
  const sortGroup = (t: { task_type: string; source: string }) => {
    if (t.task_type === 'completed') return 4;
    if (isFromManager(t)) return 1; // chief/head always on top (unless completed)
    if (t.task_type === 'draft') return 3;
    return 2;
  };
  const tasks = mappedTasks.sort((a, b) => {
    const ga = sortGroup(a), gb = sortGroup(b);
    if (ga !== gb) return ga - gb;
    return (b.task_date || '').localeCompare(a.task_date || '');
  });

  // Unassigned drafts (monthly_plan_id IS NULL), current user, limit 20
  const { data: draftRows, error: draftErr } = await db
    .from('daily_tasks')
    .select('daily_task_id, description, task_date, spent_hours')
    .eq('user_id', userId)
    .is('monthly_plan_id', null)
    .order('task_date', { ascending: false })
    .limit(20);

  if (draftErr) throw draftErr;

  const drafts = draftRows || [];

  const completed = tasks.filter((t) => t.task_type === 'completed').length;
  const totalHours = tasks.reduce((sum, t) => sum + (Number(t.spent_hours) || 0), 0);

  // Current user role
  const { data: userProfile } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();

  return NextResponse.json({
    planInfo: {
      description: planRow?.description || (() => {
        const proc = planRow?.procedures as unknown as { description: string } | { description: string }[] | null;
        const p = Array.isArray(proc) ? proc[0] : proc;
        return p?.description || null;
      })(),
      plannedHours: Number(planRow?.planned_hours) || 0,
      status: planRow?.status || null,
      year: planRow?.year || null,
      month: planRow?.month || null,
      companies,
      companyIds,
      planProjects,
      planDocuments,
      distributionType: (planRow as Record<string, unknown>)?.distribution_type || 'even',
    },
    currentUserRole: userProfile?.role || 'employee',
    tasks,
    drafts,
    summary: {
      total: tasks.length,
      completed,
      totalHours,
    },
  });
}

// --- POST -- create daily_task from template ----------------------------

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rl = checkRateLimit(`wp-tasks:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }
  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 401 });
  }

  try {
    const { monthly_plan_id, title, description, task_date, spent_hours } = await req.json();
    if (!monthly_plan_id || !description) {
      return NextResponse.json({ error: 'monthly_plan_id and description required' }, { status: 400 });
    }

    const db = getDb();
    const taskType = Number(spent_hours) > 0 ? 'completed' : 'incomplete';

    const { data, error } = await db
      .from('daily_tasks')
      .insert({
        monthly_plan_id,
        user_id: userId,
        title: title || null,
        description,
        source: 'template',
        task_type: taskType,
        task_date: task_date || new Date().toISOString().slice(0, 10),
        spent_hours: Number(spent_hours) || 0,
        ...(taskType === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      })
      .select('daily_task_id')
      .single();

    if (error) throw error;
    logger.info(`[planner/tasks] Created task ${data!.daily_task_id} from template for ${userId}`);
    return NextResponse.json({ daily_task_id: data!.daily_task_id });
  } catch (err) {
    logger.error('[planner/tasks] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
