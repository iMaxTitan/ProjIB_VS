/**
 * POST /api/calendar/free-slots — get free calendar slots for the current user's week.
 *
 * Body: { weekStart: string, weekEnd: string, slotDurationMinutes?: number }
 *   - weekStart/weekEnd: YYYY-MM-DD date range
 *   - slotDurationMinutes: minimum slot duration to include (default 30)
 *
 * Returns: { slots: Array<{ date: string; start: string; end: string; durationMinutes: number }> }
 *
 * Uses Graph API calendarView to fetch busy events, then computes free windows
 * within working hours (09:00–18:00 Europe/Kyiv).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import { getGraphToken } from '@/lib/ops/graph/client';
import { fetchWithTimeout } from '@/lib/shared/utils/fetch-with-timeout';
import logger from '@/lib/shared/logger';

// ─── Rate limit config ───
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const WORKING_DAY_START = '09:00';
const WORKING_DAY_END = '18:00';
const DEFAULT_SLOT_DURATION = 30; // minutes

// ─── Types ───────────────────────────────────────────────────────────────────

interface GraphEvent {
  id: string;
  subject?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
  showAs?: string;
}

interface GraphCalendarViewResponse {
  value: GraphEvent[];
  '@odata.nextLink'?: string;
}

interface FreeSlot {
  date: string;
  start: string;  // HH:mm
  end: string;    // HH:mm
  durationMinutes: number;
}

// ─── Auth guard ──────────────────────────────────────────────────────────────

function guardAuth(req: NextRequest) {
  if (!isRequestAuthorized(req)) return { error: 'Unauthorized', status: 401 };

  const rl = checkRateLimit(`cal-free:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) return { error: 'Too Many Requests', status: 429 };

  const userId = getDbUserId(req);
  if (!userId) return { error: 'Missing user ID', status: 401 };

  return { userId };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert "HH:mm" to minutes from midnight */
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Convert minutes from midnight to "HH:mm" */
function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Generate dates array between start and end (inclusive), YYYY-MM-DD */
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Compute free slots for one day given busy intervals */
function computeFreeSlots(
  date: string,
  busyIntervals: Array<{ startMin: number; endMin: number }>,
  minDuration: number,
): FreeSlot[] {
  const dayStart = timeToMinutes(WORKING_DAY_START);
  const dayEnd = timeToMinutes(WORKING_DAY_END);

  // Sort by start time
  const sorted = [...busyIntervals]
    .filter(b => b.endMin > dayStart && b.startMin < dayEnd)
    .sort((a, b) => a.startMin - b.startMin);

  const slots: FreeSlot[] = [];
  let cursor = dayStart;

  for (const busy of sorted) {
    const busyStart = Math.max(busy.startMin, dayStart);
    const busyEnd = Math.min(busy.endMin, dayEnd);

    if (cursor < busyStart) {
      const duration = busyStart - cursor;
      if (duration >= minDuration) {
        slots.push({
          date,
          start: minutesToTime(cursor),
          end: minutesToTime(busyStart),
          durationMinutes: duration,
        });
      }
    }
    cursor = Math.max(cursor, busyEnd);
  }

  // Trailing free slot
  if (cursor < dayEnd) {
    const duration = dayEnd - cursor;
    if (duration >= minDuration) {
      slots.push({
        date,
        start: minutesToTime(cursor),
        end: minutesToTime(dayEnd),
        durationMinutes: duration,
      });
    }
  }

  return slots;
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Auth + rate limit
  const auth = guardAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const { weekStart, weekEnd, slotDurationMinutes } = body as {
      weekStart?: string;
      weekEnd?: string;
      slotDurationMinutes?: number;
    };

    // 2. Validate input
    if (!weekStart || !DATE_RE.test(weekStart) || !weekEnd || !DATE_RE.test(weekEnd)) {
      return NextResponse.json(
        { error: 'Invalid weekStart/weekEnd (YYYY-MM-DD)' },
        { status: 400 },
      );
    }

    const minDuration = slotDurationMinutes && slotDurationMinutes > 0
      ? slotDurationMinutes
      : DEFAULT_SLOT_DURATION;

    const db = getDb();

    // 3. Get Azure AD OID for Graph API calls
    const { data: profile } = await db
      .from('user_profiles')
      .select('teams_aad_oid')
      .eq('user_id', auth.userId)
      .single();

    const oid = profile?.teams_aad_oid;
    if (!oid) {
      return NextResponse.json(
        { error: "Немає прив'язки до Teams" },
        { status: 400 },
      );
    }

    // 4. Get Graph token (app-level client_credentials)
    const token = await getGraphToken();
    if (!token) {
      return NextResponse.json({ error: 'Failed to get Graph token' }, { status: 502 });
    }

    // 5. Fetch all calendar events for the date range
    const events: GraphEvent[] = [];
    let url = `${GRAPH_BASE}/users/${oid}/calendarView?startDateTime=${weekStart}T00:00:00Z&endDateTime=${weekEnd}T23:59:59Z&$select=id,subject,start,end,isAllDay,showAs&$top=100`;

    while (url) {
      const res = await fetchWithTimeout(
        url,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Prefer: 'outlook.timezone="Europe/Kyiv"',
          },
        },
        20_000,
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        logger.error(`[calendar/free-slots] Graph ${res.status}: ${errBody.slice(0, 300)}`);
        return NextResponse.json({ error: 'Graph API error' }, { status: 502 });
      }

      const data = (await res.json()) as GraphCalendarViewResponse;
      events.push(...(data.value ?? []));
      url = data['@odata.nextLink'] ?? '';
    }

    // 6. Group busy intervals by date
    const busyByDate = new Map<string, Array<{ startMin: number; endMin: number }>>();

    for (const event of events) {
      // Skip free/tentative events (only count busy/oof/workingElsewhere)
      if (event.showAs === 'free') continue;

      // Skip all-day events (they don't block specific slots)
      if (event.isAllDay) continue;

      const startDt = event.start.dateTime.replace(/\.0+$/, '');
      const endDt = event.end.dateTime.replace(/\.0+$/, '');
      const date = startDt.slice(0, 10);
      const startTime = startDt.slice(11, 16); // HH:mm
      const endTime = endDt.slice(11, 16);

      const startMin = timeToMinutes(startTime);
      const endMin = timeToMinutes(endTime);

      if (endMin <= startMin) continue; // skip invalid

      if (!busyByDate.has(date)) busyByDate.set(date, []);
      busyByDate.get(date)!.push({ startMin, endMin });
    }

    // 7. Compute free slots for each day
    const dates = dateRange(weekStart, weekEnd);
    const allSlots: FreeSlot[] = [];

    for (const date of dates) {
      // Skip weekends (Sat=6, Sun=0)
      const dow = new Date(date + 'T12:00:00').getDay();
      if (dow === 0 || dow === 6) continue;

      const busy = busyByDate.get(date) ?? [];
      const daySlots = computeFreeSlots(date, busy, minDuration);
      allSlots.push(...daySlots);
    }

    return NextResponse.json({ slots: allSlots });
  } catch (err) {
    logger.error('[calendar/free-slots] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
