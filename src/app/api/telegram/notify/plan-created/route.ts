import { createClient } from '@/lib/shared/postgrest-client';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { config } from '@/lib/shared/config';
import {
  isRequestAuthorized,
  getRequesterKey,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';
import { NotifProfile, sendNotificationsToAll } from '@/lib/bot/notifications/send';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

let _db: ReturnType<typeof createClient> | null = null;
function getDb() {
  if (_db) return _db;
  _db = createClient(
    config.db.serverUrl,
    config.db.serviceRoleKey,
    { auth: { persistSession: false } }
  );
  return _db;
}

const MONTH_NAMES_UK = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

export async function POST(req: NextRequest) {
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

  let body: { monthlyPlanId?: string; notifyUserIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { monthlyPlanId, notifyUserIds } = body;
  if (!monthlyPlanId) {
    return NextResponse.json({ error: 'Missing monthlyPlanId' }, { status: 400 });
  }

  try {
    const db = getDb();

    // Check if this notification type is enabled globally
    const { data: notifSetting } = await db
      .from('telegram_notification_settings')
      .select('is_enabled')
      .eq('event_type', 'plan_created')
      .maybeSingle();

    if (notifSetting && !notifSetting.is_enabled) {
      return NextResponse.json({ notified: 0, reason: 'disabled' });
    }

    // Get plan details
    const { data: plan, error: planError } = await db
      .from('monthly_plans')
      .select('year, month, planned_hours, procedure_id')
      .eq('monthly_plan_id', monthlyPlanId)
      .single();

    if (planError || !plan) {
      logger.error('[notify/plan-created] Plan not found:', planError);
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Get procedure name
    const { data: proc } = await db
      .from('procedures')
      .select('name')
      .eq('procedure_id', plan.procedure_id as string)
      .maybeSingle();

    // Determine which users to notify:
    // - notifyUserIds provided → notify only those (update: newly added assignees)
    // - not provided → notify all current assignees (new plan / copy)
    let userIds: string[];
    if (notifyUserIds?.length) {
      userIds = notifyUserIds;
    } else {
      const { data: assignees } = await db
        .from('monthly_plan_assignees')
        .select('user_id')
        .eq('monthly_plan_id', monthlyPlanId);
      if (!assignees?.length) {
        return NextResponse.json({ notified: 0 });
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userIds = (assignees as any[]).map((a: { user_id: unknown }) => a.user_id as string);
    }

    if (!userIds.length) {
      return NextResponse.json({ notified: 0 });
    }

    // Get active subscribers among assignees (any channel)
    const { data: profiles, error: profilesError } = await db
      .from('user_profiles')
      .select('full_name, notification_channel, telegram_chat_id, telegram_is_active, teams_conversation_id, teams_service_url, teams_is_active, teams_member_id')
      .in('user_id', userIds)
      .or('telegram_is_active.eq.true,teams_is_active.eq.true')
      .returns<NotifProfile[]>();

    if (profilesError) {
      logger.error('[notify/plan-created] profiles query error:', profilesError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    if (!profiles?.length) {
      return NextResponse.json({ notified: 0 });
    }

    // Build message
    const procedureName = proc?.name ?? 'Не вказана';
    const monthName = MONTH_NAMES_UK[(plan.month as number) - 1] ?? String(plan.month);
    const hours = Number(plan.planned_hours || 0).toFixed(0);

    const text = [
      '📋 <b>Вас призначено виконавцем нового плану</b>',
      '',
      `📌 <b>Процедура:</b> ${procedureName}`,
      `📅 <b>Місяць:</b> ${monthName} ${plan.year}`,
      `⏱ <b>Планових годин:</b> ${hours} год.`,
    ].join('\n');

    await sendNotificationsToAll(profiles, text);

    logger.info(`[notify/plan-created] Notified ${profiles.length} subscribers for plan ${monthlyPlanId}`);
    return NextResponse.json({ notified: profiles.length });
  } catch (error: unknown) {
    logger.error('[notify/plan-created] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
