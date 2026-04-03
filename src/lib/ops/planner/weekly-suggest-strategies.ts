/**
 * Helper functions and strategies for weekly planner suggestion engine.
 * Split from weekly-suggest.ts for file size compliance.
 */

import type { CalendarEntry, ActivePlanForSlot } from './calendar-entries';
import logger from '@/lib/shared/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SuggestedSlot {
  _id?: string;
  monthly_plan_id: string;
  plan_name: string;
  process_name: string;
  date: string;
  start_time: string;
  duration_minutes: number;
}

export interface OccupiedInterval { startMin: number; endMin: number }

// ─── Constants ────────────────────────────────────────────────────────────────
export const WORK_START = 9 * 60;
export const WORK_END = 18 * 60;
export const LUNCH_DURATION = 60;
export const DEFAULT_SLOT_MIN = 60;
export const MAX_WEEK_MIN = 40 * 60;
export const WORK_DAY_MIN = WORK_END - WORK_START - LUNCH_DURATION;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function weekDates(weekStart: string): string[] {
  const d = new Date(weekStart);
  return Array.from({ length: 5 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

export function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minToTime(min: number): string {
  const h = String(Math.floor(min / 60)).padStart(2, '0');
  const m = String(min % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function intervalsOverlap(a: OccupiedInterval, b: OccupiedInterval): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

export function buildOccupiedMap(entries: CalendarEntry[]): Map<string, OccupiedInterval[]> {
  const map = new Map<string, OccupiedInterval[]>();
  for (const e of entries) {
    const start = timeToMin(e.start_time);
    const list = map.get(e.date) || [];
    list.push({ startMin: start, endMin: start + e.duration_minutes });
    map.set(e.date, list);
  }
  return map;
}

export function scheduledMinByPlan(
  entries: CalendarEntry[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.source !== 'plan' || !e.monthly_plan_id) continue;
    map.set(e.monthly_plan_id, (map.get(e.monthly_plan_id) || 0) + e.duration_minutes);
  }
  return map;
}

function totalOccupiedMin(entries: CalendarEntry[]): number {
  return entries.reduce((sum, e) => sum + e.duration_minutes, 0);
}

export function findFreeSlot(occupied: OccupiedInterval[], durationMin: number, lunchStartMin: number): string | null {
  const lunch: OccupiedInterval = { startMin: lunchStartMin, endMin: lunchStartMin + LUNCH_DURATION };
  for (let start = WORK_START; start + durationMin <= WORK_END; start += 30) {
    const c: OccupiedInterval = { startMin: start, endMin: start + durationMin };
    if (intervalsOverlap(c, lunch)) continue;
    if (occupied.some((o) => intervalsOverlap(c, o))) continue;
    return minToTime(start);
  }
  return null;
}

/** Merge consecutive same-procedure slots on the same day into one larger block. */
export function mergeConsecutiveSlots(slots: SuggestedSlot[]): SuggestedSlot[] {
  if (slots.length <= 1) return slots;

  // Sort by date → start_time → plan
  const sorted = [...slots].sort((a, b) =>
    a.date.localeCompare(b.date)
    || a.start_time.localeCompare(b.start_time)
    || a.monthly_plan_id.localeCompare(b.monthly_plan_id),
  );

  const merged: SuggestedSlot[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    const prevEnd = timeToMin(prev.start_time) + prev.duration_minutes;

    if (
      cur.date === prev.date
      && cur.monthly_plan_id === prev.monthly_plan_id
      && timeToMin(cur.start_time) === prevEnd
    ) {
      // Merge: extend previous slot
      prev.duration_minutes += cur.duration_minutes;
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

// ─── Strategy: repeat previous week ──────────────────────────────────────────

export function suggestFromPreviousWeek(
  prevEntries: CalendarEntry[],
  dates: string[],
  occupiedMap: Map<string, OccupiedInterval[]>,
  lunchStartMin: number,
  alreadyScheduled: Map<string, number>,
): SuggestedSlot[] {
  const suggestions: SuggestedSlot[] = [];
  const totalAlreadyMin = [...alreadyScheduled.values()].reduce((s, v) => s + v, 0);
  let weekCap = MAX_WEEK_MIN - totalAlreadyMin;

  // Budget per plan = prev-week minutes - already scheduled this week
  const prevMinByPlan = new Map<string, number>();
  for (const e of prevEntries) {
    if (!e.monthly_plan_id) continue;
    prevMinByPlan.set(e.monthly_plan_id, (prevMinByPlan.get(e.monthly_plan_id) || 0) + e.duration_minutes);
  }
  const remainingBudget = new Map<string, number>();
  for (const [planId, prevMin] of prevMinByPlan) {
    const rem = prevMin - (alreadyScheduled.get(planId) || 0);
    if (rem > 0) remainingBudget.set(planId, rem);
  }

  for (const entry of prevEntries) {
    if (weekCap < 30) break;
    if (!entry.monthly_plan_id) continue;

    const budget = remainingBudget.get(entry.monthly_plan_id) || 0;
    if (budget < 30) continue;

    const prevDay = new Date(entry.date).getDay();
    const dayIdx = prevDay === 0 ? 4 : prevDay - 1;
    if (dayIdx < 0 || dayIdx >= dates.length) continue;

    const targetDate = dates[dayIdx];
    const startMin = timeToMin(entry.start_time);
    const candidate: OccupiedInterval = { startMin, endMin: startMin + entry.duration_minutes };
    const dayOcc = occupiedMap.get(targetDate) || [];

    const hasConflict = dayOcc.some((o) => intervalsOverlap(candidate, o));
    let time: string;
    if (hasConflict) {
      const alt = findFreeSlot(dayOcc, entry.duration_minutes, lunchStartMin);
      if (!alt) continue;
      time = alt;
    } else {
      time = entry.start_time.slice(0, 5);
    }

    suggestions.push({
      monthly_plan_id: entry.monthly_plan_id,
      plan_name: entry.plan_name || '',
      process_name: entry.process_name,
      date: targetDate,
      start_time: time,
      duration_minutes: entry.duration_minutes,
    });

    const tMin = timeToMin(time);
    dayOcc.push({ startMin: tMin, endMin: tMin + entry.duration_minutes });
    occupiedMap.set(targetDate, dayOcc);
    weekCap -= entry.duration_minutes;
    remainingBudget.set(entry.monthly_plan_id, budget - entry.duration_minutes);
  }

  logger.info(`[WeeklyPlanner] Suggested ${suggestions.length} slots from previous week`);
  return suggestions;
}

// ─── Strategy: proportional distribution ─────────────────────────────────────

export function suggestProportional(
  activePlans: ActivePlanForSlot[],
  countByPlan: Map<string, number>,
  dates: string[],
  occupiedMap: Map<string, OccupiedInterval[]>,
  lunchStartMin: number,
  alreadyScheduled: Map<string, number>,
  freeMin: number,
): SuggestedSlot[] {
  // 1. Calculate weekly weight per plan (subtract already-scheduled)
  const eligible: { plan: ActivePlanForSlot; weight: number }[] = [];
  for (const plan of activePlans) {
    const assignees = countByPlan.get(plan.monthlyPlanId) || 1;
    const weeklyBudgetHrs = plan.plannedHours / assignees / 4;
    const alreadyHrs = (alreadyScheduled.get(plan.monthlyPlanId) || 0) / 60;
    const weight = weeklyBudgetHrs - alreadyHrs; // remaining weekly budget in hours
    if (weight < 0.5) continue; // less than 30 min remaining — skip
    eligible.push({ plan, weight });
  }

  if (eligible.length === 0 || freeMin < 30) return [];

  // 2. Total weight → each procedure's share of free time
  const totalWeight = eligible.reduce((s, e) => s + e.weight, 0);

  const shares: { plan: ActivePlanForSlot; shareMin: number }[] = eligible.map((e) => ({
    plan: e.plan,
    shareMin: Math.round((e.weight / totalWeight) * freeMin / 30) * 30, // round to 30-min
  }));

  // 3. Distribute slots round-robin across days
  const suggestions: SuggestedSlot[] = [];
  let dayIdx = 0;

  for (const { plan, shareMin } of shares) {
    let remaining = shareMin;
    let attempts = 0;
    const maxAttempts = dates.length * 10; // generous: up to 50 attempts

    while (remaining >= 30 && attempts < maxAttempts) {
      const date = dates[dayIdx % dates.length];
      const dayOcc = occupiedMap.get(date) || [];
      const slotDur = Math.min(remaining, DEFAULT_SLOT_MIN);

      // Try preferred duration, then fallback to 30-min if it doesn't fit
      let freeTime = findFreeSlot(dayOcc, slotDur, lunchStartMin);
      let actualDur = slotDur;
      if (!freeTime && slotDur > 30) {
        freeTime = findFreeSlot(dayOcc, 30, lunchStartMin);
        actualDur = 30;
      }

      if (freeTime) {
        suggestions.push({
          monthly_plan_id: plan.monthlyPlanId,
          plan_name: plan.planName,
          process_name: plan.processName,
          date,
          start_time: freeTime,
          duration_minutes: actualDur,
        });

        const startMin = timeToMin(freeTime);
        dayOcc.push({ startMin, endMin: startMin + actualDur });
        occupiedMap.set(date, dayOcc);
        remaining -= actualDur;
      }

      dayIdx++;
      attempts++;
    }
  }

  logger.info(`[WeeklyPlanner] Suggested ${suggestions.length} slots proportionally (free=${freeMin}min)`);
  return suggestions;
}

export { totalOccupiedMin };
