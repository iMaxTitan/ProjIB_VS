import React from 'react';
import { cn } from '@/lib/utils';
import {
    Target, CheckCircle2, Wallet, Layers,
    FileText, Clock, Building2, Users,
    Settings2, Type, AlignLeft, Activity,
    SlidersHorizontal, Mail,
} from 'lucide-react';

export type ColorScheme = 'amber' | 'purple' | 'indigo' | 'blue' | 'emerald' | 'cyan';

/**
 * Centralised title → icon mapping.
 * DetailSection auto-resolves the icon by title;
 * pass `titleIcon` explicitly to override.
 */
const SECTION_ICONS: Record<string, React.ReactElement> = {
    'Цель': <Target />,
    'Ожидаемый результат': <CheckCircle2 />,
    'Бюджет': <Wallet />,
    'Квартальные планы': <Layers />,
    'Месячные планы': <Layers />,
    'Квартальный план': <Layers />,
    'Мероприятие': <FileText />,
    'Часы': <Clock />,
    'Предприятия': <Building2 />,
    'Исполнители': <Users />,
    'Процесс': <Settings2 />,
    'Название': <Type />,
    'Описание': <AlignLeft />,
    'Департаменты': <Building2 />,
    'Статус': <Activity />,
    'Параметры мероприятия': <SlidersHorizontal />,
    'Контактная информация': <Mail />,
    'Организация': <Building2 />,
};

interface DetailSectionProps {
    title: string;
    children: React.ReactNode;
    className?: string;
    rightElement?: React.ReactNode;
    colorScheme?: ColorScheme;
    /** Explicit icon override. When omitted, auto-resolved from SECTION_ICONS by title. */
    titleIcon?: React.ReactNode;
}

export function DetailSection({ title, children, className, rightElement, colorScheme = 'indigo', titleIcon }: DetailSectionProps) {
    const titleColors = {
        amber: 'text-amber-400',
        purple: 'text-purple-400',
        indigo: 'text-indigo-400',
        blue: 'text-blue-400',
        emerald: 'text-emerald-400',
        cyan: 'text-cyan-400',
    };

    const resolvedIcon = titleIcon ?? SECTION_ICONS[title] ?? null;

    return (
        <div className={cn("relative", className)}>
            <div className="flex justify-between items-center mb-1.5">
                <h3 className={cn("text-xs font-bold uppercase tracking-wider pl-1 flex items-center gap-1.5", titleColors[colorScheme])}>
                    {resolvedIcon ? React.cloneElement(resolvedIcon as React.ReactElement<{ className?: string }>, { className: "h-3.5 w-3.5" }) : null}
                    {title}
                </h3>
                {rightElement}
            </div>
            <div className="text-sm text-slate-700 leading-snug">
                {children}
            </div>
        </div>
    );
}

interface StatBoxProps {
    icon: React.ReactNode;
    value: string | number | React.ReactNode;
    label: string;
    colorScheme: ColorScheme;
}

export function StatBox({ icon, value, label, colorScheme }: StatBoxProps) {
    const bgMap = {
        amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
        purple: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
        indigo: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
        blue: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
        emerald: 'bg-emerald-500/10 text-green-600 border-emerald-500/20',
        cyan: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
    };

    return (
        <div className="flex items-center gap-3 p-3 glass-card rounded-2xl">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border shadow-sm", bgMap[colorScheme])}>
                {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "h-5 w-5" })}
            </div>
            <div>
                <div className="text-base font-bold text-slate-900 leading-none font-mono tracking-tighter">{value}</div>
                <p className="text-2xs font-bold text-slate-500 leading-tight mt-1 uppercase tracking-widest font-heading">{label}</p>
            </div>
        </div>
    );
}
