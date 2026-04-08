/**
 * Activity service — shared types and interfaces.
 */
import type { PostgrestClient } from '@/lib/shared/postgrest-client';

export type { PostgrestClient };

// =============================================
// Internal DB row types
// =============================================

export interface ActivityFeedRow {
    activity_id: string;
    action_type: string | null;
    target_type: string | null;
    event_type: string;
    event_time: string;
    user_id: string;
    user_name: string | null;
    user_photo: string | null;
    user_role: string | null;
    department_id: string;
    department_name: string | null;
    event_description: string | null;
    spent_hours: number | null;
    plan_id: string;
    plan_name: string | null;
    plan_date: string;
    quarterly_goal: string | null;
    quarter: number | null;
    process_name: string | null;
}

export interface ActivityStatsRow {
    spent_hours: number | null;
    event_time: string;
    user_id: string;
    department_id: string;
}

export interface ActivityContextRow {
    spent_hours: number | null;
    user_id: string;
    user_name: string | null;
    department_id: string;
    department_name: string | null;
}

export interface LegacyActivityProfile {
    user_id?: string | null;
    email?: string | null;
    full_name?: string | null;
    photo_base64?: string | null;
    role?: string | null;
    department_id?: string | null;
    department_name?: string | null;
}

export interface LegacyActivityRow {
    id?: string;
    activity_id?: string;
    user_id?: string | null;
    action_type?: string | null;
    target_type?: string | null;
    target_id?: string | null;
    created_at?: string | null;
    timestamp?: string | null;
    details?: Record<string, unknown> | null;
    user_profiles?: LegacyActivityProfile | LegacyActivityProfile[] | null;
}

export interface AnnualPlanLookupRow {
    annual_id: string;
    goal: string | null;
    expected_result: string | null;
}

export interface QuarterlyPlanLookupRow {
    quarterly_id: string;
    goal: string | null;
    expected_result: string | null;
    quarter: number | null;
    department_id: string | null;
}

// =============================================
// Public exported types
// =============================================

export interface ActivityEvent {
    activity_id: string;
    event_type: 'task_created' | 'task_completed' | 'plan_created' | 'status_change' | 'report_generated' | 'other' | string;
    action_type?: string | null;
    target_type?: string | null;
    event_time: string;
    user_id: string;
    user_name: string;
    user_photo: string | null;
    user_role: string;
    department_id: string;
    department_name: string;
    event_description: string;
    spent_hours: number | null;
    plan_id: string;
    plan_name: string;
    plan_date: string;
    quarterly_goal: string | null;
    quarter: number | null;
    process_name: string | null;
}

export interface ActivityStats {
    totalHours: number;
    totalTasks: number;
    activeUsers: number;
    totalUsers: number;
    todayHours: number;
    todayTasks: number;
}

export interface ActivityFilters {
    departmentId?: string;
    daysBack?: number;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
}
