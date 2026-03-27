/**
 * /api/planner/entries — CRUD for weekly calendar entries.
 * GET    ?weekStart=YYYY-MM-DD -> { entries, activePlans, lunchStart, vacationDays }
 * POST   { monthly_plan_id, date, start_time, duration_minutes } -> create
 * PATCH  { id, date?, start_time?, duration_minutes? } -> update
 * DELETE ?id=uuid -> delete + Outlook cleanup
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { getServerDb as getDb } from '@/lib/shared/db-server';
import {
  getWeekEntries,
  getActivePlansForUser,
  getVacationDaysForWeek,
} from '@/lib/ops/planner/calendar-entries';
import {
  createEntry,
  createEntriesBatch,
  updateEntry,
  deleteEntry,
} from '@/lib/ops/planner/calendar-entries-write';
import { deleteOutlookEvent } from '@/lib/ops/graph/calendar-write';
import logger from '@/lib/shared/logger';

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

function guardAuth(req: NextRequest) {
  if (!isRequestAuthorized(req)) return { error: 'Unauthorized', status: 401 };
  const userId = getDbUserId(req);
  if (!userId) return { error: 'Missing user ID', status: 401 };
  const rl = checkRateLimit(`wp:${getRequesterKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) return { error: 'Too Many Requests', status: 429 };
  return { userId };
}

async function getUserOid(db: ReturnType<typeof getDb>, userId: string): Promise<string | null> {
  const { data } = await db
    .from('user_profiles')
    .select('teams_aad_oid')
    .eq('user_id', userId)
    .single();
  return data?.teams_aad_oid ?? null;
}

// --- GET ---------------------------------------------------------------

export async function GET(req: NextRequest) {
  const auth = guardAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const weekStart = url.searchParams.get('weekStart');
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'Invalid weekStart (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const db = getDb();
    const [entries, activePlans, profile, vacationDays] = await Promise.all([
      getWeekEntries(db, auth.userId, weekStart),
      getActivePlansForUser(db, auth.userId, weekStart),
      db.from('user_profiles').select('lunch_start').eq('user_id', auth.userId).single(),
      getVacationDaysForWeek(db, auth.userId, weekStart),
    ]);
    const lunchStart = profile.data?.lunch_start?.slice(0, 5) ?? '13:00';

    return NextResponse.json({ entries, activePlans, lunchStart, vacationDays: [...vacationDays] });
  } catch (err) {
    logger.error('[planner/entries] GET error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// --- POST --------------------------------------------------------------

export async function POST(req: NextRequest) {
  const auth = guardAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const db = getDb();

    // Batch mode: { entries: [...] } (also accept body.slots for compat)
    const batchEntries = body.entries || body.slots;
    if (Array.isArray(batchEntries)) {
      const result = await createEntriesBatch(db, auth.userId, batchEntries);
      return NextResponse.json(result);
    }

    // Single mode
    const { monthly_plan_id, date, start_time, duration_minutes, cascade, task_template_id } = body;
    if (!monthly_plan_id || !date || !start_time || !duration_minutes) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date (YYYY-MM-DD)' }, { status: 400 });
    }
    if (!/^\d{2}:\d{2}$/.test(start_time)) {
      return NextResponse.json({ error: 'Invalid start_time (HH:MM)' }, { status: 400 });
    }

    const result = await createEntry(db, auth.userId, {
      monthly_plan_id,
      date,
      start_time,
      duration_minutes: Number(duration_minutes),
      skipOverlapCheck: !!cascade,
      task_template_id: task_template_id || undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    const isBusiness = msg.includes('перетинається') || msg.includes('межах') || msg.includes('відпустка');
    if (!isBusiness) logger.error('[planner/entries] POST error:', err);
    return NextResponse.json({ error: msg }, { status: isBusiness ? 400 : 500 });
  }
}

// --- PATCH -------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  const auth = guardAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const { id, date, start_time, duration_minutes, daily_task_id, task_template_id, monthly_plan_id, cascade } = body;

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const db = getDb();
    const { oldOutlookEventId } = await updateEntry(db, auth.userId, id, { date, start_time, duration_minutes, daily_task_id, task_template_id, monthly_plan_id, skipOverlapCheck: !!cascade });

    // Clean up old Outlook event if entry was moved
    if (oldOutlookEventId) {
      const oid = await getUserOid(db, auth.userId);
      if (oid) {
        try {
          await deleteOutlookEvent(oid, oldOutlookEventId);
        } catch (syncErr) {
          logger.warn('[planner/entries] Outlook cleanup on move:', syncErr);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    const isBusiness = msg.includes('не знайдено') || msg.includes('перетинається') || msg.includes('межах');
    if (!isBusiness) logger.error('[planner/entries] PATCH error:', err);
    return NextResponse.json({ error: msg }, { status: isBusiness ? 400 : 500 });
  }
}

// --- DELETE ------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  const auth = guardAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    const db = getDb();
    const { outlookEventId } = await deleteEntry(db, auth.userId, id);

    // Best-effort Outlook cleanup
    if (outlookEventId) {
      const oid = await getUserOid(db, auth.userId);
      if (oid) {
        try {
          await deleteOutlookEvent(oid, outlookEventId);
        } catch (syncErr) {
          logger.warn('[planner/entries] Outlook sync failed on delete:', syncErr);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    const isBusiness = msg.includes('не знайдено');
    if (!isBusiness) logger.error('[planner/entries] DELETE error:', err);
    return NextResponse.json({ error: msg }, { status: isBusiness ? 400 : 500 });
  }
}
