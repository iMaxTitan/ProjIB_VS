import React from 'react';
import { ActivityEvent } from '@/lib/services/activity.service';
import { Activity, Clock, CheckCircle2, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

const EVENT_CONFIG = {
    task_created: {
        icon: CheckCircle2,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        label: 'Задача выполнена'
    },
    task_completed: {
        icon: CheckCircle2,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        label: 'Задача выполнена'
    },
    plan_created: {
        icon: Calendar,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        label: 'План создан'
    }
} as const;

interface ActivityFeedProps {
    events: ActivityEvent[];
    loading?: boolean;
}

export function ActivityFeed({ events, loading }: ActivityFeedProps) {
    const formatTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Сегодня';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Вчера';
        }
        return date.toLocaleDateString('ru-RU', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
    };

    const getInitials = (name: string | null | undefined) => {
        if (!name) return '??';
        return name.split(' ').map(w => w[0]?.toUpperCase() || '').join('').slice(0, 2) || '??';
    };

    // Grouping
    const groupedEvents = events.reduce((acc, event) => {
        const dateKey = new Date(event.event_time).toDateString();
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(event);
        return acc;
    }, {} as Record<string, ActivityEvent[]>);

    return (
        <div className="glass-card rounded-3xl border border-white/40 bg-white/60 backdrop-blur-xl shadow-sm overflow-hidden min-h-[400px]">
            <div className="px-6 py-4 border-b border-gray-100/50 flex items-center justify-between bg-white/40">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    Лента событий
                </h3>
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold">
                    {events.length}
                </span>
            </div>

            {events.length === 0 ? (
                <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                        <Activity className="h-8 w-8" />
                    </div>
                    <p className="text-slate-500 font-medium">Событий не найдено</p>
                    <p className="text-slate-400 text-xs mt-1">Попробуйте изменить период или фильтры</p>
                </div>
            ) : (
                <div className="overflow-y-auto max-h-[800px] scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    {Object.entries(groupedEvents).map(([dateKey, dateEvents]) => (
                        <div key={dateKey} className="relative">
                            <div className="sticky top-0 z-10 px-6 py-2 bg-white/90 backdrop-blur-md border-b border-gray-50 text-xs font-bold text-slate-400 uppercase tracking-wider shadow-sm">
                                {formatDate(dateEvents[0].event_time)}
                            </div>
                            <div className="divide-y divide-gray-50">
                                {dateEvents.map((event) => {
                                    const config = EVENT_CONFIG[event.event_type as keyof typeof EVENT_CONFIG];
                                    if (!config) return null;
                                    const Icon = config.icon;

                                    return (
                                        <div key={event.activity_id} className="group px-6 py-4 hover:bg-gradient-to-r hover:from-blue-50/30 hover:to-indigo-50/30 transition-all duration-200">
                                            <div className="flex gap-4">
                                                {/* Avatar */}
                                                <div className="flex-shrink-0 mt-1">
                                                    {event.user_photo ? (
                                                        <img
                                                            src={event.user_photo}
                                                            alt=""
                                                            className="w-10 h-10 rounded-2xl object-cover shadow-sm ring-2 ring-white"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-100 to-blue-50 text-indigo-600 flex items-center justify-center text-xs font-bold shadow-sm ring-2 ring-white">
                                                            {getInitials(event.user_name)}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-4 mb-1">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="font-bold text-slate-800 text-sm truncate group-hover:text-blue-600 transition-colors">
                                                                {event.user_name || 'Неизвестно'}
                                                            </span>
                                                            <span className="text-xs text-slate-400 truncate px-2 py-0.5 bg-slate-100 rounded-md">
                                                                {event.department_name}
                                                            </span>
                                                        </div>
                                                        <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
                                                            {formatTime(event.event_time)}
                                                        </span>
                                                    </div>

                                                    {/* Activity Type Badge */}
                                                    <div className="flex items-center gap-1.5 mb-2">
                                                        <div className={cn("p-1 rounded-md", config.bgColor)}>
                                                            <Icon className={cn("h-3 w-3", config.color)} />
                                                        </div>
                                                        <span className="text-xs font-semibold text-slate-600">{config.label}</span>
                                                    </div>

                                                    <p className="text-sm text-slate-700 leading-relaxed">
                                                        {event.event_description}
                                                    </p>

                                                    {/* Tags */}
                                                    {((event.spent_hours ?? 0) > 0 || event.plan_name) && (
                                                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                                                            {(event.spent_hours ?? 0) > 0 && (
                                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100/50">
                                                                    <Clock className="h-3 w-3" />
                                                                    {Number(event.spent_hours).toFixed(1)}ч
                                                                </span>
                                                            )}
                                                            {event.plan_name && (
                                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100/50 max-w-[200px] truncate">
                                                                    <CheckCircle2 className="h-3 w-3" />
                                                                    <span className="truncate">{event.plan_name}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
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
