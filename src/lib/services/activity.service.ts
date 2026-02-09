import { supabase } from '@/lib/supabase';
import logger from '@/lib/logger';

type ActivityEventType = ActivityEvent['event_type'];

interface ActivityFeedRow {
    activity_id: string;
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

function normalizeEventType(value: string): ActivityEventType {
    if (value === 'task_completed') return 'task_completed';
    if (value === 'plan_created') return 'plan_created';
    return 'task_created';
}

function mapFeedRowToActivityEvent(row: ActivityFeedRow): ActivityEvent {
    return {
        activity_id: row.activity_id,
        event_type: normalizeEventType(row.event_type),
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
    event_type: 'task_created' | 'task_completed' | 'plan_created';
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
        // РСЃРїРѕР»СЊР·СѓРµРј RPC С„СѓРЅРєС†РёСЋ get_activity_feed
        const { data, error } = await supabase.rpc('get_activity_feed', {
            p_user_id: userId,
            p_department_id: departmentId || null,
            p_days_back: daysBack,
            p_limit: limit
        });

        if (error) {
            logger.error('RPC get_activity_feed error, using fallback:', error);
            return getActivityFeedFallback(userId, userRole, userDepartmentId, filters);
        }

        // RPC РІРѕР·РІСЂР°С‰Р°РµС‚ РґР°РЅРЅС‹Рµ РІ РЅСѓР¶РЅРѕРј С„РѕСЂРјР°С‚Рµ
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
        logger.error('Error fetching activity feed from view:', error);
        return [];
    }

    // РџСЂРµРѕР±СЂР°Р·СѓРµРј РІ С„РѕСЂРјР°С‚ ActivityEvent
    return ((events || []) as ActivityFeedRow[]).slice(0, limit).map(mapFeedRowToActivityEvent);
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
    const buildQuery = (startDate: Date, endDate: Date) => {
        let query = supabase
            .from('v_activity_feed')
            .select('spent_hours, user_id, user_name, department_id, department_name')
            .eq('event_type', 'task_created')
            .gte('event_time', startDate.toISOString())
            .lt('event_time', endDate.toISOString());

        if (userRole === 'employee') {
            query = query.eq('user_id', userId);
        } else if (userRole === 'head') {
            query = query.eq('department_id', userDeptId);
        } else if (userRole === 'chief' && departmentId) {
            query = query.eq('department_id', departmentId);
        }
        return query;
    };

    // РџР°СЂР°Р»Р»РµР»СЊРЅРѕ Р·Р°РіСЂСѓР¶Р°РµРј РґР°РЅРЅС‹Рµ Р·Р° С‚РµРєСѓС‰РёР№ Рё РїСЂРµРґС‹РґСѓС‰РёР№ РїРµСЂРёРѕРґС‹
    const [currentResult, previousResult] = await Promise.all([
        buildQuery(currentStart, now),
        buildQuery(previousStart, currentStart)
    ]);

    const currentEvents = currentResult.data || [];
    const previousEvents = previousResult.data || [];

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

    const typedCurrentEvents = currentEvents as ActivityContextRow[];
    const typedPreviousEvents = previousEvents as ActivityContextRow[];
    const current = calcStats(typedCurrentEvents);
    const previous = calcStats(typedPreviousEvents);

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
    for (const event of typedCurrentEvents) {
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
    for (const event of typedCurrentEvents) {
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

function getEmptyContext(periodType: 'week' | 'month' | 'quarter' | 'year', daysBack: number): AIContext {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - daysBack);

    return {
        current: { hours: 0, tasks: 0, activeUsers: 0, avgHoursPerTask: 0, avgHoursPerUser: 0 },
        previous: { hours: 0, tasks: 0, activeUsers: 0, avgHoursPerTask: 0, avgHoursPerUser: 0 },
        changes: { hoursChange: 0, tasksChange: 0, usersChange: 0, productivityChange: 0 },
        topPerformers: [],
        departmentStats: [],
        periodInfo: {
            type: periodType,
            daysBack,
            startDate: start.toISOString().split('T')[0],
            endDate: now.toISOString().split('T')[0]
        }
    };
}



