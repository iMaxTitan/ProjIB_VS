/**
 * POST   /api/plans/monthly/relations — add relation (assignee/company/project/document)
 * DELETE /api/plans/monthly/relations — remove relation
 * GET    /api/plans/monthly/relations?type=employees&department_id=xxx — list available items for dropdown
 *
 * Body: { monthly_plan_id, type: 'assignee'|'company'|'project'|'document', id: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { hasRole, ROLE_GROUPS } from '@/lib/shared/auth/role-groups';

const RATE = 60;
const RATE_WINDOW = 60_000;

type RelType = 'assignee' | 'company' | 'project' | 'document';

const TABLE_MAP: Record<RelType, { table: string; idCol: string }> = {
  assignee: { table: 'monthly_plan_assignees', idCol: 'user_id' },
  company: { table: 'monthly_plan_companies', idCol: 'company_id' },
  project: { table: 'monthly_plan_projects', idCol: 'project_id' },
  document: { table: 'monthly_plan_documents', idCol: 'kb_document_id' },
};

function guard(req: NextRequest) {
  if (!isRequestAuthorized(req)) return { error: 'Unauthorized', status: 401 };
  const userId = getDbUserId(req);
  if (!userId) return { error: 'Missing user ID', status: 401 };
  const rl = checkRateLimit(getRequesterKey(req), RATE, RATE_WINDOW);
  if (!rl.allowed) return { error: 'Too Many Requests', status: 429 };
  return { userId };
}

async function checkEditor(userId: string): Promise<boolean> {
  const db = getDb();
  const { data } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  const role = (data as { role: string } | null)?.role;
  return !!role && hasRole(role, ROLE_GROUPS.PLAN_EDITORS);
}

async function checkPlanPending(planId: string): Promise<boolean> {
  const db = getDb();
  const { data } = await db.from('monthly_plans').select('status').eq('monthly_plan_id', planId).single();
  return (data as { status: string } | null)?.status === 'pending';
}

// ─── GET — available items for dropdown ───

export async function GET(req: NextRequest) {
  const auth = guard(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await checkEditor(auth.userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const type = req.nextUrl.searchParams.get('type');
  const departmentId = req.nextUrl.searchParams.get('department_id');
  const planId = req.nextUrl.searchParams.get('plan_id');

  try {
    const db = getDb();

    if (type === 'employees' && departmentId) {
      // Employees from specific department, excluding already assigned
      let query = db.from('user_profiles')
        .select('user_id, full_name, role')
        .eq('department_id', departmentId)
        .eq('status', 'active')
        .order('full_name');

      const { data: employees } = await query;

      // Filter out already assigned if plan_id provided
      if (planId && employees) {
        const { data: assigned } = await db.from('monthly_plan_assignees')
          .select('user_id')
          .eq('monthly_plan_id', planId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assignedIds = new Set((assigned || []).map((a: any) => a.user_id as string));
        return NextResponse.json((employees as { user_id: string; full_name: string; role: string }[]).filter(e => !assignedIds.has(e.user_id)));
      }
      return NextResponse.json(employees || []);
    }

    if (type === 'companies') {
      const { data } = await db.from('companies')
        .select('company_id, company_name')
        .order('company_name');
      return NextResponse.json(data || []);
    }

    if (type === 'projects') {
      const { data } = await db.from('projects')
        .select('project_id, project_name')
        .order('project_name');
      return NextResponse.json(data || []);
    }

    if (type === 'documents') {
      const { data } = await db.from('kb_documents')
        .select('id, title')
        .eq('status', 'ready')
        .order('title')
        .limit(200);
      return NextResponse.json(data || []);
    }

    return NextResponse.json({ error: 'type required' }, { status: 400 });
  } catch (err) {
    logger.error('[plans/monthly/relations] GET error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ─── POST — add relation ───

export async function POST(req: NextRequest) {
  const auth = guard(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await checkEditor(auth.userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { monthly_plan_id, type, id } = (await req.json()) as {
      monthly_plan_id: string; type: RelType; id: string;
    };
    if (!monthly_plan_id || !type || !id) return NextResponse.json({ error: 'monthly_plan_id, type, id required' }, { status: 400 });

    const mapping = TABLE_MAP[type];
    if (!mapping) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });

    // Assignees can be added always; other relations only for pending plans
    if (type !== 'assignee' && !(await checkPlanPending(monthly_plan_id))) {
      return NextResponse.json({ error: 'Plan must be in pending status' }, { status: 403 });
    }

    const db = getDb();
    const { error } = await db.from(mapping.table).insert({
      monthly_plan_id,
      [mapping.idCol]: id,
    });
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Already exists' }, { status: 409 });
      throw error;
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    logger.error('[plans/monthly/relations] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ─── DELETE — remove relation ───

export async function DELETE(req: NextRequest) {
  const auth = guard(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await checkEditor(auth.userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { monthly_plan_id, type, id } = (await req.json()) as {
      monthly_plan_id: string; type: RelType; id: string;
    };
    if (!monthly_plan_id || !type || !id) return NextResponse.json({ error: 'monthly_plan_id, type, id required' }, { status: 400 });

    const mapping = TABLE_MAP[type];
    if (!mapping) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });

    const db = getDb();

    // Assignee removal: check for completed tasks
    if (type === 'assignee') {
      const { count } = await db.from('daily_tasks')
        .select('daily_task_id', { count: 'exact', head: true })
        .eq('monthly_plan_id', monthly_plan_id)
        .eq('user_id', id)
        .eq('task_type', 'completed');
      if (count && count > 0) {
        return NextResponse.json({ error: `Неможливо видалити — у співробітника є ${count} виконаних задач` }, { status: 400 });
      }
    } else if (!(await checkPlanPending(monthly_plan_id))) {
      return NextResponse.json({ error: 'Plan must be in pending status' }, { status: 403 });
    }

    const { error } = await db.from(mapping.table)
      .delete()
      .eq('monthly_plan_id', monthly_plan_id)
      .eq(mapping.idCol, id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[plans/monthly/relations] DELETE error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
