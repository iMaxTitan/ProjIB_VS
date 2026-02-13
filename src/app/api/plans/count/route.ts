import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/api/request-guards';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

let _db: ReturnType<typeof createClient> | null = null;
function getDb() {
  if (_db) return _db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  _db = createClient(url, key, { auth: { persistSession: false } });
  return _db;
}

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
    );
  }

  // DB user_id из httpOnly cookie (установлен при логине), fallback на query param
  const cookieUserId = getDbUserId(req);
  const queryUserId = new URL(req.url).searchParams.get('userId');

  // Если оба есть и не совпадают — отклоняем
  if (cookieUserId && queryUserId && cookieUserId !== queryUserId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = cookieUserId || queryUserId;
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  try {
    const db = getDb();

    const [annualResult, assignedResult, createdResult] = await Promise.all([
      db.from('annual_plans').select('annual_id').eq('user_id', userId),
      db.from('monthly_plan_assignees').select('monthly_plan_id').eq('user_id', userId),
      db.from('monthly_plans').select('monthly_plan_id').eq('created_by', userId),
    ]);

    if (assignedResult.error) throw assignedResult.error;
    if (createdResult.error) throw createdResult.error;

    const annualIds = (annualResult.data || []).map(r => r.annual_id).filter(Boolean);

    let quarterly = 0;
    if (annualIds.length > 0) {
      const { count, error } = await db
        .from('quarterly_plans')
        .select('quarterly_id', { count: 'exact', head: true })
        .in('annual_plan_id', annualIds);
      if (error) throw error;
      quarterly = count || 0;
    }

    const monthlyIds = new Set([
      ...(assignedResult.data || []).map(r => r.monthly_plan_id),
      ...(createdResult.data || []).map(r => r.monthly_plan_id),
    ]);

    return NextResponse.json({
      annual: annualIds.length,
      quarterly,
      monthly: monthlyIds.size,
    });
  } catch (error: unknown) {
    logger.error('[plans/count] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
