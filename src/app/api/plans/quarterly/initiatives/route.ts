/**
 * POST   /api/plans/quarterly/initiatives — create or link initiative to a plan
 * PATCH  /api/plans/quarterly/initiatives — update plan_initiative status or initiative fields
 * DELETE /api/plans/quarterly/initiatives?id=uuid — unlink initiative from plan
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
    const {
      initiative_id, title, description, source,
      quarterly_plan_id, annual_plan_id, monthly_plan_id,
    } = body as {
      initiative_id?: string; title?: string; description?: string; source?: string;
      quarterly_plan_id?: string; annual_plan_id?: string; monthly_plan_id?: string;
    };

    // At least one plan FK required
    if (!quarterly_plan_id && !annual_plan_id && !monthly_plan_id) {
      return NextResponse.json({ error: 'plan id required' }, { status: 400 });
    }

    let initId = initiative_id;

    // If no existing initiative — create new one
    if (!initId) {
      if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 });
      const { data: newInit, error: initErr } = await db
        .from('initiatives')
        .insert({ title: title.trim(), description: description?.trim() || null, source: source || 'planned' })
        .select('id')
        .single();
      if (initErr) throw initErr;
      initId = (newInit as unknown as { id: string }).id;
    }

    // Link initiative to plan
    const { data, error } = await db
      .from('plan_initiatives')
      .insert({
        initiative_id: initId,
        quarterly_plan_id: quarterly_plan_id || null,
        annual_plan_id: annual_plan_id || null,
        monthly_plan_id: monthly_plan_id || null,
      })
      .select('id, initiative_id, quarterly_plan_id, annual_plan_id, monthly_plan_id, status')
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    logger.error('[plans/initiatives] POST error:', err);
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
    const { id, status, title, description } = body as {
      id?: string; status?: string; title?: string; description?: string;
    };

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    // Update status on plan_initiatives link
    if (status !== undefined) {
      if (!['planned', 'in_progress', 'completed'].includes(status)) {
        return NextResponse.json({ error: 'invalid status' }, { status: 400 });
      }
      const { error } = await db
        .from('plan_initiatives')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    }

    // Update initiative fields (title/description) on initiatives table
    if (title !== undefined || description !== undefined) {
      // Get initiative_id from plan_initiatives
      const { data: link } = await db
        .from('plan_initiatives')
        .select('initiative_id')
        .eq('id', id)
        .single();
      if (link) {
        const updates: Record<string, unknown> = {};
        if (title !== undefined) updates.title = title.trim();
        if (description !== undefined) updates.description = description.trim() || null;
        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          const { error } = await db.from('initiatives').update(updates).eq('id', (link as unknown as { initiative_id: string }).initiative_id);
          if (error) throw error;
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[plans/initiatives] PATCH error:', err);
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
    // Delete link only, initiative stays in справочник
    const { error } = await db.from('plan_initiatives').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[plans/initiatives] DELETE error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
