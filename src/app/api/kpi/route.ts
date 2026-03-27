/**
 * API endpoint for KPI computation
 * GET /api/kpi?year=2026&periodType=month|quarter|year&periodValue=2
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { isRequestAuthorized, getRequesterKey, getDbUserId, checkRateLimit } from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { computeKPI } from '@/lib/ops';

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

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
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
  const periodType = url.searchParams.get('periodType') || 'year';
  const periodValue = url.searchParams.get('periodValue') ? Number(url.searchParams.get('periodValue')) : undefined;

  if (year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
  }
  if (!['month', 'quarter', 'year'].includes(periodType)) {
    return NextResponse.json({ error: 'Invalid periodType' }, { status: 400 });
  }

  try {
    const db = getDb();
    const data = await computeKPI(db, userId, year, periodType, periodValue);
    return NextResponse.json(data);
  } catch (err) {
    logger.error('[KPI API] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
