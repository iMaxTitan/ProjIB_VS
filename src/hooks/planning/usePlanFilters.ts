import { useState, useMemo } from 'react';
import { AnnualPlan, QuarterlyPlan, PlanStatus } from '@/types/planning';
import { UserInfo } from '@/types/azure';

export function usePlanFilters(
    annualPlans: AnnualPlan[],
    quarterlyPlans: QuarterlyPlan[],
    selectedYear: number | null,
    selectedQuarter: number | null,
    user?: UserInfo | null
) {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<PlanStatus | null>(null);

    // Head видит только планы своего отдела для квартальных
    const isHead = user?.role === 'head';
    const userDepartmentId = user?.department_id;

    // Мемоизируем ID годовых планов выбранного года
    const annualPlanIdsForYear = useMemo(() => {
        return new Set(
            annualPlans
                .filter(p => p.year === selectedYear)
                .map(p => p.annual_id)
        );
    }, [annualPlans, selectedYear]);

    // Фильтрация годовых планов - видят все (мемоизирована)
    const filteredAnnualPlans = useMemo(() => {
        const searchLower = searchQuery.toLowerCase();
        return annualPlans.filter(plan => {
            const matchesYear = !selectedYear || plan.year === selectedYear;
            const matchesSearch = !searchQuery ||
                plan.goal.toLowerCase().includes(searchLower) ||
                plan.year.toString().includes(searchQuery);
            const matchesStatus = !statusFilter || plan.status === statusFilter;
            return matchesYear && matchesSearch && matchesStatus;
        });
    }, [annualPlans, selectedYear, searchQuery, statusFilter]);

    // Фильтрация квартальных планов (мемоизирована)
    // Head видит только квартальные планы своего отдела
    const filteredQuarterlyPlans = useMemo(() => {
        const searchLower = searchQuery.toLowerCase();
        return quarterlyPlans.filter(plan => {
            const matchesDepartment = !isHead || !userDepartmentId || plan.department_id === userDepartmentId;
            const matchesYear = !selectedYear || (plan.annual_plan_id && annualPlanIdsForYear.has(plan.annual_plan_id));
            const matchesQuarter = !selectedQuarter || plan.quarter === selectedQuarter;
            const matchesSearch = !searchQuery ||
                plan.goal.toLowerCase().includes(searchLower) ||
                `Q${plan.quarter}`.toLowerCase().includes(searchLower);
            const matchesStatus = !statusFilter || plan.status === statusFilter;
            return matchesDepartment && matchesYear && matchesQuarter && matchesSearch && matchesStatus;
        });
    }, [quarterlyPlans, isHead, userDepartmentId, selectedYear, selectedQuarter, searchQuery, statusFilter, annualPlanIdsForYear]);

    return {
        searchQuery,
        setSearchQuery,
        statusFilter,
        setStatusFilter,
        filteredAnnualPlans,
        filteredQuarterlyPlans
    };
}
