/**
 * PATCH /api/plans/status — update plan status for any plan table
 * Body: { id: uuid, table: 'monthly_plans' | 'annual_plans' | 'quarterly_plans', status: 'pending' | 'active' | 'done' }
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { hasRole, ROLE_GROUPS } from '@/lib/shared/auth/role-groups';

const VALID_TABLES = ['monthly_plans', 'annual_plans', 'quarterly_plans'] as const;
const VALID_STATUSES = ['pending', 'active', 'done'] as const;
const PK_MAP: Record<string, string> = {
  monthly_plans: 'monthly_plan_id',
  annual_plans: 'annual_id',
  quarterly_plans: 'quarterly_id',
};

export async function PATCH(req: NextRequest) {
  if (!isRequestAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = getDbUserId(req);
  if (!userId) return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  const rl = checkRateLimit(getRequesterKey(req), 20, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });

  const db = getDb();
  const { data: profile } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  const role = (profile as { role: string } | null)?.role;
  if (!role || !hasRole(role, ROLE_GROUPS.PLAN_EDITORS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id, table, status } = (await req.json()) as { id?: string; table?: string; status?: string };
    if (!id || !table || !status) return NextResponse.json({ error: 'id, table, status required' }, { status: 400 });
    if (!VALID_TABLES.includes(table as typeof VALID_TABLES[number])) return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

    const pk = PK_MAP[table];
    const { data, error } = await db
      .from(table)
      .update({ status, updated_at: new Date().toISOString() })
      .eq(pk, id)
      .select(`${pk}, status`)
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    logger.error('[plans/status] PATCH error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
