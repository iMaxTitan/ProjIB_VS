import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { AnnualPlan, QuarterlyPlan, MonthlyPlan, PlanStatus } from '@/types/planning';
import { UserInfo } from '@/types/azure';
import { getErrorMessage } from '@/lib/utils/error-message';
import logger from '@/lib/logger';
import {
  aggregateHoursByMonthlyPlan,
  buildMeasuresMap,
  mapMonthlyPlansWithHierarchy,
} from '@/modules/plans/monthly-mappers';

export const usePlans = (user: UserInfo) => {
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

    const [monthlyResult, tasksResult, measuresResult] = await Promise.all([
      supabase
        .from('monthly_plans')
        .select('*')
        .in('quarterly_id', quarterlyIds)
        .order('month', { ascending: true }),
      supabase
        .from('daily_tasks')
        .select('monthly_plan_id, spent_hours'),
      supabase
        .from('v_kpi_operational')
        .select('entity_id, entity_name, process_id, process_name')
    ]);

    if (monthlyResult.error) throw monthlyResult.error;
    if (tasksResult.error) throw tasksResult.error;
    if (measuresResult.error) throw measuresResult.error;

    const measuresMap = buildMeasuresMap(measuresResult.data || []);
    const hoursMap = aggregateHoursByMonthlyPlan(tasksResult.data || []);
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
      // Ищем ID годового плана по году (или передаем ID напрямую)
      // Если мы фильтруем по году, нам нужно найти annual_id для этого года
      // Но v_quarterly_plans имеет annual_plan_id. 
      // Вариант 1: Загрузить по annual_plan_id (как сейчас).
      // Вариант 2: Загрузить по году через join (сложнее).
      // Оставим загрузку по annual_plan_id, но интерфейс должен это поддерживать.

      // Однако PlansPageNew выбирает "год".
      // Нам нужно найти plan с этим годом.

      // 1. Находим все AnnualPlans для заданного года
      const annualids = annualPlans
        .filter(p => p.year === year)
        .map(p => p.annual_id);

      if (annualids.length === 0) {
        setQuarterlyPlans([]);
        return;
      }

      // 2. Загружаем QuarterlyPlans для ВСЕХ этих AnnualPlans
      const { data, error } = await supabase
        .from('v_quarterly_plans')
        .select('*')
        .in('annual_plan_id', annualids)
        .order('quarter', { ascending: true });

      if (error) throw error;

      // Важно: Мы должны не заменять ВСЕ квартальные планы, а добавлять/обновлять их для этого года?
      // Если мы заменим, то при переключении года "исчезнут" другие.
      // Для дерева это ОК, если дерево показывает только выбранный год.
      // Но если дерево показывает ВСЕ годы...
      // Спецификация говорит: "Выбор Года загружает только Годовые планы этого года".
      // Значит, дерево тоже фильтруется.
      setQuarterlyPlans(data || []);
    } catch (error: unknown) {
      logger.error('Ошибка при загрузке квартальных планов:', error);
      setError(getErrorMessage(error));
    }
  }, [annualPlans]);

  // Загрузка квартальных планов по ID годового плана (прямая загрузка)
  const fetchQuarterlyPlansByAnnualId = useCallback(async (annualId: string) => {
    try {
      const { data, error } = await supabase
        .from('v_quarterly_plans')
        .select('*')
        .eq('annual_plan_id', annualId)
        .order('quarter', { ascending: true });

      if (error) throw error;
      setQuarterlyPlans(data || []);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    }
  }, []);

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
      const [annualData, quarterlyData, monthlyRawData, dailyTasksData, measuresData] = await Promise.all([
        fetchAllWithPagination<AnnualPlan>('v_annual_plans', 'year', false),
        fetchAllWithPagination<QuarterlyPlan>('v_quarterly_plans', 'quarter', true),
        // Месячные планы без join
        supabase
          .from('monthly_plans')
          .select('*')
          .order('month', { ascending: true })
          .then(({ data, error }) => {
            if (error) throw error;
            return data || [];
          }),
        // Загружаем все daily_tasks для агрегации spent_hours
        supabase
          .from('daily_tasks')
          .select('monthly_plan_id, spent_hours')
          .then(({ data, error }) => {
            if (error) throw error;
            return data || [];
          }),
        // Загружаем мероприятия через view (работает с RLS)
        supabase
          .from('v_kpi_operational')
          .select('entity_id, entity_name, process_id, process_name')
          .then(({ data, error }) => {
            if (error) throw error;
            return data || [];
          })
      ]);

      const measuresMap = buildMeasuresMap(measuresData);
      const hoursMap = aggregateHoursByMonthlyPlan(dailyTasksData);
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
  }, []);

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



