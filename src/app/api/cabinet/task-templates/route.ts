/**
 * GET    /api/cabinet/task-templates?procedure_id=X  — list active templates
 * POST   /api/cabinet/task-templates                 — create template (chief/head)
 * PATCH  /api/cabinet/task-templates                 — update template (chief/head)
 * DELETE /api/cabinet/task-templates?id=X            — soft-delete template (chief/head)
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { hasRole, ROLE_GROUPS } from '@/lib/shared/auth/role-groups';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '@/lib/ops/planner/task-templates';

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

async function checkWriteRole(db: ReturnType<typeof getDb>, userId: string): Promise<string | null> {
  const { data } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  const role = (data as { role: string } | null)?.role;
  if (!role || !hasRole(role, ROLE_GROUPS.REF_EDITORS)) return null;
  return role;
}

// ─── GET ───

export async function GET(req: NextRequest) {
  const auth = guardAuth(req);
  if ('error' in auth) return errResponse(auth);

  const procedureId = req.nextUrl.searchParams.get('procedure_id');
  if (!procedureId) {
    return NextResponse.json({ error: 'procedure_id required' }, { status: 400 });
  }

  try {
    const db = getDb();
    const templates = await getTemplates(db, procedureId);
    return NextResponse.json(templates);
  } catch (err) {
    logger.error('[TaskTemplates API] GET error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ─── POST ───

export async function POST(req: NextRequest) {
  const auth = guardAuth(req, true);
  if ('error' in auth) return errResponse(auth);

  try {
    const db = getDb();
    const role = await checkWriteRole(db, auth.userId);
    if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { procedure_id, title, content } = body as {
      procedure_id?: string;
      title?: string;
      content?: string;
    };

    if (!procedure_id) return NextResponse.json({ error: 'procedure_id required' }, { status: 400 });
    if (!title?.trim() || title.trim().length < 3) return NextResponse.json({ error: 'title required (min 3 chars)' }, { status: 400 });
    if (!content?.trim() || content.trim().length < 10) return NextResponse.json({ error: 'content required (min 10 chars)' }, { status: 400 });

    const created = await createTemplate(db, procedure_id, title.trim(), content.trim(), auth.userId);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    logger.error('[TaskTemplates API] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ─── PATCH ───

export async function PATCH(req: NextRequest) {
  const auth = guardAuth(req, true);
  if ('error' in auth) return errResponse(auth);

  try {
    const db = getDb();
    const role = await checkWriteRole(db, auth.userId);
    if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { id, title, content, is_active } = body as {
      id?: string;
      title?: string;
      content?: string;
      is_active?: boolean;
    };

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (title !== undefined) {
      if (!title.trim() || title.trim().length < 3) return NextResponse.json({ error: 'title min 3 chars' }, { status: 400 });
      updates.title = title.trim();
    }
    if (content !== undefined) {
      if (!content.trim() || content.trim().length < 10) return NextResponse.json({ error: 'content min 10 chars' }, { status: 400 });
      updates.content = content.trim();
    }
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

    const updated = await updateTemplate(db, id, updates);
    return NextResponse.json(updated);
  } catch (err) {
    logger.error('[TaskTemplates API] PATCH error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ─── DELETE ───

export async function DELETE(req: NextRequest) {
  const auth = guardAuth(req, true);
  if ('error' in auth) return errResponse(auth);

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    const db = getDb();
    const role = await checkWriteRole(db, auth.userId);
    if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await deleteTemplate(db, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[TaskTemplates API] DELETE error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
