/** Shared week-date helpers for the planner UI. */

import type { CalendarEntry } from '@/lib/ops/planner/calendar-entries';

// ─── Overlap / collision resolution ("пятнашки") ────────────────────────────

const WORK_END_MIN = 18 * 60; // 1080

function timeStrToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minToTimeStr(min: number): string {
  const h = String(Math.floor(min / 60)).padStart(2, '0');
  const m = String(min % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * After an entry is moved/resized (the "anchor"), resolve overlaps on that date
 * by pushing other plan entries down (like a sliding puzzle / "пятнашки").
 * External entries are immovable. Returns entries that need start_time updates.
 */
export function resolveOverlaps(
  anchorId: string,
  entries: CalendarEntry[],
  date: string,
): { id: string; newStartTime: string }[] {
  const dayEntries = entries.filter((e) => e.date === date);

  // Fixed intervals: external entries + anchor entry (the one user just placed)
  type IV = { startMin: number; endMin: number };
  const fixed: IV[] = [];

  for (const e of dayEntries) {
    if (e.source === 'external') {
      const sm = timeStrToMin(e.start_time);
      fixed.push({ startMin: sm, endMin: sm + e.duration_minutes });
    }
  }

  const anchor = dayEntries.find((e) => e.id === anchorId);
  if (anchor) {
    const sm = timeStrToMin(anchor.start_time);
    fixed.push({ startMin: sm, endMin: sm + anchor.duration_minutes });
  }

  // Flexible items: other plan entries on this date, sorted by start time
  const flexible = dayEntries
    .filter((e) => e.id !== anchorId && e.source === 'plan')
    .map((e) => {
      const sm = timeStrToMin(e.start_time);
      return { id: e.id, startMin: sm, duration: e.duration_minutes };
    })
    .sort((a, b) => a.startMin - b.startMin);

  if (flexible.length === 0) return [];

  const placed: IV[] = [...fixed];
  const changes: { id: string; newStartTime: string }[] = [];

  for (const flex of flexible) {
    let start = flex.startMin;

    // Push past any overlapping placed item (cascade until clear)
    let again = true;
    while (again) {
      again = false;
      for (const p of placed) {
        if (start < p.endMin && start + flex.duration > p.startMin) {
          start = p.endMin;
          again = true;
          break;
        }
      }
    }

    // Clamp to work hours
    if (start + flex.duration > WORK_END_MIN) {
      start = Math.max(0, WORK_END_MIN - flex.duration);
    }

    placed.push({ startMin: start, endMin: start + flex.duration });

    if (start !== flex.startMin) {
      changes.push({ id: flex.id, newStartTime: minToTimeStr(start) });
    }
  }

  return changes;
}

// ─── Overlap layout (side-by-side rendering) ────────────────────────────────

export interface LayoutInfo {
  column: number;
  totalColumns: number;
}

/**
 * Compute column layout for overlapping events in a single day column.
 * Items that overlap in time get placed side-by-side (column 0, 1, 2...).
 * Returns a map of item ID → { column, totalColumns }.
 */
export function computeOverlapLayout(
  items: { id: string; startMin: number; endMin: number }[],
): Map<string, LayoutInfo> {
  if (items.length <= 1) {
    const map = new Map<string, LayoutInfo>();
    if (items.length === 1) map.set(items[0].id, { column: 0, totalColumns: 1 });
    return map;
  }

  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const result = new Map<string, LayoutInfo>();

  // Find connected overlap groups using sweep line
  const groups: (typeof sorted)[] = [];
  let currentGroup: typeof sorted = [];
  let groupEnd = 0;

  for (const item of sorted) {
    if (currentGroup.length === 0 || item.startMin < groupEnd) {
      currentGroup.push(item);
      groupEnd = Math.max(groupEnd, item.endMin);
    } else {
      groups.push(currentGroup);
      currentGroup = [item];
      groupEnd = item.endMin;
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  for (const group of groups) {
    // Assign columns greedily — pick the first free column for each item
    const columns: { endMin: number }[] = [];
    for (const item of group) {
      let col = columns.findIndex((c) => c.endMin <= item.startMin);
      if (col === -1) {
        col = columns.length;
        columns.push({ endMin: item.endMin });
      } else {
        columns[col].endMin = item.endMin;
      }
      result.set(item.id, { column: col, totalColumns: 0 }); // totalColumns set below
    }
    // All items in group share the same totalColumns
    const maxCols = columns.length;
    for (const item of group) {
      result.get(item.id)!.totalColumns = maxCols;
    }
  }

  return result;
}

// ─── Week-date helpers ──────────────────────────────────────────────────────

export function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function formatWeekRange(start: Date, end: Date): string {
  const sMonth = start.toLocaleDateString('uk-UA', { month: 'short' });
  const eMonth = end.toLocaleDateString('uk-UA', { month: 'short' });
  const sDay = start.getDate();
  const eDay = end.getDate();
  if (sMonth === eMonth) return `${sDay} – ${eDay} ${sMonth}`;
  return `${sDay} ${sMonth} – ${eDay} ${eMonth}`;
}

export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getWeekDates(weekStart: Date): string[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return toLocalDateStr(d);
  });
}
