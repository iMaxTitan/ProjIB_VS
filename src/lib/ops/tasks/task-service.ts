// Compatibility shim — wraps planner/task-service with client-side supabase
// TODO: Remove this shim in Phase 7 cleanup
import { supabase } from '@/lib/shared/supabase';
import {
  getTasksByMonthlyPlanId as _getTasksByMonthlyPlanId,
  getWeeklyTasksSpentHours as _getWeeklyTasksSpentHours,
  getTaskCompanies as _getTaskCompanies,
  updateTaskCompanies as _updateTaskCompanies,
  type DailyTaskRow,
} from '@/lib/ops/planner/task-service';

export type { DailyTaskRow };

export const getTasksByMonthlyPlanId = (monthlyPlanId: string) =>
  _getTasksByMonthlyPlanId(supabase, monthlyPlanId);

export const getWeeklyTasksSpentHours = (userId: string, date: string) =>
  _getWeeklyTasksSpentHours(supabase, userId, date);

export const getTaskCompanies = (taskId: string) =>
  _getTaskCompanies(supabase, taskId);

export const updateTaskCompanies = (taskId: string, companyIds: string[]) =>
  _updateTaskCompanies(supabase, taskId, companyIds);
