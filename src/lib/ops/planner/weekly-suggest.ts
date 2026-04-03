/**
 * Weekly planner suggestion engine — ghost-slots based on monthly plan budgets.
 * Strategy 1: repeat previous week pattern (shifted +7 days).
 * Strategy 2: proportional distribution across Mon-Fri.
 */
import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import {
  getActivePlansForUser, getWeekEntries, getVacationDaysForWeek,
} from './calendar-entries';
import {
  type SuggestedSlot,
  type OccupiedInterval,
  WORK_START, WORK_END, MAX_WEEK_MIN, WORK_DAY_MIN,
  weekDates,
  buildOccupiedMap,
  scheduledMinByPlan,
  mergeConsecutiveSlots,
  suggestFromPreviousWeek,
  suggestProportional,
  totalOccupiedMin,
} from './weekly-suggest-strategies';

export type { SuggestedSlot };

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_LUNCH_START = 13 * 60;

// ─── Main ────────────────────────────────────────────────────────────────────
export async function suggestWeekSlots(
  db: SupabaseClient,
  userId: string,
  weekStart: string,
  lunchStartMin = DEFAULT_LUNCH_START,
): Promise<SuggestedSlot[]> {
  const dates = weekDates(weekStart);

  const existingEntries = await getWeekEntries(db, userId, weekStart);
  const occupiedMap = buildOccupiedMap(existingEntries);
  const activePlans = await getActivePlansForUser(db, userId, weekStart);

  // Block vacation days — mark as fully occupied so strategies skip them
  const vacationDays = await getVacationDaysForWeek(db, userId, weekStart);
  for (const vd of vacationDays) {
    const dayOcc = occupiedMap.get(vd) || [];
    dayOcc.push({ startMin: WORK_START, endMin: WORK_END });
    occupiedMap.set(vd, dayOcc);
  }
  const alreadyScheduled = scheduledMinByPlan(existingEntries);

  const prevStart = new Date(weekStart);
  prevStart.setDate(prevStart.getDate() - 7);
  const prevEntries = await getWeekEntries(db, userId, prevStart.toISOString().slice(0, 10));
  const prevPlanEntries = prevEntries.filter((e) => e.source === 'plan');

  if (prevPlanEntries.length > 0) {
    const slots = suggestFromPreviousWeek(prevPlanEntries, dates, occupiedMap, lunchStartMin, alreadyScheduled);
    return mergeConsecutiveSlots(slots);
  }

  if (activePlans.length === 0) return [];

  const planIds = [...new Set(activePlans.map((p) => p.monthlyPlanId))];
  const { data: assigneeCounts } = await db
    .from('monthly_plan_assignees')
    .select('monthly_plan_id')
    .in('monthly_plan_id', planIds);

  const countByPlan = new Map<string, number>();
  for (const row of assigneeCounts || []) {
    countByPlan.set(row.monthly_plan_id, (countByPlan.get(row.monthly_plan_id) || 0) + 1);
  }

  const occupiedMin = totalOccupiedMin(existingEntries);
  const totalWorkMin = Math.min(MAX_WEEK_MIN, WORK_DAY_MIN * dates.length);
  const freeMin = Math.max(0, totalWorkMin - occupiedMin);

  const slots = suggestProportional(activePlans, countByPlan, dates, occupiedMap, lunchStartMin, alreadyScheduled, freeMin);
  return mergeConsecutiveSlots(slots);
}
