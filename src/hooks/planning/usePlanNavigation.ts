import { useState, useEffect, useRef } from 'react';
import { AnnualPlan, QuarterlyPlan } from '@/types/planning';

export function usePlanNavigation(
    annualPlans: AnnualPlan[],
    quarterlyPlans: QuarterlyPlan[]
) {
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<number | null>(null); // 0-11
    const hasInitialized = useRef(false);

    // Получить уникальные годы (сортировка по убыванию)
    const availableYears = Array.from(new Set(annualPlans.map(p => p.year))).sort((a, b) => b - a);

    // Автовыбор текущего года, квартала и месяца при первой загрузке
    useEffect(() => {
        // Ждём, пока данные загрузятся
        if (annualPlans.length === 0 || hasInitialized.current) return;

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
        const currentMonth = now.getMonth(); // 0-indexed

        // 1. Выбрать год (текущий или последний доступный)
        const yearToSelect = availableYears.includes(currentYear) ? currentYear : availableYears[0];
        setSelectedYear(yearToSelect);

        // 2. Всегда устанавливаем квартал и месяц для текущего года
        if (yearToSelect === currentYear) {
            setSelectedQuarter(currentQuarter);
            setSelectedMonth(currentMonth);
        } else if (availableYears.length > 0) {
            // Для другого года - показываем последний квартал
            setSelectedQuarter(4);
            setSelectedMonth(11); // Декабрь
        }

        hasInitialized.current = true;
    }, [annualPlans, availableYears]);

    // Сброс квартала при смене года (только после инициализации)
    const prevYearRef = useRef<number | null>(null);
    useEffect(() => {
        if (hasInitialized.current && prevYearRef.current !== null && prevYearRef.current !== selectedYear) {
            setSelectedQuarter(null);
            setSelectedMonth(null);
        }
        prevYearRef.current = selectedYear;
    }, [selectedYear]);

    // Сброс месяца при смене квартала (только после инициализации)
    const prevQuarterRef = useRef<number | null>(null);
    useEffect(() => {
        if (hasInitialized.current && prevQuarterRef.current !== null && prevQuarterRef.current !== selectedQuarter) {
            setSelectedMonth(null);
        }
        prevQuarterRef.current = selectedQuarter;
    }, [selectedQuarter]);

    return {
        selectedYear,
        setSelectedYear,
        selectedQuarter,
        setSelectedQuarter,
        selectedMonth,
        setSelectedMonth,
        availableYears
    };
}
