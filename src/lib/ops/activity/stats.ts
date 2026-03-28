/**
 * Activity service — statistics and AI context functions.
 */
import type { SupabaseClient } from '@/lib/shared/postgrest-client';
import { supabase } from '@/lib/shared/supabase';
import { getServerDb } from '@/lib/shared/db-server';
import logger from '@/lib/shared/logger';
import { ActivityStats, ActivityStatsRow, ActivityContextRow } from './types';

/** Returns supabase (browser, has JWT) or getServerDb() (Node, service-role). */
function defaultDb(): SupabaseClient {
    if (typeof window !== 'undefined') return supabase;
    return getServerDb();
}

export interface AIContext {
    current: { hours: number; tasks: number; activeUsers: number; avgHoursPerTask: number; avgHoursPerUser: number };
    previous: { hours: number; tasks: number; activeUsers: number; avgHoursPerTask: number; avgHoursPerUser: number };
    changes: { hoursChange: number; tasksChange: number; usersChange: number; productivityChange: number };
    topPerformers: { name: string; hours: number; tasks: number; department: string }[];
    departmentStats: { name: string; hours: number; tasks: number; users: number }[];
    periodInfo: { type: 'week' | 'month' | 'quarter' | 'year'; daysBack: number; startDate: string; endDate: string };
}

/**
 * Получение статистики активности.
 * Использует тот же источник данных что и лента (v_activity_feed).
 */
export async function getActivityStats(
    userId: string,
    userRole: string,
    userDepartmentId: string | null,
    departmentId?: string,
    daysBack = 7,
    db?: SupabaseClient,
): Promise<ActivityStats> {
    const userDeptId = departmentId || (userRole === 'head' ? userDepartmentId : null);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const periodStart = new Date(today);
    periodStart.setDate(today.getDate() - daysBack);
    const client = db || defaultDb();
    let query = client.from('v_activity_feed').select('spent_hours, event_time, user_id, department_id').eq('event_type', 'task_created').gte('event_time', periodStart.toISOString());
    if (userRole === 'employee') query = query.eq('user_id', userId);
    else if (userRole === 'head') query = query.eq('department_id', userDeptId);
    else if (userRole === 'chief' && departmentId) query = query.eq('department_id', departmentId);
    const { data: events, error } = await query;
    if (error) logger.error('Error fetching activity stats from view:', error);
    let totalHours = 0, totalTasks = 0, todayHours = 0, todayTasks = 0;
    const activeUserIds = new Set<string>();
    for (const event of (events || []) as ActivityStatsRow[]) {
        totalHours += Number(event.spent_hours) || 0;
        totalTasks += 1;
        activeUserIds.add(event.user_id);
        if (new Date(event.event_time) >= today) { todayHours += Number(event.spent_hours) || 0; todayTasks += 1; }
    }
    let usersQuery = client.from('user_profiles').select('user_id', { count: 'exact' }).eq('status', 'active');
    if (userRole === 'employee') usersQuery = usersQuery.eq('user_id', userId);
    else if (userRole === 'head') usersQuery = usersQuery.eq('department_id', userDeptId);
    else if (departmentId) usersQuery = usersQuery.eq('department_id', departmentId);
    const { count: totalUsers } = await usersQuery;
    return {
        totalHours: Math.round(totalHours * 10) / 10,
        totalTasks,
        activeUsers: activeUserIds.size,
        totalUsers: totalUsers || 0,
        todayHours: Math.round(todayHours * 10) / 10,
        todayTasks,
    };
}

/**
 * Получение списка отделов для фильтра (только для chief).
 */
export async function getDepartmentsForFilter(db?: SupabaseClient): Promise<{ id: string; name: string }[]> {
    const client = db || defaultDb();
    const { data } = await client.from('departments').select('department_id, department_name').order('department_name');
    return data?.map(d => ({ id: d.department_id, name: d.department_name })) || [];
}

/**
 * Получение обогащённого контекста для AI-анализа.
 */
export async function getAIContext(
    userId: string,
    userRole: string,
    userDepartmentId: string | null,
    daysBack: number,
    departmentId?: string,
    db?: SupabaseClient,
): Promise<AIContext> {
    const periodType = daysBack <= 7 ? 'week' : daysBack <= 30 ? 'month' : daysBack <= 90 ? 'quarter' : 'year';
    const userDeptId = departmentId || (userRole === 'head' ? userDepartmentId : null);
    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(now.getDate() - daysBack);
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - daysBack);

    const client = db || defaultDb();
    const fetchAllRows = async (startDate: Date, endDate: Date): Promise<ActivityContextRow[]> => {
        const PAGE = 1000;
        const allRows: ActivityContextRow[] = [];
        let offset = 0;
        while (true) {
            let query = client.from('v_activity_feed').select('spent_hours, user_id, user_name, department_id, department_name').eq('event_type', 'task_created').gte('event_time', startDate.toISOString()).lt('event_time', endDate.toISOString()).range(offset, offset + PAGE - 1);
            if (userRole === 'employee') query = query.eq('user_id', userId);
            else if (userRole === 'head') query = query.eq('department_id', userDeptId);
            else if (userRole === 'chief' && departmentId) query = query.eq('department_id', departmentId);
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
        fetchAllRows(previousStart, currentStart),
    ]);

    const calcStats = (events: ActivityContextRow[]) => {
        const hours = events.reduce((sum, e) => sum + (Number(e.spent_hours) || 0), 0);
        const tasks = events.length;
        const users = new Set(events.map(e => e.user_id)).size;
        return { hours: Math.round(hours * 100) / 100, tasks, activeUsers: users, avgHoursPerTask: tasks > 0 ? Math.round((hours / tasks) * 100) / 100 : 0, avgHoursPerUser: users > 0 ? Math.round((hours / users) * 100) / 100 : 0 };
    };

    const current = calcStats(currentEvents);
    const previous = calcStats(previousEvents);
    const calcChange = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);
    const changes = { hoursChange: calcChange(current.hours, previous.hours), tasksChange: calcChange(current.tasks, previous.tasks), usersChange: calcChange(current.activeUsers, previous.activeUsers), productivityChange: calcChange(current.avgHoursPerTask, previous.avgHoursPerTask) };

    const userStats = new Map<string, { name: string; hours: number; tasks: number; department: string }>();
    for (const event of currentEvents) {
        const existing = userStats.get(event.user_id) || { name: event.user_name || 'Неизвестно', hours: 0, tasks: 0, department: event.department_name || '' };
        existing.hours += Number(event.spent_hours) || 0;
        existing.tasks += 1;
        userStats.set(event.user_id, existing);
    }
    const topPerformers = Array.from(userStats.values()).sort((a, b) => b.hours - a.hours).slice(0, 5).map(p => ({ ...p, hours: Math.round(p.hours * 100) / 100 }));

    const deptStats = new Map<string, { name: string; hours: number; tasks: number; userIds: Set<string> }>();
    for (const event of currentEvents) {
        const existing = deptStats.get(event.department_id) || { name: event.department_name || '', hours: 0, tasks: 0, userIds: new Set<string>() };
        existing.hours += Number(event.spent_hours) || 0;
        existing.tasks += 1;
        existing.userIds.add(event.user_id);
        deptStats.set(event.department_id, existing);
    }
    const departmentStats = Array.from(deptStats.values()).map(d => ({ name: d.name, hours: Math.round(d.hours * 100) / 100, tasks: d.tasks, users: d.userIds.size })).sort((a, b) => b.hours - a.hours);

    return {
        current, previous, changes, topPerformers, departmentStats,
        periodInfo: { type: periodType, daysBack, startDate: currentStart.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] },
    };
}
