/**
 * Activity service — feed query functions (primary + fallback chain).
 */
import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import { supabase } from '@/lib/shared/supabase';
import { getServerDb } from '@/lib/shared/db-server';
import logger from '@/lib/shared/logger';
import {
    ActivityEvent,
    ActivityFilters,
    ActivityFeedRow,
    LegacyActivityRow,
    LegacyActivityProfile,
    AnnualPlanLookupRow,
    QuarterlyPlanLookupRow,
} from './types';
import { mapFeedRowToActivityEvent, mapLegacyRowToActivityEvent } from './mappers';

/** Returns supabase (browser, has JWT) or getServerDb() (Node, service-role). */
function defaultDb(): SupabaseClient {
    if (typeof window !== 'undefined') return supabase;
    return getServerDb();
}

// Internal row types for daily_tasks fallback
type DailyTaskFeedRow = { daily_task_id: string; monthly_plan_id: string; user_id: string | null; description: string | null; spent_hours: number | null; task_date: string | null; created_at: string | null };
type QuarterlyFeedRow = { quarterly_id: string; quarter: number | null; goal: string | null; department_id: string | null };
type DepartmentFeedRow = { department_id: string; department_name: string | null };
type MonthlyPlanFeedRow = { monthly_plan_id: string; description: string | null; quarterly_id: string | null; procedure_id: string | null };
type ProcedureFeedRow = { procedure_id: string; process_id: string | null };
type ProcessFeedRow = { process_id: string; process_name: string | null };
type UserProfileFeedRow = { user_id: string; email: string | null; full_name: string | null; photo_base64: string | null; role: string | null; department_id: string | null; department_name: string | null };

/**
 * Получение ленты активности с учётом роли пользователя.
 * Chief видит всех, Head — свой отдел, Employee — только себя.
 */
export async function getActivityFeed(
    userId: string,
    userRole: string,
    userDepartmentId: string | null,
    filters: ActivityFilters = {}
): Promise<ActivityEvent[]> {
    const { departmentId, daysBack = 7, dateFrom, dateTo, limit = 50 } = filters;
    if (dateFrom || dateTo) {
        return getActivityFeedByDateRange(userId, userRole, userDepartmentId, filters);
    }
    try {
        const { data, error } = await defaultDb().rpc('get_activity_feed', {
            p_user_id: userId,
            p_department_id: departmentId || null,
            p_days_back: daysBack,
            p_limit: limit,
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

async function getActivityFeedByDateRange(
    userId: string,
    userRole: string,
    userDepartmentId: string | null,
    filters: ActivityFilters
): Promise<ActivityEvent[]> {
    const { departmentId, dateFrom, dateTo, limit = 500 } = filters;
    let query = defaultDb().from('v_activity_feed').select('*').order('event_time', { ascending: false }).limit(limit);
    if (dateFrom) query = query.gte('event_time', dateFrom.toISOString());
    if (dateTo) query = query.lte('event_time', dateTo.toISOString());
    if (userRole === 'employee') query = query.eq('user_id', userId);
    else if (userRole === 'head') query = query.eq('department_id', userDepartmentId);
    else if (userRole === 'chief' && departmentId) query = query.eq('department_id', departmentId);
    const { data, error } = await query;
    if (error) { logger.error('getActivityFeedByDateRange failed:', error); return []; }
    return ((data || []) as ActivityFeedRow[]).map(mapFeedRowToActivityEvent);
}

async function getActivityFeedFallback(
    userId: string,
    userRole: string,
    userDepartmentId: string | null,
    filters: ActivityFilters
): Promise<ActivityEvent[]> {
    const { departmentId, daysBack = 7, limit = 50 } = filters;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    let query = defaultDb().from('v_activity_feed').select('*').gte('event_time', startDate.toISOString()).order('event_time', { ascending: false }).limit(limit * 2);
    if (userRole === 'employee') query = query.eq('user_id', userId);
    else if (userRole === 'head') query = query.eq('department_id', userDepartmentId);
    else if (userRole === 'chief' && departmentId) query = query.eq('department_id', departmentId);
    const { data: events, error } = await query;
    if (error) {
        logger.warn('Error fetching activity feed from view, using activities fallback:', error);
        const fromActivities = await getActivityFeedFromActivities(userId, userRole, userDepartmentId, filters);
        return fromActivities.length > 0 ? fromActivities : getActivityFeedFromDailyTasks(userId, userRole, userDepartmentId, filters);
    }
    const viewEvents = ((events || []) as ActivityFeedRow[]).slice(0, limit).map(mapFeedRowToActivityEvent);
    if (viewEvents.length === 0) {
        const fromActivities = await getActivityFeedFromActivities(userId, userRole, userDepartmentId, filters);
        return fromActivities.length > 0 ? fromActivities : getActivityFeedFromDailyTasks(userId, userRole, userDepartmentId, filters);
    }
    return viewEvents;
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
    if (error) { logger.warn('Error fetching activity feed from activities source:', error); return []; }
    const activityRows = (data || []) as LegacyActivityRow[];
    const userIds = Array.from(new Set(activityRows.map(r => r.user_id).filter(Boolean))) as string[];
    const annualIds = Array.from(new Set(activityRows.filter(r => r.target_type === 'annual_plan' && r.target_id).map(r => r.target_id as string)));
    const quarterlyIds = Array.from(new Set(activityRows.filter(r => r.target_type === 'quarterly_plan' && r.target_id).map(r => r.target_id as string)));
    const profileMap = new Map<string, LegacyActivityProfile>();
    const annualMap = new Map<string, AnnualPlanLookupRow>();
    const quarterlyMap = new Map<string, QuarterlyPlanLookupRow>();
    if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await defaultDb().from('v_user_details').select('user_id, email, full_name, photo_base64, role, department_id, department_name').in('user_id', userIds);
        if (!profilesError) for (const p of (profilesData || []) as LegacyActivityProfile[]) { if (p.user_id) profileMap.set(p.user_id, p); }
    }
    if (annualIds.length > 0) {
        const { data: annualData, error: annualError } = await defaultDb().from('annual_plans').select('annual_id, goal, expected_result').in('annual_id', annualIds);
        if (!annualError) for (const a of (annualData || []) as AnnualPlanLookupRow[]) annualMap.set(a.annual_id, a);
    }
    if (quarterlyIds.length > 0) {
        const { data: qData, error: qError } = await defaultDb().from('quarterly_plans').select('quarterly_id, goal, expected_result, quarter, department_id').in('quarterly_id', quarterlyIds);
        if (!qError) for (const q of (qData || []) as QuarterlyPlanLookupRow[]) quarterlyMap.set(q.quarterly_id, q);
    }
    let events = activityRows.map(row => {
        const profile = row.user_id ? profileMap.get(row.user_id) : undefined;
        return mapLegacyRowToActivityEvent({ ...row, user_profiles: profile || null }, { annualPlans: annualMap, quarterlyPlans: quarterlyMap });
    });
    if (userRole === 'employee') events = events.filter(e => e.user_id === userId);
    else if (userRole === 'head') events = events.filter(e => e.department_id && e.department_id === userDepartmentId);
    else if (userRole === 'chief' && departmentId) events = events.filter(e => e.department_id && e.department_id === departmentId);
    if (events.length === 0) return getActivityFeedFromDailyTasks(userId, userRole, userDepartmentId, filters);
    return events.slice(0, limit);
}

async function getActivityFeedFromDailyTasks(
    userId: string,
    userRole: string,
    userDepartmentId: string | null,
    filters: ActivityFilters
): Promise<ActivityEvent[]> {
    const { departmentId, daysBack = 7, limit = 50 } = filters;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    let query = defaultDb().from('daily_tasks').select('daily_task_id, monthly_plan_id, user_id, description, spent_hours, task_date, created_at').gte('created_at', startDate.toISOString()).order('created_at', { ascending: false }).limit(limit * 4);
    if (userRole === 'employee') query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) { logger.warn('Error fetching activity feed from daily_tasks fallback:', error); return []; }
    const rows = (data || []) as DailyTaskFeedRow[];
    if (rows.length === 0) return [];

    const monthlyPlanIds = Array.from(new Set(rows.map(r => r.monthly_plan_id).filter(Boolean)));
    const monthlyPlanMap = new Map<string, MonthlyPlanFeedRow>();
    if (monthlyPlanIds.length > 0) {
        const { data: mRows } = await defaultDb().from('monthly_plans').select('monthly_plan_id, description, quarterly_id, procedure_id').in('monthly_plan_id', monthlyPlanIds);
        for (const r of (mRows || []) as MonthlyPlanFeedRow[]) monthlyPlanMap.set(r.monthly_plan_id, r);
    }

    const userIds = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean))) as string[];
    const profileMap = new Map<string, UserProfileFeedRow>();
    if (userIds.length > 0) {
        const { data: pRows } = await defaultDb().from('v_user_details').select('user_id, email, full_name, photo_base64, role, department_id, department_name').in('user_id', userIds);
        for (const r of (pRows || []) as UserProfileFeedRow[]) profileMap.set(r.user_id, r);
    }

    const procedureIds = Array.from(new Set(Array.from(monthlyPlanMap.values()).map(m => m.procedure_id).filter(Boolean))) as string[];
    const procedureMap = new Map<string, ProcedureFeedRow>();
    if (procedureIds.length > 0) {
        const { data: prRows } = await defaultDb().from('procedures').select('procedure_id, process_id').in('procedure_id', procedureIds);
        for (const r of (prRows || []) as ProcedureFeedRow[]) procedureMap.set(r.procedure_id, r);
    }

    const processIds = Array.from(new Set(Array.from(procedureMap.values()).map(m => m.process_id).filter(Boolean))) as string[];
    const processMap = new Map<string, ProcessFeedRow>();
    if (processIds.length > 0) {
        const { data: psRows } = await defaultDb().from('processes').select('process_id, process_name').in('process_id', processIds);
        for (const r of (psRows || []) as ProcessFeedRow[]) processMap.set(r.process_id, r);
    }

    const quarterlyIds = Array.from(new Set(Array.from(monthlyPlanMap.values()).map(m => m.quarterly_id).filter(Boolean))) as string[];
    const quarterlyMap = new Map<string, QuarterlyFeedRow>();
    if (quarterlyIds.length > 0) {
        const { data: qRows } = await defaultDb().from('quarterly_plans').select('quarterly_id, quarter, goal, department_id').in('quarterly_id', quarterlyIds);
        for (const r of (qRows || []) as QuarterlyFeedRow[]) quarterlyMap.set(r.quarterly_id, r);
    }

    const departmentIds = Array.from(new Set(Array.from(quarterlyMap.values()).map(q => q.department_id).filter(Boolean))) as string[];
    const departmentMap = new Map<string, DepartmentFeedRow>();
    if (departmentIds.length > 0) {
        const { data: dRows } = await defaultDb().from('departments').select('department_id, department_name').in('department_id', departmentIds);
        for (const r of (dRows || []) as DepartmentFeedRow[]) departmentMap.set(r.department_id, r);
    }

    let events: ActivityEvent[] = rows.map(row => {
        const profile = row.user_id ? profileMap.get(row.user_id) : undefined;
        const monthly = monthlyPlanMap.get(row.monthly_plan_id);
        const procedure = monthly?.procedure_id ? procedureMap.get(monthly.procedure_id) : undefined;
        const processRel = procedure?.process_id ? processMap.get(procedure.process_id) : undefined;
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
            process_name: processRel?.process_name || null,
        };
    });

    if (userRole === 'head') events = events.filter(e => e.department_id && e.department_id === userDepartmentId);
    else if (userRole === 'chief' && departmentId) events = events.filter(e => e.department_id && e.department_id === departmentId);
    return events.slice(0, limit);
}
