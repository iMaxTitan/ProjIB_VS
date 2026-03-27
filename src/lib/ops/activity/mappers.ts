/**
 * Activity service — row mappers and normalization helpers.
 */
import {
    ActivityEvent,
    ActivityFeedRow,
    LegacyActivityProfile,
    LegacyActivityRow,
    AnnualPlanLookupRow,
    QuarterlyPlanLookupRow,
} from './types';

type ActivityEventType = ActivityEvent['event_type'];

export function normalizeEventType(value: string): ActivityEventType {
    if (!value) return 'other';
    if (value === 'task_created') return 'task_created';
    if (value === 'task_completed') return 'task_completed';
    if (value === 'plan_created') return 'plan_created';
    if (value === 'status_change') return 'status_change';
    if (value === 'report_generated') return 'report_generated';
    return value;
}

export function mapFeedRowToActivityEvent(row: ActivityFeedRow): ActivityEvent {
    return {
        activity_id: row.activity_id,
        event_type: normalizeEventType(row.event_type),
        action_type: row.action_type || row.event_type || null,
        target_type: row.target_type || null,
        event_time: row.event_time,
        user_id: row.user_id,
        user_name: row.user_name || 'Неизвестно',
        user_photo: row.user_photo || null,
        user_role: row.user_role || 'employee',
        department_id: row.department_id,
        department_name: row.department_name || '',
        event_description: row.event_description || '',
        spent_hours: row.spent_hours,
        plan_id: row.plan_id,
        plan_name: row.plan_name || '',
        plan_date: row.plan_date,
        quarterly_goal: row.quarterly_goal || null,
        quarter: row.quarter || null,
        process_name: row.process_name || null,
    };
}

export function normalizeLegacyProfile(
    value: LegacyActivityProfile | LegacyActivityProfile[] | null | undefined
): LegacyActivityProfile | undefined {
    if (!value) return undefined;
    return Array.isArray(value) ? value[0] : value;
}

export function toNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function getDisplayName(
    profile: { full_name?: string | null; email?: string | null } | undefined,
    details: Record<string, unknown>,
    userId?: string | null
): string {
    const detailsName =
        (typeof details['user_name'] === 'string' && details['user_name']) ||
        (typeof details['full_name'] === 'string' && details['full_name']) ||
        (typeof details['employee_name'] === 'string' && details['employee_name']) ||
        '';
    const emailName = profile?.email ? profile.email.split('@')[0] : '';
    const userIdFallback = userId ? `Пользователь ${userId.slice(0, 8)}` : 'Неизвестно';
    return profile?.full_name || detailsName || emailName || userIdFallback;
}

export function mapLegacyRowToActivityEvent(
    row: LegacyActivityRow,
    lookups?: {
        annualPlans?: Map<string, AnnualPlanLookupRow>;
        quarterlyPlans?: Map<string, QuarterlyPlanLookupRow>;
    }
): ActivityEvent {
    const profile = normalizeLegacyProfile(row.user_profiles);
    const details = row.details || {};
    const createdAt = row.created_at || row.timestamp || new Date().toISOString();
    const actionType = row.action_type || '';
    const targetType = row.target_type || '';
    const eventType = normalizeEventType(actionType);
    const detailsDepartmentId = typeof details['department_id'] === 'string' ? details['department_id'] : '';
    const detailsDepartmentName = typeof details['department_name'] === 'string' ? details['department_name'] : '';
    const detailsDescription = typeof details['description'] === 'string' ? details['description'] : '';
    const detailsMessage = typeof details['message'] === 'string' ? details['message'] : '';
    const detailsGoal = typeof details['goal'] === 'string' ? details['goal'] : '';
    const detailsExpectedResult = typeof details['expected_result'] === 'string' ? details['expected_result'] : '';
    const detailsPlanName = typeof details['plan_name'] === 'string' ? details['plan_name'] : '';
    const annualPlan = targetType === 'annual_plan' && row.target_id ? lookups?.annualPlans?.get(row.target_id) : undefined;
    const quarterlyPlan = targetType === 'quarterly_plan' && row.target_id ? lookups?.quarterlyPlans?.get(row.target_id) : undefined;
    const planGoal = annualPlan?.goal || quarterlyPlan?.goal || '';
    const planExpectedResult = annualPlan?.expected_result || quarterlyPlan?.expected_result || '';
    const planDepartmentId = quarterlyPlan?.department_id || '';
    const planQuarter = quarterlyPlan?.quarter ?? null;
    const isPlanEvent = targetType === 'annual_plan' || targetType === 'quarterly_plan';
    const eventDescription = isPlanEvent
        ? (planExpectedResult || detailsExpectedResult || detailsDescription || detailsMessage || planGoal || detailsGoal || `${actionType || 'event'} ${targetType}`.trim())
        : (detailsDescription || detailsMessage || detailsGoal || detailsExpectedResult || `${actionType || 'event'} ${targetType}`.trim());

    return {
        activity_id: row.activity_id || row.id || `${row.user_id || 'unknown'}-${createdAt}`,
        event_type: eventType,
        action_type: actionType || null,
        target_type: targetType || null,
        event_time: createdAt,
        user_id: row.user_id || '',
        user_name: getDisplayName(profile, details, row.user_id),
        user_photo: profile?.photo_base64 || null,
        user_role: profile?.role || 'employee',
        department_id: profile?.department_id || planDepartmentId || detailsDepartmentId || '',
        department_name: profile?.department_name || detailsDepartmentName || '',
        event_description: eventDescription,
        spent_hours: toNumber(details['spent_hours']),
        plan_id: row.target_id || '',
        plan_name: planGoal || detailsPlanName || detailsGoal || '',
        plan_date: String(details['plan_date'] || createdAt),
        quarterly_goal: quarterlyPlan?.goal || (details['quarterly_goal'] ? String(details['quarterly_goal']) : null),
        quarter: planQuarter ?? toNumber(details['quarter']),
        process_name: details['process_name'] ? String(details['process_name']) : null,
    };
}
