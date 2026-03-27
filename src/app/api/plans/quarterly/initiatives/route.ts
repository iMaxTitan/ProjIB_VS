/**
 * POST   /api/plans/quarterly/initiatives — create initiative
 * PATCH  /api/plans/quarterly/initiatives — update initiative (title, description, status)
 * DELETE /api/plans/quarterly/initiatives?id=uuid — delete initiative
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
  return !!role && hasRole(role, ROLE_GROUPS.REF_EDITORS);
}

// ─── POST ───

export async function POST(req: NextRequest) {
  const auth = guard(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await checkWriteRole(auth.userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const db = getDb();
    const body = await req.json();
    const { quarterly_plan_id, title, description } = body as {
      quarterly_plan_id?: string; title?: string; description?: string;
    };

    if (!quarterly_plan_id) return NextResponse.json({ error: 'quarterly_plan_id required' }, { status: 400 });
    if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 });

    const { data, error } = await db
      .from('quarterly_plan_initiatives')
      .insert({ quarterly_plan_id, title: title.trim(), description: description?.trim() || null })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    logger.error('[plans/quarterly/initiatives] POST error:', err);
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
    const { id, title, description, status } = body as {
      id?: string; title?: string; description?: string; status?: string;
    };

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description.trim() || null;
    if (status !== undefined) {
      if (!['planned', 'in_progress', 'completed'].includes(status)) {
        return NextResponse.json({ error: 'invalid status' }, { status: 400 });
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No fields' }, { status: 400 });

    const { data, error } = await db
      .from('quarterly_plan_initiatives')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    logger.error('[plans/quarterly/initiatives] PATCH error:', err);
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
    const { error } = await db.from('quarterly_plan_initiatives').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[plans/quarterly/initiatives] DELETE error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
