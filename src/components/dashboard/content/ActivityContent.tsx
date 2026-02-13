'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
    BarChart2,
    Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { ActivityFeed } from './ActivityFeed';
import DashboardTopTabs, { DashboardTopTabItem } from './shared/DashboardTopTabs';
import TwoPanelLayout from './shared/TwoPanelLayout';
import {
    getActivityFeed,
    getAIContext,
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
// 4) Максимум 12 записей — при добавлении новых удаляй старые с конца.
const MANUAL_BUILD_CHANGELOG_ITEMS: Array<{ date: string; type: ChangelogType; text: string }> = [
    { date: '12.02', type: 'Добавлено', text: 'посада співробітника (текстове поле) у довідник співробітників.' },
    { date: '12.02', type: 'Добавлено', text: 'поле «Послуга» у довідник заходів.' },
    { date: '12.02', type: 'Добавлено', text: 'групування місячних планів за процесами (згорнуті за замовчуванням).' },
    { date: '12.02', type: 'Добавлено', text: 'опис заходу (read-only) у деталях місячного плану.' },
    { date: '12.02', type: 'Добавлено', text: 'звіт по підприємствах: групування за заходами з AI-примітками замість плоского списку задач.' },
    { date: '12.02', type: 'Добавлено', text: 'PDF офіційного формату: шапка «Додаток до Акту», реквізити договору, автоматичний розрахунок сум (нормо-година × години).' },
    { date: '12.02', type: 'Добавлено', text: 'реквізити підприємств у PDF: номер договору, дата та ставка беруться з БД (снапшот за період).' },
    { date: '12.02', type: 'Обновлено', text: 'стандартизовано імена PDF файлів: українська мова, кирилиця, таймстамп.' },
    { date: '11.02', type: 'Исправлено', text: 'корректный подсчёт часов на плашках планов (ранее могли занижаться при большом количестве задач).' },
    { date: '11.02', type: 'Исправлено', text: 'улучшена диагностика входа: при ошибке авторизации теперь показывается точная причина (например, пользователь не найден в ReportIB).' },
    { date: '11.02', type: 'Добавлено', text: 'тип распределения часов по предприятиям: по серверам, по рабочим станциям или поровну.' },
    { date: '11.02', type: 'Обновлено', text: 'предприятия в месячном плане автоматически подбираются по инфраструктуре за период.' },
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
] as const;

type PeriodValue = typeof PERIODS[number]['value'];

const PERIOD_TAB_ITEMS: DashboardTopTabItem<string>[] = PERIODS.map(p => ({
    id: String(p.value),
    label: p.label,
    shortLabel: p.shortLabel,
    tone: 'indigo' as const,
}));

export default function ActivityContent({ user }: ActivityContentProps) {
    // AI Analysis
    const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [showAiPanel, setShowAiPanel] = useState(false);

    // Period and filters
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodValue>(7);

    // Mobile drawer (for TwoPanelLayout)
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const isMobile = useIsMobile();
    const isChief = user.role === 'chief';
    const isHead = user.role === 'head';
    const canSeeAI = isChief || isHead;

    // Activity feed data via TanStack Query (staleTime: 2 min)
    const { data: activityData, isLoading: loading } = useQuery({
        queryKey: ['activity-feed', user.user_id, user.role, user.department_id, selectedPeriod],
        queryFn: async () => {
            const eventsData = await getActivityFeed(user.user_id, user.role || 'employee', user.department_id || null, {
                daysBack: selectedPeriod,
                limit: 500
            });

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
            return { events: eventsData, totalUsers: count || 0 };
        },
        staleTime: 2 * 60 * 1000,
        refetchOnMount: true,
    });

    const events = useMemo(() => activityData?.events ?? [], [activityData?.events]);
    const totalUsers = activityData?.totalUsers ?? 0;

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

    const analyzeWithAI = async () => {
        setAiLoading(true);
        setAiAnalysis(null);
        try {
            const aiContext = await getAIContext(
                user.user_id, user.role || 'employee', user.department_id || null, selectedPeriod
            );

            const response = await fetch('/api/ai/activity-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
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
        if (period === selectedPeriod) return;
        setSelectedPeriod(period);
        setAiAnalysis(null);
    };

    const getPeriodLabel = (days: number) => {
        const period = PERIODS.find(p => p.value === days);
        return period?.label || `${days} дней`;
    };

    // Left panel - Stats & AI
    const leftPanel = (
        <div className="flex flex-col h-full">
            <DashboardTopTabs
                selected={String(selectedPeriod)}
                items={PERIOD_TAB_ITEMS}
                onSelect={(id) => handlePeriodChange(Number(id) as PeriodValue)}
                ariaLabel="Выбор периода"
            />

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
                            {loading ? (
                                <div className="h-7 w-12 rounded bg-slate-200 animate-pulse mt-0.5" />
                            ) : (
                                <div className="text-2xl font-bold text-slate-800 leading-none">{stats.totalHours}</div>
                            )}
                            {loading ? (
                                <div className="h-3 w-16 rounded bg-slate-100 animate-pulse mt-1.5" />
                            ) : (
                                <div className="text-2xs font-medium text-emerald-600 mt-1">+{stats.todayHours} сегодня</div>
                            )}
                        </div>

                        <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                            <div className="flex items-center gap-1.5 mb-1">
                                <div className="w-5 h-5 rounded-md bg-emerald-100 flex items-center justify-center">
                                    <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" aria-hidden="true" />
                                </div>
                                <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">Задач</span>
                            </div>
                            {loading ? (
                                <div className="h-7 w-10 rounded bg-slate-200 animate-pulse mt-0.5" />
                            ) : (
                                <div className="text-2xl font-bold text-slate-800 leading-none">{stats.totalTasks}</div>
                            )}
                            {loading ? (
                                <div className="h-3 w-16 rounded bg-slate-100 animate-pulse mt-1.5" />
                            ) : (
                                <div className="text-2xs font-medium text-emerald-600 mt-1">+{stats.todayTasks} сегодня</div>
                            )}
                        </div>

                        <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                            <div className="flex items-center gap-1.5 mb-1">
                                <div className="w-5 h-5 rounded-md bg-purple-100 flex items-center justify-center">
                                    <Users className="h-2.5 w-2.5 text-purple-600" aria-hidden="true" />
                                </div>
                                <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">Активных</span>
                            </div>
                            {loading ? (
                                <div className="h-7 w-8 rounded bg-slate-200 animate-pulse mt-0.5" />
                            ) : (
                                <div className="text-2xl font-bold text-slate-800 leading-none">{stats.activeUsers}</div>
                            )}
                            {loading ? (
                                <div className="h-3 w-10 rounded bg-slate-100 animate-pulse mt-1.5" />
                            ) : (
                                <div className="text-2xs text-slate-500 mt-1">
                                    из <span className="font-bold text-slate-700">{stats.totalUsers}</span>
                                </div>
                            )}
                        </div>

                        <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                            <div className="flex items-center gap-1.5 mb-1">
                                <div className="w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center">
                                    <TrendingUp className="h-2.5 w-2.5 text-amber-600" aria-hidden="true" />
                                </div>
                                <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">Среднее</span>
                            </div>
                            {loading ? (
                                <div className="h-7 w-10 rounded bg-slate-200 animate-pulse mt-0.5" />
                            ) : (
                                <div className="text-2xl font-bold text-slate-800 leading-none">
                                    {stats.activeUsers > 0 ? (stats.totalHours / stats.activeUsers).toFixed(1) : '0'}
                                </div>
                            )}
                            {loading ? (
                                <div className="h-3 w-12 rounded bg-slate-100 animate-pulse mt-1.5" />
                            ) : (
                                <div className="text-2xs text-slate-500 mt-1">час/чел</div>
                            )}
                        </div>
                    </div>
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
                                            "px-2.5 py-1 text-xs font-bold rounded-lg transition-[background-color,box-shadow]",
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
            </div>
        </div>
    );

    // Right panel - Activity Feed
    const rightPanel = (
        <div className="h-full overflow-hidden">
            <ActivityFeed events={events} loading={loading} />
        </div>
    );

    return (
        <>
            <TwoPanelLayout
                leftPanel={leftPanel}
                rightPanel={rightPanel}
                isDrawerOpen={isDrawerOpen}
                onDrawerClose={() => setIsDrawerOpen(false)}
                initialWidth={480}
                rightPanelClassName="bg-indigo-50/30 p-4"
            />

            {/* FAB — открыть ленту на мобильном */}
            {isMobile && (
                <button
                    type="button"
                    onClick={() => setIsDrawerOpen(true)}
                    aria-label="Открыть ленту событий"
                    className="fixed bottom-6 right-6 z-50 p-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full shadow-lg shadow-indigo-500/30 transition-transform active:scale-95"
                >
                    <Activity className="h-6 w-6" aria-hidden="true" />
                </button>
            )}
        </>
    );
}
