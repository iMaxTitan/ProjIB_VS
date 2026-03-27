import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/shared/supabase';
import { AnnualPlan, QuarterlyPlan, MonthlyPlan, PlanStatus } from '@/types/planning';
import { getErrorMessage } from '@/lib/shared/utils/error-message';
import logger from '@/lib/shared/logger';
import {
  buildHoursMapFromView,
  buildProceduresMap,
  mapMonthlyPlansWithHierarchy,
} from '@/lib/ops/plans/monthly-mappers';
import { proceduresQueryOptions, annualPlansQueryOptions } from '@/lib/ops/reference-queries';
import {
  fetchQuarterlyPlansByAnnualIds,
  fetchAllQuarterlyPlansFromBase,
} from '@/lib/ops/plans/quarterly-fetcher';

export const usePlans = () => {
  const queryClient = useQueryClient();

  const [annualPlans, setAnnualPlans] = useState<AnnualPlan[]>([]);
  const [quarterlyPlans, setQuarterlyPlans] = useState<QuarterlyPlan[]>([]);
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>([]);
  const [activeView, setActiveView] = useState<'yearly' | 'quarterly'>('yearly');
  const [selectedAnnualPlan, setSelectedAnnualPlan] = useState<string | null>(null);
  const [selectedQuarterlyPlan, setSelectedQuarterlyPlan] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PlanStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showPermissionError, setShowPermissionError] = useState<boolean>(false);
  const [permissionErrorMessage, setPermissionErrorMessage] = useState<string>('');

  const loadMonthlyPlansByQuarterlyIds = useCallback(async (
    quarterlyIds: string[],
    quarterlySource: QuarterlyPlan[] = quarterlyPlans,
    annualSource: AnnualPlan[] = annualPlans
  ) => {
    if (quarterlyIds.length === 0) { setMonthlyPlans([]); return; }

    const [monthlyResult, proceduresData] = await Promise.all([
      supabase.from('monthly_plans').select('*').in('quarterly_id', quarterlyIds).order('month', { ascending: true }),
      queryClient.ensureQueryData(proceduresQueryOptions),
    ]);

    if (monthlyResult.error) throw monthlyResult.error;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monthlyData = (monthlyResult.data ?? []) as any[];
    const planIds = monthlyData.map(r => r.monthly_plan_id);
    const { data: hoursData, error: hoursErr } = await supabase
      .from('v_monthly_plan_hours')
      .select('monthly_plan_id, total_spent_hours, tasks_count')
      .in('monthly_plan_id', planIds);
    if (hoursErr) throw hoursErr;

    const proceduresMap = buildProceduresMap(proceduresData);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hoursMap = buildHoursMapFromView((hoursData ?? []) as any[]);
    setMonthlyPlans(mapMonthlyPlansWithHierarchy({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
      monthlyRows: monthlyData as any[],
      quarterlyPlans: quarterlySource,
      annualPlans: annualSource,
      proceduresMap,
      hoursMap,
    }));
  }, [quarterlyPlans, annualPlans, queryClient]);

  const fetchAnnualPlans = useCallback(async () => {
    try {
      setLoading(true);
      const data = await queryClient.ensureQueryData(annualPlansQueryOptions);
      setAnnualPlans(data);
    } catch (error: unknown) {
      logger.error('Ошибка при загрузке годовых планов:', error);
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  const fetchQuarterlyPlans = useCallback(async (year: number) => {
    try {
      const annualids = annualPlans.filter(p => p.year === year).map(p => p.annual_id);
      if (annualids.length === 0) { setQuarterlyPlans([]); return; }
      setQuarterlyPlans(await fetchQuarterlyPlansByAnnualIds(annualids));
    } catch (error: unknown) {
      logger.error('Ошибка при загрузке квартальных планов:', error);
      setError(getErrorMessage(error));
    }
  }, [annualPlans]);

  const fetchQuarterlyPlansByAnnualId = useCallback(async (annualId: string) => {
    try {
      setQuarterlyPlans(await fetchQuarterlyPlansByAnnualIds([annualId]));
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    }
  }, []);

  const fetchMonthlyPlans = useCallback(async (quarter: number) => {
    try {
      const quarterlyIds = quarterlyPlans.filter(q => q.quarter === quarter).map(q => q.quarterly_id);
      await loadMonthlyPlansByQuarterlyIds(quarterlyIds);
    } catch (error: unknown) {
      logger.error('Ошибка при загрузке месячных планов:', error);
      setError(getErrorMessage(error));
    }
  }, [quarterlyPlans, loadMonthlyPlansByQuarterlyIds]);

  const fetchMonthlyPlansByQuarterlyId = useCallback(async (quarterlyId: string) => {
    try {
      await loadMonthlyPlansByQuarterlyIds([quarterlyId]);
    } catch (error: unknown) {
      logger.error('Ошибка при загрузке месячных планов:', error);
      setError(getErrorMessage(error));
    }
  }, [loadMonthlyPlansByQuarterlyIds]);

  const refreshPlans = useCallback(async (filterYear?: number) => {
    try {
      setLoading(true);
      let monthlyQuery = supabase.from('monthly_plans').select('*').order('month', { ascending: true });
      if (filterYear) monthlyQuery = monthlyQuery.eq('year', filterYear);

      const [annualData, quarterlyData, monthlyResult, proceduresData] = await Promise.all([
        queryClient.fetchQuery(annualPlansQueryOptions),
        fetchAllQuarterlyPlansFromBase(),
        monthlyQuery,
        queryClient.ensureQueryData(proceduresQueryOptions),
      ]);

      if (monthlyResult.error) throw monthlyResult.error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const monthlyRawData = (monthlyResult.data ?? []) as any[];

      const planIds = monthlyRawData.map(r => r.monthly_plan_id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let hoursData: any[] = [];
      if (planIds.length > 0) {
        const { data, error: hoursErr } = await supabase
          .from('v_monthly_plan_hours')
          .select('monthly_plan_id, total_spent_hours, tasks_count')
          .in('monthly_plan_id', planIds);
        if (hoursErr) throw hoursErr;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hoursData = (data ?? []) as any[];
      }

      const proceduresMap = buildProceduresMap(proceduresData);
      const hoursMap = buildHoursMapFromView(hoursData);
      const monthlyData = mapMonthlyPlansWithHierarchy({
        monthlyRows: monthlyRawData, quarterlyPlans: quarterlyData,
        annualPlans: annualData, proceduresMap, hoursMap,
      });

      setAnnualPlans(annualData);
      if (filterYear) {
        const yearAnnualIds = new Set(annualData.filter((a: AnnualPlan) => a.year === filterYear).map((a: AnnualPlan) => a.annual_id));
        setQuarterlyPlans(quarterlyData.filter((q: QuarterlyPlan) => q.annual_plan_id && yearAnnualIds.has(q.annual_plan_id)));
      } else {
        setQuarterlyPlans(quarterlyData);
      }
      setMonthlyPlans(monthlyData);
    } catch (error: unknown) {
      logger.error('Ошибка при загрузке планов:', error);
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [fetchAllQuarterlyPlansFromBase, queryClient]);

  const handleAnnualPlanClick = useCallback((planId: string) => {
    setSelectedAnnualPlan(planId);
    setActiveView('quarterly');
    const plan = annualPlans.find(p => p.annual_id === planId);
    if (plan) fetchQuarterlyPlans(plan.year);
  }, [fetchQuarterlyPlans, annualPlans]);

  const handleQuarterlyPlanClick = useCallback((planId: string) => {
    setSelectedQuarterlyPlan(planId);
  }, []);

  const handlePlanSuccess = useCallback(() => { refreshPlans(); }, [refreshPlans]);

  const handleStatusFilterChange = useCallback((newStatus: PlanStatus | null) => {
    setStatusFilter(newStatus);
  }, []);

  return {
    annualPlans, quarterlyPlans, monthlyPlans,
    activeView, setActiveView,
    selectedAnnualPlan, setSelectedAnnualPlan,
    selectedQuarterlyPlan, setSelectedQuarterlyPlan,
    statusFilter, setStatusFilter,
    loading, error,
    showPermissionError, setShowPermissionError,
    permissionErrorMessage, setPermissionErrorMessage,
    fetchAllPlans: refreshPlans,
    refreshPlans, fetchAnnualPlans, fetchQuarterlyPlans,
    fetchQuarterlyPlansByAnnualId, fetchMonthlyPlans, fetchMonthlyPlansByQuarterlyId,
    handleAnnualPlanClick, handleQuarterlyPlanClick, handlePlanSuccess, handleStatusFilterChange,
  };
};

export default usePlans;
