/**
 * Role group constants — single source of truth for role-based access checks.
 * Import these instead of hardcoding ['chief', 'head'] etc.
 */

import type { UserRole } from '@/types/supabase';

export const ROLE_GROUPS = {
  /** KB management: upload, validate, normalize, index */
  KB_MANAGERS: ['chief', 'head'] as const,
  /** Report generation for all employees, timesheet */
  REPORT_MANAGERS: ['chief', 'head', 'analyst'] as const,
  /** Plan structure editing (create/delete plans) */
  PLAN_EDITORS: ['chief', 'head'] as const,
  /** Reference data editing (services, working days, calendar) */
  REF_EDITORS: ['chief', 'head', 'analyst'] as const,
  /** Web UI access (can log in to the site) */
  WEB_USERS: ['chief', 'head', 'analyst', 'employee'] as const,
} as const;

/** Check if a role belongs to a group. */
export function hasRole(role: string | null, group: readonly string[]): boolean {
  return !!role && group.includes(role);
}

/** Type guard: narrow string to UserRole. */
export function isValidRole(role: string): role is UserRole {
  return ['chief', 'head', 'analyst', 'employee', 'kb_user'].includes(role);
}
