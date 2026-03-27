'use client';

// Compatibility shim — wraps planner/task-service functions with client-side supabase
// TODO: Remove in Phase 7
import { supabase } from '@/lib/shared/supabase';
import {
  getWeeklyTasksSpentHours as _getWeeklyTasksSpentHours,
  getTaskCompanies as _getTaskCompanies,
  updateTaskCompanies as _updateTaskCompanies,
} from '@/lib/ops/planner/task-service';

export const getWeeklyTasksSpentHours = (userId: string, date: string) =>
  _getWeeklyTasksSpentHours(supabase, userId, date);

export const getTaskCompanies = (taskId: string) =>
  _getTaskCompanies(supabase, taskId);

export const updateTaskCompanies = (taskId: string, companyIds: string[]) =>
  _updateTaskCompanies(supabase, taskId, companyIds);
