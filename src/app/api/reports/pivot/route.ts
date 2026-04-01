/**
 * Dynamic Pivot Report API
 * GET /api/reports/pivot?year=2026&groupBy=company&timeGrain=month&metric=hours
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { ROLE_GROUPS, hasRole } from '@/lib/shared/auth/role-groups';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { buildPivot, type BuildPivotParams } from '@/lib/ops/reports/pivot-service';
import type { PivotGroupBy, PivotTimeGrain, PivotMetric, PivotPeriodType, PivotFilters } from '@/types/pivot';

const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;

const VALID_GROUP_BY: PivotGroupBy[] = ['company', 'department', 'employee', 'process', 'procedure', 'category'];
const VALID_TIME_GRAIN: PivotTimeGrain[] = ['month', 'quarter'];
const VALID_METRIC: PivotMetric[] = ['hours', 'tasks', 'planned', 'cost', 'kpi'];
const VALID_PERIOD_TYPE: PivotPeriodType[] = ['month', 'quarter', 'year'];

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = getDbUserId(req);
  if (!userId) return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });

  const rl = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });

  const db = getDb();

  const { data: profile } = await db.from('user_profiles').select('role').eq('user_id', userId).single();
  if (!profile || !hasRole(profile.role as string, ROLE_GROUPS.REPORT_MANAGERS)) {
    return NextResponse.json({ error: 'Forbidden: insufficient role' }, { status: 403 });
  }

  // Parse & validate params
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
  const periodType = (url.searchParams.get('periodType') || 'year') as PivotPeriodType;
  const periodValue = url.searchParams.get('periodValue') ? Number(url.searchParams.get('periodValue')) : undefined;
  const groupByRaw = url.searchParams.get('groupBy') || 'company';
  const timeGrain = (url.searchParams.get('timeGrain') || 'month') as PivotTimeGrain;
  const metric = (url.searchParams.get('metric') || 'hours') as PivotMetric;
  const filtersRaw = url.searchParams.get('filters');

  if (year < 2000 || year > 2100) return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
  if (!VALID_PERIOD_TYPE.includes(periodType)) return NextResponse.json({ error: 'Invalid periodType' }, { status: 400 });
  if (periodType === 'month' && (periodValue === undefined || periodValue < 1 || periodValue > 12)) return NextResponse.json({ error: 'Invalid month value' }, { status: 400 });
  if (periodType === 'quarter' && (periodValue === undefined || periodValue < 1 || periodValue > 4)) return NextResponse.json({ error: 'Invalid quarter value' }, { status: 400 });
  if (!VALID_TIME_GRAIN.includes(timeGrain)) return NextResponse.json({ error: 'Invalid timeGrain' }, { status: 400 });
  if (!VALID_METRIC.includes(metric)) return NextResponse.json({ error: 'Invalid metric' }, { status: 400 });

  const groupBy = groupByRaw.split(',').map(s => s.trim()).filter(s => VALID_GROUP_BY.includes(s as PivotGroupBy)) as PivotGroupBy[];
  if (groupBy.length === 0) return NextResponse.json({ error: 'Invalid groupBy' }, { status: 400 });

  let filters: PivotFilters = {};
  if (filtersRaw) {
    try { filters = JSON.parse(filtersRaw) as PivotFilters; }
    catch { return NextResponse.json({ error: 'Invalid filters JSON' }, { status: 400 }); }
  }

  try {
    const params: BuildPivotParams = { year, periodType, periodValue, groupBy, timeGrain, metric, filters };
    const result = await buildPivot(db, params);
    return NextResponse.json(result);
  } catch (err) {
    logger.error('[Pivot API] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
