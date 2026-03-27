/**
 * GET/PUT /api/telegram/permissions
 * Manage Telegram bot tool permissions (chief only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId, checkRateLimit, getRequesterKey } from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';
import { invalidatePermissionsCache } from '@/lib/bot/core/permissions';
import { botRegistry } from '@/lib/bot/core/registry';

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

async function checkChiefRole(db: ReturnType<typeof getServerDb>, userId: string): Promise<boolean> {
  const { data } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .single();
  return data?.role === 'chief';
}

/** GET — list all permissions + available tools */
export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const db = getServerDb();

  if (!await checkChiefRole(db, userId)) {
    return NextResponse.json({ error: 'Forbidden — chief only' }, { status: 403 });
  }

  const { data: permissions } = await db
    .from('bot_permissions')
    .select('*')
    .order('tool_name');

  const tools = botRegistry.getAll().map(t => ({
    name: t.name,
    label: t.label,
    description: t.description,
    supportedScopes: t.supportedScopes,
  }));

  return NextResponse.json({ permissions: permissions || [], tools });
}

/** PUT — update a permission */
export async function PUT(req: NextRequest) {
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
  const { role, toolName, isEnabled, scope } = body as {
    role?: string;
    toolName?: string;
    isEnabled?: boolean;
    scope?: string;
  };

  if (!role || !['employee', 'head', 'chief'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }
  if (!toolName) {
    return NextResponse.json({ error: 'Missing toolName' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof isEnabled === 'boolean') updateData.is_enabled = isEnabled;
  if (scope && ['own', 'department', 'all'].includes(scope)) updateData.scope = scope;

  const { error } = await db
    .from('bot_permissions')
    .update(updateData)
    .eq('role', role)
    .eq('tool_name', toolName);

  if (error) {
    return NextResponse.json({ error: 'Failed to update permission' }, { status: 500 });
  }

  // Invalidate cache
  invalidatePermissionsCache();

  return NextResponse.json({ ok: true });
}
