/**
 * GET /api/cabinet/vacation-balance — vacation day balance for the current user.
 *
 * Query params:
 *   ?year=2026  (required, 2020–2100)
 *
 * Response: { totalAllowed: 24, used: number, pending: number, remaining: number, breakdown: {...} }
 *
 * Uses `planned_absences` table — counts approved + pending calendar days.
 */

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { getServerDb } from '@/lib/shared/db-server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';

// ─── Rate limit config ───
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

/** KZoT annual vacation allowance (calendar days) */
const ANNUAL_ALLOWANCE = 24;

interface VacationBalance {
  /** Total annual allowance (calendar days) */
  totalAllowed: number;
  /** Used (approved) calendar days */
  used: number;
  /** Pending (awaiting approval) calendar days */
  pending: number;
  /** Remaining = totalAllowed - used - pending */
  remaining: number;
  /** Breakdown by absence type */
  breakdown: {
    used14d: number;
    used10d: number;
    used5d: number;
    pending14d: number;
    pending10d: number;
    pending5d: number;
  };
}

export async function GET(req: NextRequest) {
  // 1. Auth
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Rate limiting
  const rateLimit = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
    );
  }

  // 3. User ID from cookie
  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  // 4. Validate year param
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year'));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
  }

  try {
    const db = getServerDb();

    // 5. Fetch all non-rejected absences for the user & year
    const { data, error } = await db
      .from('planned_absences')
      .select('absence_type, calendar_days, status')
      .eq('user_id', userId)
      .eq('year', year)
      .in('status', ['pending', 'approved']);

    if (error) throw error;

    // 6. Compute balance
    let usedDays = 0;
    let pendingDays = 0;
    let used14d = 0;
    let used10d = 0;
    let used5d = 0;
    let pending14d = 0;
    let pending10d = 0;
    let pending5d = 0;

    for (const row of data || []) {
      const days = (row.calendar_days as number) || 0;
      const type = row.absence_type as string;
      const isApproved = row.status === 'approved';

      if (isApproved) {
        usedDays += days;
        if (type === '14d') used14d++;
        else if (type === '10d') used10d++;
        else used5d++;
      } else {
        pendingDays += days;
        if (type === '14d') pending14d++;
        else if (type === '10d') pending10d++;
        else pending5d++;
      }
    }

    const balance: VacationBalance = {
      totalAllowed: ANNUAL_ALLOWANCE,
      used: usedDays,
      pending: pendingDays,
      remaining: Math.max(0, ANNUAL_ALLOWANCE - usedDays - pendingDays),
      breakdown: {
        used14d,
        used10d,
        used5d,
        pending14d,
        pending10d,
        pending5d,
      },
    };

    return NextResponse.json(balance);
  } catch (error: unknown) {
    logger.error('[cabinet/vacation-balance] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
