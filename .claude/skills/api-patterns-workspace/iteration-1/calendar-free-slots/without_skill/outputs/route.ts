/**
 * POST /api/calendar/free-slots — get free time slots from Outlook calendar via Graph API.
 * Body: { weekStart: string, weekEnd: string } — date range (YYYY-MM-DD).
 * Returns: { slots: Array<{ start: string, end: string, date: string }> }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { getGraphToken, graphPost } from '@/lib/ops/graph/client';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIMEZONE = 'Europe/Kyiv';

// Working hours
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const MIN_SLOT_MINUTES = 30;

interface ScheduleItem {
  status: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
}

interface ScheduleResponse {
  value: Array<{
    scheduleId: string;
    availabilityView: string;
    scheduleItems: ScheduleItem[];
  }>;
}

interface FreeSlot {
  start: string;
  end: string;
  date: string;
  durationMinutes: number;
}

function guardAuth(req: NextRequest) {
  if (!isRequestAuthorized(req)) return { error: 'Unauthorized', status: 401 };
  const userId = getDbUserId(req);
  if (!userId) return { error: 'Missing user ID', status: 401 };
  const rl = checkRateLimit(`cal-free:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) return { error: 'Too Many Requests', status: 429 };
  return { userId };
}

function computeFreeSlots(
  scheduleItems: ScheduleItem[],
  weekStart: string,
  weekEnd: string,
): FreeSlot[] {
  const slots: FreeSlot[] = [];
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(weekEnd + 'T23:59:59');

  // Iterate each day in the range
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const dateStr = d.toISOString().slice(0, 10);
    const dayStart = new Date(d);
    dayStart.setHours(WORK_START_HOUR, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(WORK_END_HOUR, 0, 0, 0);

    // Collect busy intervals for this day
    const busyIntervals: Array<{ start: number; end: number }> = [];

    for (const item of scheduleItems) {
      if (item.status === 'free') continue;

      const eventStart = new Date(item.start.dateTime);
      const eventEnd = new Date(item.end.dateTime);

      // Clamp to working hours
      const clampedStart = Math.max(eventStart.getTime(), dayStart.getTime());
      const clampedEnd = Math.min(eventEnd.getTime(), dayEnd.getTime());

      if (clampedStart < clampedEnd) {
        busyIntervals.push({ start: clampedStart, end: clampedEnd });
      }
    }

    // Sort busy intervals by start time
    busyIntervals.sort((a, b) => a.start - b.start);

    // Merge overlapping intervals
    const merged: Array<{ start: number; end: number }> = [];
    for (const interval of busyIntervals) {
      const last = merged[merged.length - 1];
      if (last && interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
      } else {
        merged.push({ ...interval });
      }
    }

    // Find gaps between busy intervals within working hours
    let cursor = dayStart.getTime();
    for (const interval of merged) {
      if (interval.start > cursor) {
        const durationMinutes = (interval.start - cursor) / 60_000;
        if (durationMinutes >= MIN_SLOT_MINUTES) {
          slots.push({
            start: new Date(cursor).toISOString(),
            end: new Date(interval.start).toISOString(),
            date: dateStr,
            durationMinutes: Math.round(durationMinutes),
          });
        }
      }
      cursor = Math.max(cursor, interval.end);
    }

    // Gap after last busy interval until end of work day
    if (cursor < dayEnd.getTime()) {
      const durationMinutes = (dayEnd.getTime() - cursor) / 60_000;
      if (durationMinutes >= MIN_SLOT_MINUTES) {
        slots.push({
          start: new Date(cursor).toISOString(),
          end: dayEnd.toISOString(),
          date: dateStr,
          durationMinutes: Math.round(durationMinutes),
        });
      }
    }
  }

  return slots;
}

export async function POST(req: NextRequest) {
  const auth = guardAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { weekStart, weekEnd } = await req.json();

    if (!weekStart || !DATE_RE.test(weekStart) || !weekEnd || !DATE_RE.test(weekEnd)) {
      return NextResponse.json(
        { error: 'Invalid weekStart/weekEnd (YYYY-MM-DD)' },
        { status: 400 },
      );
    }

    const db = getDb();

    // Get Azure AD OID for Graph API calls
    const { data: profile } = await db
      .from('user_profiles')
      .select('teams_aad_oid, email')
      .eq('user_id', auth.userId)
      .single();

    const oid = profile?.teams_aad_oid;
    const email = profile?.email;
    if (!oid || !email) {
      return NextResponse.json(
        { error: "Немає прив'язки до Teams" },
        { status: 400 },
      );
    }

    const token = await getGraphToken();
    if (!token) {
      return NextResponse.json({ error: 'Graph API unavailable' }, { status: 502 });
    }

    // Use Graph getSchedule API to get busy/free info
    const scheduleUrl = 'https://graph.microsoft.com/v1.0/users/' + oid + '/calendar/getSchedule';
    const result = await graphPost<ScheduleResponse>(token, scheduleUrl, {
      schedules: [email],
      startTime: {
        dateTime: weekStart + 'T00:00:00',
        timeZone: TIMEZONE,
      },
      endTime: {
        dateTime: weekEnd + 'T23:59:59',
        timeZone: TIMEZONE,
      },
      availabilityViewInterval: 30,
    });

    if (!result.ok || !result.data?.value?.length) {
      logger.warn('[calendar/free-slots] Graph getSchedule failed:', result.status);
      return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 502 });
    }

    const schedule = result.data.value[0];
    const freeSlots = computeFreeSlots(schedule.scheduleItems || [], weekStart, weekEnd);

    return NextResponse.json({ slots: freeSlots });
  } catch (err) {
    logger.error('[calendar/free-slots] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
