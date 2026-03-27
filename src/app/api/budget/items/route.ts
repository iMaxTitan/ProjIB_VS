/**
 * GET    /api/budget/items              — list budget items (optionally ?process_id=X)
 * POST   /api/budget/items              — create item (chief/head)
 * PATCH  /api/budget/items              — update item (chief/head)
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { hasRole, ROLE_GROUPS } from '@/lib/shared/auth/role-groups';

const RATE_READ = 30;
const RATE_WRITE = 10;
const RATE_WINDOW_MS = 60_000;

type AuthError = { error: string; status: number; retryAfterSec?: number };
type AuthOk = { userId: string };

function guardAuth(req: NextRequest, write = false): AuthError | AuthOk {
  if (!isRequestAuthorized(req)) return { error: 'Unauthorized', status: 401 };
  const userId = getDbUserId(req);
  if (!userId) return { error: 'Missing user ID', status: 401 };
  const limit = write ? RATE_WRITE : RATE_READ;
  const rl = checkRateLimit(getRequesterKey(req), limit, RATE_WINDOW_MS);
  if (!rl.allowed) return { error: 'Too Many Requests', status: 429, retryAfterSec: rl.retryAfterSec };
  return { userId };
}

function errResponse(auth: AuthError) {
  return NextResponse.json(
    { error: auth.error },
    { status: auth.status, ...(auth.status === 429 ? { headers: { 'Retry-After': String(auth.retryAfterSec) } } : {}) },
  );
}

async function checkWriteRole(userId: string): Promise<boolean> {
  const db = getDb();
  const { data } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  const role = (data as { role: string } | null)?.role;
  return !!role && hasRole(role, ROLE_GROUPS.REF_EDITORS);
}

// ─── GET ───

export async function GET(req: NextRequest) {
  const auth = guardAuth(req);
  if ('error' in auth) return errResponse(auth);

  try {
    const db = getDb();
    const processId = req.nextUrl.searchParams.get('process_id');

    let query = db
      .from('budget_items')
      .select('id, name, category_id, process_id, description, is_active, created_at, budget_categories(name), processes(process_name)')
      .order('created_at', { ascending: false });

    if (processId) {
      query = query.eq('process_id', processId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data);
  } catch (err) {
    logger.error('[budget/items] GET error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ─── POST ───

export async function POST(req: NextRequest) {
  const auth = guardAuth(req, true);
  if ('error' in auth) return errResponse(auth);

  if (!(await checkWriteRole(auth.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = getDb();
    const body = await req.json();
    const { name, category_id, process_id, description } = body as {
      name?: string; category_id?: string; process_id?: string; description?: string;
    };

    if (!name?.trim() || name.trim().length < 2) {
      return NextResponse.json({ error: 'name required (min 2 chars)' }, { status: 400 });
    }
    if (!category_id) return NextResponse.json({ error: 'category_id required' }, { status: 400 });
    if (!process_id) return NextResponse.json({ error: 'process_id required' }, { status: 400 });

    const { data, error } = await db
      .from('budget_items')
      .insert({ name: name.trim(), category_id, process_id, description: description?.trim() || null })
      .select('id, name, category_id, process_id, description, is_active, created_at')
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    logger.error('[budget/items] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ─── PATCH ───

export async function PATCH(req: NextRequest) {
  const auth = guardAuth(req, true);
  if ('error' in auth) return errResponse(auth);

  if (!(await checkWriteRole(auth.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = getDb();
    const body = await req.json();
    const { id, name, category_id, process_id, description, is_active } = body as {
      id?: string; name?: string; category_id?: string; process_id?: string;
      description?: string; is_active?: boolean;
    };

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      if (!name.trim() || name.trim().length < 2) return NextResponse.json({ error: 'name min 2 chars' }, { status: 400 });
      updates.name = name.trim();
    }
    if (category_id !== undefined) updates.category_id = category_id;
    if (process_id !== undefined) updates.process_id = process_id;
    if (description !== undefined) updates.description = description?.trim() || null;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await db
      .from('budget_items')
      .update(updates)
      .eq('id', id)
      .select('id, name, category_id, process_id, description, is_active, created_at')
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    logger.error('[budget/items] PATCH error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
