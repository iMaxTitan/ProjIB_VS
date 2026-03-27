/**
 * Shared constants and helpers for calendar sync (pull & push).
 */

import { fetchWithTimeout } from '@/lib/shared/utils/fetch-with-timeout';
import logger from '@/lib/shared/logger';

// ─── Constants ───────────────────────────────────────────────────────────────

export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
export const TIMEZONE = 'Europe/Kyiv';
export const MAX_DURATION_MINUTES = 480; // 8h — skip all-day events

// ─── Graph authenticated fetch ──────────────────────────────────────────────

/**
 * GET request to Graph API with auth + optional Prefer header.
 * Returns parsed JSON or null on failure.
 */
export async function graphGet<T>(
  token: string,
  url: string,
  opts?: { timezone?: boolean; timeout?: number },
): Promise<T | null> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (opts?.timezone !== false) {
    headers['Prefer'] = `outlook.timezone="${TIMEZONE}"`;
  }
  try {
    const res = await fetchWithTimeout(url, { headers }, opts?.timeout ?? 10_000);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error(`[calendar] GET ${url.slice(0, 100)} -> ${res.status} ${body.slice(0, 200)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.error('[calendar] graphGet error:', err);
    return null;
  }
}

// ─── Time helpers ───────────────────────────────────────────────────────────

/** Parse Graph event start/end into date + startTime + duration. */
export function parseEventTimes(event: {
  start?: { dateTime: string };
  end?: { dateTime: string };
}): { date: string; startTime: string; durationMinutes: number } | null {
  if (!event.start?.dateTime || !event.end?.dateTime) return null;
  const startDt = event.start.dateTime.replace(/\.0+$/, '');
  const endDt = event.end.dateTime.replace(/\.0+$/, '');
  const date = startDt.slice(0, 10);
  const startTime = startDt.slice(11, 16); // HH:MM (match DB format)
  const durationMinutes = Math.round(
    (new Date(endDt).getTime() - new Date(startDt).getTime()) / 60_000,
  );
  if (durationMinutes <= 0 || durationMinutes > MAX_DURATION_MINUTES) return null;
  return { date, startTime, durationMinutes };
}

/** Compute end time string from start_time (HH:MM or HH:MM:SS) + duration in minutes. */
export function computeEndTime(startTime: string, durationMin: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const totalMin = h * 60 + m + durationMin;
  const endH = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const endM = String(totalMin % 60).padStart(2, '0');
  return `${endH}:${endM}`;
}

/** Returns 5 weekday date strings (Mon–Fri) starting from weekStart. */
export function weekDates(weekStart: string): string[] {
  const d = new Date(weekStart);
  return Array.from({ length: 5 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day.toISOString().slice(0, 10);
  });
}
