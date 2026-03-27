/**
 * PATCH  /api/plans/annual  — update annual plan (expected_result, status)
 * DELETE /api/plans/annual?id=uuid — delete annual plan
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
    const { process_id, year, copy_from_year } = (await req.json()) as {
      process_id: string; year: number; copy_from_year?: number;
    };
    if (!process_id || !year) return NextResponse.json({ error: 'process_id and year required' }, { status: 400 });

    // Check if already exists
    const { data: existing } = await db.from('annual_plans').select('annual_id').eq('process_id', process_id).eq('year', year).maybeSingle();
    if (existing) return NextResponse.json({ error: 'Plan already exists' }, { status: 409 });

    // Get process mission as default expected_result
    const { data: proc } = await db.from('processes').select('mission').eq('process_id', process_id).single();
    let expected_result = (proc as { mission?: string } | null)?.mission || '';

    // Copy from previous year if requested
    let budgetItemsToCopy: { budget_item_id: string; amount: number; payment_date: string | null }[] = [];
    if (copy_from_year) {
      const { data: prev } = await db.from('annual_plans').select('annual_id, expected_result').eq('process_id', process_id).eq('year', copy_from_year).maybeSingle();
      if (prev) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prevAny = prev as any;
        expected_result = prevAny.expected_result || expected_result;
        const { data: budgets } = await db.from('annual_plan_budget').select('budget_item_id, amount, payment_date').eq('annual_plan_id', prevAny.annual_id);
        budgetItemsToCopy = (budgets || []) as typeof budgetItemsToCopy;
      }
    }

    // Create plan
    const { data: plan, error } = await db.from('annual_plans')
      .insert({ process_id, year, expected_result, status: 'pending' })
      .select('annual_id, year, process_id, expected_result, status')
      .single();
    if (error) throw error;

    // Copy budget items
    if (budgetItemsToCopy.length > 0 && plan) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const planId = (plan as any).annual_id;
      await db.from('annual_plan_budget').insert(
        budgetItemsToCopy.map(b => ({ annual_plan_id: planId, budget_item_id: b.budget_item_id, amount: b.amount, payment_date: b.payment_date }))
      );
    }

    return NextResponse.json(plan, { status: 201 });
  } catch (err) {
    logger.error('[plans/annual] POST error:', err);
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
    const { id, expected_result, status } = body as {
      id?: string; expected_result?: string; status?: string;
    };

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (expected_result !== undefined) updates.expected_result = expected_result.trim();
    if (status !== undefined) {
      if (!['pending', 'active', 'done'].includes(status)) {
        return NextResponse.json({ error: 'status must be pending, active, or done' }, { status: 400 });
      }
      updates.status = status;
    }

    const { data, error } = await db
      .from('annual_plans')
      .update(updates)
      .eq('annual_id', id)
      .select('annual_id, year, process_id, expected_result, status')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    logger.error('[plans/annual] PATCH error:', err);
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
    const { error } = await db.from('annual_plans').delete().eq('annual_id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[plans/annual] DELETE error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
