import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { GraphCalendarService } from '@/services/graph';
import { Loader2, Plus, Calendar as CalendarIcon, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalendarEvent } from "@/types/graph-types";
import logger from '@/lib/logger';

interface OutlookActivitySidebarProps {
    onAddEventToLog?: (event: CalendarEvent) => void;
    onEventsLoaded?: (events: Array<{
        subject: string;
        start: string;
        end: string;
        duration_hours: number;
    }>) => void;
}

export default function OutlookActivitySidebar({ onAddEventToLog, onEventsLoaded }: OutlookActivitySidebarProps) {
    const { user } = useAuth();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user?.user_id) return;

        const loadEvents = async () => {
            setLoading(true);
            try {
                // Load current week + previous week
                const now = new Date();
                const start = new Date(now);
                start.setDate(now.getDate() - 7);
                const end = new Date(now);
                end.setDate(now.getDate() + 7);

                const data = await GraphCalendarService.getCalendarEvents({
                    startDate: start,
                    endDate: end
                });

                // Sort desc
                data.sort((a, b) => new Date(b.start.dateTime).getTime() - new Date(a.start.dateTime).getTime());
                setEvents(data);

                // Передаем события для AI-контекста
                if (onEventsLoaded) {
                    const formattedEvents = data.map(e => {
                        const startTime = new Date(e.start.dateTime).getTime();
                        const endTime = new Date(e.end.dateTime).getTime();
                        const durationHours = (endTime - startTime) / (1000 * 60 * 60);
                        return {
                            subject: e.subject,
                            start: e.start.dateTime,
                            end: e.end.dateTime,
                            duration_hours: Math.round(durationHours * 10) / 10
                        };
                    });
                    onEventsLoaded(formattedEvents);
                }
            } catch (e: unknown) {
                logger.error(e);
                setError("Не удалось загрузить календарь");
            } finally {
                setLoading(false);
            }
        };

        loadEvents();
    }, [user?.user_id]);

    const formatTime = (iso: string) => {
        return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (iso: string) => {
        return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    };

    return (
        <div className="flex flex-col h-full bg-gray-50/50 border-l border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <CalendarIcon className="w-3 h-3" />
                    Outlook Calendar
                </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                ) : error ? (
                    <div className="text-xs text-red-500 text-center py-4">{error}</div>
                ) : events.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-xs">
                        Нет событий за последнее время
                    </div>
                ) : (
                    events.map(event => (
                        <div
                            key={event.id}
                            className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-all group flex flex-col gap-2 relative"
                        >
                            <div className="flex justify-between items-start gap-2">
                                <span className="text-xs font-bold text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 whitespace-nowrap">
                                    {formatDate(event.start.dateTime)}
                                </span>
                                <span className="text-xs font-mono text-gray-400">
                                    {formatTime(event.start.dateTime)}
                                </span>
                            </div>

                            <p className="text-sm font-medium text-gray-800 leading-tight line-clamp-2" title={event.subject}>
                                {event.subject}
                            </p>

                            {/* Add Button Overlay */}
                            {onAddEventToLog && (
                                <button
                                    onClick={() => onAddEventToLog(event)}
                                    className="absolute inset-0 bg-indigo-50/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-indigo-600 font-medium text-xs gap-1 backdrop-blur-[1px]"
                                >
                                    <Plus className="w-4 h-4" />
                                    Добавить в журнал
                                </button>
                            )}

                            <div className="flex items-center justify-between mt-1">
                                <span className="text-2xs text-gray-400 truncate max-w-[120px]">
                                    {event.organizer?.emailAddress.name || 'Unknown'}
                                </span>
                                {(event.onlineMeetingUrl || event.onlineMeeting?.joinUrl) && (
                                    <ExternalLink className="w-3 h-3 text-blue-400" />
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}


