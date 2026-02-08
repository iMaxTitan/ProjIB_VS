import React from 'react';
import { Clock, CheckCircle2, Users, TrendingUp, Brain, Loader2, ThumbsUp, AlertTriangle, RefreshCw, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AIAnalysis {
    summary: string;
    insights: { type: 'positive' | 'warning' | 'neutral'; text: string }[];
    topPerformers: string[];
    concerns: string[];
}

interface ActivityStats {
    totalHours: number;
    totalTasks: number;
    activeUsers: number;
    totalUsers: number;
    todayHours: number;
    todayTasks: number;
}

interface ActivityStatsSidebarProps {
    stats: ActivityStats | null;
    aiAnalysis: AIAnalysis | null;
    aiLoading: boolean;
    showAiPanel: boolean;
    setShowAiPanel: (show: boolean) => void;
    analyzeWithAI: () => void;
    canSeeAI: boolean;
    hasEvents: boolean;
    selectedPeriodLabel: string;
}

export function ActivityStatsSidebar({
    stats,
    aiAnalysis,
    aiLoading,
    showAiPanel,
    setShowAiPanel,
    analyzeWithAI,
    canSeeAI,
    hasEvents,
    selectedPeriodLabel
}: ActivityStatsSidebarProps) {

    return (
        <div className="space-y-6">
            {/* Stats Grid - Vertical Layout for Sidebar */}
            {stats && (
                <div className="grid grid-cols-2 gap-4">
                    {/* Hours */}
                    <div className="glass-card p-4 rounded-3xl border border-white/40 bg-white/60 backdrop-blur-xl shadow-sm hover:shadow-md transition-all duration-300 group">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform duration-300">
                                <Clock className="h-4 w-4" />
                            </div>
                            <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">Часов</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-bold text-slate-800 tracking-tight">{stats.totalHours}</span>
                            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md w-fit mt-1">
                                +{stats.todayHours} сегодня
                            </span>
                        </div>
                    </div>

                    {/* Tasks */}
                    <div className="glass-card p-4 rounded-3xl border border-white/40 bg-white/60 backdrop-blur-xl shadow-sm hover:shadow-md transition-all duration-300 group">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform duration-300">
                                <CheckCircle2 className="h-4 w-4" />
                            </div>
                            <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">Задач</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-bold text-slate-800 tracking-tight">{stats.totalTasks}</span>
                            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md w-fit mt-1">
                                +{stats.todayTasks} сегодня
                            </span>
                        </div>
                    </div>

                    {/* Active */}
                    <div className="glass-card p-4 rounded-3xl border border-white/40 bg-white/60 backdrop-blur-xl shadow-sm hover:shadow-md transition-all duration-300 group">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform duration-300">
                                <Users className="h-4 w-4" />
                            </div>
                            <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">Активных</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-bold text-slate-800 tracking-tight">{stats.activeUsers}</span>
                            <span className="text-xs font-medium text-slate-400 mt-1">
                                из <span className="text-slate-600 font-bold">{stats.totalUsers}</span>
                            </span>
                        </div>
                    </div>

                    {/* Average */}
                    <div className="glass-card p-4 rounded-3xl border border-white/40 bg-white/60 backdrop-blur-xl shadow-sm hover:shadow-md transition-all duration-300 group">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform duration-300">
                                <TrendingUp className="h-4 w-4" />
                            </div>
                            <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">Среднее</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-bold text-slate-800 tracking-tight">
                                {stats.activeUsers > 0 ? (stats.totalHours / stats.activeUsers).toFixed(1) : '0'}
                            </span>
                            <span className="text-xs font-medium text-slate-400 mt-1">часов/чел</span>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Analysis Panel */}
            {canSeeAI && (
                <div className="glass-card rounded-3xl border border-amber-200/50 bg-amber-50/40 backdrop-blur-md overflow-hidden shadow-sm">
                    <div className="px-6 py-4 flex items-center justify-between gap-4 border-b border-amber-100/50">
                        <div className="flex items-center gap-3">
                            <div className="bg-amber-100 p-2 rounded-xl text-amber-600">
                                <Brain className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-800">AI Анализ</span>
                                </div>
                                <span className="text-xs text-amber-700/70 font-medium">
                                    {selectedPeriodLabel}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {!aiAnalysis && !aiLoading && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAiPanel(true);
                                        analyzeWithAI();
                                    }}
                                    disabled={!hasEvents}
                                    className={cn(
                                        "px-3 py-1.5 text-xs font-bold rounded-xl transition-all shadow-sm",
                                        "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-amber-500/25 hover:scale-[1.02]",
                                        !hasEvents && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    Анализ
                                </button>
                            )}
                            {aiAnalysis && !aiLoading && (
                                <button
                                    type="button"
                                    onClick={() => analyzeWithAI()}
                                    className="p-2 text-amber-600 hover:bg-amber-100/50 rounded-xl transition-colors"
                                    title="Обновить"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </button>
                            )}
                            {(showAiPanel || aiAnalysis) && (
                                <button
                                    type="button"
                                    onClick={() => setShowAiPanel(!showAiPanel)}
                                    className="p-2 text-amber-600 hover:bg-amber-100/50 rounded-xl transition-colors"
                                >
                                    <ChevronDown className={cn("h-4 w-4 transition-transform", showAiPanel && "rotate-180")} />
                                </button>
                            )}
                        </div>
                    </div>

                    {showAiPanel && (
                        <div className="p-4 space-y-4 animate-in slide-in-from-top-2 duration-300">
                            {aiLoading ? (
                                <div className="flex flex-col items-center justify-center py-8 text-amber-700 space-y-3">
                                    <Loader2 className="h-8 w-8 animate-spin opacity-50" />
                                    <span className="text-sm font-medium">Анализирую данные...</span>
                                </div>
                            ) : aiAnalysis ? (
                                <>
                                    <div className="bg-white/60 p-4 rounded-2xl border border-amber-100 text-sm text-slate-700 leading-relaxed font-medium shadow-sm">
                                        {aiAnalysis.summary}
                                    </div>

                                    {aiAnalysis.insights.length > 0 && (
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1">Инсайты</h4>
                                            <div className="grid grid-cols-1 gap-2">
                                                {aiAnalysis.insights.map((insight, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={cn(
                                                            "flex items-start gap-3 p-3 rounded-2xl border transition-all",
                                                            insight.type === 'positive' && "bg-green-50/50 border-green-100 text-green-800",
                                                            insight.type === 'warning' && "bg-amber-50/50 border-amber-100 text-amber-800",
                                                            insight.type === 'neutral' && "bg-slate-50/50 border-slate-100 text-slate-700"
                                                        )}
                                                    >
                                                        {insight.type === 'positive' && <ThumbsUp className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                                                        {insight.type === 'warning' && <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                                                        <span className="text-xs font-medium leading-relaxed">{insight.text}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {(aiAnalysis.topPerformers.length > 0 || aiAnalysis.concerns.length > 0) && (
                                        <div className="space-y-4">
                                            {aiAnalysis.topPerformers.length > 0 && (
                                                <div className="bg-gradient-to-br from-green-50/50 to-emerald-50/50 rounded-2xl p-4 border border-green-100/50">
                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-green-700 mb-3 flex items-center gap-2">
                                                        <TrendingUp className="h-3 w-3" />
                                                        Лидеры
                                                    </h4>
                                                    <ul className="space-y-2">
                                                        {aiAnalysis.topPerformers.map((name, idx) => (
                                                            <li key={idx} className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                                                                {name}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {aiAnalysis.concerns.length > 0 && (
                                                <div className="bg-gradient-to-br from-amber-50/50 to-orange-50/50 rounded-2xl p-4 border border-amber-100/50">
                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-3 flex items-center gap-2">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        Внимание
                                                    </h4>
                                                    <ul className="space-y-2">
                                                        {aiAnalysis.concerns.map((c, idx) => (
                                                            <li key={idx} className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
                                                                {c}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-6">
                                    <p className="text-sm font-medium text-amber-700">
                                        Нет данных.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
