/**
 * GET /api/meetings/employees
 * Chief only — returns users that have Teams linked (teams_aad_oid IS NOT NULL).
 */

import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized, getDbUserId } from '@/lib/shared/api/request-guards';
import { getServerDb } from '@/lib/shared/db-server';
import logger from '@/lib/shared/logger';

export interface TeamsEmployee {
  user_id: string;
  full_name: string;
  department_name: string | null;
}

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestingUserId = getDbUserId(req);
  if (!requestingUserId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  try {
    const db = getServerDb();

    const { data: profile } = await db
      .from('user_profiles')
      .select('role')
      .eq('user_id', requestingUserId)
      .single();

    if (profile?.role !== 'chief') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await db
      .from('user_profiles')
      .select('user_id, full_name, department_id')
      .not('teams_aad_oid', 'is', null)
      .eq('status', 'active')
      .order('full_name');

    if (error) throw error;

    // Get department names
    const { data: depts } = await db
      .from('departments')
      .select('id, name');

    const deptMap = new Map((depts || []).map(d => [d.id, d.name]));

    const employees: TeamsEmployee[] = (data || []).map(u => ({
      user_id: u.user_id,
      full_name: u.full_name || '',
      department_name: u.department_id ? (deptMap.get(u.department_id) ?? null) : null,
    }));

    return NextResponse.json({ employees });
  } catch (err) {
    logger.error('[api/meetings/employees] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
