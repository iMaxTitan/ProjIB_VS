import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { AnnualPlan, QuarterlyPlan, MonthlyPlan, PlanStatus } from '@/types/planning';
import { getErrorMessage } from '@/lib/utils/error-message';
import logger from '@/lib/logger';
import {
  buildHoursMapFromView,
  buildMeasuresMap,
  mapMonthlyPlansWithHierarchy,
} from '@/modules/plans/monthly-mappers';
import { measuresQueryOptions } from '@/lib/queries/reference-queries';

type QuarterlyBaseRow = {
  quarterly_id: string;
  annual_plan_id: string | null;
  department_id: string | null;
  quarter: number;
  goal: string;
  expected_result: string;
  status: PlanStatus;
  process_id?: string | null;
  departments?: { department_name?: string | null } | { department_name?: string | null }[] | null;
  processes?: { process_name?: string | null } | { process_name?: string | null }[] | null;
};

export const usePlans = () => {
  const queryClient = useQueryClient();

  // Состояния для данных
  const [annualPlans, setAnnualPlans] = useState<AnnualPlan[]>([]);
  const [quarterlyPlans, setQuarterlyPlans] = useState<QuarterlyPlan[]>([]);
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>([]);

  // Состояния для UI
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
    if (quarterlyIds.length === 0) {
      setMonthlyPlans([]);
      return;
    }

    const [monthlyResult, measuresData] = await Promise.all([
      supabase
        .from('monthly_plans')
        .select('*')
        .in('quarterly_id', quarterlyIds)
        .order('month', { ascending: true }),
      queryClient.ensureQueryData(measuresQueryOptions),
    ]);

    if (monthlyResult.error) throw monthlyResult.error;

    // Use v_monthly_plan_hours view instead of raw daily_tasks (~120 rows vs ~21K)
    const planIds = (monthlyResult.data || []).map(r => r.monthly_plan_id);
    const { data: hoursData, error: hoursErr } = await supabase
      .from('v_monthly_plan_hours')
      .select('monthly_plan_id, total_spent_hours, tasks_count')
      .in('monthly_plan_id', planIds);
    if (hoursErr) throw hoursErr;

    const measuresMap = buildMeasuresMap(measuresData);
    const hoursMap = buildHoursMapFromView(hoursData || []);
    const plans = mapMonthlyPlansWithHierarchy({
      monthlyRows: monthlyResult.data || [],
      quarterlyPlans: quarterlySource,
      annualPlans: annualSource,
      measuresMap,
      hoursMap,
    });

    setMonthlyPlans(plans);
  }, [quarterlyPlans, annualPlans]);

  // Загрузка всех записей с пагинацией (Supabase ограничивает до 1000 за запрос)
  const fetchAllWithPagination = async <T>(
    table: string,
    orderBy: string,
    ascending: boolean = true
  ): Promise<T[]> => {
    const pageSize = 1000;
    const allData: T[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order(orderBy, { ascending })
        .range(from, to);

      if (error) throw error;

      if (data && data.length > 0) {
        allData.push(...data);  // O(n) вместо O(n²) конкатенации
        hasMore = data.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }

    return allData;
  };

  const normalizeRelation = <T,>(value: T | T[] | null | undefined): T | undefined => {
    if (!value) return undefined;
    return Array.isArray(value) ? value[0] : value;
  };

  const mapQuarterlyRows = useCallback((rows: QuarterlyBaseRow[]): QuarterlyPlan[] => {
    return rows.map((row) => {
      const department = normalizeRelation(row.departments);
      const process = normalizeRelation(row.processes);
      return {
        quarterly_id: row.quarterly_id,
        annual_plan_id: row.annual_plan_id,
        department_id: row.department_id,
        department_name: department?.department_name || undefined,
        quarter: row.quarter,
        goal: row.goal,
        expected_result: row.expected_result,
        status: row.status,
        process_id: row.process_id || undefined,
        process_name: process?.process_name || undefined,
      };
    });
  }, []);

  const fetchQuarterlyPlansByAnnualIds = useCallback(async (annualIds: string[]): Promise<QuarterlyPlan[]> => {
    const tableResult = await supabase
      .from('quarterly_plans')
      .select(`
        quarterly_id,
        annual_plan_id,
        department_id,
        quarter,
        goal,
        expected_result,
        status,
        process_id,
        departments (department_name),
        processes (process_name)
      `)
      .in('annual_plan_id', annualIds)
      .order('quarter', { ascending: true });

    if (tableResult.error) throw tableResult.error;
    return mapQuarterlyRows((tableResult.data || []) as QuarterlyBaseRow[]);
  }, [mapQuarterlyRows]);

  const fetchAllQuarterlyPlansFromBase = useCallback(async (): Promise<QuarterlyPlan[]> => {
    const tableResult = await supabase
      .from('quarterly_plans')
      .select(`
        quarterly_id,
        annual_plan_id,
        department_id,
        quarter,
        goal,
        expected_result,
        status,
        process_id,
        departments (department_name),
        processes (process_name)
      `)
      .order('quarter', { ascending: true });

    if (tableResult.error) throw tableResult.error;
    return mapQuarterlyRows((tableResult.data || []) as QuarterlyBaseRow[]);
  }, [mapQuarterlyRows]);

  // Загрузка только годовых планов как начальной точки
  const fetchAnnualPlans = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('v_annual_plans')
        .select('*')
        .order('year', { ascending: false });

      if (error) throw error;
      setAnnualPlans(data || []);

      // Очищаем зависимые данные при полной перезагрузке годовых, 
      // или оставляем старые? Лучше очистить, если год не выбран.
    } catch (error: unknown) {
      logger.error('Ошибка при загрузке годовых планов:', error);
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  // Загрузка квартальных планов для конкретного года
  const fetchQuarterlyPlans = useCallback(async (year: number) => {
    try {
      const annualids = annualPlans
        .filter(p => p.year === year)
        .map(p => p.annual_id);

      if (annualids.length === 0) {
        setQuarterlyPlans([]);
        return;
      }

      const plans = await fetchQuarterlyPlansByAnnualIds(annualids);
      setQuarterlyPlans(plans);
    } catch (error: unknown) {
      logger.error('Ошибка при загрузке квартальных планов:', error);
      setError(getErrorMessage(error));
    }
  }, [annualPlans, fetchQuarterlyPlansByAnnualIds]);

  // Загрузка квартальных планов по ID годового плана (прямая загрузка)
  const fetchQuarterlyPlansByAnnualId = useCallback(async (annualId: string) => {
    try {
      const plans = await fetchQuarterlyPlansByAnnualIds([annualId]);
      setQuarterlyPlans(plans);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    }
  }, [fetchQuarterlyPlansByAnnualIds]);

  // Загрузка месячных планов для выбранного квартала
  const fetchMonthlyPlans = useCallback(async (quarter: number) => {
    try {
      // 1. Находим все QuarterlyPlans для выбранного квартала
      const quarterlyIds = quarterlyPlans
        .filter(q => q.quarter === quarter)
        .map(q => q.quarterly_id);
      await loadMonthlyPlansByQuarterlyIds(quarterlyIds);
    } catch (error: unknown) {
      logger.error('Ошибка при загрузке месячных планов:', error);
      setError(getErrorMessage(error));
    }
  }, [quarterlyPlans, loadMonthlyPlansByQuarterlyIds]);

  // Загрузка месячных планов по ID квартального плана
  const fetchMonthlyPlansByQuarterlyId = useCallback(async (quarterlyId: string) => {
    try {
      await loadMonthlyPlansByQuarterlyIds([quarterlyId]);
    } catch (error: unknown) {
      logger.error('Ошибка при загрузке месячных планов:', error);
      setError(getErrorMessage(error));
    }
  }, [loadMonthlyPlansByQuarterlyIds]);

  // Универсальный метод обновления - загрузка ВСЕХ планов
  const refreshPlans = useCallback(async () => {
    try {
      setLoading(true);

      // Загружаем все планы параллельно
      const [annualData, quarterlyData, monthlyRawData, measuresData, hoursResult] = await Promise.all([
        fetchAllWithPagination<AnnualPlan>('v_annual_plans', 'year', false),
        fetchAllQuarterlyPlansFromBase(),
        supabase
          .from('monthly_plans')
          .select('*')
          .order('month', { ascending: true })
          .then(({ data, error }) => {
            if (error) throw error;
            return data || [];
          }),
        queryClient.ensureQueryData(measuresQueryOptions),
        // v_monthly_plan_hours: all pre-aggregated rows (~120 instead of ~21K daily_tasks)
        supabase
          .from('v_monthly_plan_hours')
          .select('monthly_plan_id, total_spent_hours, tasks_count'),
      ]);

      if (hoursResult.error) throw hoursResult.error;

      const measuresMap = buildMeasuresMap(measuresData);
      const hoursMap = buildHoursMapFromView(hoursResult.data || []);
      const monthlyData = mapMonthlyPlansWithHierarchy({
        monthlyRows: monthlyRawData,
        quarterlyPlans: quarterlyData,
        annualPlans: annualData,
        measuresMap,
        hoursMap,
      });

      setAnnualPlans(annualData);
      setQuarterlyPlans(quarterlyData);
      setMonthlyPlans(monthlyData);
    } catch (error: unknown) {
      logger.error('Ошибка при загрузке планов:', error);
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [fetchAllQuarterlyPlansFromBase]);

  // Обработчики кликов по планам
  const handleAnnualPlanClick = useCallback((planId: string) => {
    setSelectedAnnualPlan(planId);
    setActiveView('quarterly');

    // Находим план, чтобы получить год
    const plan = annualPlans.find(p => p.annual_id === planId);
    if (plan) {
      fetchQuarterlyPlans(plan.year);
    }
  }, [fetchQuarterlyPlans, annualPlans]);

  const handleQuarterlyPlanClick = useCallback((planId: string) => {
    setSelectedQuarterlyPlan(planId);
  }, []);

  // Обновление данных после успешного действия
  const handlePlanSuccess = useCallback(() => {
    refreshPlans();
  }, [refreshPlans]);

  // Пример обработчика смены фильтра статуса
  const handleStatusFilterChange = useCallback((newStatus: PlanStatus | null) => {
    setStatusFilter(newStatus);
  }, []);

  return {
    // Данные
    annualPlans,
    quarterlyPlans,
    monthlyPlans,

    // Состояние UI
    activeView,
    setActiveView,
    selectedAnnualPlan,
    setSelectedAnnualPlan,
    selectedQuarterlyPlan,
    setSelectedQuarterlyPlan,
    statusFilter,
    setStatusFilter,
    loading,
    error,
    showPermissionError,
    setShowPermissionError,
    permissionErrorMessage,
    setPermissionErrorMessage,

    // Методы
    fetchAllPlans: refreshPlans, // Алиас для совместимости
    refreshPlans,
    fetchAnnualPlans,
    fetchQuarterlyPlans,
    fetchQuarterlyPlansByAnnualId,
    fetchMonthlyPlans,
    fetchMonthlyPlansByQuarterlyId,
    handleAnnualPlanClick,
    handleQuarterlyPlanClick,
    handlePlanSuccess,
    handleStatusFilterChange
  };
};

export default usePlans;





