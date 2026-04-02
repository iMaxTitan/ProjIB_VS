/**
 * POST   /api/plans/monthly — create or copy monthly plan
 * DELETE /api/plans/monthly?id=uuid — delete monthly plan
 *
 * POST body: { procedure_id, year, month, quarterly_id?, copy_from_month?, planned_hours? }
 * copy_from_month: number (1-12) — copy from that month of the same year, or previous year December if month=1
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { hasRole, ROLE_GROUPS } from '@/lib/shared/auth/role-groups';

const RATE_WRITE = 30;
const RATE_WINDOW_MS = 60_000;

function guard(req: NextRequest) {
  if (!isRequestAuthorized(req)) return { error: 'Unauthorized', status: 401 };
  const userId = getDbUserId(req);
  if (!userId) return { error: 'Missing user ID', status: 401 };
  const rl = checkRateLimit(getRequesterKey(req), RATE_WRITE, RATE_WINDOW_MS);
  if (!rl.allowed) return { error: 'Too Many Requests', status: 429 };
  return { userId };
}

async function checkEditor(userId: string): Promise<boolean> {
  const db = getDb();
  const { data } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  const role = (data as { role: string } | null)?.role;
  return !!role && hasRole(role, ROLE_GROUPS.PLAN_EDITORS);
}

// ─── POST ───

export async function POST(req: NextRequest) {
  const auth = guard(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await checkEditor(auth.userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = getDb();
    const { procedure_id, year, month, quarterly_id, copy_from_month, planned_hours } = (await req.json()) as {
      procedure_id: string; year: number; month: number;
      quarterly_id?: string; copy_from_month?: number; planned_hours?: number;
    };
    if (!procedure_id || !year || !month) {
      return NextResponse.json({ error: 'procedure_id, year, month required' }, { status: 400 });
    }

    // Check if already exists
    const { data: existing } = await db.from('monthly_plans')
      .select('monthly_plan_id')
      .eq('procedure_id', procedure_id).eq('year', year).eq('month', month)
      .maybeSingle();
    if (existing) return NextResponse.json({ error: 'Plan already exists' }, { status: 409 });

    // Resolve quarterly_id if not provided
    let qId = quarterly_id || null;
    if (!qId) {
      const q = Math.ceil(month / 3);
      const { data: qp } = await db.from('quarterly_plans')
        .select('quarterly_id')
        .eq('year', year).eq('quarter', q)
        .limit(1)
        .maybeSingle();
      qId = (qp as Record<string, string>)?.quarterly_id || null;
    }

    // Base plan data
    let hours = planned_hours || 0;
    let description: string | null = null;
    let distributionType = 'even';
    let companiesToCopy: string[] = [];
    let projectsToCopy: string[] = [];
    let docsToCopy: string[] = [];
    let assigneesToCopy: string[] = [];

    // Copy from previous month
    if (copy_from_month) {
      const srcMonth = copy_from_month;
      const srcYear = srcMonth === 0 ? year - 1 : year;
      const actualSrcMonth = srcMonth === 0 ? 12 : srcMonth;

      const { data: prev } = await db.from('monthly_plans')
        .select('monthly_plan_id, planned_hours, description, distribution_type')
        .eq('procedure_id', procedure_id).eq('year', srcYear).eq('month', actualSrcMonth)
        .maybeSingle();

      if (prev) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = prev as any;
        hours = p.planned_hours || hours;
        description = p.description;
        distributionType = p.distribution_type || 'even';

        // Copy companies
        const { data: companies } = await db.from('monthly_plan_companies').select('company_id').eq('monthly_plan_id', p.monthly_plan_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        companiesToCopy = ((companies || []) as any[]).map(c => c.company_id);

        // Copy projects
        const { data: projects } = await db.from('monthly_plan_projects').select('project_id').eq('monthly_plan_id', p.monthly_plan_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        projectsToCopy = ((projects || []) as any[]).map(pr => pr.project_id);

        // Copy docs
        const { data: docs } = await db.from('monthly_plan_documents').select('kb_document_id').eq('monthly_plan_id', p.monthly_plan_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        docsToCopy = ((docs || []) as any[]).map(d => d.kb_document_id);

        // Copy assignees
        const { data: assignees } = await db.from('monthly_plan_assignees').select('user_id').eq('monthly_plan_id', p.monthly_plan_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assigneesToCopy = ((assignees || []) as any[]).map(a => a.user_id);
      }
    }

    // Create plan
    const { data: plan, error } = await db.from('monthly_plans')
      .insert({
        procedure_id, year, month, quarterly_id: qId,
        planned_hours: hours, description, distribution_type: distributionType,
        status: 'pending', created_by: auth.userId,
      })
      .select('monthly_plan_id, year, month, procedure_id, status, planned_hours')
      .single();

    if (error) throw error;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const planId = (plan as any).monthly_plan_id;

    // Copy related data
    if (companiesToCopy.length > 0) {
      await db.from('monthly_plan_companies').insert(companiesToCopy.map(cid => ({ monthly_plan_id: planId, company_id: cid })));
    }
    if (projectsToCopy.length > 0) {
      await db.from('monthly_plan_projects').insert(projectsToCopy.map(pid => ({ monthly_plan_id: planId, project_id: pid })));
    }
    if (docsToCopy.length > 0) {
      await db.from('monthly_plan_documents').insert(docsToCopy.map(did => ({ monthly_plan_id: planId, kb_document_id: did })));
    }
    if (assigneesToCopy.length > 0) {
      await db.from('monthly_plan_assignees').insert(assigneesToCopy.map(uid => ({ monthly_plan_id: planId, user_id: uid })));
    }

    return NextResponse.json(plan, { status: 201 });
  } catch (err) {
    logger.error('[plans/monthly] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ─── DELETE ───

export async function DELETE(req: NextRequest) {
  const auth = guard(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await checkEditor(auth.userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    const db = getDb();
    const { error } = await db.from('monthly_plans').delete().eq('monthly_plan_id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[plans/monthly] DELETE error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
