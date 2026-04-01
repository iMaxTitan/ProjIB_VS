'use client';

// Thin shim — wraps planner/task-service with client-side PostgREST
import { supabase as db } from '@/lib/shared/db-client';
import {
  getWeeklyTasksSpentHours as _getWeeklyTasksSpentHours,
  getTaskCompanies as _getTaskCompanies,
  updateTaskCompanies as _updateTaskCompanies,
} from '@/lib/ops/planner/task-service';

export const getWeeklyTasksSpentHours = (userId: string, date: string) =>
  _getWeeklyTasksSpentHours(db, userId, date);

export const getTaskCompanies = (taskId: string) =>
  _getTaskCompanies(db, taskId);

export const updateTaskCompanies = (taskId: string, companyIds: string[]) =>
  _updateTaskCompanies(db, taskId, companyIds);
