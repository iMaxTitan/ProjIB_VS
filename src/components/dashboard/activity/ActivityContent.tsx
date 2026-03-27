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
    ChevronLeft,
    ChevronRight,
    AlertTriangle,
    ThumbsUp,
    Loader2,
    Brain,
    BarChart2,
    Activity,
    Send,
    Check,
} from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { ActivityFeed } from './ActivityFeed';
import TwoPanelLayout from '../shared/TwoPanelLayout';
import {
    getActivityFeed,
    getAIContext,
} from '@/lib/ops';
import { supabase } from '@/lib/shared/supabase';
import logger from '@/lib/shared/logger';
import Skeleton from '@/components/ui/Skeleton';

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
    { date: '25.03', type: 'Добавлено', text: 'База знань → Законодавство: імпорт законів України з zakon.rada.gov.ua за номером або URL. Автоматичний пошук пов\'язаних актів (постанови, накази, зміни) з групуванням. Таблиця-бібліотека з перевіркою оновлень.' },
    { date: '20.03', type: 'Добавлено', text: 'Планувальник: зовнішні події (наради) → задачі. Прив\'язка процедури до наради, збір з AI-саммарі в описі задачі, значок шаблону на всіх плитках.' },
    { date: '20.03', type: 'Исправлено', text: 'Планувальник: Push оновлює існуючі події (PATCH), Pull коректно показує зміни з Outlook, каскад блоків, копіювання тижня, обід.' },
    { date: '20.03', type: 'Обновлено', text: 'Планувальник v3: 7 кольорових статусів плиток, шаблони задач на плитках (amber), збір без модалки (групування по шаблону), ресайз без скидання Outlook sync, Pull виявляє видалені в Outlook події.' },
    { date: '19.03', type: 'Добавлено', text: 'Планувальник — задачі v2: модалка створення/редагування (шаблони, компанії, проекти, документи ІБ), підтвердження видалення, кнопка редагування, іконка збору задач на плитці плану.' },
    { date: '19.03', type: 'Исправлено', text: 'Планувальник: календар не впливає на статус задач, виправлено порожній календар на мобільних, drag & drop позиціонування.' },
    { date: '18.03', type: 'Добавлено', text: 'Планувальник — окрема вкладка: тижневий календар, задачі, чернетки, шаблони, Outlook sync, AI suggest. Все що було в Кабінеті → тепер окремий модуль.' },
    { date: '16.03', type: 'Добавлено', text: 'Плани → задачі: назва (title), статуси «чернетка»/«в роботі», бейджі CHIEF/HEAD для задач від керівництва. Кнопка «+» на картці співробітника. Шаблони завдань у довіднику процедур.' },
    { date: '09.03', type: 'Добавлено', text: 'Тижневий план: автозаповнення — кнопка «Запропонувати» розставляє процедури на тиждень (з минулого тижня або пропорційно до плану). Ghost-блоки з ✓/✗, «Прийняти всі» одним кліком.' },
    { date: '09.03', type: 'Исправлено', text: 'Тижневий план: виправлено drag overlay (відповідає вигляду плитки), пакетне створення слотів (без помилки Too Many Requests), покращений алгоритм suggest (заповнює більше слотів).' },
    { date: '09.03', type: 'Обновлено', text: 'Тижневий план: кольорові статуси блоків — rose (не в Outlook), sky (синхронізовано), amber (є чернетка), emerald (призначено). Іконка транскрипту на нарадах. Дедуплікація чернеток.' },
    { date: '09.03', type: 'Добавлено', text: 'Кабінет → Тижневий план: розподіл процедур з місячного плану по днях тижня drag-and-drop. Сітка пн-пт × 9:00-18:00, наради з Outlook, одностороння синхронізація в Outlook, копіювання з минулого тижня.' },
    { date: '04.03', type: 'Добавлено', text: 'Кабінет → Відпустка: планування відпустки через self-service. Обрати місяць і дні → надіслати заявку → head/chief затверджує → дні автоматично вписуються в табель кодом «О».' },
    { date: '04.03', type: 'Добавлено', text: 'Кабінет співробітника — нова секція з персональним дашбордом: картки метрик (години, задачі, KPI з трендом), найближчі дедлайни, профіль, налаштування бота. Доступно всім ролям.' },
];

const CHANGELOG_TYPE_STYLES: Record<ChangelogType, string> = {
    Добавлено: 'bg-emerald-100 text-emerald-700',
    Обновлено: 'bg-blue-100 text-blue-700',
    Исправлено: 'bg-amber-100 text-amber-700'
};

const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export default function ActivityContent({ user }: ActivityContentProps) {
    // AI Analysis
    const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [showAiPanel, setShowAiPanel] = useState(false);

    // Month selection
    const today = new Date();
    const [selectedYear, setSelectedYear] = useState(today.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
    const isCurrentMonth = selectedYear === today.getFullYear() && selectedMonth === today.getMonth() + 1;

    const prevMonth = () => {
        if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
        else setSelectedMonth(m => m - 1);
        setAiAnalysis(null);
    };
    const nextMonth = () => {
        if (isCurrentMonth) return;
        if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
        else setSelectedMonth(m => m + 1);
        setAiAnalysis(null);
    };

    // Mobile drawer (for TwoPanelLayout)
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const isMobile = useIsMobile();
    const isChief = user.role === 'chief';
    const isHead = user.role === 'head';
    const canSeeAI = isChief || isHead || user.role === 'analyst';

    // Changelog broadcast state (index → idle | sending | sent)
    const [broadcastState, setBroadcastState] = useState<Record<number, 'idle' | 'sending' | 'sent'>>({});

    const handleBroadcast = async (item: typeof MANUAL_BUILD_CHANGELOG_ITEMS[0], idx: number) => {
        setBroadcastState(prev => ({ ...prev, [idx]: 'sending' }));
        try {
            const res = await fetch('/api/telegram/notify/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: item.date, type: item.type, text: item.text }),
            });
            setBroadcastState(prev => ({ ...prev, [idx]: res.ok ? 'sent' : 'idle' }));
        } catch {
            setBroadcastState(prev => ({ ...prev, [idx]: 'idle' }));
        }
    };

    // Date range for selected month
    const dateFrom = new Date(selectedYear, selectedMonth - 1, 1, 0, 0, 0, 0);
    const dateTo = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999);

    // Activity feed data via TanStack Query (staleTime: 2 min)
    const { data: activityData, isLoading: loading } = useQuery({
        queryKey: ['activity-feed', user.user_id, user.role, user.department_id, selectedYear, selectedMonth],
        queryFn: async () => {
            const eventsData = await getActivityFeed(user.user_id, user.role || 'employee', user.department_id || null, {
                dateFrom,
                dateTo,
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
            // Compute daysBack as days from start of selected month to today (for AI context)
            const daysBack = Math.max(1, Math.ceil((Date.now() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1);
            const aiContext = await getAIContext(
                user.user_id, user.role || 'employee', user.department_id || null, daysBack
            );

            const response = await fetch('/api/ai/activity-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stats,
                    context: aiContext,
                    userRole: user.role,
                    daysBack
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

    const monthLabel = `${MONTHS_RU[selectedMonth - 1]} ${selectedYear}`;

    // Left panel - Stats & AI
    const leftPanel = (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-white/40 flex-shrink-0">
                <button
                    onClick={prevMonth}
                    aria-label="Предыдущий месяц"
                    className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="text-sm font-semibold text-slate-700 select-none">{monthLabel}</span>
                <button
                    onClick={nextMonth}
                    disabled={isCurrentMonth}
                    aria-label="Следующий месяц"
                    className={cn(
                        'p-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500',
                        isCurrentMonth ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-slate-800 hover:bg-white/60',
                    )}
                >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>

            {/* Header */}
            <div className="flex-shrink-0 p-3 sm:p-4 border-b border-slate-100 bg-white/50">
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
                                <Skeleton className="h-7 w-12 mt-0.5" />
                            ) : (
                                <div className="text-2xl font-bold text-slate-800 leading-none">{stats.totalHours}</div>
                            )}
                            {loading ? (
                                <Skeleton className="h-3 w-16 bg-slate-100 mt-1.5" />
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
                                <Skeleton className="h-7 w-10 mt-0.5" />
                            ) : (
                                <div className="text-2xl font-bold text-slate-800 leading-none">{stats.totalTasks}</div>
                            )}
                            {loading ? (
                                <Skeleton className="h-3 w-16 bg-slate-100 mt-1.5" />
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
                                <Skeleton className="h-7 w-8 mt-0.5" />
                            ) : (
                                <div className="text-2xl font-bold text-slate-800 leading-none">{stats.activeUsers}</div>
                            )}
                            {loading ? (
                                <Skeleton className="h-3 w-10 bg-slate-100 mt-1.5" />
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
                                <Skeleton className="h-7 w-10 mt-0.5" />
                            ) : (
                                <div className="text-2xl font-bold text-slate-800 leading-none">
                                    {stats.activeUsers > 0 ? (stats.totalHours / stats.activeUsers).toFixed(1) : '0'}
                                </div>
                            )}
                            {loading ? (
                                <Skeleton className="h-3 w-12 bg-slate-100 mt-1.5" />
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
                                        {monthLabel}
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
                        {MANUAL_BUILD_CHANGELOG_ITEMS.map((item, idx) => {
                            const state = broadcastState[idx] ?? 'idle';
                            return (
                                <li key={`${item.date}-${idx}`} className="flex items-start gap-1.5 text-xs text-slate-700 leading-relaxed">
                                    <div className="flex-1">
                                        <span className="font-semibold">{item.date}</span>
                                        <span className={`ml-2 inline-flex rounded px-1.5 py-0.5 text-2xs font-semibold ${CHANGELOG_TYPE_STYLES[item.type]}`}>
                                            {item.type}
                                        </span>
                                        <span className="ml-2">{item.text}</span>
                                    </div>
                                    {isChief && (
                                        <button
                                            type="button"
                                            onClick={() => handleBroadcast(item, idx)}
                                            disabled={state !== 'idle'}
                                            aria-label="Отправить в Telegram"
                                            title="Отправить в Telegram"
                                            className={cn(
                                                'flex-shrink-0 mt-0.5 p-1 rounded transition-colors',
                                                state === 'sent'
                                                    ? 'text-emerald-500 cursor-default'
                                                    : state === 'sending'
                                                        ? 'text-indigo-400 cursor-wait'
                                                        : 'text-slate-300 hover:text-indigo-500 hover:bg-indigo-50'
                                            )}
                                        >
                                            {state === 'sending' ? (
                                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                            ) : state === 'sent' ? (
                                                <Check className="h-3 w-3" aria-hidden="true" />
                                            ) : (
                                                <Send className="h-3 w-3" aria-hidden="true" />
                                            )}
                                        </button>
                                    )}
                                </li>
                            );
                        })}
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
