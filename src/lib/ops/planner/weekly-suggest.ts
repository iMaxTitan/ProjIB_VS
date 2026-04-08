/**
 * Weekly planner suggestion engine — ghost-slots based on monthly plan budgets.
 * Strategy 1: repeat previous week pattern (shifted +7 days).
 * Strategy 2: proportional distribution across Mon-Fri.
 */
import type { PostgrestClient } from '@/lib/shared/postgrest-client';
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
  db: PostgrestClient,
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

  // Step 1: copy previous week pattern
  let slots: SuggestedSlot[] = [];
  if (prevPlanEntries.length > 0) {
    slots = suggestFromPreviousWeek(prevPlanEntries, dates, occupiedMap, lunchStartMin, alreadyScheduled);
  }

  // Step 2: fill remaining capacity with proportional distribution
  // Update occupied map and scheduled minutes with step 1 results
  const occupiedWithStep1 = new Map(occupiedMap);
  const scheduledWithStep1 = new Map(alreadyScheduled);
  for (const s of slots) {
    const dayOcc = occupiedWithStep1.get(s.date) || [];
    const startMin = parseInt(s.start_time.split(':')[0]) * 60 + parseInt(s.start_time.split(':')[1]);
    dayOcc.push({ startMin, endMin: startMin + s.duration_minutes });
    occupiedWithStep1.set(s.date, dayOcc);
    if (s.monthly_plan_id) {
      scheduledWithStep1.set(s.monthly_plan_id, (scheduledWithStep1.get(s.monthly_plan_id) || 0) + s.duration_minutes);
    }
  }

  const allExistingMin = totalOccupiedMin(existingEntries) + slots.reduce((s, sl) => s + sl.duration_minutes, 0);
  const totalWorkMin = Math.min(MAX_WEEK_MIN, WORK_DAY_MIN * dates.length);
  const freeMin = Math.max(0, totalWorkMin - allExistingMin);

  if (freeMin > 0) {
    const fillSlots = suggestProportional(activePlans, countByPlan, dates, occupiedWithStep1, lunchStartMin, scheduledWithStep1, freeMin);
    slots = [...slots, ...fillSlots];
  }

  return mergeConsecutiveSlots(slots);
}
