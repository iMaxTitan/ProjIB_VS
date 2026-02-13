import { supabase } from '@/lib/supabase';
import logger from '@/lib/logger';

type ActivityEventType = ActivityEvent['event_type'];

interface ActivityFeedRow {
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

interface ActivityStatsRow {
    spent_hours: number | null;
    event_time: string;
    user_id: string;
    department_id: string;
}

interface ActivityContextRow {
    spent_hours: number | null;
    user_id: string;
    user_name: string | null;
    department_id: string;
    department_name: string | null;
}

interface LegacyActivityProfile {
    user_id?: string | null;
    email?: string | null;
    full_name?: string | null;
    photo_base64?: string | null;
    role?: string | null;
    department_id?: string | null;
    department_name?: string | null;
}

interface LegacyActivityRow {
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

interface AnnualPlanLookupRow {
    annual_id: string;
    goal: string | null;
    expected_result: string | null;
}

interface QuarterlyPlanLookupRow {
    quarterly_id: string;
    goal: string | null;
    expected_result: string | null;
    quarter: number | null;
    department_id: string | null;
}

function normalizeEventType(value: string): ActivityEventType {
    if (!value) return 'other';
    if (value === 'task_created') return 'task_created';
    if (value === 'task_completed') return 'task_completed';
    if (value === 'plan_created') return 'plan_created';
    if (value === 'status_change') return 'status_change';
    if (value === 'report_generated') return 'report_generated';
    return value;
}

function mapFeedRowToActivityEvent(row: ActivityFeedRow): ActivityEvent {
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
        process_name: row.process_name || null
    };
}

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
    limit?: number;
}

/**
 * РџРѕР»СѓС‡РµРЅРёРµ Р»РµРЅС‚С‹ Р°РєС‚РёРІРЅРѕСЃС‚Рё СЃ СѓС‡С‘С‚РѕРј СЂРѕР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
 * Chief РІРёРґРёС‚ РІСЃРµС…, Head - СЃРІРѕР№ РѕС‚РґРµР», Employee - С‚РѕР»СЊРєРѕ СЃРµР±СЏ
 */
export async function getActivityFeed(
    userId: string,
    userRole: string,
    userDepartmentId: string | null,
    filters: ActivityFilters = {}
): Promise<ActivityEvent[]> {
    const { departmentId, daysBack = 7, limit = 50 } = filters;

    try {
        const { data, error } = await supabase.rpc('get_activity_feed', {
            p_user_id: userId,
            p_department_id: departmentId || null,
            p_days_back: daysBack,
            p_limit: limit
        });

        if (error) {
            logger.warn('RPC get_activity_feed unavailable, using fallback:', error);
            return getActivityFeedFallback(userId, userRole, userDepartmentId, filters);
        }

        return ((data || []) as ActivityFeedRow[]).map(mapFeedRowToActivityEvent);
    } catch (err: unknown) {
        logger.error('Error in getActivityFeed:', err);
        return getActivityFeedFallback(userId, userRole, userDepartmentId, filters);
    }
}

/**
 * Fallback РµСЃР»Рё RPC РЅРµРґРѕСЃС‚СѓРїРЅР° - РїСЂСЏРјРѕР№ Р·Р°РїСЂРѕСЃ С‡РµСЂРµР· view v_activity_feed
 */
async function getActivityFeedFallback(
    userId: string,
    userRole: string,
    userDepartmentId: string | null,
    filters: ActivityFilters
): Promise<ActivityEvent[]> {
    const { departmentId, daysBack = 7, limit = 50 } = filters;

    const userDeptId = userDepartmentId;

    // Р’С‹С‡РёСЃР»СЏРµРј РґР°С‚Сѓ РЅР°С‡Р°Р»Р°
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // РСЃРїРѕР»СЊР·СѓРµРј view v_activity_feed РІРјРµСЃС‚Рѕ СЃР»РѕР¶РЅС‹С… JOIN
    let query = supabase
        .from('v_activity_feed')
        .select('*')
        .gte('event_time', startDate.toISOString())
        .order('event_time', { ascending: false })
        .limit(limit * 2); // Р‘РµСЂС‘Рј Р±РѕР»СЊС€Рµ, С‚.Рє. Р±СѓРґРµРј С„РёР»СЊС‚СЂРѕРІР°С‚СЊ

    // РџСЂРёРјРµРЅСЏРµРј С„РёР»СЊС‚СЂ РїРѕ СЂРѕР»Рё
    if (userRole === 'employee') {
        query = query.eq('user_id', userId);
    } else if (userRole === 'head') {
        query = query.eq('department_id', userDeptId);
    } else if (userRole === 'chief' && departmentId) {
        query = query.eq('department_id', departmentId);
    }
    // Chief Р±РµР· С„РёР»СЊС‚СЂР° - РІСЃРµ

    const { data: events, error } = await query;

    if (error) {
        logger.warn('Error fetching activity feed from view, using activities fallback:', error);
        const eventsFromActivities = await getActivityFeedFromActivities(userId, userRole, userDepartmentId, filters);
        if (eventsFromActivities.length > 0) {
            return eventsFromActivities;
        }
        return getActivityFeedFromDailyTasks(userId, userRole, userDepartmentId, filters);
    }

    // View тоже может вернуть пусто без ошибки, тогда идем дальше по fallback-цепочке.
    const viewEvents = ((events || []) as ActivityFeedRow[]).slice(0, limit).map(mapFeedRowToActivityEvent);
    if (viewEvents.length === 0) {
        const eventsFromActivities = await getActivityFeedFromActivities(userId, userRole, userDepartmentId, filters);
        if (eventsFromActivities.length > 0) {
            return eventsFromActivities;
        }
        return getActivityFeedFromDailyTasks(userId, userRole, userDepartmentId, filters);
    }
    return viewEvents;
}

function normalizeLegacyProfile(value: LegacyActivityProfile | LegacyActivityProfile[] | null | undefined): LegacyActivityProfile | undefined {
    if (!value) return undefined;
    return Array.isArray(value) ? value[0] : value;
}

function toNumber(value: unknown): number | null {
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

function mapLegacyRowToActivityEvent(
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
    const detailsDepartmentId =
        typeof details['department_id'] === 'string' ? details['department_id'] : '';
    const detailsDepartmentName =
        typeof details['department_name'] === 'string' ? details['department_name'] : '';
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
        process_name: details['process_name'] ? String(details['process_name']) : null
    };
}

async function getActivityFeedFromActivities(
    userId: string,
    userRole: string,
    userDepartmentId: string | null,
    filters: ActivityFilters
): Promise<ActivityEvent[]> {
    const { departmentId, daysBack = 7, limit = 50 } = filters;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const { data, error } = await supabase
        .from('activities')
        .select('id, user_id, action_type, target_type, target_id, details, created_at')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(limit * 3);

    if (error) {
        logger.warn('Error fetching activity feed from activities source:', error);
        return [];
    }

    const activityRows = (data || []) as LegacyActivityRow[];
    const userIds = Array.from(new Set(activityRows.map((r) => r.user_id).filter(Boolean))) as string[];
    const annualIds = Array.from(
        new Set(
            activityRows
                .filter((r) => r.target_type === 'annual_plan' && r.target_id)
                .map((r) => r.target_id as string)
        )
    );
    const quarterlyIds = Array.from(
        new Set(
            activityRows
                .filter((r) => r.target_type === 'quarterly_plan' && r.target_id)
                .map((r) => r.target_id as string)
        )
    );
    const profileMap = new Map<string, LegacyActivityProfile>();
    const annualMap = new Map<string, AnnualPlanLookupRow>();
    const quarterlyMap = new Map<string, QuarterlyPlanLookupRow>();

    if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
            .from('v_user_details')
            .select('user_id, email, full_name, photo_base64, role, department_id, department_name')
            .in('user_id', userIds);

        if (!profilesError) {
            for (const profile of (profilesData || []) as LegacyActivityProfile[]) {
                if (profile.user_id) {
                    profileMap.set(profile.user_id, profile);
                }
            }
        }
    }

    if (annualIds.length > 0) {
        const { data: annualData, error: annualError } = await supabase
            .from('annual_plans')
            .select('annual_id, goal, expected_result')
            .in('annual_id', annualIds);

        if (!annualError) {
            for (const annual of (annualData || []) as AnnualPlanLookupRow[]) {
                annualMap.set(annual.annual_id, annual);
            }
        }
    }

    if (quarterlyIds.length > 0) {
        const { data: quarterlyData, error: quarterlyError } = await supabase
            .from('quarterly_plans')
            .select('quarterly_id, goal, expected_result, quarter, department_id')
            .in('quarterly_id', quarterlyIds);

        if (!quarterlyError) {
            for (const quarterly of (quarterlyData || []) as QuarterlyPlanLookupRow[]) {
                quarterlyMap.set(quarterly.quarterly_id, quarterly);
            }
        }
    }

    let events = activityRows.map((row) => {
        const profile = row.user_id ? profileMap.get(row.user_id) : undefined;
        return mapLegacyRowToActivityEvent({
            ...row,
            user_profiles: profile || null
        }, {
            annualPlans: annualMap,
            quarterlyPlans: quarterlyMap
        });
    });

    if (userRole === 'employee') {
        events = events.filter((e) => e.user_id === userId);
    } else if (userRole === 'head') {
        events = events.filter((e) => e.department_id && e.department_id === userDepartmentId);
    } else if (userRole === 'chief' && departmentId) {
        events = events.filter((e) => e.department_id && e.department_id === departmentId);
    }

    if (events.length === 0) {
        return getActivityFeedFromDailyTasks(userId, userRole, userDepartmentId, filters);
    }

    return events.slice(0, limit);
}

type DailyTaskFeedRow = {
    daily_task_id: string;
    monthly_plan_id: string;
    user_id: string | null;
    description: string | null;
    spent_hours: number | null;
    task_date: string | null;
    created_at: string | null;
};

type QuarterlyFeedRow = {
    quarterly_id: string;
    quarter: number | null;
    goal: string | null;
    department_id: string | null;
};

type DepartmentFeedRow = {
    department_id: string;
    department_name: string | null;
};

type MonthlyPlanFeedRow = {
    monthly_plan_id: string;
    description: string | null;
    quarterly_id: string | null;
    measure_id: string | null;
};

type MeasureFeedRow = {
    measure_id: string;
    process_id: string | null;
};

type ProcessFeedRow = {
    process_id: string;
    process_name: string | null;
};

type UserProfileFeedRow = {
    user_id: string;
    email: string | null;
    full_name: string | null;
    photo_base64: string | null;
    role: string | null;
    department_id: string | null;
    department_name: string | null;
};

async function getActivityFeedFromDailyTasks(
    userId: string,
    userRole: string,
    userDepartmentId: string | null,
    filters: ActivityFilters
): Promise<ActivityEvent[]> {
    const { departmentId, daysBack = 7, limit = 50 } = filters;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    let query = supabase
        .from('daily_tasks')
        .select('daily_task_id, monthly_plan_id, user_id, description, spent_hours, task_date, created_at')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(limit * 4);

    if (userRole === 'employee') {
        query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) {
        logger.warn('Error fetching activity feed from daily_tasks fallback:', error);
        return [];
    }

    const rows = (data || []) as DailyTaskFeedRow[];
    if (rows.length === 0) return [];

    const monthlyPlanIds = Array.from(new Set(rows.map((r) => r.monthly_plan_id).filter(Boolean)));
    const monthlyPlanMap = new Map<string, MonthlyPlanFeedRow>();
    if (monthlyPlanIds.length > 0) {
        const { data: monthlyRows } = await supabase
            .from('monthly_plans')
            .select('monthly_plan_id, description, quarterly_id, measure_id')
            .in('monthly_plan_id', monthlyPlanIds);
        for (const row of ((monthlyRows || []) as MonthlyPlanFeedRow[])) {
            monthlyPlanMap.set(row.monthly_plan_id, row);
        }
    }

    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
    const profileMap = new Map<string, UserProfileFeedRow>();
    if (userIds.length > 0) {
        const { data: profileRows } = await supabase
            .from('v_user_details')
            .select('user_id, email, full_name, photo_base64, role, department_id, department_name')
            .in('user_id', userIds);
        for (const row of ((profileRows || []) as UserProfileFeedRow[])) {
            profileMap.set(row.user_id, row);
        }
    }

    const measureIds = Array.from(
        new Set(
            Array.from(monthlyPlanMap.values())
                .map((m) => m.measure_id)
                .filter(Boolean)
        )
    ) as string[];
    const measureMap = new Map<string, MeasureFeedRow>();
    if (measureIds.length > 0) {
        const { data: measureRows } = await supabase
            .from('measures')
            .select('measure_id, process_id')
            .in('measure_id', measureIds);
        for (const row of ((measureRows || []) as MeasureFeedRow[])) {
            measureMap.set(row.measure_id, row);
        }
    }

    const processIds = Array.from(
        new Set(
            Array.from(measureMap.values())
                .map((m) => m.process_id)
                .filter(Boolean)
        )
    ) as string[];
    const processMap = new Map<string, ProcessFeedRow>();
    if (processIds.length > 0) {
        const { data: processRows } = await supabase
            .from('processes')
            .select('process_id, process_name')
            .in('process_id', processIds);
        for (const row of ((processRows || []) as ProcessFeedRow[])) {
            processMap.set(row.process_id, row);
        }
    }

    const quarterlyIds = Array.from(
        new Set(
            Array.from(monthlyPlanMap.values())
                .map((m) => m.quarterly_id)
                .filter(Boolean)
        )
    ) as string[];
    const quarterlyMap = new Map<string, QuarterlyFeedRow>();
    if (quarterlyIds.length > 0) {
        const { data: quarterlyRows } = await supabase
            .from('quarterly_plans')
            .select('quarterly_id, quarter, goal, department_id')
            .in('quarterly_id', quarterlyIds);

        for (const row of ((quarterlyRows || []) as QuarterlyFeedRow[])) {
            quarterlyMap.set(row.quarterly_id, row);
        }
    }

    const departmentIds = Array.from(
        new Set(
            Array.from(quarterlyMap.values())
                .map((q) => q.department_id)
                .filter(Boolean)
        )
    ) as string[];
    const departmentMap = new Map<string, DepartmentFeedRow>();
    if (departmentIds.length > 0) {
        const { data: departmentRows } = await supabase
            .from('departments')
            .select('department_id, department_name')
            .in('department_id', departmentIds);
        for (const row of ((departmentRows || []) as DepartmentFeedRow[])) {
            departmentMap.set(row.department_id, row);
        }
    }

    let events: ActivityEvent[] = rows.map((row) => {
        const profile = row.user_id ? profileMap.get(row.user_id) : undefined;
        const monthly = monthlyPlanMap.get(row.monthly_plan_id);
        const measure = monthly?.measure_id ? measureMap.get(monthly.measure_id) : undefined;
        const processRel = measure?.process_id ? processMap.get(measure.process_id) : undefined;
        const quarterly = monthly?.quarterly_id ? quarterlyMap.get(monthly.quarterly_id) : undefined;
        const deptFromQuarterly = quarterly?.department_id ? departmentMap.get(quarterly.department_id)?.department_name : null;

        return {
            activity_id: row.daily_task_id,
            event_type: 'task_created',
            action_type: 'create',
            target_type: 'daily_task',
            event_time: row.created_at || (row.task_date ? `${row.task_date}T12:00:00.000Z` : new Date().toISOString()),
            user_id: row.user_id || '',
            user_name: profile?.full_name || (profile?.email ? profile.email.split('@')[0] : '') || (row.user_id ? `Пользователь ${row.user_id.slice(0, 8)}` : 'Неизвестно'),
            user_photo: profile?.photo_base64 || null,
            user_role: profile?.role || 'employee',
            department_id: profile?.department_id || quarterly?.department_id || '',
            department_name: profile?.department_name || deptFromQuarterly || '',
            event_description: row.description || '',
            spent_hours: Number(row.spent_hours) || 0,
            plan_id: row.monthly_plan_id,
            plan_name: monthly?.description || '',
            plan_date: row.task_date || '',
            quarterly_goal: quarterly?.goal || null,
            quarter: quarterly?.quarter || null,
            process_name: processRel?.process_name || null
        };
    });

    if (userRole === 'head') {
        events = events.filter((e) => e.department_id && e.department_id === userDepartmentId);
    } else if (userRole === 'chief' && departmentId) {
        events = events.filter((e) => e.department_id && e.department_id === departmentId);
    }

    return events.slice(0, limit);
}

/**
 * РџРѕР»СѓС‡РµРЅРёРµ СЃС‚Р°С‚РёСЃС‚РёРєРё Р°РєС‚РёРІРЅРѕСЃС‚Рё
 * РСЃРїРѕР»СЊР·СѓРµС‚ С‚РѕС‚ Р¶Рµ РёСЃС‚РѕС‡РЅРёРє РґР°РЅРЅС‹С… С‡С‚Рѕ Рё Р»РµРЅС‚Р° (v_activity_feed)
 * @param userId - ID РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
 * @param departmentId - ID РѕС‚РґРµР»Р° РґР»СЏ С„РёР»СЊС‚СЂР°С†РёРё (РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ)
 * @param daysBack - РєРѕР»РёС‡РµСЃС‚РІРѕ РґРЅРµР№ РЅР°Р·Р°Рґ (7 = РЅРµРґРµР»СЏ, 90 = РєРІР°СЂС‚Р°Р», 365 = РіРѕРґ)
 */
export async function getActivityStats(
    userId: string,
    userRole: string,
    userDepartmentId: string | null,
    departmentId?: string,
    daysBack: number = 7
): Promise<ActivityStats> {
    const userDeptId = departmentId || (userRole === 'head' ? userDepartmentId : null);

    // Р”Р°С‚С‹
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const periodStart = new Date(today);
    periodStart.setDate(today.getDate() - daysBack);

    // РСЃРїРѕР»СЊР·СѓРµРј v_activity_feed - С‚РѕС‚ Р¶Рµ РёСЃС‚РѕС‡РЅРёРє С‡С‚Рѕ Рё Р»РµРЅС‚Р° СЃРѕР±С‹С‚РёР№
    // Р‘РµСЂС‘Рј С‚РѕР»СЊРєРѕ task_created СЃРѕР±С‹С‚РёСЏ (СЌС‚Рѕ СЂРµР°Р»СЊРЅС‹Рµ РІС‹РїРѕР»РЅРµРЅРЅС‹Рµ Р·Р°РґР°С‡Рё)
    let query = supabase
        .from('v_activity_feed')
        .select('spent_hours, event_time, user_id, department_id')
        .eq('event_type', 'task_created')
        .gte('event_time', periodStart.toISOString());

    // Р¤РёР»СЊС‚СЂР°С†РёСЏ РїРѕ СЂРѕР»Рё
    if (userRole === 'employee') {
        query = query.eq('user_id', userId);
    } else if (userRole === 'head') {
        query = query.eq('department_id', userDeptId);
    } else if (userRole === 'chief' && departmentId) {
        query = query.eq('department_id', departmentId);
    }
    // Chief Р±РµР· С„РёР»СЊС‚СЂР° - РІСЃРµ

    const { data: events, error } = await query;

    if (error) {
        logger.error('Error fetching activity stats from view:', error);
    }

    // РџРѕРґСЃС‡С‘С‚ СЃС‚Р°С‚РёСЃС‚РёРєРё
    let totalHours = 0;
    let totalTasks = 0;
    let todayHours = 0;
    let todayTasks = 0;
    const activeUserIds = new Set<string>();

    const typedEvents = (events || []) as ActivityStatsRow[];
    for (const event of typedEvents) {
            totalHours += Number(event.spent_hours) || 0;
            totalTasks += 1;
            activeUserIds.add(event.user_id);

            const eventDate = new Date(event.event_time);
            if (eventDate >= today) {
                todayHours += Number(event.spent_hours) || 0;
                todayTasks += 1;
            }
    }

    // РћР±С‰РµРµ РєРѕР»РёС‡РµСЃС‚РІРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№
    let usersQuery = supabase
        .from('user_profiles')
        .select('user_id', { count: 'exact' })
        .eq('status', 'active');

    if (userRole === 'employee') {
        usersQuery = usersQuery.eq('user_id', userId);
    } else if (userRole === 'head') {
        usersQuery = usersQuery.eq('department_id', userDeptId);
    } else if (departmentId) {
        // Chief СЃ РІС‹Р±СЂР°РЅРЅС‹Рј РѕС‚РґРµР»РѕРј
        usersQuery = usersQuery.eq('department_id', departmentId);
    }
    // Chief Р±РµР· С„РёР»СЊС‚СЂР° - РІСЃРµ РїРѕР»СЊР·РѕРІР°С‚РµР»Рё

    const { count: totalUsers } = await usersQuery;

    return {
        totalHours: Math.round(totalHours * 10) / 10,
        totalTasks,
        activeUsers: activeUserIds.size,
        totalUsers: totalUsers || 0,
        todayHours: Math.round(todayHours * 10) / 10,
        todayTasks
    };
}

/**
 * РџРѕР»СѓС‡РµРЅРёРµ СЃРїРёСЃРєР° РѕС‚РґРµР»РѕРІ РґР»СЏ С„РёР»СЊС‚СЂР° (С‚РѕР»СЊРєРѕ РґР»СЏ chief)
 */
export async function getDepartmentsForFilter(): Promise<{ id: string; name: string }[]> {
    const { data } = await supabase
        .from('departments')
        .select('department_id, department_name')
        .order('department_name');

    return data?.map(d => ({ id: d.department_id, name: d.department_name })) || [];
}

/**
 * РљРѕРЅС‚РµРєСЃС‚ РґР»СЏ РР-Р°РЅР°Р»РёР·Р°
 */
export interface AIContext {
    // РўРµРєСѓС‰РёР№ РїРµСЂРёРѕРґ
    current: {
        hours: number;
        tasks: number;
        activeUsers: number;
        avgHoursPerTask: number;
        avgHoursPerUser: number;
    };
    // РџСЂРµРґС‹РґСѓС‰РёР№ РїРµСЂРёРѕРґ (РґР»СЏ СЃСЂР°РІРЅРµРЅРёСЏ)
    previous: {
        hours: number;
        tasks: number;
        activeUsers: number;
        avgHoursPerTask: number;
        avgHoursPerUser: number;
    };
    // РР·РјРµРЅРµРЅРёСЏ РІ %
    changes: {
        hoursChange: number;
        tasksChange: number;
        usersChange: number;
        productivityChange: number; // С‡Р°СЃС‹/Р·Р°РґР°С‡Р°
    };
    // РўРѕРї РёСЃРїРѕР»РЅРёС‚РµР»Рё Р·Р° РїРµСЂРёРѕРґ
    topPerformers: {
        name: string;
        hours: number;
        tasks: number;
        department: string;
    }[];
    // Р Р°СЃРїСЂРµРґРµР»РµРЅРёРµ РїРѕ РѕС‚РґРµР»Р°Рј
    departmentStats: {
        name: string;
        hours: number;
        tasks: number;
        users: number;
    }[];
    // РџРµСЂРёРѕРґ Р°РЅР°Р»РёР·Р°
    periodInfo: {
        type: 'week' | 'month' | 'quarter' | 'year';
        daysBack: number;
        startDate: string;
        endDate: string;
    };
}

/**
 * РџРѕР»СѓС‡РµРЅРёРµ РѕР±РѕРіР°С‰С‘РЅРЅРѕРіРѕ РєРѕРЅС‚РµРєСЃС‚Р° РґР»СЏ РР-Р°РЅР°Р»РёР·Р°
 * РљРѕРЅС‚РµРєСЃС‚ Р·Р°РІРёСЃРёС‚ РѕС‚ РІС‹Р±СЂР°РЅРЅРѕРіРѕ РїРµСЂРёРѕРґР°:
 * - РќРµРґРµР»СЏ: СЃСЂР°РІРЅРµРЅРёРµ СЃ РїСЂРѕС€Р»РѕР№ РЅРµРґРµР»РµР№
 * - РњРµСЃСЏС†: СЃСЂР°РІРЅРµРЅРёРµ СЃ РїСЂРѕС€Р»С‹Рј РјРµСЃСЏС†РµРј
 * - РљРІР°СЂС‚Р°Р»: СЃСЂР°РІРЅРµРЅРёРµ СЃ РїСЂРѕС€Р»С‹Рј РєРІР°СЂС‚Р°Р»РѕРј
 * - Р“РѕРґ: СЃСЂР°РІРЅРµРЅРёРµ СЃ РїСЂРѕС€Р»С‹Рј РіРѕРґРѕРј
 */
export async function getAIContext(
    userId: string,
    userRole: string,
    userDepartmentId: string | null,
    daysBack: number,
    departmentId?: string
): Promise<AIContext> {
    // РћРїСЂРµРґРµР»СЏРµРј С‚РёРї РїРµСЂРёРѕРґР°
    const periodType = daysBack <= 7 ? 'week' : daysBack <= 30 ? 'month' : daysBack <= 90 ? 'quarter' : 'year';

    const userDeptId = departmentId || (userRole === 'head' ? userDepartmentId : null);

    // Р”Р°С‚С‹
    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(now.getDate() - daysBack);

    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - daysBack);

    // Р‘Р°Р·РѕРІС‹Р№ Р·Р°РїСЂРѕСЃ СЃ С„РёР»СЊС‚СЂР°С†РёРµР№ РїРѕ СЂРѕР»Рё
    // Paginated fetch to bypass Supabase max_rows=1000 limit
    const fetchAllRows = async (startDate: Date, endDate: Date): Promise<ActivityContextRow[]> => {
        const PAGE = 1000;
        const allRows: ActivityContextRow[] = [];
        let offset = 0;

        while (true) {
            let query = supabase
                .from('v_activity_feed')
                .select('spent_hours, user_id, user_name, department_id, department_name')
                .eq('event_type', 'task_created')
                .gte('event_time', startDate.toISOString())
                .lt('event_time', endDate.toISOString())
                .range(offset, offset + PAGE - 1);

            if (userRole === 'employee') {
                query = query.eq('user_id', userId);
            } else if (userRole === 'head') {
                query = query.eq('department_id', userDeptId);
            } else if (userRole === 'chief' && departmentId) {
                query = query.eq('department_id', departmentId);
            }

            const { data, error } = await query;
            if (error) throw error;
            if (!data || data.length === 0) break;

            allRows.push(...(data as ActivityContextRow[]));
            if (data.length < PAGE) break;
            offset += PAGE;
        }

        return allRows;
    };

    const [currentEvents, previousEvents] = await Promise.all([
        fetchAllRows(currentStart, now),
        fetchAllRows(previousStart, currentStart)
    ]);

    // Р’С‹С‡РёСЃР»СЏРµРј СЃС‚Р°С‚РёСЃС‚РёРєСѓ
    const calcStats = (events: ActivityContextRow[]) => {
        const hours = events.reduce((sum, e) => sum + (Number(e.spent_hours) || 0), 0);
        const tasks = events.length;
        const users = new Set(events.map(e => e.user_id)).size;
        return {
            hours: Math.round(hours * 100) / 100,
            tasks,
            activeUsers: users,
            avgHoursPerTask: tasks > 0 ? Math.round((hours / tasks) * 100) / 100 : 0,
            avgHoursPerUser: users > 0 ? Math.round((hours / users) * 100) / 100 : 0
        };
    };

    const current = calcStats(currentEvents);
    const previous = calcStats(previousEvents);

    // Р’С‹С‡РёСЃР»СЏРµРј РёР·РјРµРЅРµРЅРёСЏ РІ %
    const calcChange = (curr: number, prev: number) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100);
    };

    const changes = {
        hoursChange: calcChange(current.hours, previous.hours),
        tasksChange: calcChange(current.tasks, previous.tasks),
        usersChange: calcChange(current.activeUsers, previous.activeUsers),
        productivityChange: calcChange(current.avgHoursPerTask, previous.avgHoursPerTask)
    };

    // РўРѕРї РёСЃРїРѕР»РЅРёС‚РµР»Рё (С‚РѕР»СЊРєРѕ РґР»СЏ С‚РµРєСѓС‰РµРіРѕ РїРµСЂРёРѕРґР°)
    const userStats = new Map<string, { name: string; hours: number; tasks: number; department: string }>();
    for (const event of currentEvents) {
        const key = event.user_id;
        const existing = userStats.get(key) || {
            name: event.user_name || 'Неизвестно',
            hours: 0,
            tasks: 0,
            department: event.department_name || ''
        };
        existing.hours += Number(event.spent_hours) || 0;
        existing.tasks += 1;
        userStats.set(key, existing);
    }
    const topPerformers = Array.from(userStats.values())
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 5)
        .map(p => ({ ...p, hours: Math.round(p.hours * 100) / 100 }));

    // РЎС‚Р°С‚РёСЃС‚РёРєР° РїРѕ РѕС‚РґРµР»Р°Рј
    const deptStats = new Map<string, { name: string; hours: number; tasks: number; userIds: Set<string> }>();
    for (const event of currentEvents) {
        const key = event.department_id;
        const existing = deptStats.get(key) || {
            name: event.department_name || '',
            hours: 0,
            tasks: 0,
            userIds: new Set<string>()
        };
        existing.hours += Number(event.spent_hours) || 0;
        existing.tasks += 1;
        existing.userIds.add(event.user_id);
        deptStats.set(key, existing);
    }
    const departmentStats = Array.from(deptStats.values())
        .map(d => ({ name: d.name, hours: Math.round(d.hours * 100) / 100, tasks: d.tasks, users: d.userIds.size }))
        .sort((a, b) => b.hours - a.hours);

    return {
        current,
        previous,
        changes,
        topPerformers,
        departmentStats,
        periodInfo: {
            type: periodType,
            daysBack,
            startDate: currentStart.toISOString().split('T')[0],
            endDate: now.toISOString().split('T')[0]
        }
    };
}



