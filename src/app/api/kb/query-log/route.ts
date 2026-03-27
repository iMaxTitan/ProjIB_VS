/**
 * GET/PATCH /api/kb/query-log
 * KB query analytics — chief only.
 * GET: list query logs with filters
 * PATCH: update triage label
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId, checkRateLimit, getRequesterKey } from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

async function checkChiefRole(db: ReturnType<typeof getServerDb>, userId: string): Promise<boolean> {
  const { data } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();
  return data?.role === 'chief';
}

/** GET — list logs with optional filters */
export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  const db = getServerDb();

  if (!await checkChiefRole(db, userId)) {
    return NextResponse.json({ error: 'Forbidden — chief only' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
  const offset = parseInt(searchParams.get('offset') || '0');
  const source = searchParams.get('source');       // 'telegram' | 'teams'
  const status = searchParams.get('status');        // 'failed' | 'untriaged'
  const dateFrom = searchParams.get('dateFrom');    // ISO string
  const dateTo = searchParams.get('dateTo');        // ISO string

  let query = db
    .from('kb_query_log')
    .select('*, user_profiles!kb_query_log_user_id_fkey(full_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (source && ['telegram', 'teams', 'web', 'voice-bot'].includes(source)) {
    query = query.eq('source', source);
  }

  if (status === 'failed') {
    query = query.or('chunks_found.eq.0,ai_refused.eq.true');
  } else if (status === 'untriaged') {
    query = query.is('triage_label', null);
  }

  if (dateFrom) {
    query = query.gte('created_at', dateFrom);
  }
  if (dateTo) {
    query = query.lte('created_at', dateTo);
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('[kb/query-log] GET error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [], total: count ?? 0 });
}

/** PATCH — update triage label for a log entry */
export async function PATCH(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  const db = getServerDb();

  if (!await checkChiefRole(db, userId)) {
    return NextResponse.json({ error: 'Forbidden — chief only' }, { status: 403 });
  }

  const body = await req.json();
  const { id, triageLabel, triageNote } = body as {
    id?: string;
    triageLabel?: string;
    triageNote?: string;
  };

  if (!id) {
    return NextResponse.json({ error: 'Missing log id' }, { status: 400 });
  }

  const validLabels = ['bad_docs', 'bad_query', 'garbage', 'out_of_scope', 'ok'];
  if (triageLabel && !validLabels.includes(triageLabel)) {
    return NextResponse.json({ error: 'Invalid triage label' }, { status: 400 });
  }

  const { error } = await db
    .from('kb_query_log')
    .update({
      triage_label: triageLabel || null,
      triage_note: triageNote || null,
      triaged_at: new Date().toISOString(),
      triaged_by: userId,
    })
    .eq('id', id);

  if (error) {
    logger.error('[kb/query-log] PATCH error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
