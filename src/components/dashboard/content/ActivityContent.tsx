'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { UserInfo } from '@/types/azure';
import {
    Clock,
    CheckCircle2,
    Users,
    TrendingUp,
    RefreshCw,
    ChevronDown,
    AlertTriangle,
    ThumbsUp,
    Loader2,
    Brain,
    GripVertical,
    BarChart2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { BottomDrawer } from '@/components/ui/BottomDrawer';
import { ActivityFeed } from './ActivityFeed';
import {
    getActivityFeed,
    getAIContext,
    ActivityEvent,
} from '@/lib/services/activity.service';
import { supabase } from '@/lib/supabase';
import logger from '@/lib/logger';

interface ActivityContentProps {
    user: UserInfo;
}

// AI Analysis Interface
interface AIAnalysis {
    summary: string;
    insights: { type: 'positive' | 'warning' | 'neutral'; text: string }[];
    topPerformers: string[];
    concerns: string[];
}

// Stats interface
interface ActivityStats {
    totalHours: number;
    totalTasks: number;
    activeUsers: number;
    totalUsers: number;
    todayHours: number;
    todayTasks: number;
}

type ChangelogType = 'Добавлено' | 'Обновлено' | 'Исправлено';

// Редактирование changelog:
// 1) Добавляй новые записи в начало массива.
// 2) Используй только типы: Добавлено, Обновлено, Исправлено.
// 3) Формат даты: ДД.ММ (например, 08.02).
const MANUAL_BUILD_CHANGELOG_ITEMS: Array<{ date: string; type: ChangelogType; text: string }> = [
    { date: '08.02', type: 'Добавлено', text: 'функция копирования планов для быстрого переноса в другой период без ручного заполнения.' },
    { date: '08.02', type: 'Обновлено', text: 'повышена стабильность и скорость работы приложения.' },
    { date: '08.02', type: 'Обновлено', text: 'интерфейс упрощен, ключевые действия вынесены на удобные позиции.' },
    { date: '08.02', type: 'Обновлено', text: 'карточки приведены к единому формату (просмотр, редактирование, создание).' },
    { date: '08.02', type: 'Обновлено', text: 'улучшена мобильная версия, уменьшено количество лишних касаний.' },
    { date: '07.02', type: 'Обновлено', text: 'раздел «Справочники» приведен к единому и более аккуратному виду.' },
    { date: '07.02', type: 'Обновлено', text: 'повышена читаемость текста и подписей на основных экранах.' },
    { date: '07.02', type: 'Исправлено', text: 'некорректное отображение текста в отдельных блоках.' }
];

const CHANGELOG_TYPE_STYLES: Record<ChangelogType, string> = {
    Добавлено: 'bg-emerald-100 text-emerald-700',
    Обновлено: 'bg-blue-100 text-blue-700',
    Исправлено: 'bg-amber-100 text-amber-700'
};

// Period options
const PERIODS = [
    { value: 7, label: '7 дней', shortLabel: '7д' },
    { value: 30, label: '30 дней', shortLabel: '30д' },
    { value: 90, label: 'Квартал', shortLabel: '3М' },
    { value: 365, label: 'Год', shortLabel: '1Г' }
] as const;

type PeriodValue = typeof PERIODS[number]['value'];

export default function ActivityContent({ user }: ActivityContentProps) {
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [totalUsers, setTotalUsers] = useState(0);
    const [loading, setLoading] = useState(true);

    // AI Analysis
    const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [showAiPanel, setShowAiPanel] = useState(false);

    // Period and filters
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodValue>(7);

    // Panel width for resizing
    const [panelWidth, setPanelWidth] = useState(480);
    const isResizingRef = React.useRef(false);
    const panelRef = React.useRef<HTMLDivElement>(null);

    // Mobile drawer
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const isMobile = useIsMobile();
    const isChief = user.role === 'chief';
    const isHead = user.role === 'head';
    const canSeeAI = isChief || isHead;

    // Calculate stats from events
    const stats = useMemo<ActivityStats>(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let totalHours = 0;
        let totalTasks = 0;
        let todayHours = 0;
        let todayTasks = 0;
        const activeUserIds = new Set<string>();

        for (const event of events) {
            if (event.event_type !== 'task_created' && event.event_type !== 'task_completed') {
                continue;
            }

            totalHours += Number(event.spent_hours) || 0;
            totalTasks += 1;
            activeUserIds.add(event.user_id);

            const eventDate = new Date(event.event_time);
            if (eventDate >= today) {
                todayHours += Number(event.spent_hours) || 0;
                todayTasks += 1;
            }
        }

        return {
            totalHours: Math.round(totalHours * 100) / 100,
            totalTasks,
            activeUsers: activeUserIds.size,
            totalUsers,
            todayHours: Math.round(todayHours * 100) / 100,
            todayTasks
        };
    }, [events, totalUsers]);

    const loadData = useCallback(async () => {
        try {
            const eventsData = await getActivityFeed(user.user_id, user.role || 'employee', user.department_id || null, {
                daysBack: selectedPeriod,
                limit: 500
            });

            setEvents(eventsData);

            let usersQuery = supabase
                .from('user_profiles')
                .select('user_id', { count: 'exact' })
                .eq('status', 'active');

            if (user.role === 'employee') {
                usersQuery = usersQuery.eq('user_id', user.user_id);
            } else if (user.role === 'head') {
                usersQuery = usersQuery.eq('department_id', user.department_id);
            }

            const { count } = await usersQuery;
            setTotalUsers(count || 0);
        } catch (error: unknown) {
            logger.error('Error loading activity:', error);
        } finally {
            setLoading(false);
        }
    }, [user.user_id, user.role, user.department_id, selectedPeriod]);

    const analyzeWithAI = async () => {
        setAiLoading(true);
        setAiAnalysis(null);
        try {
            const [aiEvents, aiContext] = await Promise.all([
                getActivityFeed(user.user_id, user.role || 'employee', user.department_id || null, {
                    daysBack: selectedPeriod,
                    limit: 200
                }),
                getAIContext(user.user_id, user.role || 'employee', user.department_id || null, selectedPeriod)
            ]);

            const response = await fetch('/api/ai/activity-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    events: aiEvents.slice(0, 100),
                    stats,
                    context: aiContext,
                    userRole: user.role,
                    daysBack: selectedPeriod
                })
            });

            if (response.ok) {
                const data = await response.json();
                setAiAnalysis(data.analysis);
            }
        } catch (error: unknown) {
            logger.error('AI analysis error:', error);
        } finally {
            setAiLoading(false);
        }
    };

    const handlePeriodChange = (period: PeriodValue) => {
        setSelectedPeriod(period);
        setAiAnalysis(null);
    };

    const getPeriodLabel = (days: number) => {
        const period = PERIODS.find(p => p.value === days);
        return period?.label || `${days} дней`;
    };

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Resize handlers
    const handleMouseDown = () => {
        isResizingRef.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isResizingRef.current) return;
        const newWidth = e.clientX - (panelRef.current?.getBoundingClientRect().left || 0);
        if (newWidth >= 280 && newWidth <= 600) {
            setPanelWidth(newWidth);
        }
    };

    const handleMouseUp = () => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    // Left panel - Stats & AI
    const leftPanel = (
        <div className="flex flex-col h-full">
            {!isMobile && (
                <nav
                    className="flex-shrink-0 bg-gradient-to-b from-indigo-50/50 to-transparent border-b border-indigo-200"
                    role="navigation"
                    aria-label="Выбор периода"
                >
                    <div className="px-2 sm:px-4 pt-2">
                        <div className="flex gap-0.5 items-end">
                            {PERIODS.map(({ value, label, shortLabel }) => (
                                <button
                                    type="button"
                                    key={value}
                                    onClick={() => handlePeriodChange(value)}
                                    aria-label={`Период: ${label}`}
                                    aria-current={selectedPeriod === value ? 'true' : undefined}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-t-lg transition-all border-t border-l border-r",
                                        "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
                                        selectedPeriod === value
                                            ? "bg-white border-indigo-300 text-indigo-700 shadow-sm -mb-px"
                                            : "bg-indigo-50/70 border-indigo-200/50 text-gray-500 hover:bg-indigo-100/70"
                                    )}
                                >
                                    <span className="hidden xs:inline">{label}</span>
                                    <span className="xs:hidden">{shortLabel}</span>
                                </button>
                            ))}
                            <div className="flex-1" />
                        </div>
                    </div>
                </nav>
            )}

            {/* Header */}
            <div className="flex-shrink-0 p-3 sm:p-4 border-b border-gray-100 bg-white/50">
                <div className="flex items-center gap-2 mb-3">
                    <BarChart2 className="h-5 w-5 text-indigo-600" aria-hidden="true" />
                    <h2 className="text-base sm:text-lg font-bold text-slate-800">Статистика</h2>
                </div>

            </div>

            {/* Stats cards */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-4">
                {/* Stats Summary Card */}
                <div className="bg-white rounded-xl border border-slate-200 p-2.5">
                    <div className="grid grid-cols-4 gap-2">
                        <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                            <div className="flex items-center gap-1.5 mb-1">
                                <div className="w-5 h-5 rounded-md bg-blue-100 flex items-center justify-center">
                                    <Clock className="h-2.5 w-2.5 text-blue-600" aria-hidden="true" />
                                </div>
                                <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">Часов</span>
                            </div>
                            <div className="text-2xl font-bold text-slate-800 leading-none">{stats.totalHours}</div>
                            <div className="text-2xs font-medium text-emerald-600 mt-1">+{stats.todayHours} сегодня</div>
                        </div>

                        <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                            <div className="flex items-center gap-1.5 mb-1">
                                <div className="w-5 h-5 rounded-md bg-emerald-100 flex items-center justify-center">
                                    <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" aria-hidden="true" />
                                </div>
                                <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">Задач</span>
                            </div>
                            <div className="text-2xl font-bold text-slate-800 leading-none">{stats.totalTasks}</div>
                            <div className="text-2xs font-medium text-emerald-600 mt-1">+{stats.todayTasks} сегодня</div>
                        </div>

                        <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                            <div className="flex items-center gap-1.5 mb-1">
                                <div className="w-5 h-5 rounded-md bg-purple-100 flex items-center justify-center">
                                    <Users className="h-2.5 w-2.5 text-purple-600" aria-hidden="true" />
                                </div>
                                <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">Активных</span>
                            </div>
                            <div className="text-2xl font-bold text-slate-800 leading-none">{stats.activeUsers}</div>
                            <div className="text-2xs text-slate-500 mt-1">
                                из <span className="font-bold text-slate-700">{stats.totalUsers}</span>
                            </div>
                        </div>

                        <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                            <div className="flex items-center gap-1.5 mb-1">
                                <div className="w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center">
                                    <TrendingUp className="h-2.5 w-2.5 text-amber-600" aria-hidden="true" />
                                </div>
                                <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">Среднее</span>
                            </div>
                            <div className="text-2xl font-bold text-slate-800 leading-none">
                                {stats.activeUsers > 0 ? (stats.totalHours / stats.activeUsers).toFixed(1) : '0'}
                            </div>
                            <div className="text-2xs text-slate-500 mt-1">час/чел</div>
                        </div>
                    </div>
                </div>

                {/* Build changelog */}
                <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Что нового</h3>
                    <ul className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 space-y-1.5">
                        {MANUAL_BUILD_CHANGELOG_ITEMS.map((item, idx) => (
                            <li key={`${item.date}-${idx}`} className="text-xs text-slate-700 leading-relaxed">
                                <span className="font-semibold">{item.date}</span>
                                <span className={`ml-2 inline-flex rounded px-1.5 py-0.5 text-2xs font-semibold ${CHANGELOG_TYPE_STYLES[item.type]}`}>
                                    {item.type}
                                </span>
                                <span className="ml-2">{item.text}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* AI Analysis Panel */}
                {canSeeAI && (
                    <div className="bg-amber-50/50 rounded-xl border border-amber-200/50 overflow-hidden">
                        <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-amber-100/50">
                            <div className="flex items-center gap-2">
                                <div className="bg-amber-100 p-1.5 rounded-lg">
                                    <Brain className="h-4 w-4 text-amber-600" aria-hidden="true" />
                                </div>
                                <div>
                                    <span className="font-bold text-slate-800 text-sm">AI Анализ</span>
                                    <span className="text-2xs text-amber-700/70 font-medium block">
                                        {getPeriodLabel(selectedPeriod)}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-1">
                                {!aiAnalysis && !aiLoading && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAiPanel(true);
                                            analyzeWithAI();
                                        }}
                                        disabled={events.length === 0}
                                        aria-label="Запустить AI-анализ"
                                        className={cn(
                                            "px-2.5 py-1 text-xs font-bold rounded-lg transition-all",
                                            "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-md",
                                            events.length === 0 && "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        Анализ
                                    </button>
                                )}
                                {aiAnalysis && !aiLoading && (
                                    <button
                                        type="button"
                                        onClick={analyzeWithAI}
                                        className="p-1.5 text-amber-600 hover:bg-amber-100/50 rounded-lg transition-colors"
                                        aria-label="Обновить анализ"
                                    >
                                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                )}
                                {(showAiPanel || aiAnalysis) && (
                                    <button
                                        type="button"
                                        onClick={() => setShowAiPanel(!showAiPanel)}
                                        className="p-1.5 text-amber-600 hover:bg-amber-100/50 rounded-lg transition-colors"
                                        aria-label={showAiPanel ? 'Свернуть' : 'Развернуть'}
                                    >
                                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAiPanel && "rotate-180")} aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {showAiPanel && (
                            <div className="p-3 space-y-3">
                                {aiLoading ? (
                                    <div className="flex flex-col items-center justify-center py-6 text-amber-700 space-y-2">
                                        <Loader2 className="h-6 w-6 animate-spin opacity-50" aria-hidden="true" />
                                        <span className="text-xs font-medium">Анализирую данные...</span>
                                    </div>
                                ) : aiAnalysis ? (
                                    <>
                                        <div className="bg-white/60 p-3 rounded-xl border border-amber-100 text-xs text-slate-700 leading-relaxed font-medium">
                                            {aiAnalysis.summary}
                                        </div>

                                        {aiAnalysis.insights.length > 0 && (
                                            <div className="space-y-2">
                                                <h4 className="text-2xs font-bold uppercase tracking-wider text-slate-400">Инсайты</h4>
                                                {aiAnalysis.insights.map((insight, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={cn(
                                                            "flex items-start gap-2 p-2 rounded-lg border text-xs",
                                                            insight.type === 'positive' && "bg-green-50/50 border-green-100 text-green-800",
                                                            insight.type === 'warning' && "bg-amber-50/50 border-amber-100 text-amber-800",
                                                            insight.type === 'neutral' && "bg-slate-50/50 border-slate-100 text-slate-700"
                                                        )}
                                                    >
                                                        {insight.type === 'positive' && <ThumbsUp className="h-3 w-3 mt-0.5 flex-shrink-0" aria-hidden="true" />}
                                                        {insight.type === 'warning' && <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" aria-hidden="true" />}
                                                        <span className="font-medium leading-relaxed">{insight.text}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {aiAnalysis.topPerformers.length > 0 && (
                                            <div className="bg-green-50/50 rounded-lg p-3 border border-green-100/50">
                                                <h4 className="text-2xs font-bold uppercase tracking-wider text-green-700 mb-2 flex items-center gap-1">
                                                    <TrendingUp className="h-3 w-3" aria-hidden="true" />
                                                    Лидеры
                                                </h4>
                                                <ul className="space-y-1">
                                                    {aiAnalysis.topPerformers.map((name, idx) => (
                                                        <li key={idx} className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                                                            <div className="w-1 h-1 rounded-full bg-green-400" />
                                                            {name}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {aiAnalysis.concerns.length > 0 && (
                                            <div className="bg-amber-50/50 rounded-lg p-3 border border-amber-100/50">
                                                <h4 className="text-2xs font-bold uppercase tracking-wider text-amber-700 mb-2 flex items-center gap-1">
                                                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                                    Внимание
                                                </h4>
                                                <ul className="space-y-1">
                                                    {aiAnalysis.concerns.map((c, idx) => (
                                                        <li key={idx} className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                                                            <div className="w-1 h-1 rounded-full bg-amber-400" />
                                                            {c}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-center py-4">
                                        <p className="text-xs font-medium text-amber-700">
                                            Нажмите &quot;Анализ&quot; для получения AI-инсайтов
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    // Right panel - Activity Feed
    const rightPanel = (
        <div className="h-full overflow-hidden">
            <ActivityFeed events={events} loading={loading} />
        </div>
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" aria-hidden="true" />
            </div>
        );
    }

    // Mobile layout
    if (isMobile) {
        return (
            <div className="flex flex-col h-full">
                {/* Period tabs */}
                <nav
                    className="flex-shrink-0 bg-gradient-to-b from-indigo-50/50 to-transparent border-b border-indigo-200"
                    role="navigation"
                    aria-label="Выбор периода"
                >
                    <div className="px-2 sm:px-4 pt-2">
                        <div className="flex gap-0.5 items-end">
                            {PERIODS.map(({ value, label, shortLabel }) => (
                                <button
                                    type="button"
                                    key={value}
                                    onClick={() => handlePeriodChange(value)}
                                    aria-label={`Период: ${label}`}
                                    aria-current={selectedPeriod === value ? 'true' : undefined}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-all border-t border-l border-r",
                                        "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
                                        selectedPeriod === value
                                            ? "bg-white border-indigo-300 text-indigo-700 shadow-sm -mb-px"
                                            : "bg-indigo-50/70 border-indigo-200/50 text-gray-500 hover:bg-indigo-100/70"
                                    )}
                                >
                                    <span className="hidden xs:inline">{label}</span>
                                    <span className="xs:hidden">{shortLabel}</span>
                                </button>
                            ))}
                            <div className="flex-1" />
                        </div>
                    </div>
                </nav>

                {/* Content */}
                <div className="flex-1 overflow-hidden bg-indigo-50/30 p-3">
                    {rightPanel}
                </div>

                {/* FAB for stats */}
                <button
                    type="button"
                    onClick={() => setIsDrawerOpen(true)}
                    aria-label="Открыть статистику"
                    className="fixed bottom-6 right-6 z-50 p-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full shadow-lg shadow-indigo-500/30 transition-transform active:scale-95"
                >
                    <BarChart2 className="h-6 w-6" aria-hidden="true" />
                </button>

                {/* Stats Drawer */}
                <BottomDrawer
                    isOpen={isDrawerOpen}
                    onClose={() => setIsDrawerOpen(false)}
                    height="auto"
                    showCloseButton={true}
                    showDragHandle={true}
                >
                    <div className="min-h-[50vh] bg-slate-50">
                        {leftPanel}
                    </div>
                </BottomDrawer>
            </div>
        );
    }

    // Desktop layout
    return (
        <div className="flex flex-col h-full bg-mesh-indigo">
            {/* Two-panel content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left panel - Stats */}
                <div
                    ref={panelRef}
                    className="glass-panel flex flex-col relative z-10 overflow-hidden"
                    style={{ width: panelWidth }}
                >
                    {leftPanel}

                    {/* Resize handle */}
                    <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-300/50 active:bg-indigo-400/50 transition-colors group"
                        onMouseDown={handleMouseDown}
                        aria-label="Изменить ширину панели"
                        role="separator"
                        aria-orientation="vertical"
                    >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <GripVertical className="h-6 w-6 text-gray-400/50" aria-hidden="true" />
                        </div>
                    </div>
                </div>

                {/* Right panel - Feed */}
                <div className="flex-1 overflow-y-auto relative z-0 bg-indigo-50/30 p-4">
                    {rightPanel}
                </div>
            </div>
        </div>
    );
}


