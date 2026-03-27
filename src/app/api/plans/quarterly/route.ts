/**
 * PATCH  /api/plans/quarterly  — update quarterly plan (expected_result, note, status)
 * DELETE /api/plans/quarterly?id=uuid — delete quarterly plan
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { hasRole, ROLE_GROUPS } from '@/lib/shared/auth/role-groups';

const RATE_WRITE = 10;
const RATE_WINDOW_MS = 60_000;

function guard(req: NextRequest) {
  if (!isRequestAuthorized(req)) return { error: 'Unauthorized', status: 401 };
  const userId = getDbUserId(req);
  if (!userId) return { error: 'Missing user ID', status: 401 };
  const rl = checkRateLimit(getRequesterKey(req), RATE_WRITE, RATE_WINDOW_MS);
  if (!rl.allowed) return { error: 'Too Many Requests', status: 429 };
  return { userId };
}

async function checkChief(userId: string): Promise<boolean> {
  const db = getDb();
  const { data } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  const role = (data as { role: string } | null)?.role;
  return !!role && hasRole(role, ROLE_GROUPS.PLAN_EDITORS);
}

// ─── POST (create or copy) ───

export async function POST(req: NextRequest) {
  const auth = guard(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await checkChief(auth.userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = getDb();
    const { process_id, year, quarter, copy_from_year, copy_from_quarter } = (await req.json()) as {
      process_id: string; year: number; quarter: number; copy_from_year?: number; copy_from_quarter?: number;
    };
    if (!process_id || !year || !quarter) return NextResponse.json({ error: 'process_id, year, quarter required' }, { status: 400 });

    const { data: existing } = await db.from('quarterly_plans').select('quarterly_id').eq('process_id', process_id).eq('year', year).eq('quarter', quarter).maybeSingle();
    if (existing) return NextResponse.json({ error: 'Plan already exists' }, { status: 409 });

    const { data: proc } = await db.from('processes').select('mission').eq('process_id', process_id).single();
    let expected_result = (proc as { mission?: string } | null)?.mission || '';
    let note: string | null = null;
    let initiativesToCopy: { title: string; description: string | null }[] = [];

    if (copy_from_year || copy_from_quarter) {
      const srcYear = copy_from_year || year;
      const srcQuarter = copy_from_quarter || quarter;
      const { data: prev } = await db.from('quarterly_plans').select('quarterly_id, expected_result, note')
        .eq('process_id', process_id).eq('year', srcYear).eq('quarter', srcQuarter).maybeSingle();
      if (prev) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = prev as any;
        expected_result = p.expected_result || expected_result;
        note = p.note || null;
        const { data: inits } = await db.from('quarterly_plan_initiatives').select('title, description').eq('quarterly_plan_id', p.quarterly_id);
        initiativesToCopy = (inits || []) as typeof initiativesToCopy;
      }
    }

    const { data: plan, error } = await db.from('quarterly_plans')
      .insert({ process_id, year, quarter, expected_result, note, status: 'pending' })
      .select('quarterly_id, year, quarter, process_id, expected_result, note, status')
      .single();
    if (error) throw error;

    if (initiativesToCopy.length > 0 && plan) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const planId = (plan as any).quarterly_id;
      await db.from('quarterly_plan_initiatives').insert(
        initiativesToCopy.map(i => ({ quarterly_plan_id: planId, title: i.title, description: i.description, status: 'planned' }))
      );
    }

    return NextResponse.json(plan, { status: 201 });
  } catch (err) {
    logger.error('[plans/quarterly] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ─── PATCH ───

export async function PATCH(req: NextRequest) {
  const auth = guard(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!(await checkChief(auth.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = getDb();
    const body = await req.json();
    const { id, expected_result, note, status } = body as {
      id?: string; expected_result?: string; note?: string; status?: string;
    };

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (expected_result !== undefined) updates.expected_result = expected_result.trim();
    if (note !== undefined) updates.note = note.trim() || null;
    if (status !== undefined) {
      if (!['pending', 'active', 'done'].includes(status)) {
        return NextResponse.json({ error: 'status must be pending, active, or done' }, { status: 400 });
      }
      updates.status = status;
    }

    const { data, error } = await db
      .from('quarterly_plans')
      .update(updates)
      .eq('quarterly_id', id)
      .select('quarterly_id, year, quarter, process_id, expected_result, note, status')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    logger.error('[plans/quarterly] PATCH error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ─── DELETE ───

export async function DELETE(req: NextRequest) {
  const auth = guard(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!(await checkChief(auth.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    const db = getDb();
    const { error } = await db.from('quarterly_plans').delete().eq('quarterly_id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[plans/quarterly] DELETE error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
