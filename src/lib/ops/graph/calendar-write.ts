/**
 * Graph API — calendar event CRUD (server-side, app-level token).
 * Used for syncing weekly planner slots → Outlook calendar.
 */

import { getGraphToken, graphPost, graphPatch, graphDelete } from './client';
import logger from '@/lib/shared/logger';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TIMEZONE = 'Europe/Kyiv';
const CATEGORY_NAME = 'CS Platform';

interface CreateEventParams {
  subject: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  durationMin: number;
}

interface OutlookEventBody {
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  showAs: string;
  categories: string[];
}

function buildEventBody(params: CreateEventParams): OutlookEventBody {
  const { subject, date, startTime, durationMin } = params;
  const startDT = `${date}T${startTime}:00`;

  const [h, m] = startTime.split(':').map(Number);
  const endTotalMin = h * 60 + m + durationMin;
  const endH = String(Math.floor(endTotalMin / 60)).padStart(2, '0');
  const endM = String(endTotalMin % 60).padStart(2, '0');
  const endDT = `${date}T${endH}:${endM}:00`;

  return {
    subject,
    start: { dateTime: startDT, timeZone: TIMEZONE },
    end: { dateTime: endDT, timeZone: TIMEZONE },
    showAs: 'busy',
    categories: [CATEGORY_NAME],
  };
}

/**
 * Create a calendar event for a user. Returns the Outlook event ID or null on failure.
 */
export async function createOutlookEvent(
  userOid: string,
  params: CreateEventParams,
): Promise<string | null> {
  const token = await getGraphToken();
  if (!token) {
    logger.error('[CalendarWrite] No Graph token — skipping event creation');
    return null;
  }

  const url = `${GRAPH_BASE}/users/${userOid}/events`;
  const body = buildEventBody(params);

  const res = await graphPost<{ id: string }>(token, url, body);
  if (!res.ok || !res.data?.id) {
    logger.error(`[CalendarWrite] Failed to create event for ${userOid}: ${res.status}`);
    return null;
  }

  logger.info(`[CalendarWrite] Created event ${res.data.id} for ${userOid}`);
  return res.data.id;
}

/**
 * Update an existing calendar event (date/time/duration).
 * Returns `{ ok, status }` — status=404 means the event was deleted from Outlook.
 */
export async function updateOutlookEvent(
  userOid: string,
  eventId: string,
  params: CreateEventParams,
): Promise<{ ok: boolean; status: number }> {
  const token = await getGraphToken();
  if (!token) return { ok: false, status: 0 };

  const url = `${GRAPH_BASE}/users/${userOid}/events/${eventId}`;
  const body = buildEventBody(params);

  const res = await graphPatch<unknown>(token, url, body);
  if (!res.ok) {
    logger.warn(`[CalendarWrite] Failed to update event ${eventId}: ${res.status}`);
    return { ok: false, status: res.status };
  }

  logger.info(`[CalendarWrite] Updated event ${eventId}`);
  return { ok: true, status: res.status };
}

/**
 * Delete a calendar event.
 */
export async function deleteOutlookEvent(
  userOid: string,
  eventId: string,
): Promise<boolean> {
  const token = await getGraphToken();
  if (!token) return false;

  const url = `${GRAPH_BASE}/users/${userOid}/events/${eventId}`;
  const res = await graphDelete(token, url);
  if (!res.ok) {
    logger.warn(`[CalendarWrite] Failed to delete event ${eventId}: ${res.status}`);
    return false;
  }

  logger.info(`[CalendarWrite] Deleted event ${eventId}`);
  return true;
}
