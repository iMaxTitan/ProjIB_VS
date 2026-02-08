import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnnualPlan, QuarterlyPlan, PlanType } from '@/types/planning';
import { UserInfo } from '@/types/azure';

interface PlanTreeHeaderProps {
    availableYears: number[];
    selectedYear: number | null;
    selectedQuarter: number | null;
    selectedMonth: number | null;
    annualPlans: AnnualPlan[];
    quarterlyPlans: QuarterlyPlan[];
    onSelectYear: (year: number) => void;
    onSelectQuarter: (quarter: number | null) => void;
    onSelectMonth: (month: number | null) => void;
    onCreatePlan: (type: PlanType, parentId?: string) => void;
    canCreate: boolean;
    onDoubleClickYear?: (plan: AnnualPlan) => void;
    user?: UserInfo | null;
}

export default function PlanTreeHeader({
    availableYears,
    selectedYear,
    selectedQuarter,
    selectedMonth,
    annualPlans,
    quarterlyPlans,
    onSelectYear,
    onSelectQuarter,
    onSelectMonth,
    onCreatePlan,
    canCreate,
    onDoubleClickYear,
    user
}: PlanTreeHeaderProps) {
    // Фильтрация по отделу для head
    const isHead = user?.role === 'head';
    const userDepartmentId = user?.department_id;

    // Фильтруем квартальные планы для head
    const filteredQuarterlyPlans = isHead && userDepartmentId
        ? quarterlyPlans.filter(q => q.department_id === userDepartmentId)
        : quarterlyPlans;

    // ID годовых планов для года (все annual_id для выбранного года)
    const annualPlanIdsForYear = annualPlans
        .filter(p => p.year === selectedYear)
        .map(p => p.annual_id);

    // Получить кварталы для выбранного года
    const quartersForYear = filteredQuarterlyPlans
        .filter(q => q.annual_plan_id && annualPlanIdsForYear.includes(q.annual_plan_id))
        .map(q => q.quarter)
        .sort((a, b) => a - b);
    const uniqueQuarters = Array.from(new Set(quartersForYear));

    // Месяцы для выбранного квартала (статически 3 месяца)
    const monthsForQuarter = selectedQuarter
        ? Array.from({ length: 3 }, (_, i) => (selectedQuarter - 1) * 3 + i)
        : [];

    const getMonthName = (monthIndex: number) => {
        const date = new Date(2024, monthIndex, 1);
        return date.toLocaleString('ru-RU', { month: 'short' }); // янв, фев...
    };

    return (
        <div className="px-2 sm:px-4 pt-2">
            <div className="flex gap-0.5 items-end overflow-x-auto overflow-y-hidden scrollbar-hide">
                {/* Годы */}
                {availableYears.map(year => {
                    const yearPlan = annualPlans.find(p => p.year === year);
                    const isSelected = selectedYear === year;

                    return (
                        <button
                            type="button"
                            key={`y-${year}`}
                            onClick={() => {
                                if (isSelected && selectedQuarter) {
                                    onSelectQuarter(null);
                                } else {
                                    onSelectYear(year);
                                }
                            }}
                            onDoubleClick={() => yearPlan && onDoubleClickYear?.(yearPlan)}
                            aria-label={`Год ${year}`}
                            aria-current={isSelected && !selectedQuarter ? 'page' : undefined}
                            className={cn(
                                "flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors duration-base border-t border-l border-r whitespace-nowrap",
                                "focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:z-20",
                                isSelected
                                    ? "bg-amber-500 border-amber-500 text-white shadow-sm z-10 -mb-px"
                                    : "bg-amber-50/70 border-amber-200/50 text-amber-600 hover:bg-amber-100/70 hover:text-amber-700"
                            )}
                        >
                            {year}
                        </button>
                    );
                })}
                {canCreate && !selectedQuarter && (
                    <button
                        type="button"
                        onClick={() => onCreatePlan('annual')}
                        aria-label="Создать годовой план"
                        className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-100/50 rounded-t-lg transition-all active:scale-95"
                    >
                        <Plus className="h-3.5 w-3.5" />
                    </button>
                )}

                {/* Кварталы */}
                {selectedYear && uniqueQuarters.length > 0 && (
                    <>
                        {uniqueQuarters.map(quarter => {
                            const isSelected = selectedQuarter === quarter;

                            return (
                                <button
                                    type="button"
                                    key={`q-${quarter}`}
                                    onClick={() => {
                                        if (isSelected && selectedMonth !== null) {
                                            onSelectMonth(null);
                                        } else {
                                            onSelectQuarter(quarter);
                                        }
                                    }}
                                    aria-label={`Квартал ${quarter}`}
                                    aria-current={isSelected && selectedMonth === null ? 'page' : undefined}
                                    className={cn(
                                        "flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors duration-base border-t border-l border-r whitespace-nowrap",
                                        "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:z-20",
                                        isSelected
                                            ? "bg-purple-500 border-purple-500 text-white shadow-sm z-10 -mb-px"
                                            : "bg-purple-50/70 border-purple-200/50 text-purple-600 hover:bg-purple-100/70 hover:text-purple-700"
                                    )}
                                >
                                    Q{quarter}
                                </button>
                            );
                        })}
                    </>
                )}

                {/* Месяцы */}
                {selectedQuarter && monthsForQuarter.length > 0 && (
                    <>
                        {monthsForQuarter.map(month => {
                            const isSelected = selectedMonth === month;

                            return (
                                <button
                                    type="button"
                                    key={`m-${month}`}
                                    onClick={() => onSelectMonth(month)}
                                    aria-label={`Месяц ${getMonthName(month)}`}
                                    aria-current={isSelected ? 'page' : undefined}
                                    className={cn(
                                        "flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors duration-base border-t border-l border-r whitespace-nowrap",
                                        "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:z-20",
                                        isSelected
                                            ? "bg-indigo-500 border-indigo-500 text-white shadow-sm z-10 -mb-px"
                                            : "bg-indigo-50/70 border-indigo-200/50 text-indigo-600 hover:bg-indigo-100/70 hover:text-indigo-700"
                                    )}
                                >
                                    {getMonthName(month)}
                                </button>
                            );
                        })}
                    </>
                )}
            </div>

            <div className={cn(
                "border-b transition-colors duration-slow",
                selectedMonth !== null ? "border-indigo-300" :
                    selectedQuarter ? "border-purple-300" :
                        selectedYear ? "border-amber-300" : "border-slate-200"
            )} />
        </div>
    );
}
