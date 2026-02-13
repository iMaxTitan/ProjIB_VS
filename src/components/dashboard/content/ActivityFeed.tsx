import React, { useMemo } from 'react';
import Image from 'next/image';
import { ActivityEvent } from '@/lib/services/activity.service';
import { Activity, CheckCircle2, Calendar, RefreshCw, FileText, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';

interface ActivityFeedProps {
    events: ActivityEvent[];
    loading?: boolean;
}

// --- Pluralization helper (Russian) ---
function pluralize(n: number, one: string, few: string, many: string): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 19) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
}

// --- User summary per date ---
interface UserSummary {
    userId: string;
    userName: string;
    userPhoto: string | null;
    departmentName: string;
    lastEventTime: string;
    tasksCreated: number;
    tasksUpdated: number;
    tasksDeleted: number;
    plansCreated: number;
    plansUpdated: number;
    plansDeleted: number;
    reportsGenerated: number;
    totalHours: number;
}

interface DateGroup {
    dateKey: string;
    dateLabel: string;
    userSummaries: UserSummary[];
}

function inferAction(event: ActivityEvent): { target: string; action: string } {
    const action = ((event.action_type || event.event_type || '') as string).toLowerCase();
    let target = (event.target_type || '').toLowerCase();
    if (!target) {
        const eventType = (event.event_type || '').toLowerCase();
        if (eventType === 'task_created' || eventType === 'task_completed') target = 'daily_task';
        else if (eventType === 'report_generated') target = 'report';
        else if (event.plan_id) target = 'plan';
    }
    return { target, action };
}

function accumulateEvent(summary: UserSummary, event: ActivityEvent): void {
    if (event.event_time > summary.lastEventTime) {
        summary.lastEventTime = event.event_time;
    }

    const { target, action } = inferAction(event);

    if (target === 'daily_task') {
        if (action === 'delete') summary.tasksDeleted++;
        else if (action === 'update') summary.tasksUpdated++;
        else {
            summary.tasksCreated++;
            summary.totalHours += Number(event.spent_hours) || 0;
        }
    } else if (target.includes('plan')) {
        if (action === 'create') summary.plansCreated++;
        else if (action === 'delete') summary.plansDeleted++;
        else summary.plansUpdated++;
    } else if (target === 'report' || action === 'report_generated') {
        summary.reportsGenerated++;
    } else if ((event.spent_hours ?? 0) > 0) {
        summary.tasksCreated++;
        summary.totalHours += Number(event.spent_hours) || 0;
    }
}

function buildDateGroups(events: ActivityEvent[]): DateGroup[] {
    // 1. Group events by date
    const byDate = new Map<string, ActivityEvent[]>();
    for (const event of events) {
        const dateKey = new Date(event.event_time).toDateString();
        const list = byDate.get(dateKey) || [];
        list.push(event);
        byDate.set(dateKey, list);
    }

    // 2. For each date, build user summaries
    const groups: DateGroup[] = [];
    for (const [dateKey, dateEvents] of Array.from(byDate.entries())) {
        const userMap = new Map<string, UserSummary>();

        for (const event of dateEvents) {
            let summary = userMap.get(event.user_id);
            if (!summary) {
                summary = {
                    userId: event.user_id,
                    userName: event.user_name || 'Неизвестно',
                    userPhoto: event.user_photo,
                    departmentName: event.department_name || '',
                    lastEventTime: event.event_time,
                    tasksCreated: 0, tasksUpdated: 0, tasksDeleted: 0,
                    plansCreated: 0, plansUpdated: 0, plansDeleted: 0,
                    reportsGenerated: 0, totalHours: 0,
                };
                userMap.set(event.user_id, summary);
            }
            accumulateEvent(summary, event);
        }

        const userSummaries = Array.from(userMap.values()).sort(
            (a, b) => new Date(b.lastEventTime).getTime() - new Date(a.lastEventTime).getTime()
        );

        groups.push({
            dateKey,
            dateLabel: formatDate(dateEvents[0].event_time),
            userSummaries,
        });
    }

    // 3. Sort date groups descending
    groups.sort((a, b) => new Date(b.dateKey).getTime() - new Date(a.dateKey).getTime());
    return groups;
}

// --- Summary chip builder ---
interface SummaryChip {
    icon: React.ElementType;
    iconColor: string;
    bgColor: string;
    text: string;
}

function buildSummaryChips(s: UserSummary): SummaryChip[] {
    const chips: SummaryChip[] = [];

    if (s.tasksCreated > 0) {
        const taskWord = pluralize(s.tasksCreated, 'задачу', 'задачи', 'задач');
        const hoursText = s.totalHours > 0 ? ` · ${Math.round(s.totalHours * 10) / 10}ч` : '';
        chips.push({
            icon: CheckCircle2, iconColor: 'text-emerald-600',
            bgColor: 'bg-emerald-50 border-emerald-100/50',
            text: `создал ${s.tasksCreated} ${taskWord}${hoursText}`,
        });
    }

    if (s.tasksUpdated > 0) {
        const w = pluralize(s.tasksUpdated, 'задачу', 'задачи', 'задач');
        chips.push({ icon: RefreshCw, iconColor: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-100/50', text: `обновил ${s.tasksUpdated} ${w}` });
    }

    if (s.tasksDeleted > 0) {
        const w = pluralize(s.tasksDeleted, 'задачу', 'задачи', 'задач');
        chips.push({ icon: Trash2, iconColor: 'text-red-500', bgColor: 'bg-red-50 border-red-100/50', text: `удалил ${s.tasksDeleted} ${w}` });
    }

    if (s.plansCreated > 0) {
        const w = pluralize(s.plansCreated, 'план', 'плана', 'планов');
        chips.push({ icon: Calendar, iconColor: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-100/50', text: `создал ${s.plansCreated} ${w}` });
    }

    if (s.plansUpdated > 0) {
        const w = pluralize(s.plansUpdated, 'план', 'плана', 'планов');
        chips.push({ icon: RefreshCw, iconColor: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-100/50', text: `обновил ${s.plansUpdated} ${w}` });
    }

    if (s.plansDeleted > 0) {
        const w = pluralize(s.plansDeleted, 'план', 'плана', 'планов');
        chips.push({ icon: Trash2, iconColor: 'text-red-500', bgColor: 'bg-red-50 border-red-100/50', text: `удалил ${s.plansDeleted} ${w}` });
    }

    if (s.reportsGenerated > 0) {
        const w = pluralize(s.reportsGenerated, 'отчёт', 'отчёта', 'отчётов');
        chips.push({ icon: FileText, iconColor: 'text-violet-600', bgColor: 'bg-violet-50 border-violet-100/50', text: `сформировал ${s.reportsGenerated} ${w}` });
    }

    return chips;
}

// --- Formatting ---
function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Сегодня';
    if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
    return date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name: string | null | undefined): string {
    if (!name) return '??';
    return name.split(' ').map(w => w[0]?.toUpperCase() || '').join('').slice(0, 2) || '??';
}

// --- Component ---
export function ActivityFeed({ events, loading }: ActivityFeedProps) {
    const dateGroups = useMemo(() => buildDateGroups(events), [events]);
    const totalUsers = useMemo(() => {
        const ids = new Set(events.map(e => e.user_id));
        return ids.size;
    }, [events]);

    return (
        <div className="glass-card rounded-3xl border border-white/40 bg-white/60 backdrop-blur-xl shadow-sm overflow-hidden min-h-[400px]">
            <div className="px-6 py-4 border-b border-gray-100/50 flex items-center justify-between bg-white/40">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" aria-hidden="true" />
                    Лента событий
                </h3>
                <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-bold">
                    {totalUsers} чел.
                </span>
            </div>

            {loading ? (
                <div className="p-4 space-y-3">
                    {/* Skeleton: date header */}
                    <div className="h-5 w-20 rounded bg-slate-100 animate-pulse" />
                    {/* Skeleton: user rows */}
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex gap-3 px-2 py-2">
                            <div className="w-9 h-9 rounded-xl bg-slate-200 animate-pulse flex-shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="h-4 w-28 rounded bg-slate-200 animate-pulse" />
                                    <div className="h-3.5 w-16 rounded bg-slate-100 animate-pulse" />
                                </div>
                                <div className="flex gap-1.5">
                                    <div className="h-5 w-32 rounded-md bg-slate-100 animate-pulse" />
                                    <div className="h-5 w-24 rounded-md bg-slate-100 animate-pulse" />
                                </div>
                            </div>
                        </div>
                    ))}
                    {/* Centered spinner */}
                    <Spinner size="sm" className="pt-2" />
                </div>
            ) : events.length === 0 ? (
                <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                        <Activity className="h-8 w-8" aria-hidden="true" />
                    </div>
                    <p className="text-slate-500 font-medium">Событий не найдено</p>
                    <p className="text-slate-400 text-xs mt-1">Попробуйте изменить период или фильтры</p>
                </div>
            ) : (
                <div className="overflow-y-auto max-h-[800px] scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    {dateGroups.map((group) => (
                        <div key={group.dateKey} className="relative">
                            {/* Date header */}
                            <div className="sticky top-0 z-10 px-6 py-2 bg-white/90 backdrop-blur-md border-b border-gray-50 text-xs font-bold text-slate-400 uppercase tracking-wider shadow-sm">
                                {group.dateLabel}
                            </div>

                            {/* User summaries for this date */}
                            <div className="divide-y divide-gray-50">
                                {group.userSummaries.map((summary) => {
                                    const chips = buildSummaryChips(summary);
                                    return (
                                        <div
                                            key={summary.userId}
                                            className="group px-4 sm:px-6 py-3 hover:bg-gradient-to-r hover:from-blue-50/30 hover:to-indigo-50/30 transition-colors duration-200"
                                        >
                                            <div className="flex gap-3">
                                                {/* Avatar */}
                                                <div className="flex-shrink-0 mt-0.5">
                                                    {summary.userPhoto ? (
                                                        <Image
                                                            src={summary.userPhoto}
                                                            alt=""
                                                            width={36}
                                                            height={36}
                                                            unoptimized
                                                            className="w-9 h-9 rounded-xl object-cover shadow-sm ring-2 ring-white"
                                                        />
                                                    ) : (
                                                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-100 to-blue-50 text-indigo-600 flex items-center justify-center text-xs font-bold shadow-sm ring-2 ring-white">
                                                            {getInitials(summary.userName)}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    {/* Header: name + department + time */}
                                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="font-bold text-slate-800 text-sm truncate group-hover:text-blue-600 transition-colors">
                                                                {summary.userName}
                                                            </span>
                                                            <span className="text-2xs text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded hidden sm:inline truncate max-w-[140px]">
                                                                {summary.departmentName}
                                                            </span>
                                                        </div>
                                                        <span className="text-xs font-medium text-slate-400 whitespace-nowrap flex-shrink-0">
                                                            {formatTime(summary.lastEventTime)}
                                                        </span>
                                                    </div>

                                                    {/* Summary chips */}
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {chips.map((chip, i) => {
                                                            const ChipIcon = chip.icon;
                                                            return (
                                                                <span
                                                                    key={i}
                                                                    className={cn(
                                                                        'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border',
                                                                        chip.bgColor,
                                                                        'text-slate-700'
                                                                    )}
                                                                >
                                                                    <ChipIcon className={cn('h-3 w-3 flex-shrink-0', chip.iconColor)} aria-hidden="true" />
                                                                    {chip.text}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
