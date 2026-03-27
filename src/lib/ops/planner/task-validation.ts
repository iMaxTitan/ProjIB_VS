// Validation helpers for task operations
// Extracted for reuse across planner module

export const WEEKLY_HOURS_LIMIT = 40;
export const MIN_TASK_HOURS = 0.1;
export const MAX_TASK_HOURS = 24;

export function validateTaskHours(hours: number): string | null {
  if (hours < MIN_TASK_HOURS) return `Мінімум ${MIN_TASK_HOURS} годин`;
  if (hours > MAX_TASK_HOURS) return `Максимум ${MAX_TASK_HOURS} годин`;
  return null;
}

export function validateTaskDescription(desc: string): string | null {
  if (!desc || desc.trim().length < 3) return 'Мінімум 3 символи';
  return null;
}
