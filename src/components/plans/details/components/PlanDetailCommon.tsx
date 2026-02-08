import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Pencil, ChevronDown, Check, X, Target, Trash2, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getPlanStatusText, PlanStatus, PLAN_STATUSES, getPlanStatusColor, PlanStatusInfo } from '@/types/planning';

type ColorScheme = 'amber' | 'purple' | 'indigo' | 'blue' | 'emerald' | 'cyan';

interface PlanDetailHeaderProps {
    title: string;
    status: PlanStatus;
    dateRange?: string; // or year/quarter text
    colorScheme: ColorScheme;
    onClose: () => void;
    onEdit?: () => void;
    onStatusChange?: (status: PlanStatus) => void;
    canEdit: boolean;
    icon?: React.ReactNode;
    // Inline editing props
    isEditing?: boolean;
    onSave?: () => void;
    onCancel?: () => void;
    // Delete props
    onDelete?: () => void;
    canDelete?: boolean;
    deleteReason?: string;
    onCopy?: () => void;
    // Status filtering
    availableStatuses?: PlanStatusInfo[];
}

export function PlanDetailHeader({
    title,
    status,
    dateRange,
    colorScheme,
    onClose,
    onEdit,
    onStatusChange,
    canEdit,
    icon,
    isEditing,
    onSave,
    onCancel,
    onDelete,
    canDelete,
    deleteReason,
    onCopy,
    availableStatuses
}: PlanDetailHeaderProps) {
    // РСЃРїРѕР»СЊР·СѓРµРј РѕС‚С„РёР»СЊС‚СЂРѕРІР°РЅРЅС‹Рµ СЃС‚Р°С‚СѓСЃС‹ РµСЃР»Рё РїРµСЂРµРґР°РЅС‹, РёРЅР°С‡Рµ РїРѕРєР°Р·С‹РІР°РµРј РІСЃРµ (РґР»СЏ РѕР±СЂР°С‚РЅРѕР№ СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚Рё)
    const statusesToShow = availableStatuses || PLAN_STATUSES;
    const [isStatusOpen, setIsStatusOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsStatusOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const gradientMap = {
        amber: 'from-amber-400/80 to-orange-400/80',
        purple: 'from-purple-400/80 to-violet-400/80',
        indigo: 'from-indigo-400/80 to-blue-400/80',
        blue: 'from-blue-500/80 to-cyan-500/80',
        emerald: 'from-emerald-500/80 to-green-500/80',
        cyan: 'from-cyan-500/80 to-teal-500/80',
    };

    const getStatusTailwindColor = (status: PlanStatus) => {
        const color = getPlanStatusColor(status);
        switch (color) {
            case 'violet': return 'purple';
            case 'emerald': return 'emerald';
            case 'green': return 'green';
            case 'blue': return 'blue';
            case 'red': return 'red';
            case 'amber': return 'amber';
            default: return 'gray';
        }
    };

    const handleStatusSelect = (newStatus: PlanStatus) => {
        if (onStatusChange && newStatus !== status) {
            onStatusChange(newStatus);
        }
        setIsStatusOpen(false);
    };

    const canChangeStatus = canEdit && !!onStatusChange && !isEditing;

    return (
        <div className={cn("relative z-30 bg-gradient-to-r px-4 py-4 text-white backdrop-blur-md border-b border-white/10", gradientMap[colorScheme])}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div className="p-0.5">
                        {icon || <Target className="h-5 w-5" />}
                    </div>

                    {/* Status Badge */}
                    <div className="relative" ref={dropdownRef}>
                        <div
                            className={cn(
                                "flex items-center",
                                canChangeStatus ? "cursor-pointer group" : "opacity-90"
                            )}
                            onClick={() => canChangeStatus && setIsStatusOpen(!isStatusOpen)}
                        >
                            <Badge className={cn(
                                "bg-white text-slate-900 border-white font-semibold text-xs px-2.5 py-1 rounded-full shadow-md whitespace-nowrap transition-all flex items-center gap-1.5",
                                canChangeStatus && "group-hover:bg-slate-50 pr-2 translate-y-0 active:translate-y-0.5"
                            )}>
                                <div className={cn("w-1.5 h-1.5 rounded-full", `bg-${getStatusTailwindColor(status)}-500`)} />
                                {getPlanStatusText(status)}
                                {canChangeStatus && <ChevronDown className="ml-1 h-3 w-3 text-slate-500" />}
                            </Badge>
                        </div>

                        {isStatusOpen && (
                            <div className="absolute top-full left-0 mt-2 w-48 bg-white/95 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-slate-200 py-2 z-[100] animate-scale backdrop-blur-xl">
                                <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-2">Выберите статус</div>
                                {statusesToShow.map((s) => {
                                    const tailwindColor = getStatusTailwindColor(s.value);

                                    return (
                                        <button
                                            key={s.value}
                                            onClick={() => handleStatusSelect(s.value)}
                                            className={cn(
                                                "w-full text-left px-4 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors",
                                                status === s.value ? "text-indigo-600 bg-indigo-50/50 font-semibold" : "text-slate-600"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={cn("w-2.5 h-2.5 rounded-full shadow-sm", `bg-${tailwindColor}-500`)} />
                                                {s.label}
                                            </div>
                                            {status === s.value && <Check className="h-3 w-3 text-indigo-600" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Title */}
                    <div className="flex flex-col font-heading">
                        <span className="font-bold text-lg leading-tight tracking-tight drop-shadow-sm">{title}</span>
                        {dateRange && <span className="text-xs font-bold text-white uppercase tracking-widest mt-0.5 opacity-90">{dateRange}</span>}
                    </div>
                </div>

                {/* Actions Section */}
                <div className="flex items-center gap-2">
                    {/* Close button - only on desktop (mobile uses swipe) */}
                    <button
                        type="button"
                        onClick={isEditing ? onCancel : onClose}
                        className="hidden md:flex p-2 hover:bg-white/20 rounded-xl transition-all text-white/80 hover:text-white"
                        aria-label={isEditing ? "Отмена" : "Закрыть"}
                        title={isEditing ? "Отмена" : "Закрыть"}
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>

                    {canEdit && (
                        isEditing ? (
                            <>
                                <button
                                    onClick={onSave}
                                    className="p-1.5 hover:bg-emerald-500/20 rounded-xl transition-all text-white font-bold"
                                    title="Сохранить"
                                >
                                    <Check className="h-5 w-5" />
                                </button>
                            </>
                        ) : (
                            <>
                                {onEdit && (
                                    <button onClick={onEdit} className="p-2 hover:bg-white/20 rounded-xl transition-all shadow-inner-light" title="Редактировать">
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                )}
                                {onCopy && (
                                    <button
                                        type="button"
                                        onClick={onCopy}
                                        className="p-2 hover:bg-white/20 rounded-xl transition-all text-white/80 hover:text-white"
                                        title="Копировать план"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </button>
                                )}
                                {onDelete && (
                                    showDeleteConfirm ? (
                                        <div className="flex items-center gap-1 bg-red-500/30 rounded-xl px-2 py-1 animate-fade-in">
                                            <span className="text-2xs font-bold text-white mr-1">Удалить?</span>
                                            <button
                                                type="button"
                                                onClick={() => setShowDeleteConfirm(false)}
                                                className="p-1 hover:bg-white/20 rounded-lg transition-all"
                                                title="Отмена">
                                                <X className="h-4 w-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onDelete();
                                                    setShowDeleteConfirm(false);
                                                }}
                                                className="p-1 hover:bg-red-500/50 rounded-lg transition-all"
                                                title="Подтвердить удаление">
                                                <Check className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => canDelete ? setShowDeleteConfirm(true) : alert(deleteReason || 'Удаление невозможно')}
                                            className={cn(
                                                "p-2 rounded-xl transition-all",
                                                canDelete
                                                    ? "hover:bg-red-500/30 text-white/80 hover:text-white"
                                                    : "text-white/40 cursor-not-allowed"
                                            )}
                                            title={canDelete ? "Удалить план" : deleteReason || "Удаление невозможно"}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )
                                )}
                            </>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}

interface PlanSectionProps {
    title: string;
    children: React.ReactNode;
    className?: string;
    rightElement?: React.ReactNode;
    colorScheme?: ColorScheme;
    titleIcon?: React.ReactNode;
}

export function PlanSection({ title, children, className, rightElement, colorScheme = 'indigo', titleIcon }: PlanSectionProps) {
    const titleColors = {
        amber: 'text-amber-400',
        purple: 'text-purple-400',
        indigo: 'text-indigo-400',
        blue: 'text-blue-400',
        emerald: 'text-emerald-400',
        cyan: 'text-cyan-400',
    };

    return (
        <div className={cn("relative", className)}>
            <div className="flex justify-between items-center mb-1.5">
                <h3 className={cn("text-3xs font-bold uppercase tracking-wider pl-1 flex items-center gap-1.5", titleColors[colorScheme])}>
                    {titleIcon ? React.cloneElement(titleIcon as React.ReactElement, { className: "h-3 w-3" }) : null}
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

interface PlanStatBoxProps {
    icon: React.ReactNode;
    value: string | number | React.ReactNode;
    label: string;
    colorScheme: ColorScheme;
}

export function PlanStatBox({ icon, value, label, colorScheme }: PlanStatBoxProps) {
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
                {React.cloneElement(icon as React.ReactElement, { className: "h-5 w-5" })}
            </div>
            <div>
                <div className="text-base font-bold text-slate-900 leading-none font-mono tracking-tighter">{value}</div>
                <p className="text-2xs font-bold text-slate-500 leading-tight mt-1 uppercase tracking-widest font-heading">{label}</p>
            </div>
        </div>
    );
}

export function PlanDetailcard({ children, colorScheme }: { children: React.ReactNode, colorScheme: ColorScheme }) {
    return (
        <div className={cn(
            "rounded-3xl shadow-glass border border-white/30 overflow-hidden flex flex-col glass-card animate-scale"
        )}>
            {children}
        </div>
    );
}


