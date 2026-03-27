/**
 * POST   /api/plans/annual/budget — add budget item to annual plan
 * PATCH  /api/plans/annual/budget — update amount/dates
 * DELETE /api/plans/annual/budget?id=uuid — remove
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

async function checkWriteRole(userId: string): Promise<boolean> {
  const db = getDb();
  const { data } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  const role = (data as { role: string } | null)?.role;
  return !!role && hasRole(role, ROLE_GROUPS.PLAN_EDITORS);
}

// ─── POST ───

export async function POST(req: NextRequest) {
  const auth = guard(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await checkWriteRole(auth.userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = getDb();
    const body = await req.json();
    const { annual_plan_id, budget_item_id, amount, payment_date, reminder_date } = body as {
      annual_plan_id?: string; budget_item_id?: string; amount?: number;
      payment_date?: string; reminder_date?: string;
    };

    if (!annual_plan_id) return NextResponse.json({ error: 'annual_plan_id required' }, { status: 400 });
    if (!budget_item_id) return NextResponse.json({ error: 'budget_item_id required' }, { status: 400 });
    if (amount == null || amount < 0) return NextResponse.json({ error: 'amount required (>= 0)' }, { status: 400 });

    const { data, error } = await db
      .from('annual_plan_budget')
      .insert({
        annual_plan_id, budget_item_id, amount,
        payment_date: payment_date || null,
        reminder_date: reminder_date || null,
      })
      .select('id, annual_plan_id, budget_item_id, amount, payment_date, reminder_date, budget_items(name, budget_categories(name))')
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    logger.error('[plans/annual/budget] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ─── PATCH ───

export async function PATCH(req: NextRequest) {
  const auth = guard(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await checkWriteRole(auth.userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = getDb();
    const body = await req.json();
    const { id, amount, payment_date, reminder_date } = body as {
      id?: string; amount?: number; payment_date?: string | null; reminder_date?: string | null;
    };

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (amount !== undefined) updates.amount = amount;
    if (payment_date !== undefined) updates.payment_date = payment_date || null;
    if (reminder_date !== undefined) updates.reminder_date = reminder_date || null;

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No fields' }, { status: 400 });

    const { data, error } = await db
      .from('annual_plan_budget')
      .update(updates)
      .eq('id', id)
      .select('id, annual_plan_id, budget_item_id, amount, payment_date, reminder_date, budget_items(name, budget_categories(name))')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    logger.error('[plans/annual/budget] PATCH error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ─── DELETE ───

export async function DELETE(req: NextRequest) {
  const auth = guard(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await checkWriteRole(auth.userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    const db = getDb();
    const { error } = await db.from('annual_plan_budget').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[plans/annual/budget] DELETE error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
